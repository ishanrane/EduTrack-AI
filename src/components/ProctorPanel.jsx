import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const average = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function getLandmarkMetrics(landmarks) {
  const p = (i) => landmarks[i];
  const nose = p(1);
  const leftCheek = p(234);
  const rightCheek = p(454);
  const leftOuter = p(33), leftInner = p(133), leftIris = p(468);
  const rightOuter = p(362), rightInner = p(263), rightIris = p(473);
  const leftUpper = p(159), leftLower = p(145);
  const rightUpper = p(386), rightLower = p(374);
  const eyeLineY = (p(159)?.y + p(386)?.y) / 2;
  const mouthLineY = (p(13)?.y + p(14)?.y) / 2;

  if (!nose || !leftCheek || !rightCheek || !leftOuter || !leftInner ||
      !rightOuter || !rightInner || !leftUpper || !leftLower ||
      !rightUpper || !rightLower || !Number.isFinite(eyeLineY) ||
      !Number.isFinite(mouthLineY)) return null;

  const faceWidth = Math.max(0.001, Math.abs(rightCheek.x - leftCheek.x));
  const eyeToMouth = Math.max(0.001, mouthLineY - eyeLineY);
  const yaw = (nose.x - (leftCheek.x + rightCheek.x) / 2) / faceWidth;
  const pitch = (nose.y - eyeLineY) / eyeToMouth;

  // Normalize each iris against that eye's own corners. This is more stable
  // than averaging raw x coordinates, especially with mirrored webcam video.
  const eyeRatio = (iris, outer, inner) =>
    (iris.x - outer.x) / (inner.x - outer.x || 0.001);
  const eyeVertical = (iris, upper, lower) =>
    (iris.y - (upper.y + lower.y) / 2) /
    Math.max(0.004, Math.abs(lower.y - upper.y));

  const hasIris = Boolean(leftIris && rightIris);
  let gazeX = 0;
  let gazeY = 0;
  if (hasIris) {
    gazeX = (eyeRatio(leftIris, leftOuter, leftInner) +
      eyeRatio(rightIris, rightOuter, rightInner)) / 2;
    gazeY = (eyeVertical(leftIris, leftUpper, leftLower) +
      eyeVertical(rightIris, rightUpper, rightLower)) / 2;
  }
  return { yaw, pitch, gazeX, gazeY, hasIris };
}

