// Client for your Apps Script Web App
// Set .env: VITE_GS_WEBAPP_URL=https://script.google.com/macros/s/XXXX/exec
// Reads either VITE_APPS_SCRIPT_URL or VITE_GS_WEBAPP_URL
const BASE = (import.meta.env.VITE_APPS_SCRIPT_URL || import.meta.env.VITE_GS_WEBAPP_URL || "").trim();

function withQuery(q) {
  if (!BASE) return "";
  if (!q) return BASE;
  const sep = BASE.includes("?") ? "&" : "?";
  return `${BASE}${sep}${q.replace(/^\?/, "")}`;
}

async function parseJsonOrThrow(r, url) {
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}: ${text.slice(0,200)}`);
  const s = text.trim();
  if (!(s.startsWith("{") || s.startsWith("["))) {
    throw new Error(`Expected JSON from ${url}. Got: ${s.slice(0,120)}`);
  }
  return JSON.parse(s);
}

async function getJSON(url) {
  if (!BASE) throw new Error("VITE_APPS_SCRIPT_URL is missing in .env");
  const r = await fetch(url, { cache: "no-store" });
  return parseJsonOrThrow(r, url);
}
async function postJSON(url, body) {
  if (!BASE) throw new Error("VITE_APPS_SCRIPT_URL is missing in .env");
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJsonOrThrow(r, url);
}

// Generic
export async function fetchSheet(sheetName) { return getJSON(withQuery(`sheet=${encodeURIComponent(sheetName)}`)); }
export async function insertRow(sheet, row) { return postJSON(withQuery(""), { op: "insert", sheet, row }); }

// Members
export async function fetchMembers() { return getJSON(withQuery("action=members")); }
export async function fetchMembersFresh() { return fetchMembers(); }
export async function addMember(row) { return insertRow("Members", row); }
export async function saveMember(row) { return addMember(row); }
export async function uploadPhoto({ memberId, filename, mime, data }) {
  return postJSON(withQuery(""), { op: "uploadphoto", memberId, filename, mime, data });
}
export async function uploadMemberPhoto(args) { return uploadPhoto(args); }
export async function fetchMemberById(memberId) {
  const res = await fetchSheet("Members");
  const rows = res?.rows || res?.data || [];
  return rows.find(r => String(r.MemberID||"").trim() === String(memberId).trim()) || null;
}
export async function fetchMemberBundle(memberId) {
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

// Attendance
export async function fetchAttendance(dateYMD) {
  const q = dateYMD ? `action=attendance&date=${encodeURIComponent(dateYMD)}` : "action=attendance";
  return getJSON(withQuery(q));
}
export async function clockIn(staff) { return postJSON(withQuery(""), { op: "clockin", Staff: staff }); }
export async function clockOut(staff) { return postJSON(withQuery(""), { op: "clockout", Staff: staff }); }
export async function fetchPrimaryAttendant() { return getJSON(withQuery("action=primary-attendant")); }
export async function upsertAttendance(row) {
  const op = row && row.TimeOut ? "clockout" : "clockin";
  return postJSON(withQuery(""), { op, row });
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
export async function addPayment(payload) { return postJSON(withQuery(""), { op: "addpayment", ...payload }); }

const api = {
  fetchSheet, insertRow,
  fetchMembers, fetchMembersFresh, addMember, saveMember, uploadPhoto, uploadMemberPhoto, fetchMemberById, fetchMemberBundle,
  fetchAttendance, clockIn, clockOut, fetchPrimaryAttendant, upsertAttendance,
  fetchGymEntries, addGymEntry,
  fetchProgressTracker, addProgressRow,
  fetchPricing,
  fetchPayments, addPayment,
};
export default api;