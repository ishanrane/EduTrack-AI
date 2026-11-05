import { useEffect, useMemo, useState } from "react";
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
import "./TeacherDashboard.css";

const initialClasses = [
  { name: "DBMS – SE (A)", students: 32, subject: "Database Management Systems" },
  { name: "AI & ML – TE (B)", students: 28, subject: "Artificial Intelligence & Machine Learning" },
  { name: "CN – SE (B)", students: 34, subject: "Computer Networks" },
  { name: "DM – TE (A)", students: 34, subject: "Discrete Mathematics" },
];
const initialSessions = [
  { id: 1, title: "DBMS – Practical Session", date: "Nov 04", time: "02:00 PM – 03:30 PM", classroom: "DBMS – SE (A)", state: "Upcoming" },
  { id: 2, title: "AI & ML – Revision", date: "Nov 06", time: "04:00 PM – 05:00 PM", classroom: "AI & ML – TE (B)", state: "Upcoming" },
  { id: 3, title: "Computer Networks Lecture", date: "Oct 29", time: "11:00 AM – 12:00 PM", classroom: "CN – SE (B)", state: "Completed" },
  { id: 4, title: "DBMS Unit Revision", date: "Oct 27", time: "10:00 AM – 11:00 AM", classroom: "DBMS – SE (A)", state: "Completed" },
];
const risks = [
  { name: "Isha Pawar", detail: "Low engagement (58%)", level: "High Risk", avatar: "IP" },
  { name: "Om Kadam", detail: "Frequent head movement", level: "Medium", avatar: "OK" },
  { name: "Rahul Mane", detail: "Face not detected (2 times)", level: "Medium", avatar: "RM" },
];

const navItems = [
  ["Dashboard","▦"],["My Classrooms","▱"],["Study Materials","▧"],["Class Sessions","▤"],["Monitoring History","◉"],
  ["Exams & Assessments","▧"],["AI Quiz Generator","✧"],["Student Analytics","▥"],
  ["Engagement & Behavior","⌁"],["Risk Assessment","⚠"],["Reports","▤"],
  ["Notifications","♧"],["Settings","⚙"]
];

