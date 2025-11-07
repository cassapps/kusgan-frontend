import React, { useEffect, useMemo, useState } from "react";
import { FixedSizeList as List } from 'react-window';
import "../styles.css";
import { fetchAttendance, attendanceQuickAppend, fetchMembers } from "../api/sheets";

const MANILA_TZ = "Asia/Manila";

const _MANILA_TIME_FMT = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: MANILA_TZ,
});

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

const normalizeToIso = (dateStr, hm) => {
  if (!dateStr) return hm || '';
  if (!hm) return '';
  if (/^\d{2}:\d{2}$/.test(hm)) {
    return `${dateStr}T${hm}:00`;
  }
  return hm;
};

const hoursBetween = (dateStr, tinRaw, toutRaw) => {
  const inIso = normalizeToIso(dateStr, tinRaw);
  const outIso = normalizeToIso(dateStr, toutRaw);
  if (!inIso || !outIso) return 0;
  const a = new Date(inIso);
  const b = new Date(outIso);
  if (isNaN(a) || isNaN(b)) return 0;
  let diff = (b.getTime() - a.getTime()) / (1000 * 60 * 60);
  if (diff < 0) diff += 24;
  return Math.round(diff * 100) / 100;
};

const monDashYear = (ymd) => {
  if (!ymd) return '';
  try {
    const d = new Date(ymd);
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    return new Intl.DateTimeFormat('en-US', opts).format(d).replace(',', '-');
  } catch { return ymd; }
};

