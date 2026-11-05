import { useState } from "react";
import "./Login.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function Login({ onLogin }) {
  const [role, setRole] = useState("Student");
  const [mode, setMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      const endpoint = mode === "register" ? "/auth/register" : "/auth/login";
      const payload = { email: email.trim(), password, role };
      if (mode === "register") payload.full_name = fullName.trim();
      const response = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || data.message || "Unable to continue. Please try again.");
      if (mode === "register") {
        setMode("login");
        setPassword("");
        setMessage("Account created successfully. Please log in.");
      } else {
        onLogin({
          role: data.role || role,
          email: data.email || email.trim(),
          full_name: data.full_name || "",
          token: data.access_token
        });
      }
    } catch (error) {
      setMessage(error.message || "Backend se connection nahi ho paaya. Check that backend is running.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="edutrack-login">
      <section className="login-visual" aria-label="EduTrack AI introduction">
        <img className="visual-art" src="/edutrack-left-hero.png" alt="EduTrack AI classroom monitoring" />
      </section>
      <section className="login-area">
        <div className="login-panel">
          <div className="mobile-brand">EduTrack <span>AI</span></div>
          <h1>{mode === "login" ? "Welcome Back" : "Create Account"}</h1>
          <p className="login-subtitle">{mode === "login" ? "Sign in to continue to EduTrack AI" : `Register a ${role.toLowerCase()} account`}</p>
          <div className="role-selector" role="tablist" aria-label="Choose account type">
            {[
              { name: "Student", icon: <svg viewBox="0 0 24 24"><path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c3.5 3 8.5 3 12 0v-5M22 9v6"/></svg> },
              { name: "Teacher", icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"/><path d="M4 21c0-4.2 3.6-7 8-7s8 2.8 8 7"/></svg> },
              { name: "Admin", icon: <svg viewBox="0 0 24 24"><path d="M12 2 20 5v6c0 5-3.4 8.8-8 11-4.6-2.2-8-6-8-11V5l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg> },
            ].map(item => (
              <button type="button" role="tab" aria-selected={role === item.name}
                className={`role-button ${role === item.name ? "selected" : ""}`}
                key={item.name} onClick={() => { setRole(item.name); setMessage(""); if (item.name === "Admin") setMode("login"); }}>
                {item.icon}{item.name}
              </button>
            ))}
          </div>
          <form onSubmit={handleSubmit}>
            {mode === "register" && (
              <label className="input-wrap">
                <input type="text" placeholder="Enter your full name" autoComplete="name"
                  value={fullName} onChange={e=>setFullName(e.target.value)} required minLength={2}/>
              </label>
            )}
            <label className="input-wrap">
              <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>
              <input type="email" placeholder="Enter your email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required />
            </label>
            <label className="input-wrap password-wrap">
              <svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
              <input type={showPassword ? "text" : "password"} placeholder={mode === "register" ? "Create password (min. 8 characters)" : "Enter your password"} autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={e=>setPassword(e.target.value)} required minLength={8}/>
              <button type="button" className="password-toggle" onClick={()=>setShowPassword(v=>!v)} aria-label="Toggle password visibility">{showPassword ? "◉" : "◎"}</button>
            </label>
            {message && <p className="login-message" role="alert">{message}</p>}
            <button className="submit-button" type="submit" disabled={busy}>
              {busy ? "Please wait..." : mode === "login" ? "Log In" : "Create Account"} <span>→</span>
            </button>
          </form>
          {role !== "Admin" && (
            <p className="auth-switch">
              {mode === "login" ? "New to EduTrack AI? " : "Already have an account? "}
              <button type="button" onClick={()=>{setMode(mode === "login" ? "register" : "login");setMessage("");}}>
                {mode === "login" ? "Create account" : "Log in"}
              </button>
            </p>
          )}
          <p className="secure-note">Student and Teacher accounts are stored separately and passwords are securely hashed.</p>
        </div>
      </section>
    </main>
  );
}