export default function TeacherDashboard({session,onLogout,onJoinClassroom}) {
  const [active,setActive] = useState("Dashboard");
  const [sessions,setSessions] = useState(initialSessions);
  const [liveSummary,setLiveSummary] = useState({students:0,classes:0,sessions:0,ongoing:0,completed:0,engagement:null,at_risk:null});
  useEffect(() => {
    let stopped=false, socket;
    const load=()=>{loadLectures(); fetch(`${API}/dashboard/teacher-summary?teacher=${encodeURIComponent(name)}`).then(r=>r.ok?r.json():null).then(d=>{if(d&&!stopped)setLiveSummary(d)}).catch(()=>{});};
    load(); const timer=setInterval(load,15000);
    try { socket=new WebSocket(`${API.replace(/^http/,"ws")}/ws/dashboard`); socket.onopen=()=>socket.send("teacher-dashboard"); socket.onmessage=load; } catch {}
    return ()=>{stopped=true;clearInterval(timer);if(socket)socket.close();};
  }, []);
  async function loadLectures() {
    try {
      const r = await fetch(`${API}/classroom/lectures?state=Ongoing`);
      if (!r.ok) return;
      const rows = await r.json();
      const mapped = rows.map(x => ({...x, date:"Today", state:x.state, classroom:x.classroom, title:x.title}));
      setSessions(old => [...mapped, ...old.filter(x => !x.room_id)]);
    } catch (e) { console.error("Could not load shared lectures", e); }
  }
  const [filter,setFilter] = useState("Upcoming");
  const [period,setPeriod] = useState("This Semester");
  const [notice,setNotice] = useState(false);
  const [message,setMessage] = useState("");
  const [modal,setModal] = useState("");
  const [selectedClass,setSelectedClass] = useState(initialClasses[0].name);
  const [quizTopic,setQuizTopic] = useState("Normalization");
  const [quizCount,setQuizCount] = useState("10");
  const [semester,setSemester] = useState("Current Semester");
  const name = session.guest ? "Guest Teacher" : session.email.split("@")[0].replace(/[._-]/g," ").replace(/\b\w/g,c=>c.toUpperCase());
  const ongoing = sessions.filter(s=>s.state==="Ongoing").length;
  const completed = sessions.filter(s=>s.state==="Completed").length;
  const upcoming = sessions.filter(s=>s.state==="Upcoming").length;
  const visibleSessions = sessions.filter(s=>s.state===filter);
  const totalStudents = liveSummary.students;

  async function startSession(id) {
    const selected = sessions.find(s => s.id === id);
    if (!selected) return;
    if (selected.room_id) { setMessage("This lecture is already live for students."); return; }
    try {
      const response = await fetch(`${API}/classroom/lectures`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:selected.title,classroom:selected.classroom,teacher:name,time:selected.time || "Live now"})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not start lecture");
      setSessions(old=>[data,...old.filter(x=>x.id!==id)]);
      setMessage("Lecture live hai. Students ke Ongoing Lectures mein ab dikhni chahiye.");
    } catch(e) { setMessage(e.message || "Backend connection failed."); }
  }
  async function endSession(id) {
    const selected = sessions.find(s => s.id === id);
    if (selected?.room_id && !String(selected.room_id).startsWith("demo-room-")) {
      try { await fetch(`${API}/classroom/lectures/${id}`, {method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({state:"Completed"})}); } catch(e) { setMessage("Could not end lecture on server."); return; }
    }
    setSessions(old=>old.map(s=>s.id===id?{...s,state:"Completed"}:s));
    setMessage("Session ended. Demo session summary is ready in Monitoring History.");
  }
  async function startNewSession() {
    try {
      const response = await fetch(`${API}/classroom/lectures`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:`Live Lecture – ${selectedClass}`,classroom:selectedClass,teacher:name,time:"Live now"})});
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not start lecture");
      setSessions(old=>[data,...old.filter(x=>x.id!==data.id)]);
      setMessage("Lecture live hai. Students ke Ongoing Lectures mein ab dikhni chahiye.");
      setModal(""); setActive("Class Sessions"); setFilter("Ongoing");
    } catch (e) { setMessage(e.message || "Backend connection failed."); }
  }
  function quickAction(action) {
    if(action==="Start Class Session"){setModal("session");return;}
    if(action==="Generate AI Quiz"){setModal("quiz");return;}
    if(action==="Create Exam"){setActive("Exams & Assessments");setMessage("Exam workspace selected.");return;}
    if(action==="Take Attendance"){setActive("My Classrooms");setMessage("Choose a classroom to record attendance.");return;}
    if(action==="View Reports"){setActive("Reports");return;}
    if(action==="Class Heatmap"){setActive("Engagement & Behavior");return;}
  }

  return (
    <div className="teacher-shell">
      <aside className="teacher-sidebar">
        <div className="teacher-brand">
          <div className="teacher-shield">◆<span>▱</span></div>
          <div className="teacher-brand-name">EduTrack <b>AI</b></div>
          <small>Teacher Portal</small>
        </div>
        <nav className="teacher-nav">
          {navItems.map(([label,icon])=><button key={label} onClick={()=>{setActive(label);setMessage("");}} className={`teacher-nav-item ${active===label?"teacher-nav-active":""}`}>
            <span>{icon}</span>{label}{label==="Notifications"&&<i>5</i>}
          </button>)}
        </nav>
        <button className="teacher-logout" onClick={onLogout}>↪ <span>Log out</span></button>
      </aside>

      <main className="teacher-main">
        <header className="teacher-topbar">
          <label className="teacher-search"><span>⌕</span><input placeholder="Search students, classes, exams, reports..."/></label>
          <div className="teacher-top-actions">
            <button className="teacher-bell" onClick={()=>setNotice(v=>!v)}>♧<i/></button>
            {notice&&<div className="teacher-notice">No new notifications. Session alerts will appear here.</div>}
            <div className="teacher-profile"><div className="teacher-avatar">{name.charAt(0).toUpperCase()}</div><div><b>{name}</b><small>Teacher</small></div><button onClick={onLogout}>⌄</button></div>
          </div>
        </header>

        {active==="Dashboard" ? (
          <div className="teacher-content">
            <section className="teacher-welcome">
              <div className="teacher-welcome-avatar">{name.charAt(0).toUpperCase()}</div>
              <div><h1>Good Evening, <span>{name}</span> 👋</h1><p>Manage your classes, sessions, assessments and student progress.</p></div>
              <select value={semester} onChange={e=>setSemester(e.target.value)}><option>Current Semester</option><option>Previous Semester</option><option>Academic Year</option></select>
            </section>

            <section className="teacher-stats">
              <TeacherStat icon="♧" label="Total Students" value={totalStudents} trend="+6%" tone="pink"/>
              <TeacherStat icon="◇" label="Total Classes" value={liveSummary.classes} tone="purple"/>
              <TeacherStat icon="▦" label="Total Sessions" value={liveSummary.sessions} tone="violet"/>
              <TeacherStat icon="✓" label="Completed Sessions" value={liveSummary.completed} tone="green"/>
              <TeacherStat icon="▥" label="Avg. Engagement" value={liveSummary.engagement == null ? "—" : `${liveSummary.engagement}%`} tone="purple"/>
              <TeacherStat icon="⚠" label="At Risk Students" value={liveSummary.at_risk == null ? "—" : liveSummary.at_risk} tone="red"/>
            </section>

            <section className="teacher-top-grid">
              <article className="teacher-card classroom-card">
                <TeacherHeading icon="▣" title="Classroom Overview" action="View All →" onAction={()=>setActive("My Classrooms")}/>
                {initialClasses.map(c=><button className="classroom-line" key={c.name} onClick={()=>{setSelectedClass(c.name);setActive("My Classrooms");}}>
                  <span className="classroom-icon">◇</span><span className="classroom-copy"><b>{c.name}</b><small><i/> {c.students} Students</small></span><span className="classroom-arrow">›</span>
                </button>)}
              </article>

              <article className="teacher-card sessions-card">
                <TeacherHeading icon="▦" title="Class Sessions" action="View All →" onAction={()=>setActive("Class Sessions")}/>
                <div className="session-tabs">{["Upcoming","Ongoing","Completed"].map(s=><button key={s} className={filter===s?"chosen":""} onClick={()=>setFilter(s)}>{s} ({s==="Upcoming"?upcoming:s==="Ongoing"?ongoing:completed})</button>)}</div>
                <div className="session-list compact">
                  {visibleSessions.length===0?<div className="empty-sessions">No {filter.toLowerCase()} sessions right now.</div>:visibleSessions.slice(0,2).map(s=><SessionRow key={s.id} session={s} onStart={()=>startSession(s.id)} onEnd={()=>endSession(s.id)} onJoin={()=>onJoinClassroom?.({sub:s.title,teacher:name,room:s.room_id || s.classroom,room_id:s.room_id,id:s.id,sub:s.title,teacher:s.teacher || teacherName,time:`${s.date || "Today"} · ${s.time}`})}/>)}
                </div>
              </article>

              <article className="teacher-card monitoring-summary">
                <TeacherHeading icon="▣" title="Monitoring Summary" extra="(Session-based)"/>
                <div className="summary-body"><div className="session-donut"><div><b>{sessions.length+8}</b><small>Total<br/>Sessions</small></div></div>
                  <div className="summary-counts"><div><span className="ok">✓</span><b>{completed+7}</b> Completed</div><div><span className="blue">▦</span><b>2</b> Upcoming</div><div><span className="yellow">Ⅱ</span><b>{ongoing}</b> Ongoing</div></div>
                </div>
                <button className="teacher-outline wide" onClick={()=>setActive("Monitoring History")}>View Monitoring History →</button>
              </article>
            </section>

            <section className="teacher-bottom-grid">
              <article className="teacher-card engagement-card">
                <TeacherHeading icon="⚠" title="Student Engagement"><select value={period} onChange={e=>setPeriod(e.target.value)}><option>This Semester</option><option>Last Semester</option><option>This Year</option></select></TeacherHeading>
                <div className="teacher-chart-wrap"><div className="teacher-y-axis"><span>100%</span><span>80%</span><span>60%</span><span>40%</span><span>20%</span><span>0%</span></div>
                  <svg viewBox="0 0 400 170" preserveAspectRatio="none" className="teacher-chart">
                    <defs><linearGradient id="teacherFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#b64bff" stopOpacity=".48"/><stop offset="100%" stopColor="#b64bff" stopOpacity=".02"/></linearGradient></defs>
                    {[12,42,72,102,132,162].map(y=><line key={y} x1="0" x2="400" y1={y} y2={y} stroke="#382c4c"/>)}
                    <path d="M20 92 L135 60 L250 73 L380 55 L380 162 L20 162Z" fill="url(#teacherFill)"/>
                    <path d="M20 92 L135 60 L250 73 L380 55" fill="none" stroke="#b94fff" strokeWidth="3" vectorEffect="non-scaling-stroke"/>
                    {[[20,92],[135,60],[250,73],[380,55]].map(([x,y])=><circle key={x} cx={x} cy={y} r="5" fill="white" stroke="#b94fff" strokeWidth="3"/>)}
                  </svg>
                </div><div className="teacher-chart-labels"><span>DBMS</span><span>AI & ML</span><span>CN</span><span>DM</span></div>
              </article>

              <article className="teacher-card risk-card">
                <TeacherHeading icon="⚠" title="Risk Assessment" action="View All →" onAction={()=>setActive("Risk Assessment")}/>
                {risks.map(r=><div className="risk-line" key={r.name}><div className="risk-avatar">{r.avatar}</div><div className="risk-person"><b>{r.name}</b><small>{r.detail}</small></div><span className={`risk-pill ${r.level==="High Risk"?"high":"medium"}`}>{r.level}</span></div>)}
              </article>

              <article className="teacher-card insights-card">
                <TeacherHeading icon="✧" title="AI Insights & Recommendations"/>
                <Insight icon="▥" text="6 students show consistently low engagement."/>
                <Insight icon="▤" text="Revise: Normalization & Backpropagation (AI & ML)."/>
                <Insight icon="✧" text="Generate a practice quiz for weak topics."/>
                <Insight icon="♧" text="Consider a short revision session for DBMS."/>
              </article>
            </section>

            <section className="teacher-card quick-actions">
              <TeacherHeading icon="ϟ" title="Quick Actions"/>
              <div className="quick-action-list">
                {["Start Class Session","Create Exam","Generate AI Quiz","View Reports","Take Attendance","Class Heatmap"].map((a,i)=><button key={a} className={i===0?"quick-primary":""} onClick={()=>quickAction(a)}><span>{["▷","▤","✧","▥","♙","▦"][i]}</span>{a}</button>)}
              </div>
            </section>
            {message&&<div className="teacher-toast">{message}<button onClick={()=>setMessage("")}>×</button></div>}
            <p className="teacher-demo-note">Sample dashboard data · Monitoring is activated only when a teacher starts a class session.</p>
          </div>
        ) : (
          <TeacherSection active={active} sessions={sessions} setActive={setActive} startSession={startSession} endSession={endSession} filter={filter} setFilter={setFilter} onNew={()=>setModal("session")} onJoinClassroom={onJoinClassroom} teacherName={name}/>
        )}
      </main>

      {modal&&<div className="teacher-modal-backdrop" onClick={()=>setModal("")}><div className="teacher-modal" onClick={e=>e.stopPropagation()}>
        <button className="modal-close" onClick={()=>setModal("")}>×</button>
        {modal==="session"?<>
          <div className="modal-symbol">▷</div><h2>Start Class Session</h2><p>Choose a classroom. Monitoring will only run for this session.</p>
          <label>Classroom<select value={selectedClass} onChange={e=>setSelectedClass(e.target.value)}>{initialClasses.map(c=><option key={c.name}>{c.name}</option>)}</select></label>
          <button className="modal-primary" onClick={startNewSession}>Start Session & Monitoring</button>
        </>:<>
          <div className="modal-symbol">✧</div><h2>Generate AI Quiz</h2><p>Create a practice quiz for your selected topic.</p>
          <label>Topic<input value={quizTopic} onChange={e=>setQuizTopic(e.target.value)}/></label>
          <label>Number of questions<select value={quizCount} onChange={e=>setQuizCount(e.target.value)}><option>5</option><option>10</option><option>15</option><option>20</option></select></label>
          <button className="modal-primary" onClick={()=>{setMessage(`Demo quiz configured: ${quizCount} questions on ${quizTopic}. AI generation will connect with backend later.`);setModal("");}}>Prepare Quiz</button>
        </>}
      </div></div>}
    </div>
  );
}

