// src/pages/Members.jsx
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { FixedSizeList as List } from 'react-window';
import { useNavigate } from "react-router-dom";
import { fetchSheet, fetchPayments, fetchGymEntries } from "../api/sheets";
import LoadingSkeleton from '../components/LoadingSkeleton.jsx';
import React, { Suspense } from 'react';
const AddMemberModal = React.lazy(() => import('../components/AddMemberModal.jsx'));

// helpers
const toKey = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, "_");
const yesy = (v) => ["yes","y","true","1"].includes(String(v||"").trim().toLowerCase());
const firstOf = (obj, keys) => keys.map(k=>obj[k]).find(v => v !== undefined && v !== "");
const getStr = (row, keys) => String(firstOf(row, keys) ?? "");
const asDate = (v) => {
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d) ? null : d;
};
const isSameDay = (a, b) =>
  a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const normRow = (row) => {
  const out = {};
  Object.entries(row || {}).forEach(([k,v]) => { out[toKey(k)] = v; });
  return out;
};

// Basic title-case for names (First Letter Caps), keeps separators intact
const toTitleCase = (s) => {
  const str = String(s || "");
  return str.toLowerCase().replace(/(?:^|[\s\-])([a-z])/g, (m, g1) => m.replace(g1, g1.toUpperCase()));
};

// Pretty date like "Nov-2, 2025"
const fmtDate = (d) => {
  if (!d) return "";
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  return `${m}-${d.getDate()}, ${d.getFullYear()}`;
};

const ageFromBirthday = (bday) => {
  const d = asDate(bday);
  if (!d) return NaN;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
};

// Payments: latest EndDate per member for membership/coach
function buildPaymentIndex(paymentsRaw) {
  const idx = new Map(); // MemberID -> { membershipEnd?:Date, coachEnd?:Date, membershipState?, coachActive? }
  for (const raw of paymentsRaw) {
    const p = normRow(raw);
    const memberId = firstOf(p, ["memberid","member_id","id","member_id_"]);
    if (!memberId) continue;
    // include common payment field names like 'Particulars'
    const tag = String(firstOf(p, ["type","item","category","product","paymentfor","plan","description","particulars","particular"]) || "").toLowerCase();

    // Prefer explicit Gym/Coach validity keys if present; fall back to generic end/EndDate
    const gymUntil = asDate(firstOf(p, ["gymvaliduntil","gym_valid_until","gym_valid","gym_validity","gym_until","gymvalid","enddate","end_date","valid_until","expiry","expires","until","end"]));
    const coachUntil = asDate(firstOf(p, ["coachvaliduntil","coach_valid_until","coach_valid","coach_until","coachvalid","enddate","end_date","valid_until","expiry","expires","until","end"]));

    const rec = idx.get(memberId) || {};
    const isCoachTag = /coach|trainer|pt/.test(tag);
    const isMembershipTag = /member|gym/.test(tag) && !isCoachTag;

    // Assign membership/coach end dates based on explicit fields or tags
    if (gymUntil) {
      if (!rec.membershipEnd || gymUntil > rec.membershipEnd) rec.membershipEnd = gymUntil;
    }
    if (coachUntil) {
      if (!rec.coachEnd || coachUntil > rec.coachEnd) rec.coachEnd = coachUntil;
    }

    // If explicit fields weren't present, try to use generic end date depending on tag
    if (!gymUntil && !coachUntil) {
      const end = asDate(firstOf(p, ["enddate","end_date","valid_until","end","until","expiry","expires"]));
      if (end) {
        if (isCoachTag) {
          if (!rec.coachEnd || end > rec.coachEnd) rec.coachEnd = end;
        } else if (isMembershipTag) {
          if (!rec.membershipEnd || end > rec.membershipEnd) rec.membershipEnd = end;
        }
      }
    }
    idx.set(memberId, rec);
  }

  const today = new Date();
  for (const [id, rec] of idx) {
    rec.membershipState =
      rec.membershipEnd == null ? null : (rec.membershipEnd >= today ? "active" : "expired");
    rec.coachActive = !!(rec.coachEnd && rec.coachEnd >= today);
  }
  return idx;
}

