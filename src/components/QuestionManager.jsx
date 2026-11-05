import { useEffect, useState } from "react";
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
export default function QuestionManager({ token }) {
  const [items,setItems]=useState([]),[error,setError]=useState(""),[loading,setLoading]=useState(true);
  useEffect(()=>{let alive=true;fetch(`${API}/questions`,{headers:{Authorization:`Bearer ${token}`}}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.detail||"Unable to load questions");return d;}).then(d=>{if(alive)setItems(Array.isArray(d)?d:(d.questions||[]));}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false};},[token]);
  return <section style={{padding:24}}><h2>Question Manager</h2>{loading?"Loading questions…":error?<p>{error}</p>:items.length?items.map((q,i)=><article key={q.id||i} style={{padding:12,margin:"10px 0",border:"1px solid #475569",borderRadius:8}}>{q.question||q.question_text||JSON.stringify(q)}</article>):<p>No questions found.</p>}</section>;
}
