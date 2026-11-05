export default function Classroom({ token, onExit }) {
  return <main style={{padding:24,color:"#e5e7eb",background:"#0f172a",minHeight:"60vh",borderRadius:16}}>
    <h2>Classroom</h2><p>Classroom workspace is ready. Connect your classroom session API here.</p>
    <button onClick={onExit} style={{padding:"10px 16px",border:0,borderRadius:8,cursor:"pointer"}}>Back to dashboard</button>
  </main>;
}
