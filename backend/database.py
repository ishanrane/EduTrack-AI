"""Database adapter: PostgreSQL in production, SQLite fallback for local legacy use."""
import os, sqlite3
from pathlib import Path
from urllib.parse import urlparse

DB_PATH = Path(__file__).resolve().parent / "edutrack.db"
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

class PgCursor:
    def __init__(self, cursor, lastrowid=None): self._cursor, self.lastrowid = cursor, lastrowid
    def fetchone(self): return self._cursor.fetchone()
    def fetchall(self): return self._cursor.fetchall()
    @property
    def rowcount(self): return self._cursor.rowcount

class PgConnection:
    def __init__(self, conn): self.conn=conn
    def execute(self, sql, params=()):
        from psycopg2.extras import DictCursor
        sql=sql.replace('?', '%s')
        cur=self.conn.cursor(cursor_factory=DictCursor)
        is_insert=sql.lstrip().upper().startswith('INSERT INTO') and ' RETURNING ' not in sql.upper()
        if is_insert: sql += ' RETURNING id'
        cur.execute(sql, params)
        lastrowid=None
        if is_insert:
            row=cur.fetchone(); lastrowid=row['id'] if row else None
        return PgCursor(cur,lastrowid)
    def commit(self): self.conn.commit()
    def close(self): self.conn.close()

class SQLiteConnection:
    def __init__(self, conn): self.conn=conn
    def execute(self,*a,**kw): return self.conn.execute(*a,**kw)
    def executescript(self,*a,**kw): return self.conn.executescript(*a,**kw)
    def commit(self): self.conn.commit()
    def close(self): self.conn.close()

def get_db():
    if DATABASE_URL:
        import psycopg2
        url=DATABASE_URL.replace('postgresql+psycopg2://','postgresql://',1)
        return PgConnection(psycopg2.connect(url))
    conn=sqlite3.connect(DB_PATH); conn.row_factory=sqlite3.Row
    return SQLiteConnection(conn)

