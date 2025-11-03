// src/pages/Members.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMembers, fetchPayments, fetchGymEntries } from "../api/sheets";
import AddMemberModal from "../components/AddMemberModal";

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

    const tag = String(firstOf(p, ["type","item","category","product","paymentfor","plan","description"]) || "").toLowerCase();
    const end = asDate(firstOf(p, ["enddate","end_date","valid_until","expiry","expires","until","end"]));
    if (!end) continue;

    const rec = idx.get(memberId) || {};
    const isCoach = /coach|trainer|pt/.test(tag);
    const isMembership = /member|gym/.test(tag) && !isCoach;

    if (isCoach) {
      if (!rec.coachEnd || end > rec.coachEnd) rec.coachEnd = end;
    } else if (isMembership) {
      if (!rec.membershipEnd || end > rec.membershipEnd) rec.membershipEnd = end;
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
  const [rows, setRows] = useState([]);
  const [payIdx, setPayIdx] = useState(new Map());
  const [visitIdx, setVisitIdx] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [openAdd, setOpenAdd] = useState(false);

  async function loadAll() {
    const [mRes, pRes, gRes] = await Promise.all([
      fetchMembers(), fetchPayments(), fetchGymEntries()
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
    (async () => {
      try {
        await loadAll();
        if (!alive) return;
      } catch (e) {
        console.error(e);
        if (alive) setError(e.message || "Failed to fetch");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filteredSorted = useMemo(() => {
    const term = q.trim().toLowerCase();
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
  }, [rows, q, visitIdx]);

  const openDetail = (memberId, row) => {
    if (!memberId) return;
    navigate(`/members/${encodeURIComponent(memberId)}`, { state: { row } });
  };

  return (
    <div className="content">
      <h2>All Members</h2>

      <div className="toolbar">
        <input
          className="search-wide"
          placeholder="Search members by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="button" onClick={() => setOpenAdd(true)}>+ Add Member</button>
      </div>

      {loading && <div>Loading members…</div>}
      {error && <div>Error: {error}</div>}
      {!loading && !error && (
        <table className="aligned">
          <colgroup>
            <col style={{ width: "12%" }} />  {/* Nick Name */}
            <col style={{ width: "34%" }} />  {/* Full Name */}
            <col style={{ width: "12%" }} />  {/* Member Since */}
            <col style={{ width: "12%" }} />  {/* Last Gym Visit */}
            <col style={{ width: "15%" }} />  {/* Gym Membership */}
            <col style={{ width: "15%" }} />  {/* Coach Subscription */}
          </colgroup>
          <thead>
            <tr>
              <th>Nick Name</th>
              <th>Full Name</th>         {/* badges moved here */}
              <th>Member Since</th>
              <th>Last Gym Visit</th>
              <th>Gym Membership</th>
              <th>Coach Subscription</th>
            </tr>
          </thead>
          <tbody>
            {filteredSorted.length === 0 ? (
              <tr><td colSpan={6}>No members found.</td></tr>
            ) : (
              filteredSorted.map(({ r, lastVisit, isToday, memberId }, i) => {
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

                // FULL NAME (ALL CAPS) supports FirstName/LastName variants
                const first = String(firstOf(r, ["first_name","firstname","first","given_name"]) ?? "");
                const last  = String(firstOf(r, ["last_name","lastname","last","surname"]) ?? "");
                const fullName = [first, last].filter(Boolean).map(toTitleCase).join(" ");

                const nick = String(r.nick_name ?? r.nickname ?? "").toUpperCase();
                const memberSince = asDate(firstOf(r, ["member_since","membersince","join_date","joined","start_date"]));
                const mState = pay?.membershipState ?? null;
                const coachActive = pay?.coachActive ?? false;

                return (
                  <tr
                    key={i}
                    className="row-link"
                    onClick={() => navigate(`/members/${encodeURIComponent(memberId)}`, { state: { row: r } })}
                  >
                    <td><strong>{nick}</strong></td>
                    <td>
                      {fullName}
                      <span style={{ display:"inline-flex", gap:6, marginLeft:8, verticalAlign:"middle" }}>
                        {isStudent && <span className="pill student">Student</span>}
                        {isSenior && <span className="pill senior">Senior</span>}
                      </span>
                    </td>
                    <td>{fmtDate(memberSince)}</td>
                    <td>
                      {isToday ? (
                        <span className="pill ok">Visited today</span>
                      ) : (
                        lastVisit ? fmtDate(new Date(lastVisit)) : ""
                      )}
                    </td>
                    <td>
                      {mState === "active" && <span className="pill ok">Active</span>}
                      {mState === "expired" && <span className="pill bad">Expired</span>}
                    </td>
                    <td>{coachActive ? <span className="pill ok">Available</span> : ""}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      )}

      <AddMemberModal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onSaved={async () => {
          try { await loadAll(); } catch(_) {}
        }}
      />
    </div>
  );
}
