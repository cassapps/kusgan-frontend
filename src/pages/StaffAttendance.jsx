import React, { useEffect, useMemo, useState } from "react";
import "../styles.css";
import { fetchAttendance, attendanceQuickAppend, fetchMembers, fetchSheet, insertRow } from "../api/sheets";

const MANILA_TZ = "Asia/Manila";

const _MANILA_TIME_FMT = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: MANILA_TZ,
});

// Canonical hard-coded staff list (edit here to add/remove staff members).
// Staff are personnel (coaches/staff) — different from Members (clients).
const STAFF_LIST = [
  'Coach Elmer', 'Coach Jojo', 'Bezza', 'Patpat', 'Sheena', 'Jeanette', 'Xyza', 'Johanna'
];

// Names to pin to the top of the staff select (order here is preserved)
const STAFF_PRIORITY = ['Coach Jojo', 'Coach Elmer'];

const fmtManilaTime = (value) => {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (isNaN(d)) return String(value);
    return _MANILA_TIME_FMT.format(d);
  } catch (e) {
    return String(value);
  }
};

const phTodayYMD = () => {
  const d = new Date();
  try {
    const s = new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TZ }).format(d); // YYYY-MM-DD
    return s;
  } catch (e) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
};

// Parse a row's date value and return YYYY-MM-DD in Manila timezone.
const rowDateYMD = (r) => {
  try {
    const raw = String(r?.Date || r?.date || r?.DateTime || r?.datetime || r?.LogDate || r?.log_date || '').trim();
    if (!raw) return '';
    // If already in YYYY-MM-DD format, return directly
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0,10);
    // Try to parse as a Date; if it's an ISO string it'll be interpreted as UTC by Date
    const d = new Date(raw);
    if (!isNaN(d)) {
      // Format in Manila tz as YYYY-MM-DD
      return new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TZ }).format(d);
    }
    // Fallback: take first 10 chars
    return raw.slice(0,10);
  } catch (e) {
    return '';
  }
};

const normalizeToIso = (dateStr, hm) => {
  if (!dateStr) return hm || '';
  if (!hm) return '';
  if (/^\d{2}:\d{2}$/.test(hm)) {
    return `${dateStr}T${hm}:00`;
  }
  return hm;
};

const monDashYear = (ymd) => {
  if (!ymd) return '';
  try {
    const d = new Date(ymd);
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    return new Intl.DateTimeFormat('en-US', opts).format(d).replace(',', '-');
  } catch { return ymd; }
};

// Desired app-wide display: "Nov-7, 2025" (month-short - day, year)
const formatDisplayDate = (ymd) => {
  if (!ymd) return '';
  try {
    // Accept YYYY-MM-DD or other parseable date
    const d = new Date(ymd);
    if (isNaN(d)) return String(ymd);
    const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d);
    const day = d.getDate();
    const year = d.getFullYear();
    return `${month}-${day}, ${year}`;
  } catch (e) { return String(ymd); }
};

// Display time value (TimeIn/TimeOut) in 12-hour Manila AM/PM format.
const displayTimeFromRaw = (r, timeRaw) => {
  try {
    if (!timeRaw) return '—';
    const dateStr = rowDateYMD(r) || phTodayYMD();
    // If timeRaw looks like HH:MM, normalize to ISO using the row date
    const iso = (/^\d{1,2}:\d{2}$/.test(String(timeRaw).trim())) ? normalizeToIso(dateStr, String(timeRaw).trim()) : String(timeRaw).trim();
    return fmtManilaTime(iso);
  } catch (e) { return String(timeRaw || '—'); }
};

