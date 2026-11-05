# EduTrack AI – Consolidated Working Package

This package consolidates the latest Phase 5 project, including the cumulative PostgreSQL/dashboard/assessment/material backend work from the preceding phases.

## Setup (Windows PowerShell)

1. Extract this ZIP.
2. Open PowerShell in `edutrack-ai-refined-work`.
3. Preserve your existing `.env` file. If absent, copy `.env.example` to `.env`.
4. Set the database URL in `.env` (do not share credentials):

   `DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/edutrack_ai`

5. Install backend dependencies:

   `pip install -r backend/requirements.txt`

6. Start backend:

   `python -m uvicorn backend.server:app --reload --host 127.0.0.1 --port 8000`

7. In a second terminal, install/start frontend:

   `npm install`

   `npm run dev`

8. API docs: http://localhost:8000/docs

## Included cumulative capabilities

- PostgreSQL database adapter with SQLite fallback.
- Existing authentication/demo endpoints and legacy exam APIs.
- Dashboard summary endpoint and dashboard WebSocket event channel.
- Scheduled exam creation, attempts, scoring and result endpoints.
- Study material upload/download/list/delete backend endpoints.
- Assignment creation/submission/grading backend endpoints.
- Notifications backend endpoints.
- Existing LiveKit token/classroom and whiteboard project files retained.

## Important implementation status – read before deployment

This is a consolidated development build, not a production-certified release. Several dashboard areas still contain demo/static UI data. The newer study-material and assignment endpoints need full UI wiring in Teacher/Student dashboards; the scheduled-exam endpoints also need complete UI wiring. Attendance workflows, complete classroom enrollment/subject authorization, full admin user-management CRUD, robust notification UI, AI quiz generation/weak-topic analytics, and comprehensive proctoring validation still require implementation and testing.

The current demo authentication is not sufficient for production. Before deploying publicly, implement secure password hashing, signed expiring sessions/JWT, role and classroom authorization on every endpoint, upload MIME/content validation and size limits, rate limiting, audit logging, backups, migrations and automated tests.

## Safety

- Never commit `.env`.
- Never share PostgreSQL or LiveKit secrets.
- Keep a backup of the existing database and project before replacing files.
- Do not delete existing project data while upgrading.
