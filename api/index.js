import express from 'express';
import cors from 'cors';
import db from './db.js';

const app = express();
app.use(cors());
app.use(express.json());

/* ---------- STAFF ---------- */
app.get('/staff', (req, res) => {
  const rows = db.prepare('SELECT * FROM staff WHERE active=1 ORDER BY full_name ASC').all();
  res.json(rows);
});

app.post('/staff', (req, res) => {
  const { full_name, role } = req.body;
  if (!full_name) return res.status(400).json({ error: 'full_name required' });
  db.prepare('INSERT INTO staff (full_name, role, active) VALUES (?,?,1)').run(full_name.toUpperCase(), role || 'Staff');
  const row = db.prepare('SELECT * FROM staff ORDER BY id DESC LIMIT 1').get();
  res.status(201).json(row);
});

/* ---------- MEMBERS ---------- */
app.get('/members', (req, res) => {
  const rows = db.prepare('SELECT * FROM members ORDER BY created_at DESC').all();
  res.json(rows);
});

app.post('/members', (req, res) => {
  const { full_name, plan } = req.body;
  if (!full_name) return res.status(400).json({ error: 'full_name required' });

  const id = `MBR-${(Math.floor(Math.random()*9000)+1000).toString().padStart(4,'0')}`;
  const created_at = new Date().toISOString();

  db.prepare(`
    INSERT INTO members (id, full_name, plan, status, created_at)
    VALUES (?, ?, ?, 'Active', ?)
  `).run(id, full_name, plan || 'Monthly', created_at);

  const row = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
  res.status(201).json(row);
});

/* ---------- ATTENDANCE (uses staff) ---------- */
app.get('/attendance', (req, res) => {
  const rows = db.prepare('SELECT * FROM attendance ORDER BY id DESC LIMIT 200').all();
  res.json(rows);
});

app.post('/attendance/checkin', (req, res) => {
  const { staff_id } = req.body;
  if (!staff_id) return res.status(400).json({ error: 'staff_id required' });

  const staff = db.prepare('SELECT * FROM staff WHERE id = ? AND active=1').get(staff_id);
  if (!staff) return res.status(404).json({ error: 'staff not found' });

  const time_in = new Date().toISOString();
  db.prepare(`
    INSERT INTO attendance (staff_id, staff_name, time_in, status)
    VALUES (?, ?, ?, 'On Duty')
  `).run(staff.id, staff.full_name, time_in);

  const row = db.prepare('SELECT * FROM attendance ORDER BY id DESC LIMIT 1').get();
  res.status(201).json(row);
});

/* ---------- PAYMENTS ---------- */
app.get('/payments', (req, res) => {
  const rows = db.prepare('SELECT * FROM payments ORDER BY id DESC LIMIT 200').all();
  res.json(rows);
});

app.post('/payments', (req, res) => {
  const { pay_date, member_id, member_name, method, amount } = req.body;
  if (!member_id || !member_name || !method || !amount) {
    return res.status(400).json({ error: 'member_id, member_name, method, amount required' });
  }
  const date = pay_date || new Date().toISOString().slice(0,10);

  db.prepare(`
    INSERT INTO payments (pay_date, member_id, member_name, method, amount)
    VALUES (?, ?, ?, ?, ?)
  `).run(date, member_id, member_name, method, amount);

  const row = db.prepare('SELECT * FROM payments ORDER BY id DESC LIMIT 1').get();
  res.status(201).json(row);
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Kusgan API running on http://localhost:${PORT}`);
});
