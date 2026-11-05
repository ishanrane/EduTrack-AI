# EduTrack AI – Phase 3: Teacher & Student live dashboard data

## What changed
- Added `GET /dashboard/teacher-summary?teacher=<teacher-name>` using PostgreSQL/SQLite records.
- Added `GET /dashboard/student-summary?email=<student-email>` using the signed-in email's exam sessions and results.
- Teacher dashboard KPI values for student count, distinct classrooms, session count and completed sessions now come from the backend. Engagement and at-risk values show `—` because no trustworthy monitoring/engagement records are stored yet.
- Student dashboard KPI values for exam sessions, completed exams, average score and ongoing lectures now come from the backend. Engagement shows `—` until actual monitoring aggregates exist.
- Both dashboards refresh on dashboard WebSocket events and every 15 seconds as a fallback.
- Existing LiveKit and whiteboard components were not intentionally changed.

## Apply
1. Back up your working project.
2. Extract this ZIP and copy the updated `backend/server.py`, `src/TeacherDashboard.jsx`, and `src/StudentDashboard.jsx` into the same paths in your project.
3. Keep your existing `.env` and its `DATABASE_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` and frontend LiveKit settings.
4. Start backend: `python -m uvicorn backend.server:app --reload --host 127.0.0.1 --port 8000`
5. Start frontend: `npm run dev`
6. Test `/dashboard/teacher-summary?teacher=YOUR_TEACHER_NAME` and `/dashboard/student-summary?email=YOUR_STUDENT_EMAIL`.

## Honest limitations
This phase connects the displayed KPI cards and ongoing lecture list to persisted database records. Other pages still contain sample/static exam schedules, study materials, notifications, risk rows, monitoring charts and reports. Attendance, engagement, risk assessment, course/class membership, and material upload tables/APIs still need to be implemented before those sections can show real data. Student summary is scoped by email, but the current demo login/authentication should be hardened before production use.
