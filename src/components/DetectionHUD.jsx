export default function DetectionHUD({ result, connected = false }) {
  const score = Number(result?.suspicion_score ?? 0);
  const risk = score >= 70 ? "High Risk" : score >= 35 ? "Medium Risk" : "Low Risk";
  const items = [
    ["Face Detection", result?.face_detected == null ? "Waiting" : result.face_detected ? "Detected" : "Not detected"],
    ["Gaze Tracking", result?.gaze ?? "Waiting"],
    ["Head Pose", result?.head_pose ?? "Waiting"],
    ["Suspicious Activity", score > 0 ? `${score}% score` : "None reported"]
  ];
  return (
    <section className="et-hud">
      <header><b>AI Proctoring</b><span className={connected ? "ok" : "wait"}>{connected ? "● Connected" : "● Connecting"}</span></header>
      {items.map(([label,value]) => <div className="et-hud-row" key={label}><span>{label}</span><b>{String(value)}</b></div>)}
      <div className="et-risk"><span>Risk assessment</span><b>{risk}</b></div>
      <style>{`
        .et-hud{background:#111827;color:#e5e7eb;border:1px solid #334155;border-radius:14px;padding:14px;margin-top:12px}
        .et-hud header,.et-hud-row,.et-risk{display:flex;justify-content:space-between;gap:12px;align-items:center}
        .et-hud header{margin-bottom:12px}.et-hud .ok{color:#4ade80;font-size:12px}.et-hud .wait{color:#fbbf24;font-size:12px}
        .et-hud-row{padding:9px 0;border-top:1px solid #263244;font-size:12px}.et-hud-row span{color:#94a3b8}
        .et-risk{margin-top:8px;padding:10px;background:#1e293b;border-radius:9px;font-size:13px}.et-risk b{color:#4ade80}
      `}</style>
    </section>
  );
}