export default function StaffAttendance() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [staffOptions, setStaffOptions] = useState([]);
  const [visibleCount, setVisibleCount] = useState(10);
  const [pendingAction, setPendingAction] = useState(null); // { type: 'in'|'out', staff }

  const MANILA_TZ = "Asia/Manila";
  const phTodayYMD = () => {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TZ }).format(new Date()); }
    catch (e) { const d = new Date(); const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
  };

  // Return HH:MM 24-hour Manila time for a given Date (or now)
  const formatManilaHHMM = (date = new Date()) => {
    try {
      return new Intl.DateTimeFormat('en-GB', { timeZone: MANILA_TZ, hour12: false, hour: '2-digit', minute: '2-digit' }).format(new Date(date));
    } catch (e) {
      const d = new Date(date);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
  };

  useEffect(() => { load(false); /* staff list is hardcoded; populate from STAFF_LIST */ setStaffOptions(Array.from(new Set(STAFF_LIST)).sort((a,b)=>a.localeCompare(b))); }, []);

  async function load(force = false) {
    setLoading(true);
    setError("");
    try {
      // Always prefer reading the full Attendance sheet (authoritative staff rows)
      // so we consistently show historical rows rather than relying on an
      // endpoint that may return only today's entries.
      let data = [];
      try {
        const sheetRes = await fetchSheet('Attendance');
        data = sheetRes?.rows ?? sheetRes?.data ?? [];
      } catch (e) {
        // fallback to the attendance endpoint if sheet fetch fails
        try {
          const res = await fetchAttendance(undefined, force);
          data = res?.rows ?? res?.data ?? [];
        } catch (e2) { data = []; }
      }
      const finalRows = Array.isArray(data) ? data : [];
      console.debug(`StaffAttendance: loaded ${finalRows.length} rows (force=${!!force})`);
      setRows(finalRows);
      return finalRows;
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Failed to load attendance');
      setRows([]);
      return [];
    } finally { setLoading(false); }
  }

  // Note: staff are hard-coded in STAFF_LIST. We do not derive staff from Members.

  const isSignedInToday = (name) => {
    if (!name) return false;
    const key = String(name).trim().toLowerCase();
    const today = phTodayYMD();
    // First pass: exact match for today (same staff, same date, has TimeIn, no TimeOut)
    for (const r of rows || []) {
      try {
        const staff = String(r?.Staff || r?.staff || r?.Name || r?.name || '').trim().toLowerCase();
        const dateStr = rowDateYMD(r) || '';
        const tin = String(r?.TimeIn || r?.timein || r?.time_in || r?.SignIn || r?.signin || '').trim();
        const toutRaw = r?.TimeOut || r?.timeout || r?.time_out || r?.SignOut || r?.signout || '';
        const tout = String(toutRaw || '').trim();
        const noOut = tout === '' || tout === '-' || tout === '—' || tout === null || typeof tout === 'undefined';
        if (staff === key && dateStr === today && tin && noOut) return true;
      } catch (e) { }
    }
    return false;
  };

  const onSignIn = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    const today = phTodayYMD();
    const timeNow = formatManilaHHMM();
    setPendingAction({ type: 'in', staff: selected });
    setLoading(true);
    try {
      // wait for the backend to append the authoritative row, then reload (force fresh)
      const res = await attendanceQuickAppend(selected, { Date: today, TimeIn: timeNow });
      console.debug('attendanceQuickAppend sign-in result', res);
      if (!res || res.ok === false) {
        throw new Error((res && res.error) ? String(res.error) : 'attendance append failed');
      }
      // Poll the attendance endpoint until the authoritative row appears (or timeout)
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const checkFn = (rowsArr) => {
        try {
          return (rowsArr || []).some(r => {
            const staff = String(r?.Staff || r?.staff || r?.Name || r?.name || '').trim().toLowerCase();
            const dateStr = rowDateYMD(r) || '';
            const tin = String(r?.TimeIn || r?.timein || r?.time_in || r?.SignIn || r?.signin || '').trim();
            const tout = String(r?.TimeOut || r?.timeout || r?.time_out || r?.SignOut || r?.signout || '').trim();
            const noOut = tout === '' || tout === '-' || tout === '—' || tout === null || typeof tout === 'undefined';
            return staff === String(selected).trim().toLowerCase() && dateStr === today && tin && noOut;
          });
        } catch (e) { return false; }
      };
      let confirmed = false;
      for (let i = 0; i < 8; i++) {
        try {
          const sheetRes = await fetchSheet('Attendance');
          const fetched = sheetRes?.rows ?? sheetRes?.data ?? [];
          if (checkFn(fetched)) { setRows(Array.isArray(fetched) ? fetched : []); confirmed = true; break; }
        } catch (e) {}
        await wait(300);
      }
      if (!confirmed) {
        // final authoritative reload
        await load(true);
      }
    } catch (err) {
      console.error('attendanceQuickAppend sign-in failed', err);
      setError('Sign-in failed');
      alert('Sign-in failed — please retry');
      // refresh to authoritative state
      await load(true);
    } finally {
      setPendingAction(null);
      setBusy(false);
      setLoading(false);
    }
  };

  const onSignOut = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    const today = phTodayYMD();
    const timeNow = formatManilaHHMM();
    setPendingAction({ type: 'out', staff: selected });
    setLoading(true);
    try {
      // If there's a today's open entry, ask the backend to close it.
      const hasTodayOpen = (rows || []).some(r => {
        try {
          const staff = String(r?.Staff || r?.staff || r?.Name || r?.name || '').trim().toLowerCase();
          const dateStr = rowDateYMD(r) || '';
          const tin = String(r?.TimeIn || r?.timein || r?.time_in || r?.SignIn || r?.signin || '').trim();
          const tout = String(r?.TimeOut || r?.timeout || r?.time_out || r?.SignOut || r?.signout || '').trim();
          const noOut = tout === '' || tout === '-' || tout === '—' || tout === null || typeof tout === 'undefined';
          return staff === String(selected).trim().toLowerCase() && dateStr === today && tin && noOut;
        } catch (e) { return false; }
      });

      if (hasTodayOpen) {
        // let the backend update the matching row; wait for completion then reload (force fresh)
        const res = await attendanceQuickAppend(selected, { wantsOut: true, Date: today, TimeOut: timeNow });
        console.debug('attendanceQuickAppend sign-out result', res);
        if (!res || res.ok === false) {
          throw new Error((res && res.error) ? String(res.error) : 'attendance sign-out failed');
        }
        // Poll until the backend shows a TimeOut for the staff on today's row
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        const checkFn = (rowsArr) => {
          try {
            return (rowsArr || []).some(r => {
              const staff = String(r?.Staff || r?.staff || r?.Name || r?.name || '').trim().toLowerCase();
              const dateStr = rowDateYMD(r) || '';
              const tout = String(r?.TimeOut || r?.timeout || r?.time_out || r?.SignOut || r?.signout || '').trim();
              return staff === String(selected).trim().toLowerCase() && dateStr === today && tout && tout !== '-' && tout !== '—';
            });
          } catch (e) { return false; }
        };
        let confirmed = false;
        for (let i = 0; i < 8; i++) {
          try {
            const sheetRes = await fetchSheet('Attendance');
            const fetched = sheetRes?.rows ?? sheetRes?.data ?? [];
            if (checkFn(fetched)) { setRows(Array.isArray(fetched) ? fetched : []); confirmed = true; break; }
          } catch (e) {}
          await wait(300);
        }
        if (!confirmed) {
          await load(true);
        }
      } else {
        // No today's open entry: create a sign-out-only row for today so older rows remain untouched.
        await insertRow('Attendance', { Staff: selected, Date: today, TimeOut: timeNow });
        await load(true);
      }
    } catch (err) {
      console.error('attendanceQuickAppend sign-out failed', err);
      setError('Sign-out failed');
      alert('Sign-out failed — please retry');
      await load(true);
    } finally {
      setPendingAction(null);
      setBusy(false);
      setLoading(false);
    }
  };

  const selectStaffOptions = useMemo(() => {
    const s = new Set();
    for (const r of rows || []) {
      const staff = String(r?.Staff || r?.staff || r?.Name || r?.name || '').trim();
      if (staff) s.add(staff);
    }
    for (const a of staffOptions || []) if (a) s.add(a);
    const arr = Array.from(s);
    // Sort with priority names first (in the order defined in STAFF_PRIORITY), then alphabetically
    arr.sort((a, b) => {
      const ia = STAFF_PRIORITY.indexOf(a);
      const ib = STAFF_PRIORITY.indexOf(b);
      if (ia !== -1 || ib !== -1) {
        if (ia === -1) return 1; // b is priority, a is not -> b first => a after
        if (ib === -1) return -1; // a is priority, b is not -> a first
        return ia - ib; // both priority -> preserve order in STAFF_PRIORITY
      }
      return a.localeCompare(b);
    });
    return arr;
  }, [rows, staffOptions]);

  const visibleRows = useMemo(() => {
    // Show the most recent `visibleCount` rows, but keep them in chronological
    // order (oldest -> newest within that page). This avoids showing the newest
    // row first which was confusing.
    if (!Array.isArray(rows)) return [];
    const arr = rows.slice(); // keep original server order
    const start = Math.max(0, arr.length - visibleCount);
    return arr.slice(start, arr.length);
  }, [rows, visibleCount]);

  return (
    <div className="dashboard-content">
      <h2 className="dashboard-title">Staff Attendance</h2>

      {error && (<div className="small-error" style={{ marginBottom: 12 }}>{error}</div>)}

      <div className="panel">
        <div className="panel-header">Select Staff Member</div>
        <div className="att-inline">
          <select className="att-inline-select" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={busy}>
            <option value=""></option>
            {selectStaffOptions.map(s => (<option key={s} value={s}>{s}</option>))}
          </select>

          <div className="att-inline-actions">
            {(() => {
              const signedIn = isSignedInToday(selected);
              const actionLabel = signedIn ? '⏏ Sign Out' : '⏎ Sign In';
              const pendingType = signedIn ? 'out' : 'in';
              const isPending = pendingAction && pendingAction.staff === selected && pendingAction.type === pendingType;
              return (
                <button
                  className="primary-btn"
                  onClick={signedIn ? onSignOut : onSignIn}
                  disabled={!selected || busy}
                  title={signedIn ? 'Sign Out' : 'Sign In'}
                >
                  {isPending ? (
                    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <span className="spinner" aria-hidden></span>
                      {signedIn ? 'Signing Out...' : 'Signing In...'}
                    </span>
                  ) : actionLabel}
                </button>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="panel">
  <div className="panel-header">Attendance Records {loading && (<span style={{ marginLeft: 8 }}><span className="spinner" aria-hidden></span></span>)}</div>

        

        {loading ? (
          <div style={{ color: 'var(--muted)', textAlign: 'center', padding: 16 }}>Loading…</div>
        ) : (visibleRows.length === 0 ? (
          <div style={{ color: "var(--muted)", textAlign: "center", padding: 16 }}>No records.</div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <table className="attendance-table aligned" style={{ width: '75%' }}>
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Staff Name</th>
                  <th>Date</th>
                  <th>Time In</th>
                  <th>Time Out</th>
                  <th style={{ textAlign: 'center' }}>No. Of Hours</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, i) => {
                  const ymd = rowDateYMD(r) || String(r?.Date || r?.date || '');
                  const displayDate = formatDisplayDate(ymd || undefined) || String(r?.Date || r?.date || '');
                  const tin = (r?.TimeIn || r?.timein || r?.time_in || '');
                  const tout = (r?.TimeOut || r?.timeout || r?.time_out || '');
                  const tinDisp = tin ? displayTimeFromRaw(r, tin) : '—';
                  const toutDisp = tout ? displayTimeFromRaw(r, tout) : '—';
                  return (
                    <tr key={`${r?.Date || ''}|${r?.Staff || ''}|${i}`}>
                      <td style={{ fontWeight: 700 }}>{String(r?.Staff || r?.staff || r?.Name || r?.name || '')}</td>
                      <td>{displayDate}</td>
                      <td>{tinDisp}</td>
                      <td>{toutDisp}</td>
                      <td style={{ textAlign: 'center' }}>{typeof r?.NoOfHours !== 'undefined' && r?.NoOfHours !== null ? String(r.NoOfHours) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="secondary-btn" onClick={() => setVisibleCount(c => Math.min((rows?.length||0), c + 10))} disabled={busy || (visibleCount >= (rows?.length || 0))} title="Load 10 more entries">⤵ Load more</button>
        </div>

        
      </div>
    </div>
  );
}