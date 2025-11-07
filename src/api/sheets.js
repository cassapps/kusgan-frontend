import useSWR from 'swr';
import debounce from 'lodash.debounce';
// Debounced fetchSheet for user-triggered actions
const debouncedFetchSheet = debounce(async (sheetName) => {
  return await fetchSheet(sheetName);
}, 300);

export function useSheetData(sheetName) {
  // SWR caching for sheet data
  const { data, error } = useSWR(sheetName, fetchSheet, { revalidateOnFocus: false });
  return { data, error };
}
// Apps Script Web App base URL
// Support multiple env var names for backwards compatibility: prefer VITE_APPS_SCRIPT_URL,
// then VITE_GS_WEBAPP_URL, then legacy VITE_SCRIPT_URL.
const BASE = (
  import.meta.env.VITE_APPS_SCRIPT_URL || import.meta.env.VITE_GS_WEBAPP_URL || import.meta.env.VITE_SCRIPT_URL || ""
).trim();
const ATT_SHEET = (import.meta.env.VITE_ATTENDANCE_SHEET || "Attendance").trim();
// Dev-only mock toggle. Set VITE_USE_MOCK_SHEETS=true in your .env.local to enable
const USE_MOCK = String(import.meta.env.VITE_USE_MOCK_SHEETS || "").trim().toLowerCase() === "true";
const AUTO_MOCK = !BASE; // if there's no backend URL, auto-enable mock for local dev
if (!BASE && !USE_MOCK) console.info("VITE_APPS_SCRIPT_URL is not set — falling back to in-memory mock. Set VITE_APPS_SCRIPT_URL to point at your Apps Script or set VITE_USE_MOCK_SHEETS=false to disable auto-mock.");
const MOCK = USE_MOCK || AUTO_MOCK;
if (MOCK) console.info("sheets.js: running in MOCK mode (VITE_USE_MOCK_SHEETS=true or no BASE URL)");

// Build URL with query
function withQuery(q) {
  if (!BASE) throw new Error("VITE_APPS_SCRIPT_URL is missing");
  if (!q) return BASE;
  const sep = BASE.includes("?") ? "&" : "?";
  return `${BASE}${sep}${q.replace(/^\?/, "")}`;
}

