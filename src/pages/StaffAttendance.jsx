import React, { useEffect, useMemo, useRef, useState } from "react";
import "../styles.css";
import { fetchAttendance, clockIn, clockOut } from "../api/sheets";

/** Config: staff names shown in the dropdown */
const STAFF = [
  "Coach ELMER",
  "Coach JOJO",
  "SHEENA",
  "PAT",
  "XYZA",
  "BEZZA",
  "JEANETTE",
  "JOHANNA",
];

const two = (n) => String(n).padStart(2, "0");
const fmtLocalHM = (hm) => {
  // hm is "HH:mm" (server)
  if (!hm) return "-";
  const [H, M] = hm.split(":").map((x) => parseInt(x, 10));
  if (isNaN(H) || isNaN(M)) return hm;
  const d = new Date();
  d.setHours(H, M, 0, 0);
  let h = d.getHours();
  const m = two(d.getMinutes());
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
};
const parseHmToMinutes = (hm) => {
  const m = String(hm || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1];
  const mm = +m[2];
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
};
const durationHours = (hmIn, hmOut) => {
  const a = parseHmToMinutes(hmIn);
  const b = parseHmToMinutes(hmOut);
  if (a == null || b == null) return 0;
  // allow cross-midnight just in case
  const end = b >= a ? b : b + 24 * 60;
  const hrs = (end - a) / 60;
  return Math.round(hrs * 100) / 100;
};

// === Manila timezone helpers (keep) ===
const MANILA_TZ = "Asia/Manila";

// Parse many inputs, and keep calendar days stable for "YYYY-MM-DD"
const toManilaDate = (value) => {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [y, m, d] = value.split("-").map(Number);
    // Create an instant that formats to the same calendar day in Manila
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  }
  return new Date(value);
};

const fmtManilaTime = (value) => {
  const d = toManilaDate(value);
  if (!d || isNaN(d)) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: MANILA_TZ,
  }).format(d);
};

const fmtManilaDate = (value) => {
  const d = toManilaDate(value);
  if (!d || isNaN(d)) return "";
  // "Nov 1, 2025" -> "Nov-1, 2025"
  const s = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: MANILA_TZ,
  }).format(d);
  return s.replace(" ", "-");
};

// If you need today's date fallback in Manila
const nowManila = () => Date.now();

// --- Time parsing/normalization helpers ---
const HM_RE = /^(\d{1,2}):(\d{2})$/;

// Build an ISO string pinned to Manila for a given y-m-d + "HH:mm"
const hmToIsoManila = (ymd, hm) => {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = String(hm || "").match(HM_RE);
  if (!m || !t) return "";
  const [_, y, mo, d] = m;
  const [__, H, M] = t;
  // +08:00 ensures it’s interpreted as Manila time
  return `${y}-${mo}-${d}T${H.padStart(2, "0")}:${M}:00+08:00`;
};

// Normalize any time cell to an ISO string (when possible) for display
const normalizeToIso = (ymd, val) => {
  if (!val) return "";
  if (HM_RE.test(String(val))) return hmToIsoManila(ymd, val);
  const d = new Date(val);
  return isNaN(d) ? "" : d.toISOString(); // keep actual instant
};

// Compute duration in hours between two times
// Accepts "HH:mm", ISO strings, or mix. Uses date (ymd) for HH:mm.
const hoursBetween = (ymd, tin, tout) => {
  if (!tin || !tout) return 0;

  // Case 1: both HH:mm
  const a = String(tin).match(HM_RE);
  const b = String(tout).match(HM_RE);
  if (a && b) {
    const minutes = (h, m) => +h * 60 + +m;
    const mi = minutes(a[1], a[2]);
    const mo = minutes(b[1], b[2]);
    // allow cross-midnight
    const end = mo >= mi ? mo : mo + 24 * 60;
    return (end - mi) / 60;
  }

  // Case 2: at least one is a full date/time
  const iIso = a ? hmToIsoManila(ymd, `${a[1]}:${a[2]}`) : String(tin);
  const oIso = b ? hmToIsoManila(ymd, `${b[1]}:${b[2]}`) : String(tout);
  const di = new Date(iIso);
  const do_ = new Date(oIso);
  if (isNaN(di) || isNaN(do_)) return 0;
  const ms = do_.getTime() - di.getTime();
  // allow cross-midnight
  const fixed = ms >= 0 ? ms : ms + 24 * 60 * 60 * 1000;
  return fixed / 3600000;
};

