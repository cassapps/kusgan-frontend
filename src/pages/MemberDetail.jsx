import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  fetchMembers,
  fetchPayments,
  fetchGymEntries,
  fetchProgressTracker,
  fetchMemberBundle,
} from "../api/sheets";

const toKey = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, "_");
const norm = (row) => Object.fromEntries(Object.entries(row || {}).map(([k, v]) => [toKey(k), v]));
const firstOf = (o, ks) => ks.map((k) => o[k]).find((v) => v !== undefined && v !== "");
const asDate = (v) => { if (v instanceof Date) return v; const d = new Date(v); return isNaN(d) ? null : d; };
const fmtDate = (d) => (!d ? "-" : `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]}-${d.getDate()}, ${d.getFullYear()}`);
const display = (v) => (v === undefined || v === null || String(v).trim() === "" ? "-" : String(v));

// normalize Drive viewer links to direct-view URLs
const driveImg = (u) => {
  const s = String(u || "");
  if (!s) return "";
  // /file/d/<id>/, open?id=<id>, uc?export=download&id=<id>
  const m =
    s.match(/\/file\/d\/([^/]+)/) ||
    s.match(/[?&]id=([^&]+)/) ||
    s.match(/\/uc\?[^#]*id=([^&]+)/);
  const id = m ? m[1] : "";
  if (id) return `https://drive.google.com/uc?export=view&id=${id}`;
  return s;
};

function computeStatus(payments, memberId) {
  const today = new Date();
  let membershipEnd = null, coachEnd = null;

  for (const raw of payments) {
    const p = norm(raw);
    const pid = String(firstOf(p, ["memberid","member_id","id"]) || "").trim().toLowerCase();
    if (!pid || pid !== memberId.toLowerCase()) continue;

    const tag = String(firstOf(p, ["particulars","type","item","category","product","paymentfor","plan","description"]) || "").toLowerCase();
    const end = asDate(firstOf(p, ["enddate","end_date","valid_until","expiry","expires","until","end"]));
    if (!end) continue;

    const isCoach = /coach|trainer|pt/.test(tag);
    const isMembership = /member|gym/.test(tag) && !isCoach;

    if (isCoach) coachEnd = !coachEnd || end > coachEnd ? end : coachEnd;
    else if (isMembership) membershipEnd = !membershipEnd || end > membershipEnd ? end : membershipEnd;
  }

  return {
    membershipEnd,
    membershipState: membershipEnd == null ? null : (membershipEnd >= today ? "active" : "expired"),
    coachEnd,
    coachActive: !!(coachEnd && coachEnd >= today),
  };
}

export default function MemberDetail() {
  const { id: idParam, memberId: memberIdParam } = useParams();
  const navigate = useNavigate();
  const loc = useLocation();
  const passed = loc.state?.row ? norm(loc.state.row) : null;

  const [member, setMember] = useState(passed || null);
  const [loading, setLoading] = useState(!passed); // render immediately if we have a passed row
  const [error, setError] = useState("");
  const [status, setStatus] = useState({ membershipState: null, coachActive: false, membershipEnd: null, coachEnd: null });
  const [visits, setVisits] = useState([]);
  const [payments, setPayments] = useState([]);
  const [progress, setProgress] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Prefer route param; if absent use the ID from the passed row
      const routeId = decodeURIComponent(memberIdParam || idParam || "").trim();
      const passedId = String(firstOf(passed || {}, ["memberid","member_id","id"]) || "").trim();
      const id = routeId || passedId;
      if (!id) { setLoading(false); return; }

      async function loadViaBundleFresh() {
        const bundle = await fetchMemberBundle(id, { ttlMs: 0 }); // force fresh
        if (!bundle?.ok) throw new Error(bundle?.error || "bundle failed");
        const m = bundle.member ? norm(bundle.member) : null;
        const pays = (bundle.payments || []).map(norm);
        const gyms = (bundle.gymEntries || []).map(norm);
        const progs = (bundle.progress || []).map(norm);
        return { m, pays, gyms, progs };
      }

      async function loadViaLegacy() {
        const [mRes, pRes, gRes, prRes] = await Promise.all([
          fetchMembers(), fetchPayments(), fetchGymEntries(), fetchProgressTracker(),
        ]);
        const rows = (mRes?.rows ?? mRes?.data ?? []).map(norm);
        const m = rows.find((r) => String(firstOf(r, ["memberid","member_id","id"]) || "").trim().toLowerCase() === id.toLowerCase()) || null;
        const pays = (pRes?.rows ?? pRes?.data ?? []).filter((r) =>
          String(firstOf(norm(r), ["memberid","member_id","id"]) || "").trim().toLowerCase() === id.toLowerCase()
        );
        const gyms = (gRes?.rows ?? gRes?.data ?? []).filter((r) =>
          String(firstOf(norm(r), ["memberid","member_id","id"]) || "").trim().toLowerCase() === id.toLowerCase()
        );
        const progs = (prRes?.rows ?? prRes?.data ?? []).filter((r) =>
          String(firstOf(norm(r), ["memberid","member_id","id"]) || "").trim().toLowerCase() === id.toLowerCase()
        );
        return { m, pays, gyms, progs };
      }

      try {
        let data;
        try { data = await loadViaBundleFresh(); }
        catch { data = await loadViaLegacy(); }

        if (!alive) return;

        if (data.m) {
          setMember(data.m);
          const mid = String(firstOf(data.m, ["memberid","member_id","id"]) || "").trim();
          setPayments(data.pays.sort((a, b) => {
            const da = asDate(firstOf(a, ["date","paid_on","created","timestamp"])) || new Date(0);
            const db = asDate(firstOf(b, ["date","paid_on","created","timestamp"])) || new Date(0);
            return db - da;
          }));
          setVisits(
            data.gyms.map((r) => {
              const n = norm(r);
              return {
                date: asDate(firstOf(n, ["date"])),
                timeIn: firstOf(n, ["timein","time_in"]),
                timeOut: firstOf(n, ["timeout","time_out"]),
                totalHours: firstOf(n, ["totalhours","total_hours","hours"]),
                coach: firstOf(n, ["coach"]),
                focus: firstOf(n, ["focus"]),
              };
            }).filter((x) => !!x.date).sort((a, b) => b.date - a.date)
          );
          setProgress(
            data.progs.map(norm).sort((a, b) => {
              const da = asDate(firstOf(a, ["date","recorded","log_date","timestamp"])) || new Date(0);
              const db = asDate(firstOf(b, ["date","recorded","log_date","timestamp"])) || new Date(0);
              return db - da;
            })
          );
          setStatus(computeStatus(data.pays, mid));
        } else {
          // Only show error if we didn’t have a passed row to display
          if (!passed) {
            setMember(null);
            setError("Member not found");
          }
        }
      } catch (e) {
        if (alive && !passed) setError(e.message || "Failed to load member");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [memberIdParam, idParam, passed]);

  if (loading) return <div className="content">Loading…</div>;
  if (!member) return (
    <div className="content">
      <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
      <div>{error || "Member not found"}</div>
    </div>
  );

  const lastName = firstOf(member, ["lastname","last_name"]);
  const firstName = firstOf(member, ["firstname","first_name"]);
  const middle = firstOf(member, ["middlename","middle_name"]);
  const gender = firstOf(member, ["gender"]);
  const bdayRaw = firstOf(member, ["birthday","birth_date","dob"]);
  const bday = asDate(bdayRaw);
  const nick = firstOf(member, ["nick_name","nickname"]);
  const street = firstOf(member, ["street"]);
  const brgy = firstOf(member, ["brgy","barangay"]);
  const muni = firstOf(member, ["municipality","city"]);
  const email = firstOf(member, ["email"]);
  const mobile = firstOf(member, ["mobile","phone"]);
  const memberSince = asDate(firstOf(member, ["member_since","membersince","join_date"]));
  const id = String(firstOf(member, ["memberid","member_id","id"]) || "").trim(); // define ID here
  const photoRaw = firstOf(member, ["photourl","photo_url","photo"]);
  const photoUrl = driveImg(photoRaw);

  const { membershipState, coachActive } = status;

  return (
    <div className="content">
      <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
      <h2>{display(nick || firstName || "Member")}</h2>

      <div className="member-grid">
        <div className="photo cell">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt="photo"
              onError={(e) => {
                const el = e.currentTarget;
                if (!el.dataset.retry && photoRaw) {
                  el.dataset.retry = "1";
                  // try download variant
                  const s = String(photoRaw);
                  const m =
                    s.match(/\/file\/d\/([^/]+)/) ||
                    s.match(/[?&]id=([^&]+)/) ||
                    s.match(/\/uc\?[^#]*id=([^&]+)/);
                  if (m && m[1]) el.src = `https://drive.google.com/uc?export=download&id=${m[1]}`;
                  else el.style.display = "none";
                } else {
                  el.style.display = "none";
                }
              }}
            />
          ) : (
            <div style={{ color: "var(--muted)", padding: 16 }}>No photo</div>
          )}
        </div>

        <div className="cell lastname">
          <div className="label">Last Name</div>
          <div className="value">{display(lastName)}</div>
        </div>
        <div className="cell firstname">
          <div className="label">First Name</div>
          <div className="value">{display(firstName)}</div>
        </div>
        <div className="cell middlename">
          <div className="label">Middle Name</div>
          <div className="value">{display(middle)}</div>
        </div>

        <div className="cell gender">
          <div className="label">Gender</div>
          <div className="value">{display(gender)}</div>
        </div>
        <div className="cell birthday">
          <div className="label">Birthday</div>
          <div className="value">{fmtDate(bday)}</div>
        </div>
        <div className="cell age">
          <div className="label">Age</div>
          <div className="value">{display(bday ? (new Date().getFullYear() - bday.getFullYear() - ((new Date().getMonth() < bday.getMonth() || (new Date().getMonth() === bday.getMonth() && new Date().getDate() < bday.getDate())) ? 1 : 0)) : "-")}</div>
        </div>

        <div className="cell street">
          <div className="label">House No. / St. Name</div>
          <div className="value">{display(street)}</div>
        </div>
        <div className="cell brgy">
          <div className="label">Brgy.</div>
          <div className="value">{display(brgy)}</div>
        </div>
        <div className="cell municipality">
          <div className="label">Municipality / City</div>
          <div className="value">{display(muni)}</div>
        </div>

        <div className="cell nickname">
          <div className="label">Member Since</div>
          <div className="value">{fmtDate(memberSince)}</div>
        </div>
        <div className="cell mobile">
          <div className="label">Mobile</div>
          <div className="value">{display(mobile)}</div>
        </div>
        <div className="cell email">
          <div className="label">Email</div>
          <div className="value">{display(email)}</div>
        </div>

        <div className="cell memberSince">
          <div className="label">Member ID</div>
          <div className="value">{display(id)}</div>
        </div>
        <div className="cell gym">
          <div className="label">Gym Membership</div>
          <div className="value">
            {membershipState === "active" && <span className="pill ok">Active</span>}
            {membershipState === "expired" && <span className="pill bad">Expired</span>}
            {membershipState == null && "-"}
          </div>
        </div>
        <div className="cell coach">
          <div className="label">Coach Subscription</div>
          <div className="value">{coachActive ? <span className="pill ok">Available</span> : "-"}</div>
        </div>
      </div>

      <h3>Gym Visits</h3>
      <table className="aligned">
        <thead>
          <tr>
            <th>Date</th><th>Time In</th><th>Time Out</th><th>Total Hours</th><th>Coach</th><th>Focus</th>
          </tr>
        </thead>
        <tbody>
          {visits.length === 0 ? (
            <tr><td colSpan={6}>-</td></tr>
          ) : visits.slice(0, 30).map((v, i) => (
            <tr key={i}>
              <td>{fmtDate(v.date)}</td>
              <td>{display(v.timeIn)}</td>
              <td>{display(v.timeOut)}</td>
              <td>{display(v.totalHours)}</td>
              <td>{display(v.coach)}</td>
              <td>{display(v.focus)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Progress</h3>
      <table className="aligned">
        <thead>
          <tr>
            <th>Date</th><th>No</th><th>Weight</th><th>BMI</th><th>Muscle Mass</th><th>Body Fat</th>
          </tr>
        </thead>
        <tbody>
          {progress.length === 0 ? (
            <tr><td colSpan={6}>-</td></tr>
          ) : progress.slice(0, 30).map((r, i) => {
            const d = asDate(firstOf(r, ["date","recorded","log_date","timestamp"]));
            const no = firstOf(r, ["no","entry_no","seq","number"]);
            const weight = firstOf(r, ["weight","weight_kg","weight_lbs"]);
            const bmi = firstOf(r, ["bmi"]);
            const muscle = firstOf(r, ["musclemass","muscle_mass","muscle"]);
            const bodyfat = firstOf(r, ["bodyfat","body_fat","bf"]);
            return (
              <tr key={i}>
                <td>{fmtDate(d)}</td>
                <td>{display(no)}</td>
                <td>{display(weight)}</td>
                <td>{display(bmi)}</td>
                <td>{display(muscle)}</td>
                <td>{display(bodyfat)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>Payments</h3>
      <table className="aligned">
        <thead>
          <tr>
            <th>Date</th><th>Particulars</th><th>Start Date</th><th>End Date</th><th>Mode</th><th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {payments.length === 0 ? (
            <tr><td colSpan={6}>-</td></tr>
          ) : payments.slice(0, 30).map((p, i) => {
            const paid = asDate(firstOf(p, ["date","paid_on","created","timestamp"]));
            const particulars = firstOf(p, ["particulars","type","item","category","product","paymentfor","plan","description"]);
            const start = asDate(firstOf(p, ["startdate","start_date","from"]));
            const end = asDate(firstOf(p, ["enddate","end_date","valid_until","expiry","expires","until","end"]));
            const mode = firstOf(p, ["mode","payment_mode","method","via"]);
            const cost = firstOf(p, ["cost","amount","price","total","paid"]);
            return (
              <tr key={i}>
                <td>{fmtDate(paid)}</td>
                <td>{display(particulars)}</td>
                <td>{fmtDate(start)}</td>
                <td>{fmtDate(end)}</td>
                <td>{display(mode)}</td>
                <td>{display(cost)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