// Gym entries: latest Date per member
function buildLastVisitIndex(entriesRaw) {
  const idx = new Map(); // MemberID -> Date
  for (const raw of entriesRaw) {
    const r = normRow(raw);
    const memberId = firstOf(r, ["memberid","member_id","id","member_id_"]);
    if (!memberId) continue;
    const d = asDate(firstOf(r, ["date","visit_date","entry_date","log_date","timestamp","checkin"]));
    if (!d) continue;
    const curr = idx.get(memberId);
    if (!curr || d > curr) idx.set(memberId, d);
  }
  return idx;
}

export default function Members() {
  const navigate = useNavigate();
  const [membersLimit, setMembersLimit] = useState(50);
  const [rows, setRows] = useState([]);
  const [payIdx, setPayIdx] = useState(new Map());
  const [visitIdx, setVisitIdx] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [showLoadingToast, setShowLoadingToast] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const qTimer = useRef(null);
  const [openAdd, setOpenAdd] = useState(false);

  async function loadAll() {
    const [mRes, pRes, gRes] = await Promise.all([
      fetchSheet('Members'), fetchPayments(), fetchGymEntries()
    ]);
    const members = (mRes?.rows ?? mRes?.data ?? []).map(normRow);
    const payments = pRes?.rows ?? pRes?.data ?? [];
    const gymEntries = gRes?.rows ?? gRes?.data ?? [];
    setRows(members);
    setPayIdx(buildPaymentIndex(payments));
    setVisitIdx(buildLastVisitIndex(gymEntries));
  }

  useEffect(() => {
    let alive = true;
    setShowLoadingToast(true);
    (async () => {
      try {
        await loadAll();
        if (!alive) return;
      } catch (e) {
        console.error(e);
        if (alive) setError(e.message || "Failed to fetch");
      } finally {
        if (alive) setLoading(false);
        setShowLoadingToast(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Debounce search input so we don't recompute filters on every keystroke
  useEffect(() => {
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => { if (qTimer.current) clearTimeout(qTimer.current); };
  }, [q]);

  const filteredSorted = useMemo(() => {
  const term = debouncedQ.trim().toLowerCase();
    let list = rows;
    if (term) {
      list = rows.filter(r =>
        ["first_name","firstname","last_name","lastname","nick_name","nickname","mobile","email"]
          .some(k => String(r[k] ?? "").toLowerCase().includes(term))
      );
    }
    const today = new Date();
    const withVisit = list.map(r => {
      const memberId = firstOf(r, ["memberid","member_id","id","member_id_"]);
      const lastVisit = memberId ? visitIdx.get(memberId) : null;
      const isToday = lastVisit ? isSameDay(lastVisit, today) : false;

      // NEW: use join date for primary sort (most recent first)
      const joined = asDate(firstOf(r, ["member_since","membersince","join_date","joined","start_date"]));
      const joinTs = joined ? joined.getTime() : 0;

      const visitTs = lastVisit ? lastVisit.getTime() : -1;
      return { r, lastVisit, isToday, joinTs, visitTs, memberId };
    });

    // Sort: newest join first, then by last visit (desc)
    withVisit.sort((a, b) => (b.joinTs - a.joinTs) || (b.visitTs - a.visitTs));
    return withVisit;
  }, [rows, debouncedQ, visitIdx]);

  const openDetail = useCallback((memberId, row) => {
    if (!memberId) return;
    navigate(`/members/${encodeURIComponent(memberId)}`, { state: { row } });
  }, [navigate]);

  console.log('Members.jsx state:', { loading, error, rows, filteredSorted });
  return (
    <div className="content">
      <h2 className="dashboard-title">All Members</h2>

      <div className="toolbar" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <input
          className="search-wide"
          style={{ width: '60%', maxWidth: 960, minWidth: 320 }}
          placeholder="Search members by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="button" onClick={() => setOpenAdd(true)}>+ Add Member</button>
      </div>

      {showLoadingToast && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: '#2563eb', color: '#fff', padding: '10px 0', textAlign: 'center', fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
          Loading data, please wait...
        </div>
      )}
      {loading && <LoadingSkeleton />}
      {error && <div>Error: {error}</div>}
      {!loading && !error && (
        <div className="panel">
          {/* Fallback UI if rows are empty */}
          {rows.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#b91c1c', fontWeight: 600 }}>
              No member data loaded.<br />
              Please check your API connection or try again later.
            </div>
          )}
          {/* Virtualized list for rows */}
          <div style={{ width: '100%' }}>
            {filteredSorted.length === 0 ? (
              <div style={{ padding: 12 }}>No members found.</div>
            ) : filteredSorted.length <= membersLimit ? (
              // Render a normal table for small result sets so it matches other pages
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <table className="attendance-table aligned" style={{ width: '90%' }}>
                  <colgroup>
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '15%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'center' }}>Nick Name</th>
                      <th style={{ textAlign: 'left' }}>Full Name</th>
                      <th style={{ textAlign: 'center' }}>Member Since</th>
                      <th style={{ textAlign: 'center' }}>Last Gym Visit</th>
                      <th style={{ textAlign: 'center' }}>Gym Valid Until</th>
                      <th style={{ textAlign: 'center' }}>Coach Valid Until</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSorted.slice(0, membersLimit).map(({ r, lastVisit, isToday, memberId }, i) => {
                      const pay = memberId ? payIdx.get(memberId) : undefined;
                      const isStudent = yesy(firstOf(r, ["student","is_student","student?"]));
                      let ageNum = Number(firstOf(r, ["age","years_old"]));
                      if (isNaN(ageNum)) {
                        const bday = firstOf(r, ["birthday","birth_date","dob"]);
                        const d = asDate(bday);
                        if (d) {
                          const t = new Date();
                          ageNum = t.getFullYear() - d.getFullYear() - ((t.getMonth()<d.getMonth() || (t.getMonth()===d.getMonth() && t.getDate()<d.getDate())) ? 1 : 0);
                        }
                      }
                      const isSenior = !isNaN(ageNum) && ageNum >= 60;
                      const first = String(firstOf(r, ["first_name","firstname","first","given_name"]) ?? "");
                      const last = String(firstOf(r, ["last_name","lastname","last","surname"]) ?? "");
                      const fullName = [first, last].filter(Boolean).map(toTitleCase).join(" ");
                      const nick = String(r.nick_name ?? r.nickname ?? "").toUpperCase();
                      // Example image optimization for member photo
                      // const photoUrl = r.photoUrl || '';
                      // const photoSrcSet = r.photoSrcSet || '';
                      const memberSince = asDate(firstOf(r, ["member_since","membersince","join_date","joined","start_date"]));
                      const gymUntil = pay?.membershipEnd || null;
                      const coachUntil = pay?.coachEnd || null;
                      return (
                        <tr key={i} className="row-link" onClick={() => navigate(`/members/${encodeURIComponent(memberId)}`, { state: { row: r } })} style={{ cursor: 'pointer' }}>
                           <td style={{ textAlign: 'center' }}><strong>{nick}</strong></td>
                           <td style={{ textAlign: 'left' }}>{fullName} <span style={{ display: 'inline-flex', gap:6, marginLeft:8 }}>{isStudent && <span className="pill student">Student</span>}{isSenior && <span className="pill senior">Senior</span>}</span></td>
                           {/* Example image optimization for member photo */}
                           {/* <img src={photoUrl} loading="lazy" srcSet={photoSrcSet} alt={fullName} style={{ maxWidth: 40, borderRadius: '50%' }} /> */}
                          <td style={{ textAlign: 'center' }}>{fmtDate(memberSince)}</td>
                          <td style={{ textAlign: 'center' }}>{isToday ? <span className="pill ok">Visited today</span> : (lastVisit ? fmtDate(new Date(lastVisit)) : "")}</td>
                          <td style={{ textAlign: 'center', color: gymUntil ? (new Date(gymUntil) >= new Date() ? 'green' : 'red') : 'inherit' }}>{gymUntil ? fmtDate(new Date(gymUntil)) : ""}</td>
                          <td style={{ textAlign: 'center', color: coachUntil ? (new Date(coachUntil) >= new Date() ? 'green' : 'red') : 'inherit' }}>{coachUntil ? fmtDate(new Date(coachUntil)) : ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', padding: '8px 12px', fontWeight: 700, borderBottom: '1px solid var(--light-border)', background: 'var(--panel-header-bg)' }}>
                  <div style={{ width: '15%', textAlign: 'center' }}>Nick Name</div>
                  <div style={{ width: '25%', textAlign: 'left' }}>Full Name</div>
                  <div style={{ width: '15%', textAlign: 'center' }}>Member Since</div>
                  <div style={{ width: '15%', textAlign: 'center' }}>Last Gym Visit</div>
                  <div style={{ width: '15%', textAlign: 'center' }}>Gym Valid Until</div>
                  <div style={{ width: '15%', textAlign: 'center' }}>Coach Valid Until</div>
                </div>
                <List
                  height={Math.min(600, Math.max(200, Math.min(filteredSorted.length, membersLimit) * 56))}
                  itemCount={Math.min(filteredSorted.length, membersLimit)}
                  itemSize={56}
                  width={'100%'}
                >
                {({ index, style }) => {
                  const { r, lastVisit, isToday, memberId } = filteredSorted[index];
                  const pay = memberId ? payIdx.get(memberId) : undefined;
                  const isStudent = yesy(firstOf(r, ["student","is_student","student?"]));
                  let ageNum = Number(firstOf(r, ["age","years_old"]));
                  if (isNaN(ageNum)) {
                    const bday = firstOf(r, ["birthday","birth_date","dob"]);
                    const d = asDate(bday);
                    if (d) {
                      const t = new Date();
                      ageNum = t.getFullYear() - d.getFullYear() - ((t.getMonth()<d.getMonth() || (t.getMonth()===d.getMonth() && t.getDate()<d.getDate())) ? 1 : 0);
                    }
                  }
                  const isSenior = !isNaN(ageNum) && ageNum >= 60;
                  const first = String(firstOf(r, ["first_name","firstname","first","given_name"]) ?? "");
                  const last = String(firstOf(r, ["last_name","lastname","last","surname"]) ?? "");
                  const fullName = [first, last].filter(Boolean).map(toTitleCase).join(" ");
                  const nick = String(r.nick_name ?? r.nickname ?? "").toUpperCase();
                  const memberSince = asDate(firstOf(r, ["member_since","membersince","join_date","joined","start_date"]));
                  const today = new Date();
                  const gymUntil = pay?.membershipEnd || null;
                  const coachUntil = pay?.coachEnd || null;
                  return (
                    <div
                      key={index}
                      style={{ ...style, display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid rgba(0,0,0,0.04)', cursor: 'pointer' }}
                      className="row-link"
                      onClick={() => navigate(`/members/${encodeURIComponent(memberId)}`, { state: { row: r } })}
                    >
                      <div style={{ width: '15%', textAlign: 'center' }}><strong>{nick}</strong></div>
                      <div style={{ width: '25%' }}>{fullName}
                        <span style={{ display:"inline-flex", gap:6, marginLeft:8, verticalAlign:"middle" }}>
                          {isStudent && <span className="pill student">Student</span>}
                          {isSenior && <span className="pill senior">Senior</span>}
                        </span>
                      </div>
                      <div style={{ width: '15%', textAlign: 'center' }}>{fmtDate(memberSince)}</div>
                      <div style={{ width: '15%', textAlign: 'center' }}>{isToday ? <span className="pill ok">Visited today</span> : (lastVisit ? fmtDate(new Date(lastVisit)) : "")}</div>
                      <div style={{ width: '15%', textAlign: 'center', color: gymUntil ? (new Date(gymUntil) >= new Date() ? 'green' : 'red') : 'inherit' }}>{gymUntil ? fmtDate(new Date(gymUntil)) : ""}</div>
                      <div style={{ width: '15%', textAlign: 'center', color: coachUntil ? (new Date(coachUntil) >= new Date() ? 'green' : 'red') : 'inherit' }}>{coachUntil ? fmtDate(new Date(coachUntil)) : ""}</div>
                    </div>
                  );
                }}
              </List>
              </div>
            )}
          </div>
          {filteredSorted.length > membersLimit && (
            <div style={{ padding: 8, textAlign: 'center' }}>
              <button className="button" onClick={() => setMembersLimit((m) => Math.min(m + 50, filteredSorted.length))}>Load more ({filteredSorted.length - membersLimit} more)</button>
            </div>
          )}
        </div>
      )}

      <Suspense fallback={<LoadingSkeleton />}>
        <AddMemberModal
          open={openAdd}
          onClose={() => setOpenAdd(false)}
          onSaved={async () => {
            try { await loadAll(); } catch(_) {}
          }}
        />
      </Suspense>
    </div>
  );
}
