import { useEffect, useState } from "react";
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
export default function ExamResults({ token }) {
  const [data,setData]=useState([]),[error,setError]=useState("");
  useEffect(()=>{let alive=true;fetch(`${API}/exam/results`,{headers:{Authorization:`Bearer ${token}`}}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.detail||"Unable to load results");return d;}).then(d=>{if(alive)setData(Array.isArray(d)?d:(d.results||[]));}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false};},[token]);
  return <section style={{padding:24}}><h2>Exam Results</h2>{error?<p>{error}</p>:data.length?<pre style={{whiteSpace:"pre-wrap"}}>{JSON.stringify(data,null,2)}</pre>:<p>No exam results available yet.</p>}</section>;
}
