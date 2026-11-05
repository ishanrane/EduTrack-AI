EduTrack AI – Refined Proctoring Update

What changed:
- Reworked browser-side MediaPipe initialization with GPU-to-CPU fallback.
- Fixed the head-pose pitch calculation. The previous fixed threshold could classify a neutral face as looking down.
- Added a short neutral-position calibration before gaze/head-pose status is evaluated.
- Added temporal smoothing to reduce noisy one-frame landmark jumps.
- Uses normalized face geometry for yaw and pitch so camera distance has less influence.
- Uses iris landmarks for approximate gaze direction when available.
- Prevents the camera/model from being reinitialized on every parent render when callback identities change.
- Adds a more compact, responsive proctoring panel and improved exam/proctor column breakpoints.
- Keeps the existing four-warning auto-submit behavior and existing app/backend structure.

Setup:
1. Extract the ZIP.
2. In the project root run: npm install
3. Start the backend using the existing backend instructions.
4. In another terminal run: npm run dev
5. Open the app on localhost and allow camera permission.
6. During the first few seconds, face the camera normally so the proctor can calibrate.

Important accuracy note:
This is a prototype using webcam face landmarks. Gaze and head pose are estimates and can be affected by lighting, camera placement, glasses, and individual facial geometry. It must not be treated as definitive proof of misconduct or used as the sole basis for a high-stakes decision. Test and tune thresholds with real users and provide a human review process.


Eye tracking and warning refinement:
- Gaze now uses separately normalized left/right iris positions relative to each eye's corners and vertical eye opening, rather than averaging raw iris x-coordinates.
- The system calibrates a neutral gaze/head position at exam start, then smooths landmarks to reduce jitter.
- Sustained eye/head deviation now triggers a warning after about 2.8 seconds.
- A missing face for about 3.5 seconds or multiple faces for about 2.5 seconds also triggers a warning.
- Warnings are rate-limited to avoid flooding; the fourth warning invokes the existing auto-submit callback.
- Gaze direction remains an approximation and depends on camera angle, lighting, glasses, and screen position. Validate with multiple users before any real exam deployment.