// PH date helpers for last 20 days and formatting
const phYMDFrom = (base = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(base);
  const y = parts.find((p) => p.type === "year")?.value || "0000";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
};
const phTodayYMD = () => phYMDFrom(new Date());
const lastNDatesYMD_PH = (n = 20) => {
  const out = [];
  const nowPH = new Date(new Date().toLocaleString("en-US", { timeZone: MANILA_TZ }));
  for (let i = 0; i < n; i++) {
    const d = new Date(nowPH);
    d.setDate(nowPH.getDate() - i);
    out.push(phYMDFrom(d));
  }
  return out;
};
const monDashYear = (ymd) => {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(ymd || "");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const month = months[parseInt(m[2], 10) - 1] || "Jan";
  const day = parseInt(m[3], 10);
  const year = m[1];
  return `${month}-${day}, ${year}`; // e.g., "Nov-2, 2025"
};

// Treat "", -, – , — as empty
const isEmptyOut = (v) => {
  const s = String(v ?? "").trim();
  return !s || s === "-" || s === "–" || s === "—";
};
// ms until next 23:59:00 PH
const msUntilNext2359PH = () => {
  const nowPH = new Date(new Date().toLocaleString("en-US", { timeZone: MANILA_TZ }));
  const tgt = new Date(nowPH);
  tgt.setHours(23, 59, 0, 0);
  if (tgt <= nowPH) tgt.setDate(tgt.getDate() + 1);
  return tgt - nowPH + 500;
};

