import ProctorPanel from "./ProctorPanel";
import { useCallback, useEffect, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const DURATION_SECONDS = 45 * 60;

export default function ExamPanel({ token, exam, onExit, onExamStarted, onExamSubmitted, onExamFinished }) {
  const [phase, setPhase] = useState("instructions");
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [review, setReview] = useState([]);
  const [current, setCurrent] = useState(0);
  const [seconds, setSeconds] = useState(DURATION_SECONDS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [proctorWarning, setProctorWarning] = useState("");
  const [autoSubmitNotice, setAutoSubmitNotice] = useState(false);
  const submitted = useRef(false);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const submitExam = useCallback(async (automatic = false) => {
    if (!session || submitted.current) return;
    submitted.current = true;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/exam/submit`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.id, answers })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not submit exam.");
      setPhase("submitted");
      if (automatic) setAutoSubmitNotice(true);
      onExamSubmitted?.(data);
      if (automatic) {
        onExamFinished?.(data);
        window.setTimeout(() => onExit?.(), 4500);
      }
    } catch (e) {
      submitted.current = false;
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [session, answers, token, onExamSubmitted, onExamFinished, onExit]);

  useEffect(() => {
    if (phase !== "exam") return;
    if (seconds <= 0) {
      submitExam(true);
      return;
    }
    const timer = window.setTimeout(() => setSeconds(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, seconds, submitExam]);

  async function startExam() {
    setLoading(true);
    setError("");
    submitted.current = false;
    try {
      const response = await fetch(`${API}/exam/start`, { method: "POST", headers });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Unable to start exam.");
      const sessionId = data.id ?? data.session_id;
      if (!sessionId) throw new Error("The server did not return an exam session ID (expected id or session_id).");
      const qResponse = await fetch(`${API}/exam/questions/${sessionId}`, { headers });
      const qData = await qResponse.json().catch(() => ({}));
      if (!qResponse.ok) throw new Error(qData.detail || "Unable to load questions.");
      const list = qData.questions || [];
      if (!list.length) throw new Error("No questions are available for this exam.");
      setSession({ ...data, id: sessionId });
      setQuestions(list);
      setAnswers({});
      setReview([]);
      setCurrent(0);
      setSeconds(DURATION_SECONDS);
      setPhase("exam");
      onExamStarted?.(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const handleProctorWarning = useCallback((count, reason) => {
    setProctorWarning(`Warning ${count}/4: ${reason}`);
  }, []);
  const handleProctorAutoSubmit = useCallback((reason) => {
    setProctorWarning("4th warning: Your exam answers are being submitted. Redirecting to dashboard…");
    submitExam(true);
  }, [submitExam]);

  const question = questions[current];
  const options = question ? (question.options || question.choices || [question.option_a, question.option_b, question.option_c, question.option_d].filter(Boolean)) : [];
  const formatTime = value => `${String(Math.floor(value / 60)).padStart(2,"0")}:${String(value % 60).padStart(2,"0")}`;

  if (phase === "instructions") return (
    <section className="et-exam-shell">
      <h2>{exam?.title || "Secure Online Examination"}</h2>
      <p>{exam ? `${exam.date || ""} · ${exam.time || ""}` : "Read the instructions before starting."} Your attempt will be monitored during the exam.</p>
      <ul><li>Keep your camera enabled and face visible.</li><li>Do not refresh or leave the exam tab.</li><li>Use the question palette to navigate.</li><li>Submit before the timer ends.</li></ul>
      {error && <p className="et-error">{error}</p>}
      <div className="et-instruction-actions">
        {onExit && <button className="secondary" onClick={onExit}>Cancel / Back</button>}
        <button disabled={loading} onClick={startExam}>{loading ? "Preparing exam…" : "Start Exam"}</button>
      </div>
      <ExamStyles />
    </section>
  );

  if (phase === "submitted") return <section className="et-exam-shell"><h2>{autoSubmitNotice ? "Exam auto-submitted" : "Exam submitted"}</h2><p>{autoSubmitNotice ? "You received 4 proctoring warnings. Your exam answers have been submitted and you are being redirected to the student dashboard." : "Your answers have been submitted successfully."}</p>{onExit && <button onClick={onExit}>Back to dashboard</button>}<ExamStyles /></section>;

  return (
    <section className="et-exam-shell">
      <div className="et-exam-top"><div><b>EduTrack AI · Secure Examination</b><small>Question {current + 1} of {questions.length}</small></div><strong className={seconds < 300 ? "urgent" : ""}>⏱ {formatTime(seconds)}</strong></div>
      {error && <p className="et-error">{error}</p>}
      <div className="et-exam-layout et-exam-layout-proctored">
        <main className="et-question">
          <small>QUESTION {current + 1}</small>
          <h3>{question?.question || question?.question_text || question?.text || "Question text unavailable"}</h3>
          <div className="et-options">
            {options.map((option,index) => {
              const value = String(index);
              return <label className={answers[question.id] === value ? "selected" : ""} key={index}>
                <input type="radio" name={`question-${question.id}`} checked={answers[question.id] === value} onChange={() => setAnswers(old => ({...old,[question.id]:value}))}/>
                {String(option)}
              </label>;
            })}
          </div>
          <div className="et-question-actions">
            <button className="secondary" onClick={() => setReview(old => old.includes(question.id) ? old.filter(id => id !== question.id) : [...old,question.id])}>{review.includes(question.id) ? "★ Marked for review" : "☆ Mark for review"}</button>
            <div><button className="secondary" disabled={current===0} onClick={()=>setCurrent(v=>v-1)}>Previous</button><button onClick={()=>setCurrent(v=>Math.min(questions.length-1,v+1))} disabled={current===questions.length-1}>Next</button></div>
          </div>
          <button className="et-submit" disabled={loading} onClick={()=>{if(window.confirm("Submit your exam now?")) submitExam(false)}}>{loading?"Submitting…":"Submit Exam"}</button>
        </main>
        <div className="et-proctor-column">{proctorWarning && <div className="et-proctor-live-warning" role="alert">{proctorWarning}</div>}<ProctorPanel onWarning={handleProctorWarning} onAutoSubmit={handleProctorAutoSubmit} /><aside className="et-palette"><b>Question Palette</b><div className="et-palette-grid">{questions.map((q,i)=><button key={q.id ?? i} className={`${current===i?"current":""} ${answers[q.id]!=null?"answered":""} ${review.includes(q.id)?"review":""}`} onClick={()=>setCurrent(i)}>{i+1}</button>)}</div><p>{Object.keys(answers).length} answered · {review.length} for review</p></aside></div>
      </div>
      <ExamStyles />
    </section>
  );
}

function ExamStyles(){return <style>{`
.et-exam-shell{background:#0f172a;color:#e5e7eb;border:1px solid #334155;border-radius:18px;padding:26px;max-width:1600px;width:calc(100% - 24px);box-sizing:border-box;margin:20px auto;font-family:Inter,system-ui,sans-serif}
.et-exam-shell h2{margin:0 0 10px}.et-exam-shell p,.et-exam-shell li{color:#aab7ca;line-height:1.6}
.et-exam-shell button{border:0;border-radius:9px;padding:10px 15px;background:#8b5cf6;color:white;font-weight:650;cursor:pointer}.et-exam-shell button:disabled{opacity:.45;cursor:not-allowed}
.et-exam-shell .et-error{color:#fca5a5}.et-instruction-actions{display:flex;gap:10px;flex-wrap:wrap}.et-exam-page{min-height:100vh;background:#080d18;padding:16px}.et-exam-page-header{max-width:1200px;margin:0 auto 12px;display:flex;justify-content:space-between;align-items:center;color:#cbd5e1}.et-exam-page-header button{border:1px solid #334155;background:#172033;color:#e2e8f0;border-radius:8px;padding:9px 12px;cursor:pointer}.et-exam-top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;padding-bottom:14px;margin-bottom:18px}
.et-exam-top small{display:block;color:#94a3b8;margin-top:5px}.et-exam-top strong{background:#312e81;padding:10px 14px;border-radius:9px}.et-exam-top .urgent{background:#7f1d1d;color:#fecaca}
.et-exam-layout{display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:18px}.et-exam-layout-proctored{grid-template-columns:minmax(0,1fr) minmax(320px,370px);align-items:start}.et-proctor-column{display:grid;gap:14px;align-content:start;min-width:0}.et-question,.et-palette{background:#172033;border:1px solid #334155;border-radius:13px;padding:18px}
.et-question>small{color:#a78bfa;font-weight:700}.et-question h3{font-size:20px;line-height:1.5;margin:14px 0 20px}
.et-options{display:grid;gap:10px}.et-options label{display:flex;align-items:center;gap:12px;padding:13px;border:1px solid #3b465a;border-radius:10px;cursor:pointer}.et-options label.selected{border-color:#8b5cf6;background:#2e2450}.et-options input{accent-color:#a78bfa}
.et-question-actions{display:flex;justify-content:space-between;gap:10px;margin-top:22px}.et-question-actions>div{display:flex;gap:8px}.et-exam-shell button.secondary{background:#293449;color:#e2e8f0}.et-proctor-live-warning{background:#78350f;color:#fde68a;border:1px solid #d97706;border-radius:10px;padding:12px;font-size:13px;font-weight:700}.et-submit{margin-top:18px!important;background:#b42336!important}
.et-palette-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:14px 0}.et-palette-grid button{padding:9px 0;background:#334155}.et-palette-grid button.current{outline:2px solid #c4b5fd}.et-palette-grid button.answered{background:#15803d}.et-palette-grid button.review{background:#7c3aed}.et-palette p{font-size:12px}
@media(max-width:1100px){.et-exam-layout-proctored{grid-template-columns:1fr}.et-proctor-column{grid-column:auto;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}@media(max-width:760px){.et-exam-layout,.et-exam-layout-proctored{grid-template-columns:1fr}.et-proctor-column{grid-column:auto;grid-template-columns:1fr}.et-question-actions{flex-direction:column}.et-question-actions>div{justify-content:space-between}}
`}</style>}
