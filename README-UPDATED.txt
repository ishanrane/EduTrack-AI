EduTrack AI – Exam Integration Update
=====================================

WHAT CHANGED
- Replaced the Start Exam placeholder alert in src/StudentDashboard.jsx.
- Connected Start Exam to the real ExamPanel component through src/App.jsx.
- The exam page now opens as a separate full-page view with a Back to dashboard action.
- ExamPanel calls:
  POST /exam/start
  GET /exam/questions/{session_id}
  POST /exam/submit
- The start response may contain either `id` or `session_id`.

IMPORTANT BACKEND / LOGIN SETUP
Your current Login.jsx is a demo front-end login. It does not call the backend and
does not receive a JWT token. The exam API uses Bearer authentication, so the exam
cannot authenticate until a token is supplied.

For local testing only, create a `.env` file beside package.json:
VITE_API_URL=http://localhost:8000
VITE_API_TOKEN=PASTE_A_VALID_BACKEND_JWT_HERE

Restart Vite after changing .env:
npm run dev

Do not commit a real token to GitHub. The proper production solution is to connect
Login.jsx to your backend login endpoint and pass the returned access token into
the session. The exact login endpoint/request fields must match your FastAPI backend.

RUN
npm install
npm run dev

If the API returns an error, check the FastAPI terminal and browser DevTools Network
tab. The frontend route names and request payloads must match the backend implementation.
Camera/AI monitoring is not falsely marked as connected by this integration; this
change specifically connects the dashboard button to the API-backed exam panel.


Refined proctoring notes:
- First-run face calibration is expected; keep your face centered for about 2–3 seconds.
- If GPU inference is unavailable, the proctoring model automatically retries on CPU.
- See PROCTORING-UPDATE.md for changes and accuracy limitations.