function TeacherStat({icon,label,value,trend,tone}) {
  return <article className="teacher-stat"><div className={`teacher-stat-icon ${tone}`}>{icon}</div><div><small>{label}</small><div className="teacher-stat-value"><b>{value}</b>{trend&&<em className={trend.startsWith("-")?"negative":""}>{trend.startsWith("-")?"↓":"↑"} {trend.replace("-","")}</em>}</div></div></article>;
}
function TeacherHeading({icon,title,extra,action,onAction,children}) {
  return <div className="teacher-heading"><h2><span>{icon}</span>{title} {extra&&<small>{extra}</small>}</h2>{children}{action&&<button onClick={onAction}>{action}</button>}</div>;
}

function TeacherMaterials({teacherName}) {
 const [title,setTitle]=useState(""),[description,setDescription]=useState(""),[classroom,setClassroom]=useState("DBMS – SE (A)"),[subject,setSubject]=useState("Database Management Systems"),[file,setFile]=useState(null),[items,setItems]=useState([]),[msg,setMsg]=useState("");
 const classes=[["DBMS – SE (A)","Database Management Systems"],["AI & ML – TE (B)","Artificial Intelligence & Machine Learning"],["CN – SE (B)","Computer Networks"],["DM – TE (A)","Discrete Mathematics"]];
 const email=(teacherName||"teacher").toLowerCase().replace(/\s+/g,".")+"@edutrack.ai";
 const load=()=>fetch(`${API}/materials?classroom=${encodeURIComponent(classroom)}&subject=${encodeURIComponent(subject)}`).then(x=>x.ok?x.json():[]).then(setItems).catch(()=>setItems([]));
 useEffect(()=>{load();},[classroom,subject]);
 async function upload(e){e.preventDefault();if(!file){setMsg("Please select a file.");return;}const fd=new FormData();Object.entries({title,description,classroom,subject,teacher_email:email}).forEach(([k,v])=>fd.append(k,v));fd.append("file",file);try{const res=await fetch(`${API}/materials`,{method:"POST",body:fd});const data=await res.json();if(!res.ok)throw Error(data.detail||"Upload failed");setMsg("Material uploaded and shared with matching classroom + subject students.");setTitle("");setDescription("");setFile(null);load();}catch(err){setMsg(err.message);}}
 async function remove(id){if(!confirm("Delete this material?"))return;const res=await fetch(`${API}/materials/${id}?teacher_email=${encodeURIComponent(email)}`,{method:"DELETE"});if(res.ok)load();else setMsg("Could not delete material.");}
 return <div className="teacher-card" style={{padding:22,marginTop:18}}><h2>Upload Study Material</h2><p>Students will see files only when their classroom AND subject match.</p>
 <form onSubmit={upload} style={{display:"grid",gap:12,maxWidth:650}}><input required placeholder="Material title" value={title} onChange={e=>setTitle(e.target.value)}/><textarea placeholder="Description" value={description} onChange={e=>setDescription(e.target.value)}/><select value={classroom} onChange={e=>{setClassroom(e.target.value);setSubject(classes.find(c=>c[0]===e.target.value)?.[1]||"");}}>{classes.map(c=><option value={c[0]}>{c[0]}</option>)}</select><select value={subject} onChange={e=>setSubject(e.target.value)}>{classes.map(c=><option value={c[1]}>{c[1]}</option>)}</select><input required type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.png,.jpg,.jpeg" onChange={e=>setFile(e.target.files?.[0]||null)}/><button type="submit">Upload & Publish</button></form>{msg&&<p>{msg}</p>}<h3>Published materials</h3>{items.map(x=><div key={x.id} style={{display:"flex",gap:12,alignItems:"center",padding:10,borderBottom:"1px solid #ddd"}}><span>{x.title} · {x.original_filename}</span><button onClick={()=>remove(x.id)}>Delete</button></div>)}</div>;
}