export default function StaffAttendance() {
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]); // raw rows from multiple days
  const timerRef = useRef(null);

  // Load last 20 PH days
  async function load() {
    setBusy(true);
    setError("");
    try {
      const days = lastNDatesYMD_PH(20);
      const resList = await Promise.all(days.map((d) => fetchAttendance(d).catch(() => null)));
      const all = [];
      resList.forEach((res, idx) => {
        const ymd = days[idx];
        const rws = res?.rows || res?.data || [];
        // Always pin the row's Date to the PH fetch-day to avoid timezone drift
        rws.forEach((r) => all.push({ ...r, Date: ymd }));
      });
      // newest date first, then STAFF order, then name, then TimeIn
      all.sort((a, b) => {
        const ad = (a.Date || "").localeCompare(b.Date || "");
        if (ad !== 0) return -ad; // desc
        const ia = STAFF.indexOf(String(a.Staff || "").trim());
        const ib = STAFF.indexOf(String(b.Staff || "").trim());
        if (ia !== ib) return (ia === -1 ? 9999 : ia) - (ib === -1 ? 9999 : ib);
        const as = String(a.Staff || "").localeCompare(String(b.Staff || ""));
        if (as !== 0) return as;
        return String(a.TimeIn || "").localeCompare(String(b.TimeIn || ""));
      });
      setRows(all);
    } catch (e) {
      setError(e.message || "Failed to load attendance");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Group by staff + date (one table row per staff per day)
  const grouped = useMemo(() => {
    // Map key: `${date}|${staff}`
    const map = new Map();

    for (const r of rows) {
      const staff = String(r.Staff ?? "").trim();
      if (!staff) continue;

      const dateStr = String(r.Date ?? "").slice(0, 10); // "YYYY-MM-DD"
      const tinRaw = String(r.TimeIn ?? "").trim();
      const toutRaw = String(r.TimeOut ?? "").trim();

      const key = `${dateStr}|${staff}`;
      let obj = map.get(key);
      if (!obj) {
        obj = { staff, date: dateStr, sessions: [], totalHours: 0, clockedIn: false, _seen: new Set() };
        map.set(key, obj);
      }

      // Normalized ISO strings for display
      const tinISO = normalizeToIso(dateStr, tinRaw);
      const toutISO = normalizeToIso(dateStr, toutRaw);

      // De-duplicate by unique pair (same in/out only once)
      const dedupeKey = `${tinISO || tinRaw}|${toutISO || toutRaw}`;
      if (obj._seen.has(dedupeKey)) continue;
      obj._seen.add(dedupeKey);

      if (tinRaw) obj.sessions.push({ in: tinISO || tinRaw, out: toutISO || "" });

      const hrs = hoursBetween(dateStr, tinRaw, toutRaw);
      if (hrs > 0) obj.totalHours = Math.round((obj.totalHours + hrs) * 100) / 100;

      if (tinRaw && !toutRaw) obj.clockedIn = true;
    }

    // sort sessions by time-in
    const getSortVal = (t) => {
      if (!t) return 0;
      if (HM_RE.test(t)) {
        const [, h, m] = t.match(HM_RE);
        return +h * 60 + +m;
      }
      const d = new Date(t);
      return isNaN(d) ? 0 : d.getTime();
    };
    const arr = Array.from(map.values());
    for (const v of arr) {
      v.sessions.sort((a, b) => getSortVal(a.in) - getSortVal(b.in));
      delete v._seen;
    }

    // Order by date desc, then STAFF order, then name
    arr.sort((a, b) => {
      const ad = (a.date || "").localeCompare(b.date || "");
      if (ad !== 0) return -ad;
      const ia = STAFF.indexOf(a.staff);
      const ib = STAFF.indexOf(b.staff);
      if (ia !== ib) return (ia === -1 ? 9999 : ia) - (ib === -1 ? 9999 : ib);
      return a.staff.localeCompare(b.staff);
    });

    return arr;
  }, [rows]);

  // Only consider “clocked in” for today (PH) to enable/disable buttons
  const isClockedInToday = (name) => {
    const today = phTodayYMD();
    const sameName = (a = "", b = "") => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    // Only today’s open session should affect today’s UI state
    return grouped.some((g) => g.date === today && g.clockedIn && sameName(g.staff, name));
  };

  const onSignIn = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const res = await clockIn({ staff: selected });
      if (!res?.ok) throw new Error(res?.error || "Clock-in failed");
      await load();
    } catch (e) {
      setError(e.message || "Failed to sign in");
      alert(e.message || "Failed to sign in");
      console.error("clockIn error:", e);
    } finally {
      setBusy(false);
    }
  };

  const onSignOut = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const res = await clockOut({ staff: selected });
      if (!res?.ok) throw new Error(res?.error || "Clock-out failed");
      await load();
    } catch (e) {
      setError(e.message || "Failed to sign out");
      alert(e.message || "Failed to sign out");
      console.error("clockOut error:", e);
    } finally {
      setBusy(false);
    }
  };

  // Best-effort auto sign-out at 11:59 PM Manila (app must be open)
  useEffect(() => {
    const schedule = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        const today = phTodayYMD();
        const openStaff = Array.from(
          new Set(
            grouped
              .filter((g) => g.date === today && g.clockedIn)
              .map((g) => g.staff)
          )
        );
        if (openStaff.length) {
          try {
            await Promise.all(openStaff.map((s) => clockOut({ staff: s }).catch(() => null)));
          } catch {}
          await load();
        }
        schedule(); // schedule next day
      }, msUntilNext2359PH());
    };
    schedule();
    return () => clearTimeout(timerRef.current);
  }, [grouped]); // reschedule if the set of open staff changes

  return (
    <div className="dashboard-content">
      <h2 className="dashboard-title">Staff Attendance</h2>

      {error && (
        <div className="small-error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="panel">
        <div className="panel-header">Select Staff Member</div>

        {/* Inline row: dropdown + buttons (left-aligned) */}
        <div className="att-inline">
          <select
            className="att-inline-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={busy}
          >
            <option value=""></option>
            {STAFF.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <div className="att-inline-actions">
            <button
              className="primary-btn"
              onClick={onSignIn}
              disabled={!selected || busy || isClockedInToday(selected)}
              title={isClockedInToday(selected) ? "Already signed in today" : "Sign In"}
            >
              ⏎ Sign In
            </button>
            <button
              className="primary-btn"
              onClick={onSignOut}
              disabled={!selected || busy || !isClockedInToday(selected)}
              title={!isClockedInToday(selected) ? "Not currently signed in" : "Sign Out"}
            >
              ⏏ Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">Attendance Records</div>

        <table className="attendance-table aligned">
          <colgroup>
            <col style={{ width: "calc(var(--att-c1) * 1%)" }} />
            <col style={{ width: "calc(var(--att-c2) * 1%)" }} />
            <col style={{ width: "calc(var(--att-c3) * 1%)" }} />
            <col style={{ width: "calc(var(--att-c4) * 1%)" }} />
            <col style={{ width: "calc(var(--att-c5) * 1%)" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Staff Name</th>
              <th>Date</th>
              <th>Sign In</th>
              <th>Sign Out</th>
              <th style={{ textAlign: "right" }}>Total Hours</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)", textAlign: "center", padding: 16 }}>
                  No records in the last 20 days.
                </td>
              </tr>
            ) : (
              grouped.map((g) => (
                <tr key={`${g.date}|${g.staff}`}>
                  <td style={{ fontWeight: 700 }}>{g.staff}</td>
                  <td>{monDashYear(g.date)}</td>
                  <td>
                    {g.sessions.length
                      ? g.sessions.map((s, i) => (
                          <div key={i} style={{ lineHeight: "20px" }}>
                            {fmtManilaTime(s.in)}
                          </div>
                        ))
                      : "—"}
                  </td>
                  <td>
                    {g.sessions.length
                      ? g.sessions.map((s, i) => (
                          <div key={i} style={{ lineHeight: "20px" }}>
                            {s.out ? fmtManilaTime(s.out) : <span style={{ color: "var(--muted)" }}>—</span>}
                          </div>
                        ))
                      : "—"}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <span className="badge">{g.totalHours.toFixed(2)}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}