def init_db():
    conn=get_db()
    if DATABASE_URL:
        statements=[
        "CREATE TABLE IF NOT EXISTS classroom_lectures (id BIGSERIAL PRIMARY KEY,title TEXT NOT NULL,classroom TEXT NOT NULL,teacher TEXT NOT NULL,time TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'Ongoing',room_id TEXT UNIQUE NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS users (id BIGSERIAL PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS questions (id BIGSERIAL PRIMARY KEY,subject TEXT NOT NULL,question_text TEXT NOT NULL,options TEXT NOT NULL,correct_option INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS exam_sessions (id BIGSERIAL PRIMARY KEY,user_email TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'started',started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,submitted_at TIMESTAMP)",
        "CREATE TABLE IF NOT EXISTS answers (id BIGSERIAL PRIMARY KEY,session_id BIGINT NOT NULL REFERENCES exam_sessions(id),question_id BIGINT NOT NULL REFERENCES questions(id),selected_option INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS results (id BIGSERIAL PRIMARY KEY,session_id BIGINT NOT NULL,user_email TEXT NOT NULL,score INTEGER NOT NULL,total INTEGER NOT NULL,percentage DOUBLE PRECISION NOT NULL,submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        ]
        for sql in statements: conn.execute(sql)
    else:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS classroom_lectures (id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,classroom TEXT NOT NULL,teacher TEXT NOT NULL,time TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'Ongoing',room_id TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT,subject TEXT NOT NULL,question_text TEXT NOT NULL,options TEXT NOT NULL,correct_option INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS exam_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT,user_email TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'started',started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,submitted_at TEXT);
        CREATE TABLE IF NOT EXISTS answers (id INTEGER PRIMARY KEY AUTOINCREMENT,session_id INTEGER NOT NULL,question_id INTEGER NOT NULL,selected_option INTEGER NOT NULL,FOREIGN KEY(session_id) REFERENCES exam_sessions(id),FOREIGN KEY(question_id) REFERENCES questions(id));
        CREATE TABLE IF NOT EXISTS results (id INTEGER PRIMARY KEY AUTOINCREMENT,session_id INTEGER NOT NULL,user_email TEXT NOT NULL,score INTEGER NOT NULL,total INTEGER NOT NULL,percentage REAL NOT NULL,submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        """)
    count=conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    if count==0:
        import json
        seed=[("DL","What is the main purpose of a CNN?",["Learn spatial features from grid-like data","Sort database records","Compress audio only","Replace an operating system"],0),("DL","Which layer commonly reduces spatial dimensions in CNNs?",["Pooling layer","Input layer","Embedding layer","Output file"],0),("NLP","What is tokenization?",["Splitting text into smaller units","Encrypting a database","Sorting images","Compressing video"],0)]
        for s,q,o,a in seed: conn.execute("INSERT INTO questions(subject,question_text,options,correct_option) VALUES(?,?,?,?)",(s,q,json.dumps(o),a))

    # Phase 5: learning materials, assignments, submissions and notifications
    phase5_sql = [
      """CREATE TABLE IF NOT EXISTS study_materials (
        id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '',
        classroom TEXT NOT NULL, subject TEXT NOT NULL, teacher_email TEXT NOT NULL,
        original_filename TEXT NOT NULL, stored_filename TEXT NOT NULL,
        content_type TEXT DEFAULT 'application/octet-stream', size_bytes BIGINT DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, is_published BOOLEAN NOT NULL DEFAULT TRUE
      )""",
      """CREATE TABLE IF NOT EXISTS assignments (
        id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '',
        classroom TEXT NOT NULL, subject TEXT NOT NULL, teacher_email TEXT NOT NULL,
        due_at TEXT NOT NULL, max_marks INTEGER NOT NULL DEFAULT 100,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, status TEXT NOT NULL DEFAULT 'Published'
      )""",
      """CREATE TABLE IF NOT EXISTS assignment_submissions (
        id BIGSERIAL PRIMARY KEY, assignment_id BIGINT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        student_email TEXT NOT NULL, stored_filename TEXT NOT NULL, original_filename TEXT NOT NULL,
        submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, marks INTEGER, feedback TEXT DEFAULT '',
        UNIQUE(assignment_id, student_email)
      )""",
      """CREATE TABLE IF NOT EXISTS notifications (
        id BIGSERIAL PRIMARY KEY, recipient_email TEXT NOT NULL, title TEXT NOT NULL,
        message TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'General',
        is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )"""
    ]
    for statement in phase5_sql:
        conn.execute(statement)

    # Separate account stores: students and teachers never share account tables.
    account_id_type = "BIGSERIAL PRIMARY KEY" if DATABASE_URL else "INTEGER PRIMARY KEY AUTOINCREMENT"
    account_tables = [
      f"""CREATE TABLE IF NOT EXISTS student_accounts (
        id {account_id_type}, full_name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )""",
      f"""CREATE TABLE IF NOT EXISTS teacher_accounts (
        id {account_id_type}, full_name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )""",
      f"""CREATE TABLE IF NOT EXISTS admin_accounts (
        id {account_id_type}, full_name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )"""
    ]
    for statement in account_tables:
        conn.execute(statement)

    # Authentication audit trail: never store raw passwords or password hashes here.
    conn.execute("""CREATE TABLE IF NOT EXISTS auth_logs (
        id BIGSERIAL PRIMARY KEY, email TEXT, role TEXT NOT NULL,
        event_type TEXT NOT NULL, status TEXT NOT NULL,
        event_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, details TEXT DEFAULT ''
    )""")

    # One-time compatibility migration from the legacy shared users table.
    # Legacy plaintext passwords are converted to PBKDF2 before being copied.
    import hashlib, secrets, base64
    legacy_rows = conn.execute("SELECT email,password,role FROM users").fetchall()
    for legacy in legacy_rows:
        legacy_email = str(legacy["email"]).strip().lower()
        legacy_role = str(legacy["role"]).strip().lower()
        if legacy_role not in ("student", "teacher", "admin") or not legacy_email:
            continue
        legacy_password = str(legacy["password"])
        if legacy_password.startswith("pbkdf2_sha256$"):
            encoded = legacy_password
        else:
            salt = secrets.token_bytes(16)
            digest = hashlib.pbkdf2_hmac("sha256", legacy_password.encode(), salt, 310000)
            encoded = "pbkdf2_sha256$310000$" + base64.urlsafe_b64encode(salt).decode() + "$" + base64.urlsafe_b64encode(digest).decode()
            conn.execute("UPDATE users SET password=? WHERE LOWER(email)=LOWER(?)", (encoded, legacy_email))
        target = {"student":"student_accounts", "teacher":"teacher_accounts", "admin":"admin_accounts"}[legacy_role]
        existing = conn.execute(f"SELECT id FROM {target} WHERE LOWER(email)=LOWER(?)", (legacy_email,)).fetchone()
        if not existing:
            conn.execute(f"INSERT INTO {target}(full_name,email,password_hash) VALUES(?,?,?)",
                         (legacy_email.split("@")[0], legacy_email, encoded))

    conn.commit(); conn.close()
