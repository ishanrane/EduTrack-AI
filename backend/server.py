from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, Set
from pathlib import Path
import uuid, shutil
import asyncio
import json
import base64
import cv2
import numpy as np
import os
import hashlib, hmac, secrets, time, base64
from livekit import api

from dotenv import load_dotenv
load_dotenv()
from .database import get_db, init_db

app = FastAPI(title="EduTrack AI API", version="1.1.0")

class DashboardConnections:
    def __init__(self): self.clients: Set[WebSocket] = set()
    async def connect(self, ws: WebSocket):
        await ws.accept(); self.clients.add(ws)
    def disconnect(self, ws: WebSocket): self.clients.discard(ws)
    async def publish(self, event: str):
        dead=[]
        for ws in list(self.clients):
            try: await ws.send_json({"type": event, "at": __import__("datetime").datetime.utcnow().isoformat()})
            except Exception: dead.append(ws)
        for ws in dead: self.disconnect(ws)

dashboard_connections = DashboardConnections()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()

class ClassroomTokenBody(BaseModel):
    room: str = Field(min_length=1, max_length=120)
    identity: str = Field(min_length=1, max_length=160)
    name: str = Field(default="Participant", max_length=100)
    role: str = Field(default="Student", max_length=20)

@app.post("/classroom/token")
def classroom_token(body: ClassroomTokenBody):
    """Create a short-lived LiveKit access token. API secret stays on the backend."""
    api_key = os.getenv("LIVEKIT_API_KEY", "")
    api_secret = os.getenv("LIVEKIT_API_SECRET", "")
    if not api_key or not api_secret:
        raise HTTPException(503, "LiveKit credentials are not configured on the backend.")
    room_name = body.room.strip()
    identity = body.identity.strip()
    if not room_name or not identity:
        raise HTTPException(400, "Room and identity are required.")
    token = (api.AccessToken(api_key, api_secret)
             .with_identity(identity)
             .with_name(body.name.strip() or identity)
             .with_grants(api.VideoGrants(room_join=True, room=room_name, can_publish=True, can_subscribe=True, can_publish_data=True))
             .to_jwt())
    return {"token": token, "room": room_name, "identity": identity}



