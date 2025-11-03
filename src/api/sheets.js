// Apps Script Web App base URL
const BASE = (import.meta.env.VITE_APPS_SCRIPT_URL || import.meta.env.VITE_GS_WEBAPP_URL || "").trim();
const ATT_SHEET = (import.meta.env.VITE_ATTENDANCE_SHEET || "Attendance").trim();
if (!BASE) console.warn("VITE_APPS_SCRIPT_URL is not set (.env)");

// Build URL with query
function withQuery(q) {
  if (!BASE) throw new Error("VITE_APPS_SCRIPT_URL is missing");
  if (!q) return BASE;
  const sep = BASE.includes("?") ? "&" : "?";
  return `${BASE}${sep}${q.replace(/^\?/, "")}`;
}

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
async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow(r, url);
}
async function postForm(obj) {
  // Use form-encoded body so there’s no CORS preflight
  const r = await fetch(BASE, { method: "POST", body: new URLSearchParams(obj) });
  return parseJsonOrThrow(r, BASE + " [POST form]");
}

// Generic
export async function fetchSheet(sheetName) {
  return getJSON(withQuery(`sheet=${encodeURIComponent(sheetName)}`));
}
export async function insertRow(sheet, row) {
  // Use form-encoded to avoid preflight; send row as JSON string
  return postForm({ op: "insert", sheet, row: JSON.stringify(row) });
}

// Members
export async function fetchMembers() {
  return getJSON(withQuery("action=members"));
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
  return rows.find(r => String(r.MemberID||"").trim() === String(memberId).trim()) || null;
}
export async function fetchMemberBundle(memberId) {
  if (!memberId) throw new Error("memberId is required");
  const [memRes, payRes, gymRes, progRes] = await Promise.all([
    fetchSheet("Members"),
    getJSON(withQuery("action=payments")),
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
  return getJSON(withQuery(q));
}
export async function clockIn(arg) {
  const staff = typeof arg === "string" ? arg : (arg?.staff || arg?.Staff || "");
  if (!staff) throw new Error("staff is required");
  return postForm({ op: "clockin", staff });   // <-- POST form, no headers
}
export async function clockOut(arg) {
  const staff = typeof arg === "string" ? arg : (arg?.staff || arg?.Staff || "");
  if (!staff) throw new Error("staff is required");
  return postForm({ op: "clockout", staff });  // <-- POST form, no headers
}
export async function upsertAttendance(row) {
  const wantsOut = row && row.TimeOut;
  const staff = row?.Staff || row?.staff || "";
  return wantsOut ? clockOut(staff) : clockIn(staff);
}

// Gym Entries
export async function fetchGymEntries() { return fetchSheet("GymEntries"); }
export async function addGymEntry(row) { return insertRow("GymEntries", row); }

// Progress Tracker
export async function fetchProgressTracker() { return fetchSheet("ProgressTracker"); }
export async function addProgressRow(row) { return insertRow("ProgressTracker", row); }

// Pricing
export async function fetchPricing() { return getJSON(withQuery("action=pricing")); }

// Payments
export async function fetchPayments() { return getJSON(withQuery("action=payments")); }
// Use form-encoded to avoid CORS preflight which can cause "failed to fetch"
export async function addPayment(payload) { return postForm({ op: "addpayment", ...payload }); }

// Default (optional)
const api = {
  fetchSheet, insertRow,
  fetchMembers, fetchMembersFresh, addMember, saveMember, uploadPhoto, uploadMemberPhoto, fetchMemberById, fetchMemberBundle,
  updateMember,
  fetchAttendance, clockIn, clockOut, upsertAttendance,
  fetchGymEntries, addGymEntry,
  fetchProgressTracker, addProgressRow,
  fetchPricing,
  fetchPayments, addPayment,
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