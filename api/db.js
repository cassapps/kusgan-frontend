import Database from 'better-sqlite3';
const db = new Database('./kusgan.db');

/* ---------- SCHEMA ---------- */
db.exec(`
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'Staff',
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER,
  staff_name TEXT NOT NULL,
  time_in TEXT NOT NULL,
  time_out TEXT,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pay_date TEXT NOT NULL,
  member_id TEXT NOT NULL,
  member_name TEXT NOT NULL,
  method TEXT NOT NULL,
  amount INTEGER NOT NULL
);
`);

/* ---------- SEED DATA (first run only) ---------- */
const staffCount = db.prepare('SELECT COUNT(*) AS c FROM staff').get().c;
if (staffCount === 0) {
  const seed = db.prepare('INSERT INTO staff (full_name, role) VALUES (?,?)');
  seed.run('KIM ARCEO', 'PRIMARY ATTENDANT');
  seed.run('ALEX JOHNSON', 'TRAINER');
  seed.run('SARAH MILLER', 'RECEPTION');
}

const memberCount = db.prepare('SELECT COUNT(*) AS c FROM members').get().c;
if (memberCount === 0) {
  const insert = db.prepare(`
    INSERT INTO members (id, full_name, plan, status, created_at)
    VALUES (@id, @full_name, @plan, @status, @created_at)
  `);
  const now = new Date().toISOString();
  insert.run({ id:'MBR-0001', full_name:'Alex Johnson', plan:'Monthly', status:'Active', created_at: now });
  insert.run({ id:'MBR-0002', full_name:'Sarah Miller', plan:'Quarterly', status:'Active', created_at: now });
  insert.run({ id:'MBR-0003', full_name:'Juan Dela Cruz', plan:'Trial', status:'Inactive', created_at: now });
}

export default db;