export default function StaffAttendance() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLoadingToast, setShowLoadingToast] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadedDays, setLoadedDays] = useState(20);
  const [staffOptions, setStaffOptions] = useState([]);
  const [visibleCount, setVisibleCount] = useState(10);
  const [debugVisible, setDebugVisible] = useState(false);

  const load = async () => {
    setShowLoadingToast(true);
    setError("");
    try {
      const res = await fetchAttendance();
      const data = res?.rows ?? res?.data ?? [];
      setRows(Array.isArray(data) ? data : []);
      // also try to fetch members so we can offer staff picks even if no attendance rows exist
      try {
        const mRes = await fetchMembers();
        const mrows = mRes?.rows ?? mRes?.data ?? [];
        const opts = [];
        for (const m of (Array.isArray(mrows) ? mrows : [])) {
          const nm = String(m?.NickName || m?.nickname || m?.nick_name || m?.first_name || m?.firstname || m?.Name || m?.name || m?.['Full Name'] || '').trim();
          if (nm) opts.push(nm);
        }
        setStaffOptions(Array.from(new Set(opts)).sort((a,b)=>a.localeCompare(b)));
      } catch(err) {
        // ignore member fetch errors
      }
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Failed to load attendance');
    } finally {
      setLoading(false);
      setShowLoadingToast(false);
    }
  };

  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const map = new Map();
    // only consider the most recent visibleCount rows for the main table
    const slice = Array.isArray(rows) ? rows.slice(0, visibleCount) : [];
    for (const r of slice) {
      // normalize row keys to make header name variations tolerant (lowercased, no spaces/symbols)
      const norm = {};
      Object.keys(r || {}).forEach((k) => {
        const nk = String(k || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '');
        norm[nk] = r[k];
      });
      const staff = String(
        norm.staff || norm.name || norm.fullname || norm['fullname'] || norm.employee || norm.employeeid || ''
      ).trim();
      if (!staff) continue;
      const dateStr = String(r.Date || r.date || r.DateTime || r.datetime || r.LogDate || r.log_date || '').slice(0,10) || phTodayYMD();
      const tinRaw = String(r.TimeIn || r.timein || r.time_in || norm.timein || norm.timeinlocal || '').trim();
      const toutRaw = String(r.TimeOut || r.timeout || r.time_out || norm.timeout || norm.timeoutlocal || '').trim();
      const key = `${dateStr}|${staff}`;
      let obj = map.get(key);
      if (!obj) {
        obj = { staff, date: dateStr, sessions: [], totalHours: 0, clockedIn: false };
        map.set(key, obj);
      }
      const tinISO = normalizeToIso(dateStr, tinRaw);
      const toutISO = normalizeToIso(dateStr, toutRaw);
      const inVal = tinISO || tinRaw || '';
      const outVal = toutISO || toutRaw || '';
      const formattedIn = inVal ? fmtManilaTime(inVal) : '';
      const formattedOut = outVal ? fmtManilaTime(outVal) : '';
      if (tinRaw) obj.sessions.push({ in: inVal, out: outVal, formattedIn, formattedOut });
      const hrs = hoursBetween(dateStr, tinRaw, toutRaw);
      if (hrs > 0) obj.totalHours = Math.round((obj.totalHours + hrs) * 100) / 100;
      if (tinRaw && !toutRaw) obj.clockedIn = true;
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => ((b.date || '').localeCompare(a.date || '')) || a.staff.localeCompare(b.staff));
    for (const v of arr) v.sessions.sort((a,b)=> (a.in||'').localeCompare(b.in||''));
    return arr;
  }, [rows]);
  // select options: union of grouped staff and staffOptions (fallback)
  const selectStaffOptions = useMemo(() => {
    const s = new Set();
    for (const g of grouped) if (g && g.staff) s.add(g.staff);
    for (const a of staffOptions || []) if (a) s.add(a);
    return Array.from(s).sort((a,b)=>a.localeCompare(b));
  }, [grouped, staffOptions]);

  const todayClockedSet = useMemo(() => {
    const s = new Set();
    const today = phTodayYMD();
    for (const g of grouped) {
      if (g.date === today && g.clockedIn) s.add(String(g.staff || '').trim().toLowerCase());
    }
    return s;
  }, [grouped]);

  const isClockedInToday = (name) => {
    if (!name) return false;
    return todayClockedSet.has(String(name).trim().toLowerCase());
  };

  const normalizedKeys = useMemo(() => {
    const s = new Set();
    for (const r of rows) {
      for (const k of Object.keys(r || {})) {
        const nk = String(k || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '');
        s.add(nk);
      }
    }
    return Array.from(s).sort();
  }, [rows]);

  const onSignIn = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const today = phTodayYMD();
      const now = new Date();
      const timeNow = new Intl.DateTimeFormat('en-GB', { timeZone: MANILA_TZ, hour12:false, hour:'2-digit', minute:'2-digit' }).format(now);
      const opt = { Staff: selected, Date: today, TimeIn: timeNow, TimeOut: '' };
      setRows(prev => [opt, ...prev]);
      setBusy(false);
      try {
        await attendanceQuickAppend(selected);
      } catch (err) {
        console.error('attendanceQuickAppend sign-in failed', err);
        setError('Sign-in failed');
        alert('Sign-in failed — please retry');
        await load();
      }
      setTimeout(load, 1200);
    } finally { setBusy(false); }
  };

  const onSignOut = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const today = phTodayYMD();
      const now = new Date();
      const timeNow = new Intl.DateTimeFormat('en-GB', { timeZone: MANILA_TZ, hour12:false, hour:'2-digit', minute:'2-digit' }).format(now);
      setRows(prev => {
        const out = prev.slice();
        for (let i=0;i<out.length;i++){
          const r = out[i];
          if (String(r.Staff||r.staff||'').trim().toLowerCase() === String(selected).trim().toLowerCase() && String((r.Date||r.date||'')).slice(0,10) === today) {
            const tout = String(r.TimeOut||r.timeout||'').trim();
            if (!tout) { out[i] = {...r, TimeOut: timeNow}; break; }
          }
        }
        return out;
      });
      setBusy(false);
      try {
        await attendanceQuickAppend(selected, { wantsOut: true });
      } catch (err) {
        console.error('attendanceQuickAppend sign-out failed', err);
        setError('Sign-out failed');
        alert('Sign-out failed — please retry');
        setTimeout(load, 10);
      }
      setTimeout(load, 1200);
    } finally { setBusy(false); }
  };

  return (
    <>
      {showLoadingToast && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: '#2563eb', color: '#fff', padding: '10px 0', textAlign: 'center', fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
          Loading attendance data, please wait...
        </div>
      )}
      <div className="dashboard-content">
        <h2 className="dashboard-title">Staff Attendance</h2>

        {error && (
          <div className="small-error" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div className="panel">
          <div className="panel-header">Select Staff Member</div>

          <div className="att-inline">
            <select
              className="att-inline-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={busy}
            >
              <option value=""></option>
              {selectStaffOptions.map(s => (
                <option key={s} value={s}>{s}</option>
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
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="secondary-btn" onClick={() => setDebugVisible(v => !v)}>
                {debugVisible ? 'Hide debug' : 'Show debug'}
              </button>
              {debugVisible && (
                <div style={{ background: 'var(--panel-bg)', padding: 10, border: '1px dashed var(--light-border)', borderRadius: 6, width: '100%' }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Debug — attendance</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>rows: {rows.length} • grouped: {grouped.length} • normalizedKeys: {normalizedKeys.length} • staffOptions: {staffOptions.length}</div>
                  <pre style={{ maxHeight: 220, overflow: 'auto', fontSize: 12, marginTop: 8, whiteSpace: 'pre-wrap' }}>
{JSON.stringify({ rowsPreview: rows.slice(0, 6), normalizedKeys, staffOptions }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">Attendance Records</div>

          {grouped.length === 0 ? (
            <div style={{ color: "var(--muted)", textAlign: "center", padding: 16 }}>No records in the last {loadedDays} days.</div>
          ) : grouped.length > 120 ? (
            <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: '90%' }}>
                <div style={{ display: 'flex', padding: '8px 12px', fontWeight: 700, borderBottom: '1px solid var(--light-border)', background: 'var(--panel-header-bg)' }}>
                  <div style={{ width: '20%' }}>Staff Name</div>
                  <div style={{ width: '20%' }}>Date</div>
                  <div style={{ width: '20%' }}>Sign In</div>
                  <div style={{ width: '20%' }}>Sign Out</div>
                  <div style={{ width: '20%', textAlign: 'right' }}>Total Hours</div>
                </div>
                <List
                  height={Math.min(600, grouped.length * 48)}
                  itemCount={grouped.length}
                  itemSize={48}
                  width={'100%'}
                >
                  {({ index, style }) => {
                    const g = grouped[index];
                    return (
                      <div style={{ ...style, display: 'flex', padding: '8px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)', alignItems: 'center' }} key={`${g.date}|${g.staff}`}>
                        <div style={{ width: '20%', fontWeight: 700 }}>{g.staff}</div>
                        <div style={{ width: '20%' }}>{monDashYear(g.date)}</div>
                        <div style={{ width: '20%' }}>{g.sessions.length ? g.sessions.map((s, i) => (<div key={i} style={{ lineHeight: '20px' }}>{s.formattedIn || '—'}</div>)) : '—'}</div>
                        <div style={{ width: '20%' }}>{g.sessions.length ? g.sessions.map((s, i) => (<div key={i} style={{ lineHeight: '20px' }}>{s.out ? (s.formattedOut || s.out) : <span style={{ color: 'var(--muted)' }}>—</span>}</div>)) : '—'}</div>
                        <div style={{ width: '20%', textAlign: 'right', whiteSpace: 'nowrap' }}><span className="badge">{g.totalHours.toFixed(2)}</span></div>
                      </div>
                    );
                  }}
                </List>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <table className="attendance-table aligned" style={{ width: '90%' }}>
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
                  {grouped.map((g) => (
                    <tr key={`${g.date}|${g.staff}`}>
                      <td style={{ fontWeight: 700 }}>{g.staff}</td>
                      <td>{monDashYear(g.date)}</td>
                      <td>
                        {g.sessions.length
                          ? g.sessions.map((s, i) => (
                              <div key={i} style={{ lineHeight: "20px" }}>
                                {s.formattedIn || "—"}
                              </div>
                            ))
                          : "—"}
                      </td>
                      <td>
                        {g.sessions.length
                          ? g.sessions.map((s, i) => (
                              <div key={i} style={{ lineHeight: "20px" }}>
                                {s.out ? (s.formattedOut || s.out) : <span style={{ color: "var(--muted)" }}>—</span>}
                              </div>
                            ))
                          : "—"}
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <span className="badge">{g.totalHours.toFixed(2)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="secondary-btn"
              onClick={() => setVisibleCount(c => Math.min((rows?.length||0), c + 10))}
              disabled={busy || (visibleCount >= (rows?.length || 0))}
              title="Load 10 more entries"
            >
              ⤵ Load more (older entries)
            </button>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              Showing {Math.min(visibleCount, rows?.length || 0)} of {rows?.length || 0} entries
            </div>
          </div>
        </div>
      </div>
    </>
  );
}