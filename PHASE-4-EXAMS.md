# EduTrack AI Phase 4 – Exam & Assessment API

This phase adds PostgreSQL/SQLite-compatible scheduled exam tables and APIs. It does not yet replace every exam UI section in Teacher/Student dashboards.

## Setup
Keep your existing `.env` file and DATABASE_URL. Do not put credentials in source code.
Install backend dependencies:
`pip install -r backend/requirements.txt`
Restart:
`python -m uvicorn backend.server:app --reload --host 127.0.0.1 --port 8000`

On startup, the five scheduled-exam tables are created automatically.

## API
- `POST /exams` – create exam and questions. JSON fields: title, subject, classroom, teacher_email, starts_at (ISO date/time string), duration_minutes, status (Draft/Published/Cancelled), questions [{question_text, options, correct_option (zero-based), marks}].
- `GET /exams` – list exams; optional classroom, teacher_email, status filters.
- `GET /exams/{exam_id}` – exam plus questions (correct answers are not returned).
- `POST /exams/{exam_id}/attempts` – body `{"student_email":"student@example.com"}`.
- `POST /exams/attempts/{attempt_id}/submit` – body `{"answers":{"<question_id>":0}}`; returns score.
- `GET /exams/{exam_id}/results` – teacher-facing results list.
Exam create/submit publishes dashboard WebSocket events.

## Important
These endpoints are a foundation for the UI integration step. Current legacy `/exam/*` practice endpoints remain unchanged. This phase does not add authorization enforcement; protect these endpoints before public/production deployment. Do not expose the database password or LiveKit secret.
