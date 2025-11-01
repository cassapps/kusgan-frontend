import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function Staff() {
  const [list, setList] = useState([]);
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('Staff');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const res = await fetch(`${API}/staff`);
      if (!res.ok) throw new Error('Failed to load staff');
      const data = await res.json();
      setList(data);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function addStaff(e) {
    e.preventDefault();
    if (!fullName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName, role })
      });
      if (!res.ok) throw new Error('Save failed');
      setFullName('');
      setRole('Staff');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="content">
      <h2 style={{marginTop:0}}>Staff</h2>

      <form onSubmit={addStaff} style={{display:'grid', gap:12, maxWidth:420, marginBottom:16}}>
        <input
          placeholder="FULL NAME"
          value={fullName}
          onChange={e=>setFullName(e.target.value.toUpperCase())}
        />
        <select value={role} onChange={e=>setRole(e.target.value)}>
          <option>Staff</option>
          <option>PRIMARY ATTENDANT</option>
          <option>TRAINER</option>
          <option>RECEPTION</option>
        </select>
        <button className="button" disabled={loading}>
          {loading ? 'Saving…' : 'Add Staff'}
        </button>
        {error && <div className="badge warn">{error}</div>}
      </form>

      <table>
        <thead><tr><th style={{width:'70%'}}>Name</th><th>Role</th></tr></thead>
        <tbody>
          {list.map(s=>(
            <tr key={s.id}><td>{s.full_name}</td><td>{s.role}</td></tr>
          ))}
          {list.length === 0 && (
            <tr><td colSpan={2} style={{color:'#5a5e6e'}}>No staff yet. Add one above.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
