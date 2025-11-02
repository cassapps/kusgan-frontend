import React, { useEffect, useMemo, useState } from "react";
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

// === Manila timezone helpers (safe + self-contained) ===
const MANILA_TZ = "Asia/Manila";
const toManilaDate = (value) => {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  }
  return new Date(s);
};
const manilaTodayYMD = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const fmtManilaDate = (value) => {
  const d = toManilaDate(value);
  if (!d || isNaN(d)) return "";
  const s = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: MANILA_TZ,
  }).format(d);
  return s.replace(" ", "-");
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
const toYMD = (value) => {
  if (!value) return "";
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = toManilaDate(s);
  if (!d || isNaN(d)) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
};

// --- Time parsing/normalization helpers ---
const HM_RE = /^(\d{1,2}):(\d{2})$/;
const hmToIsoManila = (ymd, hm) => {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = String(hm || "").match(HM_RE);
  if (!m || !t) return "";
  const [_, y, mo, d] = m;
  const [__, H, M] = t;
  return `${y}-${mo}-${d}T${H.padStart(2, "0")}:${M}:00+08:00`;
};
const normalizeToIso = (ymd, val) => {
  if (!val) return "";
  if (HM_RE.test(String(val))) return hmToIsoManila(ymd, val);
  const d = new Date(val);
  return isNaN(d) ? "" : d.toISOString();
};
const hoursBetween = (ymd, tin, tout) => {
  if (!tin || !tout) return 0;
  const a = String(tin).match(HM_RE);
  const b = String(tout).match(HM_RE);
  if (a && b) {
    const minutes = (h, m) => +h * 60 + +m;
    const mi = minutes(a[1], a[2]);
    const mo = minutes(b[1], b[2]);
    const end = mo >= mi ? mo : mo + 24 * 60;
    return (end - mi) / 60;
  }
  const iIso = a ? hmToIsoManila(ymd, `${a[1]}:${a[2]}`) : String(tin);
  const oIso = b ? hmToIsoManila(ymd, `${b[1]}:${b[2]}`) : String(tout);
  const di = new Date(iIso);
  const do_ = new Date(oIso);
  if (isNaN(di) || isNaN(do_)) return 0;
  const ms = do_.getTime() - di.getTime();
  const fixed = ms >= 0 ? ms : ms + 24 * 60 * 60 * 1000;
  return fixed / 3600000;
};

export default function StaffAttendance() {
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [serverDate, setServerDate] = useState(""); // YYYY-MM-DD from server
  const [rows, setRows] = useState([]); // raw rows from Attendance (Date, Staff, TimeIn, TimeOut, NoOfHours)

  // Load today's attendance (server decides the date/time in Manila)
  async function load() {
    setError("");
    try {
      const res = await fetchAttendance(); // no date param -> server uses Manila "today"
      setServerDate(res?.date || "");
      setRows(res?.rows || res?.data || []);
    } catch (e) {
      setError(e.message || "Failed to load attendance");
    }
  }

  useEffect(() => {
    load();
  }, []);

  // FIX: do not reference serverDate (it was undefined and crashed)
  const todayYMD = React.useMemo(() => manilaTodayYMD(), []);

  const grouped = React.useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const staff = String(r.Staff ?? "").trim();
      if (!staff) continue;

      const rowYMD = toYMD(r.Date);
      if (rowYMD && rowYMD !== todayYMD) continue; // today only

      const tinRaw = String(r.TimeIn ?? "").trim();
      const toutRaw = String(r.TimeOut ?? "").trim();

      let obj = map.get(staff);
      if (!obj) {
        obj = { staff, date: todayYMD, sessions: [], totalHours: 0, clockedIn: false, _seen:new Set() };
        map.set(staff, obj);
      }

      const tinISO = normalizeToIso(todayYMD, tinRaw);
      const toutISO = normalizeToIso(todayYMD, toutRaw);
      const key = `${tinISO || tinRaw}|${toutISO || toutRaw}`;
      if (obj._seen.has(key)) continue;
      obj._seen.add(key);

      if (tinRaw) obj.sessions.push({ in: tinISO || tinRaw, out: toutISO || "" });

      const hrs = hoursBetween(todayYMD, tinRaw, toutRaw);
      if (hrs > 0) obj.totalHours = Math.round((obj.totalHours + hrs) * 100) / 100;

      if (tinRaw && !toutRaw) obj.clockedIn = true;
    }

    const getSortVal = (t) => {
      if (!t) return 0;
      if (HM_RE.test(t)) { const [, h, m] = t.match(HM_RE); return +h*60 + +m; }
      const d = new Date(t); return isNaN(d) ? 0 : d.getTime();
    };
    for (const v of map.values()) {
      v.sessions.sort((a, b) => getSortVal(a.in) - getSortVal(b.in));
      delete v._seen;
    }

    // FIX: guard missing STAFF constant
    const ORDER = Array.isArray(globalThis.STAFF) ? globalThis.STAFF : [];
    const arr = Array.from(map.values());
    if (ORDER.length){
      arr.sort((a, b) => {
        const ia = ORDER.indexOf(a.staff); const ib = ORDER.indexOf(b.staff);
        const aa = ia === -1 ? 9999 : ia; const bb = ib === -1 ? 9999 : ib;
        return aa - bb || a.staff.localeCompare(b.staff);
      });
    } else {
      arr.sort((a,b)=> a.staff.localeCompare(b.staff));
    }
    return arr;
  }, [rows, todayYMD]);

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Staff Attendance</h1>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">
          Select Staff
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
        >
          <option value="">-- All Staff --</option>
          {STAFF.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="text-red-500 text-sm mb-4">{error}</div>}

      <div className="grid grid-cols-5 gap-4 text-center font-semibold text-gray-700 border-b pb-2 mb-2">
        <div>Date</div>
        <div>Staff</div>
        <div>Time In</div>
        <div>Time Out</div>
        <div>Total Hours</div>
      </div>

      {grouped.length === 0 ? (
        <div className="text-center text-gray-500 py-4" colSpan={5}>
          No attendance records found.
        </div>
      ) : (
        grouped
          .filter((r) => !selected || r.staff === selected)
          .map((r) => (
            <div
              key={r.staff}
              className="grid grid-cols-5 gap-4 text-center py-2 border-b"
            >
              <div className="text-gray-900 font-medium">
                {fmtManilaDate(r.date)}
              </div>
              <div className="text-gray-900">{r.staff}</div>
              <div className="text-gray-900">
                {r.sessions.length > 0
                  ? fmtManilaTime(r.sessions[0].in)
                  : "—"}
              </div>
              <div className="text-gray-900">
                {r.sessions.length > 0
                  ? fmtManilaTime(r.sessions[r.sessions.length - 1].out)
                  : "—"}
              </div>
              <div className="text-gray-900">
                {r.totalHours > 0 ? r.totalHours : "—"}
              </div>
            </div>
          ))
      )}

      <div className="mt-4">
        <button
          onClick={load}
          className="px-4 py-2 bg-blue-600 text-white rounded-md shadow hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
