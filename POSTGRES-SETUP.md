# PostgreSQL setup for EduTrack AI

1. Copy `.env.example` to `.env` in the project root (same folder as package.json).
2. Set DATABASE_URL with your local PostgreSQL password. Never commit `.env`.
3. In the backend virtual environment run: `pip install -r backend/requirements.txt`.
4. Start backend from the project root: `python -m uvicorn backend.server:app --reload --host 127.0.0.1 --port 8000`.
5. Open `http://localhost:8000/health`; database should report `postgresql`.
6. Open `http://localhost:8000/dashboard/summary` to see database-backed aggregate counts.

If DATABASE_URL is absent, the app deliberately falls back to its existing SQLite file. Existing SQLite data is not deleted or migrated automatically. This update creates PostgreSQL tables and seeds starter questions; migrate legacy SQLite records separately after reviewing them.

Important: the existing demo login is not production-grade authentication (it stores plain-text passwords). Do not deploy publicly until password hashing, token verification, authorization and HTTPS are implemented.
