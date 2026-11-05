# EduTrack AI consolidated build with Study Material UI

## Important
This build adds the Teacher upload screen and Student live material list/download UI on top of the Phase 5 backend. Visibility requires BOTH classroom and subject to match.

## Run
Keep your existing `.env` and PostgreSQL DATABASE_URL. From project root:
`pip install -r backend/requirements.txt`
`python -m uvicorn backend.server:app --reload --host 127.0.0.1 --port 8000`
In another terminal:
`npm install`
`npm run dev`

Teacher: open Study Materials in the left navigation, select classroom/subject, choose a supported file, and Upload & Publish.
Student: My Classrooms > Study Materials, select the same classroom and subject, then Open / Download.

## Notes
- Student material list refreshes on WebSocket events and every 10 seconds.
- Uploaded files are stored under backend/uploads/materials.
- Teacher email is currently derived from the displayed teacher name in this UI; align it with your real authenticated teacher email before multi-user/production use.
- This does not complete all previously discussed pending features (full attendance, secure authorization/JWT, complete assignment UI, full exam UI integration, AI quiz generation, full admin CRUD, and production security/testing). Do not deploy publicly without those.
- Preserve LiveKit credentials in `.env`; do not share secrets.
