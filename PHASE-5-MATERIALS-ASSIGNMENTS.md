# EduTrack AI Phase 5 – Study Materials & Assignments

Based on the Phase 4 project. Preserves existing LiveKit, whiteboard and exam APIs.

## Setup
Keep your current `.env` and DATABASE_URL unchanged.
From the project root:
`pip install -r backend/requirements.txt`
`python -m uvicorn backend.server:app --reload --host 127.0.0.1 --port 8000`

New tables are created at startup: study_materials, assignments, assignment_submissions, notifications.
Uploaded files are stored under `backend/uploads/` (20 MB maximum; PDF, PPT/PPTX, DOC/DOCX, TXT, PNG/JPG/JPEG).

## Study materials
`POST /materials` multipart form fields: title, description, classroom, subject, teacher_email, file.
`GET /materials?classroom=SE-A&subject=DBMS` – returns only matching classroom AND subject.
`GET /materials/{id}/download`
`DELETE /materials/{id}?teacher_email=teacher@example.com`

## Assignments
`POST /assignments` JSON: title, description, classroom, subject, teacher_email, due_at, max_marks, status.
`GET /assignments?classroom=SE-A&subject=DBMS`
`POST /assignments/{id}/submit` multipart: student_email, file.
`GET /assignments/{id}/submissions`
`PATCH /assignments/submissions/{submission_id}/grade` JSON: marks, feedback.

## Notifications
`GET /notifications?email=student@example.com&classroom=SE-A&subject=DBMS`
`PATCH /notifications/{id}/read?email=student@example.com`

## Important limitations
This phase adds working backend endpoints and persistence. The existing Teacher/Student dashboard screens still need their upload/list/submission UI wired to these endpoints. Classroom/subject matching is enforced by query parameters, but full authenticated role/roster authorization is not yet implemented. Add proper authentication and verify student enrollment before production deployment. Back up `backend/uploads/` and PostgreSQL together.