class LectureCreateBody(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    classroom: str = Field(min_length=1, max_length=120)
    teacher: str = Field(default="Teacher", max_length=120)
    time: str = Field(default="Live now", max_length=120)

class LectureStateBody(BaseModel):
    state: str = Field(pattern="^(Ongoing|Completed)$")

@app.get("/classroom/lectures")
def list_lectures(state: str = "Ongoing"):
    conn = get_db()
    rows = conn.execute("SELECT * FROM classroom_lectures WHERE state=? ORDER BY id DESC", (state,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/classroom/lectures")
def create_lecture(body: LectureCreateBody):
    import uuid
    room_id = "edutrack-" + uuid.uuid4().hex[:16]
    conn = get_db()
    cur = conn.execute("INSERT INTO classroom_lectures(title,classroom,teacher,time,state,room_id) VALUES(?,?,?,?,?,?)",
                       (body.title.strip(), body.classroom.strip(), body.teacher.strip(), body.time.strip(), "Ongoing", room_id))
    conn.commit()
    row = conn.execute("SELECT * FROM classroom_lectures WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    import asyncio
    try: asyncio.get_running_loop().create_task(dashboard_connections.publish("lecture_created"))
    except RuntimeError: pass
    return dict(row)

@app.patch("/classroom/lectures/{lecture_id}")
def update_lecture(lecture_id: int, body: LectureStateBody):
    conn = get_db()
    cur = conn.execute("UPDATE classroom_lectures SET state=? WHERE id=?", (body.state, lecture_id))
    if not cur.rowcount:
        conn.close()
        raise HTTPException(404, "Lecture not found")
    row = conn.execute("SELECT * FROM classroom_lectures WHERE id=?", (lecture_id,)).fetchone()
    conn.commit()
    conn.close()
    try: asyncio.get_running_loop().create_task(dashboard_connections.publish("lecture_updated"))
    except RuntimeError: pass
    return dict(row)

class SubmitBody(BaseModel):
    session_id: int
    answers: Dict[str, int] = Field(default_factory=dict)

@app.get("/")
def root():
    return {"message": "EduTrack AI backend is running", "docs": "/docs"}

@app.get("/health")
def health():
    conn = get_db()
    try:
        conn.execute("SELECT 1")
        return {"status": "ok", "database": "postgresql" if os.getenv("DATABASE_URL") else "sqlite-fallback"}
    finally:
        conn.close()

@app.get("/dashboard/summary")
def dashboard_summary():
    """Live aggregate counts backed by the configured database."""
    conn = get_db()
    try:
        users = conn.execute("SELECT role, COUNT(*) AS total FROM users GROUP BY role").fetchall()
        lectures = conn.execute("SELECT state, COUNT(*) AS total FROM classroom_lectures GROUP BY state").fetchall()
        exams = conn.execute("SELECT COUNT(*) FROM exam_sessions").fetchone()[0]
        results = conn.execute("SELECT COUNT(*) FROM results").fetchone()[0]
        roles = {str(r[0]).lower(): int(r[1]) for r in users}
        states = {str(r[0]).lower(): int(r[1]) for r in lectures}
        return {"users": sum(roles.values()), "students": roles.get("student",0), "teachers": roles.get("teacher",0), "admins": roles.get("admin",0), "classrooms_ongoing": states.get("ongoing",0), "classrooms_completed": states.get("completed",0), "exam_sessions": exams, "published_results": results}
    finally:
        conn.close()

@app.websocket("/ws/dashboard")
async def dashboard_websocket(websocket: WebSocket):
    await dashboard_connections.connect(websocket)
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        dashboard_connections.disconnect(websocket)

@app.get("/dashboard/summary")
def dashboard_summary():
    conn = get_db()
    try:
        users = conn.execute("SELECT role, COUNT(*) AS total FROM users GROUP BY role").fetchall()
        lectures = conn.execute("SELECT state, COUNT(*) AS total FROM classroom_lectures GROUP BY state").fetchall()
        exams = conn.execute("SELECT COUNT(*) FROM exam_sessions").fetchone()[0]
        results = conn.execute("SELECT COUNT(*) FROM results").fetchone()[0]
        roles = {str(r[0]).lower(): int(r[1]) for r in users}
        states = {str(r[0]).lower(): int(r[1]) for r in lectures}
        return {"users":sum(roles.values()),"students":roles.get("student",0),"teachers":roles.get("teacher",0),"admins":roles.get("admin",0),"classrooms_ongoing":states.get("ongoing",0),"classrooms_completed":states.get("completed",0),"exam_sessions":int(exams),"published_results":int(results)}
    finally: conn.close()


@app.get("/dashboard/teacher-summary")
def teacher_dashboard_summary(teacher: str = ""):
    conn = get_db()
    try:
        students = conn.execute("SELECT COUNT(*) FROM users WHERE LOWER(role)='student'").fetchone()[0]
        if teacher:
            sessions = conn.execute("SELECT state, COUNT(*) FROM classroom_lectures WHERE LOWER(teacher)=LOWER(?) GROUP BY state", (teacher,)).fetchall()
            classes = conn.execute("SELECT COUNT(DISTINCT classroom) FROM classroom_lectures WHERE LOWER(teacher)=LOWER(?)", (teacher,)).fetchone()[0]
        else:
            sessions = conn.execute("SELECT state, COUNT(*) FROM classroom_lectures GROUP BY state").fetchall()
            classes = conn.execute("SELECT COUNT(DISTINCT classroom) FROM classroom_lectures").fetchone()[0]
        states={str(r[0]).lower():int(r[1]) for r in sessions}
        total=states.get('ongoing',0)+states.get('completed',0)
        return {"students":int(students),"classes":int(classes),"sessions":total,"ongoing":states.get('ongoing',0),"completed":states.get('completed',0),"engagement":None,"at_risk":None}
    finally: conn.close()

@app.get("/dashboard/student-summary")
def student_dashboard_summary(email: str):
    conn=get_db()
    try:
        sessions=conn.execute("SELECT COUNT(*) FROM exam_sessions WHERE LOWER(user_email)=LOWER(?)",(email,)).fetchone()[0]
        results=conn.execute("SELECT COUNT(*), AVG(percentage) FROM results WHERE LOWER(user_email)=LOWER(?)",(email,)).fetchone()
        live=conn.execute("SELECT COUNT(*) FROM classroom_lectures WHERE state='Ongoing'").fetchone()[0]
        return {"exam_sessions":int(sessions),"completed_exams":int(results[0] or 0),"average_score":round(float(results[1]),1) if results[1] is not None else None,"live_lectures":int(live)}
    finally: conn.close()

class AuthBody(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(pattern="^(Student|Teacher|Admin|student|teacher|admin)$")

class RegisterBody(AuthBody):
    full_name: str = Field(min_length=2, max_length=120)

def _account_table(role: str) -> str:
    return {"student": "student_accounts", "teacher": "teacher_accounts", "admin": "admin_accounts"}[role]

def _password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310000)
    return "pbkdf2_sha256$310000$" + base64.urlsafe_b64encode(salt).decode() + "$" + base64.urlsafe_b64encode(digest).decode()

def _verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt_text, digest_text = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256": return False
        salt = base64.urlsafe_b64decode(salt_text.encode())
        expected = base64.urlsafe_b64decode(digest_text.encode())
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(rounds))
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False

def _issue_access_token(email: str, role: str) -> str:
    # Signed, expiring token (stdlib only); secret must be configured for production.
    secret = os.getenv("AUTH_TOKEN_SECRET", "CHANGE_THIS_EDUTRACK_SECRET_BEFORE_DEPLOYMENT")
    payload = base64.urlsafe_b64encode(json.dumps({"sub": email, "role": role, "exp": int(time.time()) + 8*3600}).encode()).decode().rstrip("=")
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return payload + "." + signature

def _write_auth_log(conn, email: str, role: str, event_type: str, status: str, details: str = ""):
    """Write an audit event without ever recording a password or password hash."""
    conn.execute(
        "INSERT INTO auth_logs(email,role,event_type,status,details) VALUES(?,?,?,?,?)",
        (email or None, role or "unknown", event_type, status, details[:500])
    )


@app.post("/auth/register")
def register(body: RegisterBody):
    email = body.email.strip().lower()
    role = body.role.lower()
    if role == "admin":
        raise HTTPException(403, "Admin accounts must be created by the system administrator.")
    table = _account_table(role)
    conn = get_db()
    try:
        for candidate in ("student_accounts", "teacher_accounts", "admin_accounts"):
            if conn.execute(f"SELECT id FROM {candidate} WHERE LOWER(email)=LOWER(?)", (email,)).fetchone():
                _write_auth_log(conn, email, role, "register", "failed", "Email already belongs to an account")
                conn.commit()
                raise HTTPException(409, "An account with this email already exists.")
        hashed = _password_hash(body.password)
        conn.execute(f"INSERT INTO {table}(full_name,email,password_hash) VALUES(?,?,?)",
                     (body.full_name.strip(), email, hashed))
        # Keep the legacy users table populated for existing dashboard counts and reports.
        legacy = conn.execute("SELECT id FROM users WHERE LOWER(email)=LOWER(?)", (email,)).fetchone()
        if legacy:
            conn.execute("UPDATE users SET password=?, role=? WHERE id=?", (hashed, role, legacy["id"]))
        else:
            conn.execute("INSERT INTO users(email,password,role) VALUES(?,?,?)", (email, hashed, role))
        _write_auth_log(conn, email, role, "register", "success", "Account created")
        conn.commit()
        return {"message": f"{role.title()} account created successfully", "role": role, "email": email}
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        try:
            _write_auth_log(conn, email, role, "register", "failed", "Registration database error")
            conn.commit()
        except Exception:
            conn.rollback()
        raise
    finally:
        conn.close()


@app.post("/auth/login")
def login(body: AuthBody):
    email = body.email.strip().lower()
    role = body.role.lower()
    table = _account_table(role)
    conn = get_db()
    try:
        user = conn.execute(
            f"SELECT id,full_name,email,password_hash,is_active FROM {table} WHERE LOWER(email)=LOWER(?)",
            (email,)
        ).fetchone()
        if not user or not user["is_active"] or not _verify_password(body.password, user["password_hash"]):
            _write_auth_log(conn, email, role, "login", "failed", "Invalid credentials or inactive account")
            conn.commit()
            raise HTTPException(401, "Invalid email or password, or account is inactive.")
        token = _issue_access_token(email, role)
        _write_auth_log(conn, email, role, "login", "success", "Login successful")
        conn.commit()
        return {"access_token": token, "token_type": "bearer", "role": role.title(),
                "email": email, "full_name": user["full_name"]}
    finally:
        conn.close()

@app.post("/exam/start")
def start_exam():
    conn = get_db()
    cur = conn.execute("INSERT INTO exam_sessions(user_email,status) VALUES(?,?)", ("guest@edutrack.ai","started"))
    conn.commit()
    sid = cur.lastrowid
    conn.close()
    return {"id": sid, "session_id": sid, "status": "started", "title": "EduTrack AI Practice Examination"}

@app.get("/exam/questions/{session_id}")
def exam_questions(session_id: int):
    conn = get_db()
    session = conn.execute("SELECT * FROM exam_sessions WHERE id=?", (session_id,)).fetchone()
    if not session:
        conn.close()
        raise HTTPException(404, "Exam session not found")
    rows = conn.execute("SELECT id,subject,question_text,options FROM questions ORDER BY id LIMIT 10").fetchall()
    conn.close()
    return {"questions": [{"id":r["id"],"subject":r["subject"],"question_text":r["question_text"],"question":r["question_text"],"options":json.loads(r["options"])} for r in rows]}

@app.post("/exam/submit")
def submit_exam(body: SubmitBody):
    conn = get_db()
    session = conn.execute("SELECT * FROM exam_sessions WHERE id=?", (body.session_id,)).fetchone()
    if not session:
        conn.close()
        raise HTTPException(404, "Exam session not found")
    if session["status"] == "submitted":
        result = conn.execute("SELECT * FROM results WHERE session_id=?", (body.session_id,)).fetchone()
        conn.close()
        return {"message":"Already submitted","score":result["score"],"total":result["total"],"percentage":result["percentage"]}
    rows = conn.execute("SELECT id,correct_option FROM questions ORDER BY id LIMIT 10").fetchall()
    total, score = len(rows), 0
    for q in rows:
        val = body.answers.get(str(q["id"]))
        if val is not None and int(val) == q["correct_option"]:
            score += 1
        if val is not None:
            conn.execute("INSERT INTO answers(session_id,question_id,selected_option) VALUES(?,?,?)",
                         (body.session_id,q["id"],int(val)))
    pct = round((score/total)*100,2) if total else 0
    conn.execute("UPDATE exam_sessions SET status='submitted', submitted_at=CURRENT_TIMESTAMP WHERE id=?", (body.session_id,))
    conn.execute("INSERT INTO results(session_id,user_email,score,total,percentage) VALUES(?,?,?,?,?)",
                 (body.session_id,session["user_email"],score,total,pct))
    conn.commit()
    conn.close()
    try: asyncio.get_running_loop().create_task(dashboard_connections.publish("exam_submitted"))
    except RuntimeError: pass
    return {"message":"Exam submitted successfully","session_id":body.session_id,"score":score,"total":total,"percentage":pct}

@app.get("/questions")
def get_questions():
    conn = get_db()
    rows = conn.execute("SELECT id,subject,question_text,options FROM questions ORDER BY id").fetchall()
    conn.close()
    return [{"id":r["id"],"subject":r["subject"],"question_text":r["question_text"],"options":json.loads(r["options"])} for r in rows]

@app.get("/exam/results")
def get_results():
    conn = get_db()
    rows = conn.execute("SELECT id,session_id,user_email,score,total,percentage,submitted_at FROM results ORDER BY id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/proctor/face-check")
def proctor_face_check(body: dict):
    """Detect faces in one webcam frame. This is face-presence detection only."""
    image_data = str(body.get("image", ""))
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]
    if not image_data:
        raise HTTPException(400, "Image frame is required")
    try:
        raw = base64.b64decode(image_data)
        frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Invalid image frame")
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        detector = cv2.CascadeClassifier(cascade_path)
        faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
        count = len(faces)
        return {"face_count": count, "face_detected": count > 0, "multiple_faces": count > 1,
                "status": "No face detected" if count == 0 else "Multiple faces detected" if count > 1 else "One face detected"}
    except Exception as exc:
        raise HTTPException(400, f"Could not process webcam frame: {exc}")


# ---------------- Phase 4: scheduled exams & assessment APIs ----------------
from datetime import datetime
from pydantic import BaseModel, Field

class ScheduledQuestion(BaseModel):
    question_text: str = Field(min_length=3, max_length=2000)
    options: list[str] = Field(min_length=2, max_length=6)
    correct_option: int = Field(ge=0, le=5)
    marks: int = Field(default=1, ge=1, le=100)

class ScheduledExamCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    subject: str = Field(min_length=2, max_length=100)
    classroom: str = Field(min_length=2, max_length=120)
    teacher_email: str = Field(min_length=3, max_length=254)
    starts_at: str = Field(min_length=10, max_length=40)
    duration_minutes: int = Field(default=30, ge=1, le=300)
    status: str = Field(default="Published", pattern="^(Draft|Published|Cancelled)$")
    questions: list[ScheduledQuestion] = Field(min_length=1, max_length=100)

class ScheduledExamSubmit(BaseModel):
    answers: Dict[str, int] = Field(default_factory=dict)

@app.post("/exams")
async def create_scheduled_exam(body: ScheduledExamCreate):
    if any(q.correct_option >= len(q.options) for q in body.questions):
        raise HTTPException(400, "Correct option index must exist in the question options.")
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO scheduled_exams(title,subject,classroom,teacher_email,starts_at,duration_minutes,total_marks,status) VALUES(?,?,?,?,?,?,?,?)",
            (body.title, body.subject, body.classroom, body.teacher_email.lower(), body.starts_at,
             body.duration_minutes, sum(q.marks for q in body.questions), body.status))
        exam_id = cur.lastrowid
        for q in body.questions:
            conn.execute(
                "INSERT INTO scheduled_exam_questions(exam_id,question_text,options,correct_option,marks) VALUES(?,?,?,?,?)",
                (exam_id, q.question_text, json.dumps(q.options), q.correct_option, q.marks))
        conn.commit()
    finally:
        conn.close()
    await dashboard_connections.publish("exam_created")
    return {"id": exam_id, "title": body.title, "subject": body.subject, "classroom": body.classroom,
            "teacher_email": body.teacher_email, "starts_at": body.starts_at,
            "duration_minutes": body.duration_minutes, "total_marks": sum(q.marks for q in body.questions),
            "status": body.status, "question_count": len(body.questions)}

@app.get("/exams")
def list_scheduled_exams(classroom: str = "", teacher_email: str = "", status: str = ""):
    conn = get_db()
    try:
        sql = """SELECT e.id,e.title,e.subject,e.classroom,e.teacher_email,e.starts_at,e.duration_minutes,
                 e.total_marks,e.status,e.created_at,COUNT(q.id) AS question_count
                 FROM scheduled_exams e LEFT JOIN scheduled_exam_questions q ON q.exam_id=e.id WHERE 1=1"""
        params = []
        if classroom: sql += " AND LOWER(e.classroom)=LOWER(?)"; params.append(classroom)
        if teacher_email: sql += " AND LOWER(e.teacher_email)=LOWER(?)"; params.append(teacher_email)
        if status: sql += " AND e.status=?"; params.append(status)
        sql += " GROUP BY e.id ORDER BY e.id DESC"
        return [dict(r) for r in conn.execute(sql, tuple(params)).fetchall()]
    finally:
        conn.close()

@app.get("/exams/{exam_id}")
def get_scheduled_exam(exam_id: int):
    conn = get_db()
    try:
        exam = conn.execute("SELECT * FROM scheduled_exams WHERE id=?", (exam_id,)).fetchone()
        if not exam: raise HTTPException(404, "Exam not found")
        questions = conn.execute("SELECT id,question_text,options,marks FROM scheduled_exam_questions WHERE exam_id=? ORDER BY id", (exam_id,)).fetchall()
        return {"exam": dict(exam), "questions": [{"id":q["id"],"question_text":q["question_text"],"options":json.loads(q["options"]),"marks":q["marks"]} for q in questions]}
    finally:
        conn.close()

@app.post("/exams/{exam_id}/attempts")
async def start_scheduled_exam_attempt(exam_id: int, body: dict):
    email = str(body.get("student_email", "")).strip().lower()
    if not email: raise HTTPException(400, "student_email is required")
    conn = get_db()
    try:
        exam = conn.execute("SELECT * FROM scheduled_exams WHERE id=?", (exam_id,)).fetchone()
        if not exam or exam["status"] != "Published": raise HTTPException(404, "Published exam not found")
        existing = conn.execute("SELECT * FROM scheduled_exam_attempts WHERE exam_id=? AND LOWER(student_email)=LOWER(?)", (exam_id,email)).fetchone()
        if existing:
            if existing["status"] == "Submitted": raise HTTPException(409, "This exam has already been submitted.")
            return {"attempt_id": existing["id"], "status": existing["status"]}
        cur = conn.execute("INSERT INTO scheduled_exam_attempts(exam_id,student_email,status) VALUES(?,?,?)", (exam_id,email,"In Progress"))
        conn.commit()
        return {"attempt_id": cur.lastrowid, "status":"In Progress"}
    finally:
        conn.close()

@app.post("/exams/attempts/{attempt_id}/submit")
async def submit_scheduled_exam_attempt(attempt_id: int, body: ScheduledExamSubmit):
    conn = get_db()
    try:
        attempt = conn.execute("SELECT * FROM scheduled_exam_attempts WHERE id=?", (attempt_id,)).fetchone()
        if not attempt: raise HTTPException(404, "Attempt not found")
        if attempt["status"] == "Submitted":
            result = conn.execute("SELECT * FROM scheduled_exam_results WHERE attempt_id=?", (attempt_id,)).fetchone()
            return dict(result)
        questions = conn.execute("SELECT id,correct_option,marks FROM scheduled_exam_questions WHERE exam_id=? ORDER BY id", (attempt["exam_id"],)).fetchall()
        score = total = 0
        for q in questions:
            total += int(q["marks"])
            selected = body.answers.get(str(q["id"]))
            if selected is not None:
                if int(selected) < 0: raise HTTPException(400, "Invalid selected option")
                conn.execute("INSERT INTO scheduled_exam_answers(attempt_id,question_id,selected_option) VALUES(?,?,?)", (attempt_id,q["id"],int(selected)))
                if int(selected) == int(q["correct_option"]): score += int(q["marks"])
        pct = round(score * 100 / total, 2) if total else 0
        conn.execute("UPDATE scheduled_exam_attempts SET status='Submitted',submitted_at=CURRENT_TIMESTAMP WHERE id=?", (attempt_id,))
        conn.execute("INSERT INTO scheduled_exam_results(attempt_id,exam_id,student_email,score,total_marks,percentage) VALUES(?,?,?,?,?,?)",
                     (attempt_id,attempt["exam_id"],attempt["student_email"],score,total,pct))
        conn.commit()
        result = {"attempt_id":attempt_id,"exam_id":attempt["exam_id"],"student_email":attempt["student_email"],"score":score,"total_marks":total,"percentage":pct,"status":"Submitted"}
    finally:
        conn.close()
    await dashboard_connections.publish("exam_submitted")
    return result

@app.get("/exams/{exam_id}/results")
def scheduled_exam_results(exam_id: int):
    conn = get_db()
    try:
        exam = conn.execute("SELECT id,title,total_marks FROM scheduled_exams WHERE id=?", (exam_id,)).fetchone()
        if not exam: raise HTTPException(404, "Exam not found")
        rows = conn.execute("SELECT student_email,score,total_marks,percentage,submitted_at FROM scheduled_exam_results WHERE exam_id=? ORDER BY percentage DESC", (exam_id,)).fetchall()
        return {"exam":dict(exam),"results":[dict(r) for r in rows]}
    finally:
        conn.close()


# ---------------- Phase 5: study materials, assignments, submissions, notifications ----------------
UPLOAD_ROOT = Path(__file__).resolve().parent / "uploads"
MATERIAL_ROOT = UPLOAD_ROOT / "materials"
ASSIGNMENT_ROOT = UPLOAD_ROOT / "submissions"
MATERIAL_ROOT.mkdir(parents=True, exist_ok=True)
ASSIGNMENT_ROOT.mkdir(parents=True, exist_ok=True)

ALLOWED_MATERIAL_EXT = {".pdf", ".ppt", ".pptx", ".doc", ".docx", ".txt", ".png", ".jpg", ".jpeg"}
ALLOWED_SUBMISSION_EXT = ALLOWED_MATERIAL_EXT
MAX_UPLOAD_BYTES = 20 * 1024 * 1024

def _safe_ext(filename: str, allowed: set[str]):
    ext = Path(filename or "").suffix.lower()
    if ext not in allowed:
        raise HTTPException(415, f"Unsupported file type: {ext or 'no extension'}")
    return ext

async def _save_upload(upload: UploadFile, folder: Path, allowed: set[str]):
    ext = _safe_ext(upload.filename or "", allowed)
    data = await upload.read(MAX_UPLOAD_BYTES + 1)
    if not data: raise HTTPException(400, "Uploaded file is empty")
    if len(data) > MAX_UPLOAD_BYTES: raise HTTPException(413, "Maximum upload size is 20 MB")
    stored = f"{uuid.uuid4().hex}{ext}"
    (folder / stored).write_bytes(data)
    return stored, len(data)

@app.post("/materials")
async def upload_study_material(
    title: str = Form(...), description: str = Form(""),
    classroom: str = Form(...), subject: str = Form(...),
    teacher_email: str = Form(...), file: UploadFile = File(...)
):
    stored, size = await _save_upload(file, MATERIAL_ROOT, ALLOWED_MATERIAL_EXT)
    conn = get_db()
    try:
        cur = conn.execute("""INSERT INTO study_materials
          (title,description,classroom,subject,teacher_email,original_filename,stored_filename,content_type,size_bytes)
          VALUES(?,?,?,?,?,?,?,?,?)""",
          (title.strip(),description.strip(),classroom.strip(),subject.strip(),teacher_email.lower().strip(),
           file.filename or stored,stored,file.content_type or "application/octet-stream",size))
        material_id = cur.lastrowid
        # Classroom+subject scoped announcement; student dashboard can request matching scope.
        conn.execute("INSERT INTO notifications(recipient_email,title,message,category) VALUES(?,?,?,?)",
          (f"classroom:{classroom.strip().lower()}|subject:{subject.strip().lower()}",
           "New study material", f"{title.strip()} has been uploaded for {classroom.strip()} · {subject.strip()}", "Material"))
        conn.commit()
    finally: conn.close()
    await dashboard_connections.publish("material_uploaded")
    return {"id":material_id,"title":title,"classroom":classroom,"subject":subject,"filename":file.filename,"size_bytes":size}

@app.get("/materials")
def list_study_materials(classroom: str, subject: str, teacher_email: str = ""):
    conn=get_db()
    try:
        sql="""SELECT id,title,description,classroom,subject,teacher_email,original_filename,content_type,size_bytes,created_at
               FROM study_materials WHERE LOWER(classroom)=LOWER(?) AND LOWER(subject)=LOWER(?) AND is_published=TRUE"""
        params=[classroom,subject]
        if teacher_email: sql += " AND LOWER(teacher_email)=LOWER(?)"; params.append(teacher_email)
        sql += " ORDER BY id DESC"
        return [dict(x) for x in conn.execute(sql,tuple(params)).fetchall()]
    finally: conn.close()

@app.get("/materials/{material_id}/download")
def download_study_material(material_id: int):
    from fastapi.responses import FileResponse
    conn=get_db()
    try: row=conn.execute("SELECT * FROM study_materials WHERE id=? AND is_published=TRUE",(material_id,)).fetchone()
    finally: conn.close()
    if not row: raise HTTPException(404,"Material not found")
    path=MATERIAL_ROOT / row["stored_filename"]
    if not path.is_file(): raise HTTPException(404,"Material file is missing")
    return FileResponse(path,filename=row["original_filename"],media_type=row["content_type"])

@app.delete("/materials/{material_id}")
async def delete_study_material(material_id: int, teacher_email: str):
    conn=get_db()
    try:
        row=conn.execute("SELECT * FROM study_materials WHERE id=? AND LOWER(teacher_email)=LOWER(?)",(material_id,teacher_email)).fetchone()
        if not row: raise HTTPException(404,"Material not found for this teacher")
        conn.execute("DELETE FROM study_materials WHERE id=?",(material_id,)); conn.commit()
        file_path=MATERIAL_ROOT / row["stored_filename"]
        if file_path.exists(): file_path.unlink()
    finally: conn.close()
    await dashboard_connections.publish("material_deleted")
    return {"success":True}

@app.post("/assignments")
async def create_assignment(body: dict):
    required=("title","classroom","subject","teacher_email","due_at")
    if any(not str(body.get(k,"")).strip() for k in required):
        raise HTTPException(400,"title, classroom, subject, teacher_email and due_at are required")
    marks=int(body.get("max_marks",100))
    if marks < 1 or marks > 10000: raise HTTPException(400,"max_marks must be between 1 and 10000")
    conn=get_db()
    try:
        cur=conn.execute("""INSERT INTO assignments(title,description,classroom,subject,teacher_email,due_at,max_marks,status)
          VALUES(?,?,?,?,?,?,?,?)""",(body["title"].strip(),body.get("description",""),body["classroom"].strip(),
          body["subject"].strip(),body["teacher_email"].lower().strip(),body["due_at"],marks,body.get("status","Published")))
        aid=cur.lastrowid
        conn.execute("INSERT INTO notifications(recipient_email,title,message,category) VALUES(?,?,?,?)",
          (f"classroom:{body['classroom'].strip().lower()}|subject:{body['subject'].strip().lower()}",
           "New assignment",f"{body['title']} is available. Due: {body['due_at']}","Assignment"))
        conn.commit()
    finally: conn.close()
    await dashboard_connections.publish("assignment_created")
    return {"id":aid,**body,"max_marks":marks}

@app.get("/assignments")
def list_assignments(classroom: str, subject: str, teacher_email: str = ""):
    conn=get_db()
    try:
        sql="SELECT * FROM assignments WHERE LOWER(classroom)=LOWER(?) AND LOWER(subject)=LOWER(?)"
        params=[classroom,subject]
        if teacher_email: sql+=" AND LOWER(teacher_email)=LOWER(?)"; params.append(teacher_email)
        sql+=" ORDER BY id DESC"
        return [dict(x) for x in conn.execute(sql,tuple(params)).fetchall()]
    finally: conn.close()

@app.post("/assignments/{assignment_id}/submit")
async def submit_assignment(assignment_id: int, student_email: str = Form(...), file: UploadFile = File(...)):
    stored, _ = await _save_upload(file, ASSIGNMENT_ROOT, ALLOWED_SUBMISSION_EXT)
    conn=get_db()
    try:
        assignment=conn.execute("SELECT * FROM assignments WHERE id=? AND status='Published'",(assignment_id,)).fetchone()
        if not assignment: raise HTTPException(404,"Assignment not found")
        conn.execute("""INSERT INTO assignment_submissions(assignment_id,student_email,stored_filename,original_filename)
          VALUES(?,?,?,?) ON CONFLICT(assignment_id,student_email) DO UPDATE SET
          stored_filename=excluded.stored_filename,original_filename=excluded.original_filename,submitted_at=CURRENT_TIMESTAMP""",
          (assignment_id,student_email.lower().strip(),stored,file.filename or stored))
        conn.commit()
    finally: conn.close()
    await dashboard_connections.publish("assignment_submitted")
    return {"success":True,"assignment_id":assignment_id,"student_email":student_email}

@app.get("/assignments/{assignment_id}/submissions")
def get_assignment_submissions(assignment_id: int):
    conn=get_db()
    try:
        rows=conn.execute("""SELECT id,assignment_id,student_email,original_filename,submitted_at,marks,feedback
          FROM assignment_submissions WHERE assignment_id=? ORDER BY submitted_at DESC""",(assignment_id,)).fetchall()
        return [dict(x) for x in rows]
    finally: conn.close()

@app.patch("/assignments/submissions/{submission_id}/grade")
async def grade_assignment_submission(submission_id: int, body: dict):
    marks=int(body.get("marks",-1)); feedback=str(body.get("feedback",""))
    if marks < 0: raise HTTPException(400,"marks must be zero or greater")
    conn=get_db()
    try:
        row=conn.execute("""SELECT s.id,a.max_marks FROM assignment_submissions s
          JOIN assignments a ON a.id=s.assignment_id WHERE s.id=?""",(submission_id,)).fetchone()
        if not row: raise HTTPException(404,"Submission not found")
        if marks > row["max_marks"]: raise HTTPException(400,"Marks exceed assignment maximum")
        conn.execute("UPDATE assignment_submissions SET marks=?,feedback=? WHERE id=?",(marks,feedback,submission_id))
        conn.commit()
    finally: conn.close()
    await dashboard_connections.publish("assignment_graded")
    return {"success":True,"submission_id":submission_id,"marks":marks,"feedback":feedback}

@app.get("/notifications")
def get_notifications(email: str, classroom: str = "", subject: str = ""):
    conn=get_db()
    try:
        rows=conn.execute("SELECT * FROM notifications WHERE LOWER(recipient_email)=LOWER(?) ORDER BY id DESC LIMIT 100",(email,)).fetchall()
        out=[dict(x) for x in rows]
        if classroom and subject:
            scope=f"classroom:{classroom.lower()}|subject:{subject.lower()}"
            out += [dict(x) for x in conn.execute("SELECT * FROM notifications WHERE recipient_email=? ORDER BY id DESC LIMIT 100",(scope,)).fetchall()]
        return out
    finally: conn.close()

@app.patch("/notifications/{notification_id}/read")
def mark_notification_read(notification_id: int, email: str):
    conn=get_db()
    try:
        cur=conn.execute("UPDATE notifications SET is_read=TRUE WHERE id=? AND LOWER(recipient_email)=LOWER(?)",(notification_id,email))
        conn.commit()
        if not cur.rowcount: raise HTTPException(404,"Notification not found")
    finally: conn.close()
    return {"success":True}
