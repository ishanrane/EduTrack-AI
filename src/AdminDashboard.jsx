import { useEffect, useState } from "react";
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
import "./AdminDashboard.css";

const nav = [
  ["Dashboard","▦"],["User Management","♙"],["Classrooms & Courses","▣"],
  ["Exams & Assessments","▤"],["AI Monitoring","◉"],["Reports & Analytics","▥"],
  ["System Settings","⚙"],["AI Models & Config","✧"],["Logs & Audit","▧"]
];
const activities = [
  ["●","New teacher added: Prof. Mehta","10 min ago","green"],
  ["●","Classroom created: AI & ML – TE (B)","24 min ago","blue"],
  ["●","Exam scheduled: DBMS – Unit Test","52 min ago","purple"],
  ["●","Monitoring report generated","1 hour ago","yellow"],
  ["●","System backup completed","2 hours ago","green"]
];
const atRisk = [
  ["IP","Isha Pawar","AI & ML – TE (B)","58%","Low attention, face not detected (2)","High","Nov 04, 2026"],
  ["OK","Om Kadam","DBMS – SE (A)","62%","Frequent head movement","Medium","Nov 04, 2026"],
  ["RM","Rahul Mane","CN – SE (B)","65%","Multiple distractions","Medium","Nov 03, 2026"]
];
export default function AdminDashboard({session,onLogout}) {
  const [active,setActive]=useState("Dashboard");
  const [summary,setSummary]=useState({users:0,students:0,teachers:0,admins:0,classrooms_ongoing:0,classrooms_completed:0,exam_sessions:0,published_results:0});
  useEffect(()=>{
    let socket; let stopped=false;
    const load=()=>fetch(`${API}/dashboard/summary`).then(r=>r.ok?r.json():null).then(d=>{if(d&&!stopped)setSummary(d)}).catch(()=>{});
    load();
    try { socket=new WebSocket(`${API.replace(/^http/,"ws")}/ws/dashboard`); socket.onmessage=load; socket.onopen=()=>{socket.send("dashboard");}; } catch {}
    const timer=setInterval(load,15000);
    return ()=>{stopped=true;clearInterval(timer);if(socket)socket.close();};
  },[]);
  const [period,setPeriod]=useState("Current Semester");
  const [notice,setNotice]=useState(false);
  const [modal,setModal]=useState("");
  const [toast,setToast]=useState("");
  const [userType,setUserType]=useState("Student");
  const [userName,setUserName]=useState("");
  const [userEmail,setUserEmail]=useState("");
  const [className,setClassName]=useState("");
  const [search,setSearch]=useState("");
  const displayName=session.guest?"Guest Admin":session.email.split("@")[0].replace(/[._-]/g," ").replace(/\b\w/g,c=>c.toUpperCase());
  function action(label){
    if(label==="Add User"){setModal("user");return;}
    if(label==="Create Class"){setModal("class");return;}
    if(label==="Schedule Exam"){setActive("Exams & Assessments");setToast("Exam scheduling workspace selected.");return;}
    if(label==="Generate Report"){setActive("Reports & Analytics");setToast("Reports workspace selected.");return;}
    if(label==="Configure AI"){setActive("AI Models & Config");return;}
    if(label==="System Settings"){setActive("System Settings");return;}
  }
  function notify(msg){setToast(msg);setModal("");}
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <div className="admin-brand"><div className="admin-shield">◆<span>▱</span></div><div className="admin-brand-name">EduTrack <b>AI</b></div><small>Admin Portal</small></div>
      <nav className="admin-nav">{nav.map(([label,icon])=><button key={label} className={`admin-nav-item ${active===label?"admin-nav-active":""}`} onClick={()=>{setActive(label);setToast("");}}><span>{icon}</span>{label}</button>)}</nav>
      <button className="admin-logout" onClick={onLogout}>↪ <span>Log out</span></button>
    </aside>
    <main className="admin-main">
      <header className="admin-topbar">
        <label className="admin-search"><span>⌕</span><input placeholder="Search users, classes, exams, reports..." value={search} onChange={e=>setSearch(e.target.value)}/></label>
        <div className="admin-top-actions"><button className="admin-bell" onClick={()=>setNotice(v=>!v)}>♧<i/></button>{notice&&<div className="admin-notice">No new system notifications. Important alerts will appear here.</div>}
          <div className="admin-profile"><div className="admin-avatar">{displayName.charAt(0)}</div><div><b>{displayName}</b><small>Administrator</small></div><button onClick={onLogout}>⌄</button></div>
        </div>
      </header>
      {active==="Dashboard"?<div className="admin-content">
        <section className="admin-welcome"><div className="admin-campus">🏫</div><div><h1>System Overview</h1><p>Manage users, classes, monitoring, assessments and platform settings.</p></div><select value={period} onChange={e=>setPeriod(e.target.value)}><option>Current Semester</option><option>Previous Semester</option><option>Academic Year</option></select></section>
        <section className="admin-stats">
          <AdminStat icon="♧"label="Total Users"value={summary.users.toLocaleString()} trend="Live"/><AdminStat icon="♧"label="Students"value={summary.students.toLocaleString()} trend="Live"/><AdminStat icon="♙"label="Teachers"value={summary.teachers.toLocaleString()} trend="Live"/><AdminStat icon="◇"label="Ongoing Classes"value={summary.classrooms_ongoing.toLocaleString()} trend="Live"/><AdminStat icon="▤"label="Exam Sessions"value={summary.exam_sessions.toLocaleString()} trend="Live"/><AdminStat icon="✓"label="Published Results"value={summary.published_results.toLocaleString()} trend="Live"/>
        </section>
        <section className="admin-grid-top">
          <article className="admin-card"><AdminHeading icon="♧"title="User Distribution"/><div className="distribution"><div className="admin-donut"><div><b>1,248</b><small>Total<br/>Users</small></div></div><div className="distribution-legend"><p><i className="student-dot"/>Students <b>82.7% (1,032)</b></p><p><i className="teacher-dot"/>Teachers <b>6.9% (86)</b></p><p><i className="admin-dot"/>Admins <b>0.4% (5)</b></p><p><i className="other-dot"/>Others <b>10.0% (125)</b></p></div></div></article>
          <article className="admin-card"><AdminHeading icon="▣"title="Platform Activity"><select className="admin-small-select"><option>Last 7 Days</option><option>Last 30 Days</option></select></AdminHeading><div className="admin-chart-wrap"><div className="admin-y-axis"><span>1,000</span><span>800</span><span>600</span><span>400</span><span>200</span><span>0</span></div><svg viewBox="0 0 420 160" preserveAspectRatio="none" className="admin-chart"><defs><linearGradient id="adminArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#ad42f4" stopOpacity=".5"/><stop offset="100%" stopColor="#ad42f4" stopOpacity=".02"/></linearGradient></defs>{[8,37,66,95,124,153].map(y=><line key={y} x1="0" x2="420" y1={y} y2={y} stroke="#382b4b"/>)}<path d="M15 118 L75 100 L135 78 L195 91 L255 61 L315 70 L390 42 L390 153 L15 153Z" fill="url(#adminArea)"/><path d="M15 118 L75 100 L135 78 L195 91 L255 61 L315 70 L390 42" fill="none" stroke="#b34aff" strokeWidth="3" vectorEffect="non-scaling-stroke"/>{[[15,118],[75,100],[135,78],[195,91],[255,61],[315,70],[390,42]].map(([x,y])=><circle key={x} cx={x} cy={y} r="4" fill="white" stroke="#b34aff" strokeWidth="2"/>)}</svg></div><div className="admin-chart-labels"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div></article>
          <article className="admin-card"><AdminHeading icon="▣"title="AI Monitoring Insights"/><div className="insight-metric"><span>◎</span>Avg. Engagement <b>88% <em>↑ 7%</em></b></div><div className="insight-metric"><span>⬡</span>Sessions Monitored <b>156 <em>↑ 11%</em></b></div><div className="insight-metric"><span className="alert">⚠</span>Anomaly / Risk Cases <b>18 <em className="down">↓ 28%</em></b></div></article>
        </section>
        <section className="admin-grid-mid">
          <article className="admin-card"><AdminHeading icon="▤"title="Recent System Activities"action="View All →"onAction={()=>setActive("Logs & Audit")}/>{activities.map(([dot,text,time,color])=><div className="admin-activity" key={text}><span className={color}>{dot}</span><p>{text}</p><small>{time}</small></div>)}</article>
          <article className="admin-card"><AdminHeading icon="⚠"title="Risk Assessment Summary"/><div className="risk-summary"><div className="risk-donut"><div><b>18</b><small>Risk Cases</small></div></div><div className="risk-legend"><p><i className="high-dot"/>High Risk <b>4 (22%)</b></p><p><i className="med-dot"/>Medium Risk <b>6 (33%)</b></p><p><i className="low-dot"/>Low Risk <b>8 (45%)</b></p></div></div></article>
          <article className="admin-card"><AdminHeading icon="ϟ"title="Quick Actions"/><div className="admin-quick">{[["♙","Add User"],["◇","Create Class"],["▦","Schedule Exam"],["▥","Generate Report"],["▣","Configure AI"],["⚙","System Settings"]].map(([ic,label])=><button key={label} onClick={()=>action(label)}><span>{ic}</span>{label}</button>)}</div></article>
        </section>
        <article className="admin-card risk-table-card"><AdminHeading icon="⚠"title="Top At-Risk Students"action="View All →"onAction={()=>setActive("AI Monitoring")}/><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>#</th><th>Student Name</th><th>Classroom</th><th>Engagement</th><th>Issues Detected</th><th>Risk Level</th><th>Last Session</th></tr></thead><tbody>{atRisk.filter(r=>r.join(" ").toLowerCase().includes(search.toLowerCase())).map((r,i)=><tr key={r[1]}><td>{i+1}</td><td><b className="table-avatar">{r[0]}</b>{r[1]}</td><td>{r[2]}</td><td><b>{r[3]}</b><span className="engagement-bar"><i style={{width:r[3]}}/></span></td><td>{r[4]}</td><td><span className={`risk-badge ${r[5].toLowerCase()}`}>{r[5]}</span></td><td>{r[6]}</td></tr>)}</tbody></table></div></article>
        <p className="admin-footnote">Dashboard counts are loaded from the connected database. AI risk metrics will appear when monitoring records are integrated.</p>
      </div>:<AdminSection active={active} onBack={()=>setActive("Dashboard")} search={search}/>}
    </main>
    {modal&&<div className="admin-modal-backdrop" onClick={()=>setModal("")}><div className="admin-modal" onClick={e=>e.stopPropagation()}><button className="admin-modal-close" onClick={()=>setModal("")}>×</button><div className="admin-modal-icon">{modal==="user"?"♙":"◇"}</div><h2>{modal==="user"?"Add User":"Create Classroom"}</h2><p>{modal==="user"?"Enter basic account details. User creation will be connected to the backend later.":"Create a classroom record for the platform."}</p>
      {modal==="user"?<><label>Full name<input value={userName} onChange={e=>setUserName(e.target.value)} placeholder="Enter full name"/></label><label>Email<input type="email" value={userEmail} onChange={e=>setUserEmail(e.target.value)} placeholder="Enter email address"/></label><label>Role<select value={userType} onChange={e=>setUserType(e.target.value)}><option>Student</option><option>Teacher</option><option>Admin</option></select></label><button className="admin-modal-primary" onClick={()=>notify(userName&&userEmail?`Demo ${userType} form prepared for ${userName}. Database save is not connected yet.`:"Please enter a name and email.")}>Save User</button></>:<><label>Classroom name<input value={className} onChange={e=>setClassName(e.target.value)} placeholder="e.g. CSE – TE (A)"/></label><button className="admin-modal-primary" onClick={()=>notify(className?`Demo classroom "${className}" prepared. Database save is not connected yet.`:"Please enter a classroom name.")}>Create Classroom</button></>}
    </div></div>}
    {toast&&<div className="admin-toast">{toast}<button onClick={()=>setToast("")}>×</button></div>}
  </div>;
}
function AdminStat({icon,label,value,trend,tone}){return <article className="admin-stat"><div className={`admin-stat-icon ${tone||""}`}>{icon}</div><div><small>{label}</small><div><b>{value}</b><em className={trend.startsWith("-")?"down":""}>{trend.startsWith("-")?"↓":"↑"} {trend.replace("-","")}</em></div></div></article>}
function AdminHeading({icon,title,action,onAction,children}){return <div className="admin-heading"><h2><span>{icon}</span>{title}</h2>{children}{action&&<button onClick={onAction}>{action}</button>}</div>}
function AdminSection({active,onBack,search}) {
 const desc={"User Management":"Manage student, teacher and administrator accounts, roles and access permissions.","Classrooms & Courses":"Organize classrooms, subjects, academic years and teacher assignments.","Exams & Assessments":"Manage exam schedules, assessment settings and result publication.","AI Monitoring":"Review session-based monitoring summaries, AI signals and authorized alerts.","Reports & Analytics":"Explore platform usage, class performance, engagement and examination reports.","System Settings":"Configure platform preferences, security and notification settings.","AI Models & Config":"Review enabled AI capabilities and model configuration status.","Logs & Audit":"Review administrative actions and system activity history."};
 return <div className="admin-inner"><div className="admin-inner-heading"><div><h1>{active}</h1><p>{desc[active]}</p></div></div>{active==="Logs & Audit"?<div className="admin-card inner-activities">{activities.filter(a=>a[1].toLowerCase().includes(search.toLowerCase())).map(a=><div className="admin-activity" key={a[1]}><span className={a[3]}>{a[0]}</span><p>{a[1]}</p><small>{a[2]}</small></div>)}</div>:active==="AI Monitoring"?<div className="admin-card inner-summary"><h3>Session-based AI Monitoring Overview</h3><p>156 recorded sessions · 88% average engagement · 18 flagged risk cases</p><p>Monitoring is not continuously active. Data is generated only during authorized sessions.</p></div>:<div className="admin-card admin-placeholder"><div>✧</div><h2>{active} workspace</h2><p>This section is scaffolded and ready for API and PostgreSQL integration. Current dashboard values are illustrative sample data.</p></div>}<button className="admin-back" onClick={onBack}>← Back to Dashboard</button></div>;
}
