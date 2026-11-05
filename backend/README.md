# EduTrack AI Backend

## Setup (Windows)
From the project root:

```powershell
py -m venv .venv
.venv\Scripts\activate
python -m pip install -r backend\requirements.txt
python -m uvicorn backend.server:app --reload
```

Open http://localhost:8000/docs and http://localhost:8000/health.
SQLite database is created automatically at `backend/edutrack.db`.

## Notes
This is a working local-development/demo backend. It provides seeded MCQ questions, exam sessions, submissions, and results. The `/auth/login` endpoint is a simple demo account creator, not production-grade authentication. Do not expose it publicly without adding password hashing, proper JWT authentication, authorization, and rate limiting.
