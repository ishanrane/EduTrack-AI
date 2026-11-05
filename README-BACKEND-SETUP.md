# EduTrack AI - Frontend + Working Local Backend

## Start backend first (Windows)
Open a terminal in this project folder:

```powershell
py -m venv .venv
.venv\\Scripts\\activate
python -m pip install -r backend\\requirements.txt
python -m uvicorn backend.server:app --reload
```

Check:
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs
- Health: http://localhost:8000/health

The SQLite database and sample MCQ questions are created automatically on first backend startup.

## Start frontend
Open a SECOND terminal in the same project folder:

```powershell
npm install
npm run dev
```

Open the Vite URL shown in the terminal (usually http://localhost:5173).

## Demo behavior
- Choose Student and use any email/password, or click Guest Login.
- Open My Exams, choose the Ongoing exam, and click Start Exam.
- The exam loads seeded questions from FastAPI.
- Answers are submitted and scored in SQLite.
- Results are available at http://localhost:8000/exam/results.

## Important
This backend is intended for local development/demo use. It does not implement production-grade JWT security, password hashing, role permissions, webcam AI inference, or institutional user management. The current frontend demo login does not call `/auth/login`; exam endpoints are open for local testing. Do not deploy this backend publicly as-is.


## Webcam proctor panel
During an active exam, the UI shows a live webcam and sends a JPEG frame to `/proctor/face-check` every ~2.2 seconds. The endpoint uses OpenCV Haar cascades to detect face presence and multiple faces. This is basic face detection only; it does not implement gaze tracking, head pose, identity verification, or audio analysis. Browser camera permission is required. Reinstall backend requirements after updating this package.

## Dashboard live data (phase 2)

- `GET /dashboard/summary` returns live database counts for users, classrooms, exam sessions and results.
- `WS /ws/dashboard` sends an event when a lecture is created/updated or an exam is submitted.
- Admin Dashboard now loads its headline KPI cards from `/dashboard/summary`, refreshes on WebSocket events, and also polls every 15 seconds as a fallback.

Note: other Admin charts/tables and several Teacher/Student sections still contain demo/sample content and are not represented as live data yet. Monitoring risk metrics require dedicated persisted monitoring records before they can be shown as real values.