export default function ProctorPanel({ onWarning, onAutoSubmit }) {
  const videoRef = useRef(null);
  const landmarkerRef = useRef(null);
  const callbacksRef = useRef({ onWarning, onAutoSubmit });
  const warningLock = useRef(false);
  const warningCountRef = useRef(0);
  const autoSubmitted = useRef(false);
  const offscreenSince = useRef(null);
  const faceMissingSince = useRef(null);
  const multipleFacesSince = useRef(null);
  const lastVideoTime = useRef(-1);

  const [camera, setCamera] = useState("Starting camera…");
  const [face, setFace] = useState("Waiting for detection");
  const [count, setCount] = useState(0);
  const [gaze, setGaze] = useState("Calibrating");
  const [headPose, setHeadPose] = useState("Calibrating");
  const [direction, setDirection] = useState("—");
  const [warnings, setWarnings] = useState(0);
  const [engine, setEngine] = useState("Loading AI model…");
  const [cameraError, setCameraError] = useState("");
  const [lastWarning, setLastWarning] = useState("");
  const [calibration, setCalibration] = useState("Keep your face centered for calibration");

  useEffect(() => {
    callbacksRef.current = { onWarning, onAutoSubmit };
  }, [onWarning, onAutoSubmit]);

  useEffect(() => {
    let stream;
    let raf = 0;
    let alive = true;
    let lastInference = 0;
    let smoothed = null;
    let neutral = null;
    let calibrationSamples = [];
    let calibrationStarted = 0;
    let calibrated = false;
    let awayReason = "";

    const issueWarning = (reason) => {
      if (warningLock.current || autoSubmitted.current) return;
      warningLock.current = true;
      const next = warningCountRef.current + 1;
      warningCountRef.current = next;
      setWarnings(next);
      setLastWarning(reason);
      callbacksRef.current.onWarning?.(next, reason);
      window.setTimeout(() => {
        warningLock.current = false;
      }, 1800);
      if (next >= 4 && !autoSubmitted.current) {
        autoSubmitted.current = true;
        callbacksRef.current.onAutoSubmit?.(reason);
      }
    };

    async function createLandmarker(vision) {
      const options = {
        runningMode: "VIDEO",
        numFaces: 3,
        outputFaceBlendshapes: false,
      };
      try {
        return await FaceLandmarker.createFromOptions(vision, {
          ...options,
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        });
      } catch {
        // Some browsers / integrated GPUs do not support the GPU delegate.
        return FaceLandmarker.createFromOptions(vision, {
          ...options,
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        });
      }
    }

    async function setup() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access requires HTTPS or localhost in a supported browser.");
        }

        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        if (!alive) return;
        landmarkerRef.current = await createLandmarker(vision);
        if (!alive) return;
        setEngine("AI model active");

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
            facingMode: "user",
          },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;
        if (!video) throw new Error("Camera preview could not be initialized.");
        video.srcObject = stream;
        await video.play();
        setCamera("Camera active");
        setCameraError("");

        const loop = (now) => {
          if (!alive) return;
          raf = requestAnimationFrame(loop);

          const currentVideo = videoRef.current;
          if (
            !currentVideo ||
            currentVideo.readyState < 2 ||
            now - lastInference < 150 ||
            currentVideo.currentTime === lastVideoTime.current
          ) return;

          lastInference = now;
          lastVideoTime.current = currentVideo.currentTime;

          try {
            const result = landmarkerRef.current.detectForVideo(currentVideo, now);
            const faces = result.faceLandmarks || [];
            setCount(faces.length);
            setFace(
              faces.length === 0
                ? "No face detected"
                : faces.length > 1
                  ? "Multiple faces detected"
                  : "One face detected"
            );

            if (faces.length !== 1) {
              setGaze(faces.length === 0 ? "Face not visible" : "Multiple faces");
              setHeadPose("Unavailable");
              setDirection("—");
              offscreenSince.current = null;
              if (faces.length === 0) {
                multipleFacesSince.current = null;
                if (faceMissingSince.current == null) faceMissingSince.current = now;
                if (now - faceMissingSince.current >= 3500) {
                  issueWarning("Face not visible in the camera for more than 3.5 seconds");
                  faceMissingSince.current = now;
                }
              } else {
                faceMissingSince.current = null;
                if (multipleFacesSince.current == null) multipleFacesSince.current = now;
                if (now - multipleFacesSince.current >= 2500) {
                  issueWarning("More than one face is visible in the camera");
                  multipleFacesSince.current = now;
                }
              }
              calibrationSamples = [];
              calibrationStarted = 0;
              smoothed = null;
              calibrated = false;
              neutral = null;
              setCalibration("Center your face to calibrate");
              return;
            }
            faceMissingSince.current = null;
            multipleFacesSince.current = null;

            const metrics = getLandmarkMetrics(faces[0]);
            if (!metrics) return;

            // Exponential smoothing prevents one-frame landmark jumps from creating alerts.
            smoothed = smoothed
              ? {
                  yaw: smoothed.yaw * 0.72 + metrics.yaw * 0.28,
                  pitch: smoothed.pitch * 0.72 + metrics.pitch * 0.28,
                  gazeX: smoothed.gazeX * 0.62 + metrics.gazeX * 0.38,
                  gazeY: smoothed.gazeY * 0.62 + metrics.gazeY * 0.38,
                }
              : { yaw: metrics.yaw, pitch: metrics.pitch, gazeX: metrics.gazeX, gazeY: metrics.gazeY };

            if (!calibrated) {
              if (!calibrationStarted) calibrationStarted = now;
              calibrationSamples.push({ ...smoothed });
              setCalibration("Calibrating neutral head and eye position…");
              if (now - calibrationStarted >= 2200 && calibrationSamples.length >= 8) {
                neutral = {
                  yaw: average(calibrationSamples.map((v) => v.yaw)),
                  pitch: average(calibrationSamples.map((v) => v.pitch)),
                  gazeX: average(calibrationSamples.map((v) => v.gazeX)),
                  gazeY: average(calibrationSamples.map((v) => v.gazeY)),
                };
                calibrated = true;
                setCalibration("Calibration complete");
              }
              setGaze("Calibrating");
              setHeadPose("Calibrating");
              setDirection("Center");
              return;
            }

            const yawDelta = smoothed.yaw - neutral.yaw;
            const pitchDelta = smoothed.pitch - neutral.pitch;
            const gazeXDelta = smoothed.gazeX - neutral.gazeX;
            const gazeYDelta = smoothed.gazeY - neutral.gazeY;

            // Eye ratios are relative to each eye's width/height. These limits
            // intentionally tolerate small saccades and normal blinking.
            const yawLimit = 0.105;
            const pitchLimit = 0.19;
            const gazeXLimit = 0.105;
            const gazeYLimit = 0.30;

            let headLabel = "Facing forward";
            if (yawDelta < -yawLimit) headLabel = "Head turned left";
            else if (yawDelta > yawLimit) headLabel = "Head turned right";
            else if (pitchDelta > pitchLimit) headLabel = "Looking down";
            else if (pitchDelta < -pitchLimit) headLabel = "Looking up";

            let gazeLabel = "Looking at screen";
            let dir = "Center";
            if (metrics.hasIris && gazeXDelta < -gazeXLimit) {
              dir = "Left";
              gazeLabel = "Looking left";
            } else if (metrics.hasIris && gazeXDelta > gazeXLimit) {
              dir = "Right";
              gazeLabel = "Looking right";
            } else if (metrics.hasIris && gazeYDelta < -gazeYLimit) {
              dir = "Up";
              gazeLabel = "Looking up";
            } else if (metrics.hasIris && gazeYDelta > gazeYLimit) {
              dir = "Down";
              gazeLabel = "Looking down";
            }

            setHeadPose(headLabel);
            setGaze(gazeLabel);
            setDirection(dir);
            setCalibration("Calibration complete");

            const headAway = Math.abs(yawDelta) > yawLimit || Math.abs(pitchDelta) > pitchLimit;
            const eyesAway = metrics.hasIris &&
              (Math.abs(gazeXDelta) > gazeXLimit || Math.abs(gazeYDelta) > gazeYLimit);
            const lookingAway = headAway || eyesAway;
            const reason = eyesAway
              ? `Eyes looking ${gazeLabel.replace("Looking ", "").toLowerCase()}`
              : headAway ? headLabel : "";

            if (lookingAway) {
              if (offscreenSince.current == null) {
                offscreenSince.current = now;
                awayReason = reason;
              } else if (reason) {
                awayReason = reason;
              }
              // Raise a warning after a sustained 2.8-second deviation.
              if (now - offscreenSince.current >= 2800) {
                issueWarning(`${awayReason || "Looking away"} continuously for 2.8 seconds`);
                offscreenSince.current = now;
              }
            } else {
              offscreenSince.current = null;
              awayReason = "";
            }
          } catch (error) {
            setEngine("Detection temporarily unavailable");
          }
        };

        raf = requestAnimationFrame(loop);
      } catch (error) {
        if (!alive) return;
        setCamera("Camera / AI unavailable");
        setCameraError(
          error?.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in your browser."
            : error?.message || "Could not initialize the face landmark model."
        );
        setEngine("Unavailable");
      }
    }

    setup();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      landmarkerRef.current?.close?.();
      landmarkerRef.current = null;
    };
  }, []);

  const faceGood = count === 1;
  const gazeGood = gaze === "Looking at screen";
  const poseGood = headPose === "Facing forward";

  return (
    <aside className="et-proctor-panel et-proctor-panel-large">
      <div className="et-proctor-title">
        <b>AI Proctoring</b>
        <span className={camera === "Camera active" ? "et-status-good" : "et-status-warn"}>
          {camera}
        </span>
      </div>

      <div className="et-proctor-video et-proctor-video-large">
        <video ref={videoRef} autoPlay muted playsInline />
        <div className="et-camera-tag">LIVE CAMERA</div>
        <div className="et-ai-tag">{engine}</div>
        {count === 1 && <div className="et-face-frame" aria-hidden="true" />}
      </div>

      {cameraError && <p className="et-proctor-error">{cameraError}</p>}

      <div className="et-proctor-metrics">
        <div><span>Face detection</span><b className={faceGood ? "et-status-good" : "et-status-warn"}>{face ? face : "Waiting"}</b></div>
        <div><span>Faces in frame</span><b>{count}</b></div>
        <div><span>Multiple faces</span><b className={count > 1 ? "et-status-warn" : "et-status-good"}>{count > 1 ? "Detected" : count === 1 ? "None" : "Unknown"}</b></div>
        <div><span>Gaze tracking</span><b className={gazeGood ? "et-status-good" : "et-status-warn"}>{gaze}</b></div>
        <div><span>Head-pose analysis</span><b className={poseGood ? "et-status-good" : "et-status-warn"}>{headPose}</b></div>
        <div><span>Head / gaze direction</span><b>{direction}</b></div>
        <div><span>Warnings</span><b className={warnings ? "et-status-warn" : "et-status-good"}>{warnings} / 4</b></div>
      </div>

      <div className="et-calibration-status">{calibration}</div>
      {lastWarning && <p className="et-proctor-warning">Latest warning: {lastWarning}</p>}
      <p className="et-proctor-note">
        Eye direction is estimated from iris landmarks and calibrated to your normal screen-facing position.
        Keep your face centered for calibration; prolonged gaze/head deviations and face-count changes trigger warnings.
      </p>

      <style>{`
        .et-proctor-panel-large{width:100%;min-width:0;box-sizing:border-box;padding:16px;border-radius:16px;overflow:hidden}
        .et-proctor-title{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
        .et-proctor-title b{font-size:15px}
        .et-proctor-title span{font-size:11px;text-align:right}
        .et-proctor-video-large{position:relative;width:100%;aspect-ratio:16/10;min-height:190px;max-height:320px;background:#020617;border-radius:12px;overflow:hidden}
        .et-proctor-video-large video{display:block;width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
        .et-ai-tag{position:absolute;right:9px;top:9px;max-width:65%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#172033e8;color:#c4b5fd;border:1px solid #6253a6;border-radius:6px;padding:5px 8px;font-size:10px}
        .et-face-frame{position:absolute;left:25%;top:10%;width:50%;height:80%;border:2px solid #4ade80;border-radius:42% 42% 38% 38%;box-shadow:0 0 0 999px #02061710;pointer-events:none}
        .et-camera-tag{position:absolute;left:9px;top:9px;background:#7f1d1d;color:#fee2e2;border-radius:6px;padding:5px 8px;font-size:10px;letter-spacing:.04em}
        .et-proctor-metrics{display:grid;grid-template-columns:1fr;gap:0;margin-top:12px}
        .et-proctor-metrics div{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;min-width:0;font-size:12px;padding:9px 0;border-bottom:1px solid #ffffff12}
        .et-proctor-metrics span{color:#aab7ca;flex:1;min-width:0}
        .et-proctor-metrics b{max-width:62%;text-align:right;overflow-wrap:anywhere}
        .et-status-good{color:#4ade80}.et-status-warn{color:#fbbf24}
        .et-calibration-status{margin-top:11px;padding:8px 10px;background:#312e8155;border:1px solid #6253a655;border-radius:8px;color:#c4b5fd;font-size:11px}
        .et-proctor-warning{color:#fbbf24!important;font-size:12px;background:#42200655;padding:9px;border-radius:8px}
        .et-proctor-note{color:#94a3b8!important;font-size:10px;line-height:1.5;margin:10px 0 0}
        .et-proctor-error{color:#fca5a5!important;font-size:12px;line-height:1.5}
        @media(min-width:1051px){.et-proctor-metrics{grid-template-columns:1fr 1fr;column-gap:16px}.et-proctor-metrics div{gap:8px}.et-proctor-metrics b{max-width:58%}}
      `}</style>
    </aside>
  );
}
