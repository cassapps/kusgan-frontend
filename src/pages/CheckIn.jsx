import { useState } from "react";

export default function CheckIn(){
  const [last, setLast] = useState([]);
  const [id, setId] = useState("");

  const submit = (e)=>{
    e.preventDefault();
    if(!id.trim()) return;
    const now = new Date().toLocaleTimeString();
    setLast(prev => [{member:id, time:now}, ...prev].slice(0,8));
    setId("");
  }

  return (
    <div className="content">
      <h2>Member Check-In</h2>
      <div className="card" style={{marginTop:8, marginBottom:12}}>
        <form onSubmit={submit} style={{display:'grid', gridTemplateColumns:'1fr auto', gap:10}}>
          <input placeholder="Scan or type Member ID" value={id} onChange={e=>setId(e.target.value)}/>
          <button className="button">Check-In</button>
        </form>
      </div>
      <div className="card">
        <h3 style={{marginTop:0}}>Recent Check-Ins</h3>
        <table>
          <thead><tr><th>Time</th><th>Member</th></tr></thead>
          <tbody>
            {last.map((r,i)=> (<tr key={i}><td>{r.time}</td><td>{r.member}</td></tr>))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
