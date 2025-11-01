import { useState } from "react";

export default function Members(){
  const [members, setMembers] = useState([
    {id:"MBR-0001", name:"Alex Johnson", plan:"Monthly", status:"Active"},
    {id:"MBR-0002", name:"Sarah Miller", plan:"Quarterly", status:"Active"},
    {id:"MBR-0003", name:"Juan Dela Cruz", plan:"Trial", status:"Inactive"},
  ]);
  const [form, setForm] = useState({name:"", plan:"Monthly"});

  const addMember = (e)=>{
    e.preventDefault();
    if(!form.name.trim()) return;
    const next = { id:`MBR-${(members.length+1).toString().padStart(4,"0")}`, name:form.name, plan:form.plan, status:"Active"};
    setMembers(prev => [next, ...prev]);
    setForm({name:"", plan:"Monthly"});
  }

  return (
    <div className="content">
      <h2>All Members</h2>
      <div className="card" style={{marginTop:8, marginBottom:12}}>
        <form onSubmit={addMember} style={{display:'grid', gridTemplateColumns:'2fr 1fr auto', gap:10}}>
          <input placeholder="Full name" value={form.name} onChange={e=>setForm(f=>({...f, name:e.target.value}))}/>
          <select value={form.plan} onChange={e=>setForm(f=>({...f, plan:e.target.value}))}>
            <option>Monthly</option>
            <option>Quarterly</option>
            <option>Semi-Annual</option>
            <option>Annual</option>
          </select>
          <button className="button">Add Member</button>
        </form>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Plan</th><th>Status</th></tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id}>
                <td>{m.id}</td><td>{m.name}</td><td>{m.plan}</td><td><span className="badge">{m.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
