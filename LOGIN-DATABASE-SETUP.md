# EduTrack AI – Separate Student and Teacher Login

## What changed
- Student accounts are stored in PostgreSQL table `student_accounts`.
- Teacher accounts are stored in PostgreSQL table `teacher_accounts`.
- Admin accounts are stored in PostgreSQL table `admin_accounts`.
- Registration and login success/failure events are recorded in `auth_logs`; passwords are never written to the log.
- All three tables store PBKDF2-SHA256 password hashes, never plaintext passwords.
- The legacy `users` table is maintained as a compatibility index for existing dashboard counts. Existing legacy accounts are migrated into their role-specific table at backend startup and their old password values are hashed.
- Login checks only the selected role's account table. A Student account cannot log in through the Teacher tab and vice versa.

## 1. Configure PostgreSQL
Create or update `backend/.env` or the root `.env` (depending on how you currently load environment variables) with:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/edutrack_ai
AUTH_TOKEN_SECRET=replace-this-with-a-long-random-secret
```

Do not share the real password or commit `.env` to Git.

## 2. Start backend
From the project root:

```powershell
pip install -r backend/requirements.txt
python -m uvicorn backend.server:app --reload --host 127.0.0.1 --port 8000
```

The `init_db()` startup routine creates the three account tables and migrates legacy users safely.

## 3. Create student and teacher accounts
Open the frontend at `http://localhost:5173`.
- Select Student → Create account → enter name, email and password.
- Select Teacher → Create account → enter name, email and password.
- The same email cannot be registered under multiple roles.

## 4. Create the first Admin account
Admin self-registration is disabled. From the project root run:

```powershell
python -m backend.create_admin
```

Enter the admin name, email and password when prompted. Then use the Admin tab to log in.

## 5. Check tables in pgAdmin
`edutrack_ai` → Schemas → public → Tables:
- `student_accounts`
- `teacher_accounts`
- `admin_accounts`
- `users` (legacy compatibility table)

Example:

```sql
SELECT id, full_name, email, is_active, created_at FROM student_accounts;
SELECT id, full_name, email, is_active, created_at FROM teacher_accounts;
SELECT id, full_name, email, is_active, created_at FROM admin_accounts;
SELECT id, email, role, event_type, status, event_time, details FROM auth_logs ORDER BY id DESC;
```

Do not select or expose `password_hash` in screenshots or shared exports.

## Notes
- This implements registration/login and issues an expiring HMAC-signed access token. It does not yet add token verification middleware to every existing API route; role-based API authorization must be added before production deployment.
- Keep your old project backup. This update is based on the uploaded `EduTrack-AI-Student-Materials-Fix` archive.