function SessionRow({session:s,onStart,onEnd,onJoin}) {
  return <div className="teacher-session-row"><div className="session-icon">▣</div><div className="session-info"><b>{s.title}</b><small>▦ {s.date}, {s.time}</small><small>{s.classroom}</small></div>{s.state==="Upcoming"?<button className="session-action" onClick={onStart}>▷ Start Session</button>:s.state==="Ongoing"?<><button className="session-action" onClick={onJoin}>Join Lecture →</button><button className="session-action end" onClick={onEnd}>■ End Session</button></>:<span className="completed-label">✓ Completed</span>}</div>;
}
function Insight({icon,text}) {return <div className="insight-row"><span>{icon}</span><p>{text}</p></div>;}
function TeacherSection({active,sessions,setActive,startSession,endSession,filter,setFilter,onNew,onJoinClassroom,teacherName}) {
  const [query,setQuery]=useState("");
  const title=active;
  if(active==="Class Sessions"||active==="Monitoring History") {
    const list=active==="Monitoring History"?sessions.filter(s=>s.state==="Completed"):sessions;
    const filtered=list.filter(s=>(active==="Monitoring History"||s.state===filter)&&`${s.title} ${s.classroom}`.toLowerCase().includes(query.toLowerCase()));
    return <div className="teacher-inner-page"><div className="inner-page-heading"><div><h1>{title}</h1><p>{active==="Monitoring History"?"Review completed, session-based monitoring records.":"Schedule and manage classroom sessions."}</p></div>{active==="Class Sessions"&&<button onClick={onNew}>+ Start New Session</button>}</div>
      <input className="section-search" placeholder="Search sessions..." value={query} onChange={e=>setQuery(e.target.value)}/>
      {active==="Class Sessions"&&<div className="session-tabs inner-tabs">{["Upcoming","Ongoing","Completed"].map(s=><button key={s} className={filter===s?"chosen":""} onClick={()=>setFilter(s)}>{s}</button>)}</div>}
      <div className="inner-session-list">{filtered.length?filtered.map(s=><SessionRow key={s.id} session={s} onStart={()=>startSession(s.id)} onEnd={()=>endSession(s.id)} onJoin={()=>onJoinClassroom?.({sub:s.title,teacher:teacherName,room:s.room_id || s.classroom,room_id:s.room_id,id:s.id,sub:s.title,teacher:s.teacher || teacherName,time:`${s.date || "Today"} · ${s.time}`})}/>):<p className="empty-sessions">No sessions found.</p>}</div>
      <button className="teacher-outline" onClick={()=>setActive("Dashboard")}>← Back to Dashboard</button></div>;
  }
  const descriptions={
    "My Classrooms":"View classroom rosters, subjects and student counts.",
    "Exams & Assessments":"Create and manage examinations, assessment schedules and results.",
    "AI Quiz Generator":"Prepare topic-based practice quizzes and adaptive assessments.",
    "Student Analytics":"Review topic-wise performance, progress and learning trends.",
    "Engagement & Behavior":"Explore class engagement patterns and session-based behavior summaries.",
    "Risk Assessment":"Review students flagged for additional academic or engagement support.",
    "Reports":"Access class, student and examination reports.",
    "Notifications":"Session alerts, academic updates and important reminders.",
    "Settings":"Manage teacher profile and portal preferences."
  };
  return <div className="teacher-inner-page"><div className="inner-page-heading"><div><h1>{title}</h1><p>{descriptions[active]||"Teacher workspace"}</p></div></div>
    {active==="My Classrooms"?<div className="inner-class-grid">{initialClasses.map(c=><article className="teacher-card inner-class" key={c.name}><div className="classroom-icon">◇</div><h3>{c.name}</h3><p>{c.subject}</p><b>{c.students} students</b><button onClick={()=>setActive("Student Analytics")}>View Classroom →</button></article>)}</div>:
    active==="Study Materials"?<TeacherMaterials teacherName={teacherName}/>:active==="Risk Assessment"?<div className="teacher-card inner-list">{risks.map(r=><div className="risk-line" key={r.name}><div className="risk-avatar">{r.avatar}</div><div className="risk-person"><b>{r.name}</b><small>{r.detail}</small></div><span className={`risk-pill ${r.level==="High Risk"?"high":"medium"}`}>{r.level}</span></div>)}</div>:
    <div className="teacher-card section-empty"><div className="empty-large">✧</div><h2>{title} workspace</h2><p>This section is ready for the next implementation phase. Real records and AI services will be connected through the backend.</p></div>}
    <button className="teacher-outline" onClick={()=>setActive("Dashboard")}>← Back to Dashboard</button>
  </div>;
}
