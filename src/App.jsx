import { useState } from "react";
import Login from "./Login";
import StudentDashboard from "./StudentDashboard";
import TeacherDashboard from "./TeacherDashboard";
import AdminDashboard from "./AdminDashboard";
import ExamPanel from "./components/ExamPanel";
import ClassroomPage from "./components/ClassroomPage";

export default function App() {
  const [session, setSession] = useState(null);
  const [activeExam, setActiveExam] = useState(null);
  const [activeClassroom, setActiveClassroom] = useState(null);

  function handleLogin({ role, email, full_name, guest = false, token }) {
    if (["Student", "Teacher", "Admin"].includes(role)) {
      setSession({
        role,
        email: email || `${role.toLowerCase()}@edutrack.ai`,
        full_name: full_name || "",
        guest,
        token: token || ""
      });
    }
  }

  function handleLogout() {
    setActiveExam(null);
    setActiveClassroom(null);
    setSession(null);
  }

  if (!session) return <Login onLogin={handleLogin} />;

  if (activeClassroom) {
    return <ClassroomPage lecture={activeClassroom} studentEmail={session.email} role={session.role} onBack={() => setActiveClassroom(null)} />;
  }

  if (activeExam) {
    return (
      <div className="et-exam-page">
        <div className="et-exam-page-header">
          <button type="button" onClick={() => setActiveExam(null)}>← Back to dashboard</button>
          <span>EduTrack AI · Examination</span>
        </div>
        <ExamPanel
          token={session.token}
          exam={activeExam}
          onExit={() => setActiveExam(null)}
          onExamSubmitted={() => {}}
        />
      </div>
    );
  }

  if (session.role === "Teacher") return <TeacherDashboard session={session} onLogout={handleLogout} onJoinClassroom={(lecture) => setActiveClassroom(lecture)} />;
  if (session.role === "Admin") return <AdminDashboard session={session} onLogout={handleLogout} />;
  return (
    <StudentDashboard
      session={session}
      onLogout={handleLogout}
      onStartExam={(exam) => setActiveExam(exam)}
      onJoinClassroom={(lecture) => setActiveClassroom(lecture)}
    />
  );
}