// --- Lightweight in-memory mock implementation (dev only) -----------------
// This mock covers the common sheets used by the editing UI so developers can
// work without round-trips to Apps Script. It intentionally keeps behavior
// simple and synchronous-ish (small Promise delays) and uses the same shapes
// as the real API (objects with .rows or arrays) so callers rarely need changes.
const _mock = (function createMock() {
  const now = new Date();
  // seed with one or two members so UI shows something
  const members = [
    { MemberID: '1001', NickName: 'JO', FirstName: 'Joanna', LastName: 'Lacup', member_since: now.toISOString().slice(0,10) },
    { MemberID: '1002', NickName: 'SAM', FirstName: 'Samuel', LastName: 'Dela Cruz', member_since: now.toISOString().slice(0,10) }
  ];
  const payments = [];
  const gymEntries = [
    { Staff: 'Coach Elmer', Date: now.toISOString().slice(0,10), TimeIn: '08:30', TimeOut: '' },
    { Staff: 'Coach Jojo', Date: now.toISOString().slice(0,10), TimeIn: '08:45', TimeOut: '' },
    { Staff: 'Patpat', Date: now.toISOString().slice(0,10), TimeIn: '09:00', TimeOut: '' },
    { Staff: 'Sheen', Date: now.toISOString().slice(0,10), TimeIn: '09:15', TimeOut: '' },
    { Staff: 'Jeanette', Date: now.toISOString().slice(0,10), TimeIn: '09:30', TimeOut: '' },
    { Staff: 'Xyza', Date: now.toISOString().slice(0,10), TimeIn: '09:45', TimeOut: '' },
    { Staff: 'Bezza', Date: now.toISOString().slice(0,10), TimeIn: '10:00', TimeOut: '' },
    { Staff: 'Johanna', Date: now.toISOString().slice(0,10), TimeIn: '10:15', TimeOut: '' },
  ];
  const progress = [];
  const pricing = [];

  function nextId() { return String(1000 + members.length + 1); }
  // small async delay helper (0-40ms) to emulate quick response but keep things instant
  const delay = (ms = 0) => new Promise(r => setTimeout(r, ms));

  return {
    async fetchSheet(sheetName) {
      await delay(0);
      const s = String(sheetName || "").toLowerCase();
      if (s === 'members') return { rows: JSON.parse(JSON.stringify(members)) };
      if (s === 'gymentries') return { rows: JSON.parse(JSON.stringify(gymEntries)) };
      if (s === 'progresstracker') return { rows: JSON.parse(JSON.stringify(progress)) };
      if (s === 'pricing') return { rows: JSON.parse(JSON.stringify(pricing)) };
      return { rows: [] };
    },

    async fetchMembers() { await delay(0); return { rows: JSON.parse(JSON.stringify(members)) }; },
    async fetchPayments() { await delay(0); return { rows: JSON.parse(JSON.stringify(payments)) }; },
    async fetchGymEntries() { await delay(0); return { rows: JSON.parse(JSON.stringify(gymEntries)) }; },
    async fetchProgressTracker() { await delay(0); return { rows: JSON.parse(JSON.stringify(progress)) }; },
    async fetchPricing() { await delay(0); return { rows: JSON.parse(JSON.stringify(pricing)) }; },

    async insertRow(sheet, row) {
      await delay(0);
      const s = String(sheet || '').toLowerCase();
      const r = Object.assign({}, row || {});
      if (s === 'members') {
        r.MemberID = r.MemberID || nextId();
        members.push(r);
        return { ok: true, id: r.MemberID };
      }
      if (s === 'gymentries') { gymEntries.push(r); return { ok: true }; }
      if (s === 'progresstracker') { progress.push(r); return { ok: true }; }
      if (s === 'payments' || s === 'payments') { payments.push(r); return { ok: true }; }
      return { ok: true };
    },

    async upsertMember(row) {
      await delay(0);
      const id = String(row?.MemberID || row?.memberid || row?.id || '').trim();
      if (!id) return this.insertRow('Members', row);
      const idx = members.findIndex(m => String(m.MemberID) === id);
      if (idx >= 0) { members[idx] = { ...members[idx], ...row }; return { ok: true, id }; }
      const r = { ...row, MemberID: id }; members.push(r); return { ok: true, id };
    },

    async addPayment(payload) { await delay(0); payments.push(payload); return { ok: true }; },

    async attendanceQuickAppend(staff, extra = {}) { await delay(0); const rec = { Staff: staff, Date: now.toISOString().slice(0,10), TimeIn: new Date().toLocaleTimeString('en-US', { hour12:false }) , ...extra }; gymEntries.push(rec); return { ok: true, rec }; },
    async clockIn(staff) { await delay(0); return { ok: true }; },
    async clockOut(staff) { await delay(0); return { ok: true }; },

    async fetchAttendance(dateYMD) { await delay(0); return { rows: JSON.parse(JSON.stringify(gymEntries)) }; },

    async uploadPhoto(obj) { await delay(0); return { ok: true, url: 'data:mock/blank' }; },

    async fetchMemberById(memberId) { await delay(0); const m = members.find(m=>String(m.MemberID||'')===String(memberId||'')); return m ? JSON.parse(JSON.stringify(m)) : null; },

    async fetchMemberBundle(memberId) {
      await delay(0);
      const member = await this.fetchMemberById(memberId);
      const paymentsFor = payments.filter(p => String(p.MemberID||p.memberid||p.member||'') === String(memberId||''));
      const gymFor = gymEntries.filter(g => String(g.MemberID||g.memberid||'') === String(memberId||''));
      const progFor = progress.filter(p => String(p.MemberID||p.memberid||'') === String(memberId||''));
      return { member, payments: paymentsFor, gymEntries: gymFor, progress: progFor };
    },

    async fetchDashboard() {
      await delay(0);
      const totalMembers = members.length;
      const visitedToday = gymEntries.filter(e => String(e.Date||'').slice(0,10) === now.toISOString().slice(0,10)).length;
      return { ok: true, totalMembers, activeGym: 0, activeCoach: 0, visitedToday, coachToday: 0, checkedIn: 0, cashToday:0, gcashToday:0, totalPaymentsToday:0 };
    }
  };
})();
// --- end mock --------------------------------------------------------------

