"""Create an EduTrack AI admin account interactively.

Run from the project root:
    python -m backend.create_admin
"""
import getpass
import hashlib
import secrets
import base64
from .database import get_db, init_db

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310000)
    return "pbkdf2_sha256$310000$" + base64.urlsafe_b64encode(salt).decode() + "$" + base64.urlsafe_b64encode(digest).decode()

def main():
    init_db()
    name = input("Admin full name: ").strip()
    email = input("Admin email: ").strip().lower()
    password = getpass.getpass("Admin password (minimum 8 chars): ")
    if len(name) < 2 or "@" not in email or len(password) < 8:
        raise SystemExit("Please enter a valid name, email and password (8+ characters).")
    conn = get_db()
    try:
        for table in ("student_accounts", "teacher_accounts", "admin_accounts"):
            if conn.execute(f"SELECT id FROM {table} WHERE LOWER(email)=LOWER(?)", (email,)).fetchone():
                raise SystemExit("This email already belongs to an account.")
        encoded = hash_password(password)
        conn.execute("INSERT INTO admin_accounts(full_name,email,password_hash) VALUES(?,?,?)", (name,email,encoded))
        old = conn.execute("SELECT id FROM users WHERE LOWER(email)=LOWER(?)", (email,)).fetchone()
        if old:
            conn.execute("UPDATE users SET password=?, role='admin' WHERE id=?", (encoded,old["id"]))
        else:
            conn.execute("INSERT INTO users(email,password,role) VALUES(?,?,?)", (email,encoded,"admin"))
        conn.commit()
        print("Admin account created. You can now log in using the Admin role.")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
