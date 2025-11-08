import debounce from 'lodash.debounce';
// Debounced fetchSheet for user-triggered actions
const debouncedFetchSheet = debounce(async (sheetName) => {
  return await fetchSheet(sheetName);
}, 300);

// NOTE: removed SWR-based caching. `useSheetData` now performs a fresh fetch
// against the configured Apps Script endpoint on every call so callers always
// receive authoritative, up-to-date data.
export async function useSheetData(sheetName) {
  try {
    const data = await fetchSheet(sheetName);
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
// Apps Script Web App base URL
// Support multiple env var names for backwards compatibility: prefer VITE_APPS_SCRIPT_URL,
// then VITE_GS_WEBAPP_URL, then legacy VITE_SCRIPT_URL.
const BASE = (
  import.meta.env.VITE_APPS_SCRIPT_URL || import.meta.env.VITE_GS_WEBAPP_URL || import.meta.env.VITE_SCRIPT_URL || ""
).trim();
const ATT_SHEET = (import.meta.env.VITE_ATTENDANCE_SHEET || "Attendance").trim();
// NOTE: mock/dev-only code removed. This module now always talks to the configured
// Apps Script endpoint (VITE_APPS_SCRIPT_URL). Ensure that environment variable is set.

// Build URL with query
function withQuery(q) {
  if (!BASE) throw new Error("VITE_APPS_SCRIPT_URL is missing");
  if (!q) return BASE;
  const sep = BASE.includes("?") ? "&" : "?";
  return `${BASE}${sep}${q.replace(/^\?/, "")}`;
}

// Mock implementation removed.

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
  const r = await fetch(url, { cache: "no-store", mode: "cors" });
  return parseJsonOrThrow(r, url);
}
import events from "../lib/events";

// Simple in-memory cache to avoid repeated network round-trips during a session
// Keep a placeholder cache object for compatibility but disable its use.
// We'll clear it at module load to avoid any accidental stale reads.
const _GET_CACHE = new Map(); // url -> { ts, data }
try { _GET_CACHE.clear(); } catch (e) {}
// Helper to selectively invalidate or update cache entries after writes.
function _invalidateCacheContaining(sub) {
  try {
    for (const k of Array.from(_GET_CACHE.keys())) {
      if (k.includes(sub)) _GET_CACHE.delete(k);
    }
  } catch {}
}

function _mergeMemberIntoCache(newRow) {
  // no-op: client-side caching fully disabled to always fetch authoritative DB state
}

function _updateMemberInCache(updatedRow) {
  // no-op: client-side caching fully disabled
}
function _appendGymEntryToCache(entry) {
  // no-op: client-side caching fully disabled
  return false;
}
// Remove exact duplicate gym/attendance rows (same Staff, Date, TimeIn, TimeOut)
function _dedupeGymRows(rows) {
  try {
    if (!Array.isArray(rows)) return rows;
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      const key = `${String(r?.Staff||'').trim().toLowerCase()}|${String(r?.Date||'').slice(0,10)}|${String(r?.TimeIn||'').trim()}|${String(r?.TimeOut||'').trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  } catch (e) {
    return rows;
  }
}
function cachedGetJSON(url, ttlMs = 30_000) {
  // NOTE: client-side caching disabled to ensure UI always reads fresh DB state.
  // Always perform a fresh network GET and return the parsed JSON.
  return getJSON(url).then((data) => JSON.parse(JSON.stringify(data)));
}

// Helper: pick first sensible value from a row given candidate header names
function pickVal(row, ...cands) {
  if (!row) return "";
  for (const k of cands) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") return row[k];
    const kl = String(k).toLowerCase();
    // try case-insensitive keys
    const found = Object.keys(row || {}).find((kk) => String(kk || "").toLowerCase().replace(/\s+/g, "") === kl.replace(/\s+/g, ""));
    if (found && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== "") return row[found];
  }
  return "";
}

// Canonicalize member row keys to a predictable set used by the UI.
function canonicalizeMember(raw) {
  if (!raw) return null;
  const r = raw || {};
  const out = {};
  out.memberid = String(pickVal(r, 'MemberID', 'memberId', 'member_id', 'ID', 'Id') || '').trim();
  out.lastname = pickVal(r, 'LastName', 'Last Name', 'lastname', 'last_name');
  out.firstname = pickVal(r, 'FirstName', 'First Name', 'firstname', 'first_name');
  out.middlename = pickVal(r, 'MiddleName', 'Middle Name', 'middlename', 'middle_name');
  out.nickname = pickVal(r, 'NickName', 'Nick Name', 'nickname', 'nick_name');
  out.gender = pickVal(r, 'Gender', 'gender');
  out.birthday = pickVal(r, 'Birthday', 'birth_date', 'dob', 'Birth Date');
  out.street = pickVal(r, 'Street', 'street', 'House No', 'House No.');
  out.brgy = pickVal(r, 'Brgy', 'Barangay', 'brgy', 'barangay');
  out.municipality = pickVal(r, 'Municipality', 'City', 'municipality', 'city');
  out.email = pickVal(r, 'Email', 'email');
  out.mobile = pickVal(r, 'Mobile', 'Phone', 'mobile', 'phone');
  out.member_since = pickVal(r, 'MemberSince', 'Member Since', 'member_since', 'join_date');
  out.photo = pickVal(r, 'PhotoURL', 'photoUrl', 'photo_url', 'photo');
  out.student = pickVal(r, 'Student', 'student');
  out.validid = pickVal(r, 'ValidID', 'Valid Id', 'valid_id');
  // also keep the original row for any other fields the UI may want
  out._raw = r;
  return out;
}
async function postJSON(url, body) {
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
      try { events.emit('payment:added', { request: body, response: data }); } catch(e) {}
    }
  } catch (e) {}
  return data;
}
async function postForm(obj) {
  // Use form-encoded body so there’s no CORS preflight
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
      // For quick attendance appends, prefer invalidating the attendance/GymEntries cache
      // so callers always re-fetch authoritative rows from the server. For other
      // quick gym ops we may still append lightweight entries into the cache.
      try {
        if (op === 'quick_attendance_append') {
          _invalidateCacheContaining('action=attendance');
          _invalidateCacheContaining('sheet=GymEntries');
          _invalidateCacheContaining('sheet=Attendance');
        } else {
          const light = {};
          if (obj.MemberID) light.MemberID = obj.MemberID;
          if (obj.Staff) light.Staff = obj.Staff;
          if (obj.TimeIn) light.TimeIn = obj.TimeIn;
          if (obj.Date) light.Date = obj.Date;
          if (Object.keys(light).length) _appendGymEntryToCache(light);
          else { _invalidateCacheContaining('action=attendance'); _invalidateCacheContaining('sheet=GymEntries'); }
        }
      } catch(e) { _invalidateCacheContaining('action=attendance'); _invalidateCacheContaining('sheet=GymEntries'); }
      try {
        const light = {};
        if (obj.MemberID) light.MemberID = obj.MemberID;
        if (obj.Staff) light.Staff = obj.Staff;
        if (obj.TimeIn) light.TimeIn = obj.TimeIn;
        if (obj.Date) light.Date = obj.Date;
        if (Object.keys(light).length) events.emit('gymEntry:added', light);
      } catch(e) {}
    } else if (op === 'addpayment') {
      _invalidateCacheContaining('action=payments');
      _invalidateCacheContaining('action=dashboard');
      try { events.emit('payment:added', { request: obj, response: data }); } catch(e) {}
    }
  } catch (e) {}
  return data;
}

// Generic
export async function fetchSheet(sheetName) {
  const url = withQuery(`sheet=${encodeURIComponent(sheetName)}`);
  return cachedGetJSON(url, 30_000);
}
export async function insertRow(sheet, row) {
  // Use form-encoded to avoid preflight; send row as JSON string
  return postForm({ op: "insert", sheet, row: JSON.stringify(row) });
}

// Members
export async function fetchMembers() {
  return cachedGetJSON(withQuery("action=members"), 30_000);
}
export async function fetchMembersFresh() { return fetchMembers(); }
export async function addMember(row) { return insertRow("Members", row); }
export async function saveMember(row) { return addMember(row); }
export async function updateMember(row) {
  // expects { MemberID, ...fields }
  return postForm({ op: "updatemember", row: JSON.stringify(row) });
}
export async function uploadPhoto({ memberId, filename, mime, data }) {
  // Also send as form-encoded to avoid preflight; backend should parse base64
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
  return uploadPhoto(fileOrArgs || {});
}
export async function fetchMemberById(memberId) {
  const res = await fetchSheet("Members");
  const rows = res?.rows || res?.data || [];
  const found = rows.find(r => String(r.MemberID||r.memberid||r.id||'').trim() === String(memberId).trim()) || null;
  return canonicalizeMember(found) || null;
}
// Fresh fetch that bypasses the client-side cache and requests the Members
// sheet directly from the server. Use this when you need authoritative data
// immediately after a write (for example, in optimistic-update reconciliation).
export async function fetchMemberByIdFresh(memberId) {
  const res = await getJSON(withQuery(`sheet=${encodeURIComponent("Members")}`));
  const rows = res?.rows || res?.data || [];
  try {
    console.debug('[sheets] fetchMemberByIdFresh', { memberId, rowsCount: (rows || []).length });
  } catch (e) {}
  const found = rows.find(r => String(r.MemberID||r.memberid||r.id||'').trim() === String(memberId).trim()) || null;
  if (!found) {
    try {
      const ids = (rows || []).slice(0, 30).map(r => String(r.MemberID||r.memberid||r.id||'').trim());
      console.debug('[sheets] fetchMemberByIdFresh: no match found for', memberId, 'sample ids=', ids);
      if (rows && rows.length) console.debug('[sheets] fetchMemberByIdFresh: sample row[0]=', rows[0]);
    } catch (e) {}
  }
  // Return the raw sheet row so existing components that expect original
  // column names (e.g. `FirstName`, `LastName`, `NickName`) continue to work.
  // Also attach a canonicalized copy under `_canonical` for callers that
  // expect normalized keys.
  if (!found) return null;
  try { const c = canonicalizeMember(found); if (c) found._canonical = c; } catch (e) {}
  return found;
}
export async function fetchMemberBundle(memberId) {
  if (!memberId) throw new Error("memberId is required");
  const [memRes, payRes, gymRes, progRes] = await Promise.all([
    fetchSheet("Members"),
    // use the cached payments helper so repeated calls are fast
    fetchPayments(),
    fetchSheet("GymEntries"),
    fetchSheet("ProgressTracker"),
  ]);
  // Flexible key normalization: payments/gym rows may use different header names like
  // 'MemberID', 'Member ID', 'member id' etc. Normalize keys to match reliably.
  const normRowLocal = (row) => {
    const out = {};
    try { Object.entries(row || {}).forEach(([k, v]) => { out[String(k || "").trim().toLowerCase().replace(/\s+/g, "_")] = v; }); } catch (e) {}
    return out;
  };
  const id = String(memberId).trim();
  const memRows = (memRes?.rows||memRes?.data||[]);
  try { console.debug('[sheets] fetchMemberBundle', { memberId: id, memRows: memRows.length }); } catch (e) {}
  const member = memRows.find(r => {
    try { const n = normRowLocal(r); return String(n.memberid || n.member_id || n.id || '').trim() === id; } catch(e) { return false; }
  }) || null;
  if (!member) {
    try {
      const sampleIds = memRows.slice(0, 20).map(r => {
        try { return String((r.MemberID||r.memberid||r.id||'')).trim(); } catch(e) { return '' }
      });
      console.debug('[sheets] fetchMemberBundle: member not found for', id, 'sampleIds=', sampleIds);
      if (memRows && memRows.length) console.debug('[sheets] fetchMemberBundle: sample row[0]=', memRows[0]);
    } catch (e) {}
  }
  // Keep the raw member row (sheet keys) for compatibility with existing
  // components that access PascalCase column names. Provide a canonicalized
  // copy under `_canonical` for normalized access when needed.
  const canonicalMember = member ? canonicalizeMember(member) : null;
  const payments = (payRes?.rows||payRes?.data||[]).filter(r => {
    try { const n = normRowLocal(r); return String(n.memberid || n.member_id || n.id || '').trim() === id; } catch(e) { return false; }
  });
  const gymEntries = (gymRes?.rows||gymRes?.data||[]).filter(r => {
    try { const n = normRowLocal(r); return String(n.memberid || n.member_id || n.id || '').trim() === id; } catch(e) { return false; }
  });
  const progress = (progRes?.rows||progRes?.data||[]).filter(r => {
    try { const n = normRowLocal(r); return String(n.memberid || n.member_id || n.id || '').trim() === id; } catch(e) { return false; }
  });
  if (member && canonicalMember) member._canonical = canonicalMember;
  return { member: member || null, payments, gymEntries, progress };
}

// Attendance (include sheet)
export async function fetchAttendance(dateYMD, force = false) {
  const q = dateYMD ? `action=attendance&date=${encodeURIComponent(dateYMD)}` : "action=attendance";
  // Attendance is likely to change often; keep cache small
  // If caller requests a forced fresh fetch, bypass the cachedGetJSON
  const fetchPrimary = async () => {
    if (force) return getJSON(withQuery(q)).catch(() => ({ rows: [] }));
    return cachedGetJSON(withQuery(q), 5_000).catch(() => ({ rows: [] }));
  };
  const primary = await fetchPrimary();
  const rows = primary?.rows || primary?.data || [];
  if (rows && rows.length) {
    // dedupe before returning
    const deduped = _dedupeGymRows(Array.isArray(primary?.rows) ? primary.rows : (primary?.data || []));
    return Array.isArray(primary?.rows) ? { rows: deduped } : { data: deduped };
  }
  // fallback: try the configured attendance sheet name (ATT_SHEET)
  try {
    const bySheet = force ? await getJSON(withQuery(`sheet=${encodeURIComponent(ATT_SHEET)}`)).catch(() => ({ rows: [] })) : await cachedGetJSON(withQuery(`sheet=${encodeURIComponent(ATT_SHEET)}`), 5_000).catch(() => ({ rows: [] }));
    const srows = bySheet?.rows || bySheet?.data || [];
    if (srows && srows.length) {
      const deduped = _dedupeGymRows(Array.isArray(bySheet?.rows) ? bySheet.rows : (bySheet?.data || []));
      return Array.isArray(bySheet?.rows) ? { rows: deduped } : { data: deduped };
    }
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
  return postForm({ op: "quick_attendance_append", Staff: staff, ...extra });
}

// Gym Entries
export async function fetchGymEntries() { return cachedGetJSON(withQuery(`sheet=GymEntries`), 30_000); }
// Fresh, no-cache fetch for GymEntries when callers need authoritative, up-to-date rows.
export async function fetchGymEntriesFresh() { return getJSON(withQuery(`sheet=GymEntries`)); }
export async function addGymEntry(row) { return insertRow("GymEntries", row); }
export async function gymClockIn(memberId, extra={}){
  if(!memberId) throw new Error("memberId is required");
  return postForm({ op: "gymclockin", MemberID: memberId, ...extra });
}
export async function gymClockOut(memberId){
  if(!memberId) throw new Error("memberId is required");
  // Allow passing extra fields (Workouts, Comments, etc.) via additional properties
  // Caller may pass an object: gymClockOut(memberId, { Workouts, Comments })
  const extra = (arguments && arguments.length > 1 && typeof arguments[1] === 'object') ? arguments[1] : {};
  return postForm({ op: "gymclockout", MemberID: memberId, ...extra });
}
export async function upsertGymEntry({ memberId, coach, focus, timeOut, TimeIn, Date, rowNumber, Workouts, Comments }){
  // Accept optional Date/TimeIn/rowNumber to allow targeting a specific existing row
  if(!memberId) throw new Error('memberId is required');
  const payload = { op: "upsertgymentry", MemberID: memberId };
  if (timeOut) payload.TimeOut = timeOut;
  if (coach) payload.Coach = coach;
  if (focus) payload.Focus = focus;
  if (TimeIn) payload.TimeIn = TimeIn;
  if (Date) payload.Date = Date;
  if (rowNumber) payload.rowNumber = rowNumber;
  if (Workouts) payload.Workouts = Workouts;
  if (Comments) payload.Comments = Comments;
  return postForm(payload);
}

// Fast append/check-out endpoint: minimal validation and form-encoded POST to avoid preflight
export async function gymQuickAppend(memberId, extra = {}){
  if (!memberId) throw new Error("memberId is required");
  return postForm({ op: "quick_gym_append", MemberID: memberId, ...extra });
}

// Progress Tracker
export async function fetchProgressTracker() { return cachedGetJSON(withQuery(`sheet=ProgressTracker`), 30_000); }
export async function addProgressRow(row) { return insertRow("ProgressTracker", row); }

// Pricing
export async function fetchPricing() { return cachedGetJSON(withQuery("action=pricing"), 30_000); }

// Payments
export async function fetchPayments() { return cachedGetJSON(withQuery("action=payments"), 30_000); }
// Use form-encoded to avoid CORS preflight which can cause "failed to fetch"
export async function addPayment(payload) { return postForm({ op: "addpayment", ...payload }); }

// Dashboard aggregate (server-side precomputed summary)
export async function fetchDashboard() { return cachedGetJSON(withQuery("action=dashboard"), 10_000); }

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