// Fetch helpers
async function parseJsonOrThrow(r, url) {
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} from ${url}: ${text.slice(0,200)}`);
  const s = text.trim();
  if (!(s.startsWith("{") || s.startsWith("["))) throw new Error(`Expected JSON from ${url}. Got: ${s.slice(0,120)}`);
  return JSON.parse(s);
}
async function getJSON(url) {
  console.debug("API GET ->", url);  // debug
  if (MOCK) {
    try {
      const u = new URL(url);
      const sheet = u.searchParams.get('sheet') || '';
      // try to return the same shape as the real API
      return _mock.fetchSheet(sheet);
    } catch (e) {
      return { rows: [] };
    }
  }
  const r = await fetch(url, { cache: "no-store", mode: "cors" });
  return parseJsonOrThrow(r, url);
}
import events from "../lib/events";

// Simple in-memory cache to avoid repeated network round-trips during a session
const _GET_CACHE = new Map(); // url -> { ts, data }
// Helper to selectively invalidate or update cache entries after writes.
function _invalidateCacheContaining(sub) {
  try {
    for (const k of Array.from(_GET_CACHE.keys())) {
      if (k.includes(sub)) _GET_CACHE.delete(k);
    }
  } catch {}
}

function _mergeMemberIntoCache(newRow) {
  try {
    const url = withQuery(`action=members`);
    const entry = _GET_CACHE.get(url);
    if (!entry) return;
    const data = JSON.parse(JSON.stringify(entry.data));
    if (Array.isArray(data)) {
      data.push(newRow);
      _GET_CACHE.set(url, { ts: Date.now(), data });
      return;
    }
    if (data && Array.isArray(data.rows)) {
      data.rows.push(newRow);
      _GET_CACHE.set(url, { ts: Date.now(), data });
      return;
    }
  } catch (e) {}
}

function _updateMemberInCache(updatedRow) {
  try {
    const url = withQuery(`action=members`);
    const entry = _GET_CACHE.get(url);
    if (!entry) return;
    const data = JSON.parse(JSON.stringify(entry.data));
    const rows = Array.isArray(data) ? data : (data && data.rows ? data.rows : null);
    if (!rows) return;
    const id = String(updatedRow.MemberID || updatedRow.memberid || updatedRow.id || '').trim();
    const idx = rows.findIndex(r => String(r.MemberID||r.memberid||r.id||'') === id);
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], ...updatedRow };
      const newData = Array.isArray(data) ? rows : { ...data, rows };
      _GET_CACHE.set(url, { ts: Date.now(), data: newData });
    }
  } catch (e) {}
}
function _appendGymEntryToCache(entry) {
  try {
    const url1 = withQuery(`sheet=GymEntries`);
    const url2 = withQuery(`action=attendance`);
    const appendTo = (url) => {
      const entryObj = _GET_CACHE.get(url);
      if (!entryObj) return false;
      const data = JSON.parse(JSON.stringify(entryObj.data));
      const rows = Array.isArray(data) ? data : (data && data.rows ? data.rows : null);
      if (!rows) return false;
      rows.unshift(entry);
      const newData = Array.isArray(data) ? rows : { ...data, rows };
      _GET_CACHE.set(url, { ts: Date.now(), data: newData });
      return true;
    };
    appendTo(url1);
    appendTo(url2);
  } catch (e) {}
}
function cachedGetJSON(url, ttlMs = 30_000) {
  const now = Date.now();
  const entry = _GET_CACHE.get(url);
  if (entry && now - entry.ts < ttlMs) {
    // return a shallow copy to avoid accidental mutation
    return Promise.resolve(JSON.parse(JSON.stringify(entry.data)));
  }
  return getJSON(url).then((data) => {
    try { _GET_CACHE.set(url, { ts: Date.now(), data }); } catch {}
    return JSON.parse(JSON.stringify(data));
  });
}
async function postJSON(url, body) {
  if (MOCK) {
    const op = body && body.op;
    if (op === 'updatemember' || op === 'upsertmember') return _mock.upsertMember(JSON.parse(body.row || '{}'));
    if (op === 'addpayment' || op === 'addPayment') return _mock.addPayment(body);
    return { ok: true };
  }
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseJsonOrThrow(r, url);
  // If server returns a JSON payload with ok:false, treat as an error so callers can catch it
  if (data && data.ok === false) throw new Error(data.error || JSON.stringify(data));
  // Best-effort cache updates for JSON POST endpoints
  try {
    const op = body && body.op;
    if (op === 'updatemember' || op === 'upsertmember') {
      try { const updated = JSON.parse(body.row || '{}'); _updateMemberInCache(updated); } catch(e) {}
    } else if (op === 'addpayment') {
      _invalidateCacheContaining('action=payments');
      _invalidateCacheContaining('action=dashboard');
    }
  } catch (e) {}
  return data;
}
async function postForm(obj) {
  // Use form-encoded body so there’s no CORS preflight
  if (MOCK) {
    const op = obj && obj.op;
    if (op === 'insert') {
      const res = await _mock.insertRow(obj.sheet, JSON.parse(obj.row || '{}'));
      try {
        const sheet = String(obj.sheet || '').toLowerCase();
        if (sheet === 'members') events.emit('member:added', JSON.parse(obj.row || '{}'));
        if (sheet === 'gymentries') events.emit('gymEntry:added', JSON.parse(obj.row || '{}'));
      } catch (e) {}
      return res;
    }
    if (op === 'updatemember' || op === 'upsertmember') {
      const upd = await _mock.upsertMember(JSON.parse(obj.row || '{}'));
      try { events.emit('member:updated', JSON.parse(obj.row || '{}')); } catch(e) {}
      return upd;
    }
    if (op === 'quick_attendance_append') {
      const r = await _mock.attendanceQuickAppend(obj.Staff || obj.staff, obj);
      try { events.emit('gymEntry:added', r.rec || obj); } catch(e) {}
      return r;
    }
    if (op === 'quick_gym_append') { const r = await _mock.insertRow('GymEntries', obj); try { events.emit('gymEntry:added', obj); } catch(e) {} return r; }
    if (op === 'gymclockin' || op === 'gymclockout') return { ok: true };
    if (op === 'addpayment') return _mock.addPayment(obj);
    return { ok: true };
  }
  // Note: when running in MOCK mode above we return early; emit events there as well
  const r = await fetch(BASE, { method: "POST", body: new URLSearchParams(obj) });
  const data = await parseJsonOrThrow(r, BASE + " [POST form]");
  // If server-side handler returned { ok: false }, surface that as an exception so callers
  // (especially optimistic UI paths) can revert and show an error.
  if (data && data.ok === false) throw new Error(data.error || JSON.stringify(data));
  // Update or invalidate local cache to keep UI snappy:
  try {
    const op = obj && obj.op;
    if (op === 'insert') {
      const sheet = String(obj.sheet || '').toLowerCase();
      if (sheet === 'members') {
        try { const newRow = JSON.parse(obj.row || '{}'); _mergeMemberIntoCache(newRow); } catch (e) {}
        try { const newRow = JSON.parse(obj.row || '{}'); events.emit('member:added', newRow); } catch(e) {}
      } else if (sheet === 'gymentries') {
        // append the new gym entry into cached GymEntries/attendance if present, otherwise invalidate
        try { const parsed = JSON.parse(obj.row || '{}'); _appendGymEntryToCache(parsed); } catch(e) { _invalidateCacheContaining('sheet=GymEntries'); _invalidateCacheContaining('action=attendance'); }
        try { const parsed = JSON.parse(obj.row || '{}'); events.emit('gymEntry:added', parsed); } catch(e) {}
      } else {
        _invalidateCacheContaining(`sheet=${sheet}`);
      }
    } else if (op === 'updatemember' || op === 'upsertmember') {
      try { const updated = JSON.parse(obj.row || '{}'); _updateMemberInCache(updated); } catch(e) {}
      try { const updated = JSON.parse(obj.row || '{}'); events.emit('member:updated', updated); } catch(e) {}
    } else if (op === 'quick_attendance_append' || op === 'quick_gym_append' || op === 'gymclockin' || op === 'gymclockout') {
      // If we have enough info, append a lightweight entry to cached arrays; otherwise invalidate
      try {
        const light = {};
        if (obj.MemberID) light.MemberID = obj.MemberID;
        if (obj.Staff) light.Staff = obj.Staff;
        if (obj.TimeIn) light.TimeIn = obj.TimeIn;
        if (obj.Date) light.Date = obj.Date;
        // fallback: if object only has Staff (attendance), include that
        if (Object.keys(light).length) _appendGymEntryToCache(light);
        else { _invalidateCacheContaining('action=attendance'); _invalidateCacheContaining('sheet=GymEntries'); }
      } catch(e) { _invalidateCacheContaining('action=attendance'); _invalidateCacheContaining('sheet=GymEntries'); }
      try { const light = {}; if (obj.MemberID) light.MemberID = obj.MemberID; if (obj.Staff) light.Staff = obj.Staff; if (obj.TimeIn) light.TimeIn = obj.TimeIn; if (obj.Date) light.Date = obj.Date; if (Object.keys(light).length) events.emit('gymEntry:added', light); } catch(e) {}
    } else if (op === 'addpayment') {
      _invalidateCacheContaining('action=payments');
      _invalidateCacheContaining('action=dashboard');
    }
  } catch (e) {}
  return data;
}

// Generic
export async function fetchSheet(sheetName) {
  if (MOCK) return _mock.fetchSheet(sheetName);
  const url = withQuery(`sheet=${encodeURIComponent(sheetName)}`);
  return cachedGetJSON(url, 30_000);
}
export async function insertRow(sheet, row) {
  // Use form-encoded to avoid preflight; send row as JSON string
  if (MOCK) return _mock.insertRow(sheet, row);
  return postForm({ op: "insert", sheet, row: JSON.stringify(row) });
}

// Members
export async function fetchMembers() {
  if (MOCK) return _mock.fetchMembers();
  return cachedGetJSON(withQuery("action=members"), 30_000);
}
export async function fetchMembersFresh() { return fetchMembers(); }
export async function addMember(row) { return insertRow("Members", row); }
export async function saveMember(row) { return addMember(row); }
export async function updateMember(row) {
  // expects { MemberID, ...fields }
  if (MOCK) return _mock.upsertMember(row);
  return postForm({ op: "updatemember", row: JSON.stringify(row) });
}
export async function uploadPhoto({ memberId, filename, mime, data }) {
  // Also send as form-encoded to avoid preflight; backend should parse base64
  if (MOCK) return _mock.uploadPhoto({ memberId, filename, mime, data });
  return postForm({ op: "uploadphoto", memberId, filename, mime, data });
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Failed to read file"));
    fr.onload = () => {
      const result = String(fr.result || "");
      // result is a data URL like: data:image/jpeg;base64,XXXXX
      const idx = result.indexOf(",");
      const base64 = idx >= 0 ? result.slice(idx + 1) : result;
      resolve(base64);
    };
    fr.readAsDataURL(file);
  });
}

// Accept either (file, baseId) or an object { memberId, filename, mime, data }
export async function uploadMemberPhoto(fileOrArgs, baseId) {
  if (fileOrArgs instanceof Blob) {
    const file = fileOrArgs;
    const filename = (file && file.name) || `photo-${Date.now()}.jpg`;
    const mime = (file && file.type) || "image/jpeg";
    const data = await fileToBase64(file);
    const memberId = baseId || "";
    return uploadPhoto({ memberId, filename, mime, data });
  }
  // Fall back to old object signature
  if (MOCK) return _mock.uploadPhoto(fileOrArgs || {});
  return uploadPhoto(fileOrArgs || {});
}
export async function fetchMemberById(memberId) {
  if (MOCK) return _mock.fetchMemberById(memberId);
  const res = await fetchSheet("Members");
  const rows = res?.rows || res?.data || [];
  return rows.find(r => String(r.MemberID||"").trim() === String(memberId).trim()) || null;
}
export async function fetchMemberBundle(memberId) {
  if (!memberId) throw new Error("memberId is required");
  if (MOCK) return _mock.fetchMemberBundle(memberId);
  const [memRes, payRes, gymRes, progRes] = await Promise.all([
    fetchSheet("Members"),
    // use the cached payments helper so repeated calls are fast
    fetchPayments(),
    fetchSheet("GymEntries"),
    fetchSheet("ProgressTracker"),
  ]);
  const member = (memRes?.rows||memRes?.data||[]).find(r => String(r.MemberID||"").trim() === String(memberId).trim()) || null;
  const id = String(memberId).trim();
  const payments = (payRes?.rows||payRes?.data||[]).filter(r => String(r.MemberID||"").trim() === id);
  const gymEntries = (gymRes?.rows||gymRes?.data||[]).filter(r => String(r.MemberID||"").trim() === id);
  const progress = (progRes?.rows||progRes?.data||[]).filter(r => String(r.MemberID||"").trim() === id);
  return { member, payments, gymEntries, progress };
}

// Attendance (include sheet)
export async function fetchAttendance(dateYMD) {
  const q = dateYMD ? `action=attendance&date=${encodeURIComponent(dateYMD)}` : "action=attendance";
  // Attendance is likely to change often; keep cache small
  if (MOCK) return _mock.fetchAttendance(dateYMD);
  // Try the fast attendance endpoint first; if it returns empty, try the sheet-based endpoints as fallback
  const primary = await cachedGetJSON(withQuery(q), 5_000).catch(() => ({ rows: [] }));
  const rows = primary?.rows || primary?.data || [];
  if (rows && rows.length) return primary;
  // fallback: try the configured attendance sheet name (ATT_SHEET)
  try {
    const bySheet = await cachedGetJSON(withQuery(`sheet=${encodeURIComponent(ATT_SHEET)}`), 5_000).catch(() => ({ rows: [] }));
    const srows = bySheet?.rows || bySheet?.data || [];
    if (srows && srows.length) return bySheet;
  } catch (e) {}
  // secondary fallback: try GymEntries sheet name
  try {
    const gym = await cachedGetJSON(withQuery(`sheet=GymEntries`), 5_000).catch(() => ({ rows: [] }));
    const grow = gym?.rows || gym?.data || [];
    if (grow && grow.length) return gym;
  } catch (e) {}
  return primary;
}
export async function clockIn(arg) {
  const staff = typeof arg === "string" ? arg : (arg?.staff || arg?.Staff || "");
  if (!staff) throw new Error("staff is required");
  // Prefer the fast attendance quick-append endpoint to keep sign-in snappy.
  // Fall back to the original clockin op if the fast endpoint errors.
  try {
    return await attendanceQuickAppend(staff);
  } catch (err) {
    console.warn('attendanceQuickAppend failed, falling back to clockin', err);
  if (MOCK) return _mock.clockIn(staff);
    return postForm({ op: "clockin", staff });   // <-- POST form, no headers
  }
}
export async function clockOut(arg) {
  const staff = typeof arg === "string" ? arg : (arg?.staff || arg?.Staff || "");
  if (!staff) throw new Error("staff is required");
  try {
    return await attendanceQuickAppend(staff, { wantsOut: true });
  } catch (err) {
    console.warn('attendanceQuickAppend failed, falling back to clockout', err);
  if (MOCK) return _mock.clockOut(staff);
    return postForm({ op: "clockout", staff });  // <-- POST form, no headers
  }
}
export async function upsertAttendance(row) {
  const wantsOut = row && row.TimeOut;
  const staff = row?.Staff || row?.staff || "";
  return wantsOut ? clockOut(staff) : clockIn(staff);
}

// Fast attendance append/check-out endpoint
export async function attendanceQuickAppend(staff, extra = {}){
  if (!staff) throw new Error("staff is required");
  if (USE_MOCK) return _mock.attendanceQuickAppend(staff, extra);
  return postForm({ op: "quick_attendance_append", Staff: staff, ...extra });
}

// Gym Entries
export async function fetchGymEntries() { if (USE_MOCK) return _mock.fetchGymEntries(); return cachedGetJSON(withQuery(`sheet=GymEntries`), 30_000); }
export async function addGymEntry(row) { if (USE_MOCK) return _mock.insertRow('GymEntries', row); return insertRow("GymEntries", row); }
export async function gymClockIn(memberId, extra={}){
  if(!memberId) throw new Error("memberId is required");
  if (USE_MOCK) { await _mock.insertRow('GymEntries', { MemberID: memberId, ...extra }); return { ok: true }; }
  return postForm({ op: "gymclockin", MemberID: memberId, ...extra });
}
export async function gymClockOut(memberId){
  if(!memberId) throw new Error("memberId is required");
  if (USE_MOCK) { await _mock.insertRow('GymEntries', { MemberID: memberId, TimeOut: new Date().toISOString() }); return { ok: true }; }
  return postForm({ op: "gymclockout", MemberID: memberId });
}
export async function upsertGymEntry({ memberId, coach, focus, timeOut }){
  const payload = { op: "upsertgymentry", MemberID: memberId };
  if (timeOut) payload.TimeOut = timeOut;
  if (coach) payload.Coach = coach;
  if (focus) payload.Focus = focus;
  return postForm(payload);
}

// Fast append/check-out endpoint: minimal validation and form-encoded POST to avoid preflight
export async function gymQuickAppend(memberId, extra = {}){
  if (!memberId) throw new Error("memberId is required");
  if (USE_MOCK) { await _mock.insertRow('GymEntries', { MemberID: memberId, ...extra }); return { ok: true }; }
  return postForm({ op: "quick_gym_append", MemberID: memberId, ...extra });
}

// Progress Tracker
export async function fetchProgressTracker() { if (USE_MOCK) return _mock.fetchProgressTracker(); return cachedGetJSON(withQuery(`sheet=ProgressTracker`), 30_000); }
export async function addProgressRow(row) { if (USE_MOCK) return _mock.insertRow('ProgressTracker', row); return insertRow("ProgressTracker", row); }

// Pricing
export async function fetchPricing() { if (USE_MOCK) return _mock.fetchPricing(); return cachedGetJSON(withQuery("action=pricing"), 30_000); }

// Payments
export async function fetchPayments() { if (USE_MOCK) return _mock.fetchPayments(); return cachedGetJSON(withQuery("action=payments"), 30_000); }
// Use form-encoded to avoid CORS preflight which can cause "failed to fetch"
export async function addPayment(payload) { if (USE_MOCK) return _mock.addPayment(payload); return postForm({ op: "addpayment", ...payload }); }

// Dashboard aggregate (server-side precomputed summary)
export async function fetchDashboard() { if (USE_MOCK) return _mock.fetchDashboard(); return cachedGetJSON(withQuery("action=dashboard"), 10_000); }

// Default (optional)
const api = {
  fetchSheet, insertRow,
  fetchMembers, fetchMembersFresh, addMember, saveMember, uploadPhoto, uploadMemberPhoto, fetchMemberById, fetchMemberBundle,
  updateMember,
  fetchAttendance, clockIn, clockOut, upsertAttendance,
  fetchGymEntries, addGymEntry,
  gymQuickAppend,
  fetchProgressTracker, addProgressRow,
  fetchPricing,
  fetchPayments, addPayment,
  fetchDashboard,
};
export default api;

// Parse "3:05 PM" -> minutes since midnight
function parseTime12(t) {
  const s = String(t || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
  if (!m) return Infinity;
  let h = parseInt(m[1], 10), min = parseInt(m[2], 10);
  const ampm = (m[3] || "").toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

// Who is primary from today's rows (no TimeOut, earliest TimeIn)
export function derivePrimaryFromAttendance(rows = []) {
  const open = rows.filter(r => {
    const v = String(r?.TimeOut ?? "").trim();
    return v === "" || v === "-" || v === "—";
  });
  if (!open.length) return null;
  open.sort((a, b) =>
    parseTime12(a?.TimeIn || a?.SignIn || a?.timeIn) -
    parseTime12(b?.TimeIn || b?.SignIn || b?.timeIn)
  );
  const first = open[0];
  return first?.Staff || first?.staff || first?.StaffName || null;
}

// Try API; fallback to computing from attendance
// primary attendant API removed; derivePrimaryFromAttendance remains for any local use