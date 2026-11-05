import { useEffect, useState } from "react";

export default function Camera({ videoRef, isSuspicious = false }) {
  const [cameraError, setCameraError] = useState("");
  const [active, setActive] = useState(false);

  useEffect(() => {
    let stream;
    let mounted = true;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera access is not supported by this browser.");
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false
        });
        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        if (videoRef?.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setActive(true);
        setCameraError("");
      } catch (error) {
        if (mounted) {
          setActive(false);
          setCameraError(error?.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in your browser."
            : error.message || "Unable to start camera.");
        }
      }
    }

    startCamera();
    return () => {
      mounted = false;
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (videoRef?.current) videoRef.current.srcObject = null;
    };
  }, [videoRef]);

  return (
    <section className="et-camera-card">
      <header><b>Live Camera</b><span className={active ? "et-live" : "et-offline"}>{active ? "● LIVE" : "● OFFLINE"}</span></header>
      <div className={`et-camera-frame ${isSuspicious ? "et-camera-alert" : ""}`}>
        <video ref={videoRef} autoPlay muted playsInline />
        {!active && <div className="et-camera-placeholder">Camera preview will appear here</div>}
      </div>
      {cameraError && <p className="et-camera-error">{cameraError}</p>}
      <style>{`
        .et-camera-card{background:#111827;color:#f8fafc;border:1px solid #334155;border-radius:14px;padding:14px}
        .et-camera-card header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
        .et-live{color:#4ade80;font-size:12px}.et-offline{color:#fbbf24;font-size:12px}
        .et-camera-frame{position:relative;aspect-ratio:4/3;background:#020617;border-radius:10px;overflow:hidden;border:2px solid #334155}
        .et-camera-alert{border-color:#ef4444}.et-camera-frame video{width:100%;height:100%;object-fit:cover}
        .et-camera-placeholder{position:absolute;inset:0;display:grid;place-items:center;color:#94a3b8;font-size:13px}
        .et-camera-error{color:#fca5a5;font-size:12px;margin:8px 0 0}
      `}</style>
    </section>
  );
}
