import { useEffect, useState } from "react";
import PaymentModal from "../components/PaymentModal";
import EditMemberModal from "../components/EditMemberModal";
import QrCodeModal from "../components/QrCodeModal";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  fetchMembers,
  fetchPayments,
  fetchGymEntries,
  fetchProgressTracker,
  fetchMemberBundle,
  fetchPricing,
} from "../api/sheets";

const toKey = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, "_");
const norm = (row) => Object.fromEntries(Object.entries(row || {}).map(([k, v]) => [toKey(k), v]));
const firstOf = (o, ks) => ks.map((k) => o[k]).find((v) => v !== undefined && v !== "");
const asDate = (v) => { if (v instanceof Date) return v; const d = new Date(v); return isNaN(d) ? null : d; };
// Manila timezone display helper: Mon-D, YYYY
const MANILA_TZ = "Asia/Manila";
const fmtDate = (d) => {
  if (!d) return "-";
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return "-";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: MANILA_TZ, month: "short", day: "numeric", year: "numeric" }).formatToParts(date);
  const m = parts.find((p) => p.type === "month")?.value || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  const y = parts.find((p) => p.type === "year")?.value || "";
  return `${m}-${day}, ${y}`;
};
const display = (v) => (v === undefined || v === null || String(v).trim() === "" ? "-" : String(v));

// normalize Drive viewer links to direct-view URLs; leave googleusercontent links as-is
const driveImg = (u) => {
  const s = String(u || "");
  if (!s) return "";
  // If it's a wrapped string like "{ok=true, url=https://...}", extract the first URL
  const anyUrl = s.match(/https?:\/\/[^\s}]+/);
  if (anyUrl) {
    const direct = anyUrl[0];
    if (/googleusercontent\.com\//.test(direct)) return direct;
    const mid = direct.match(/(?:\/file\/d\/|[?&]id=|\/uc\?[^#]*id=)([^/&?#]+)/);
    if (mid && mid[1]) return `https://drive.google.com/uc?export=view&id=${mid[1]}`;
    return direct;
  }
  // If already a direct googleusercontent CDN link, use it as-is
  if (/googleusercontent\.com\//.test(s)) return s;
  // /file/d/<id>/, open?id=<id>, uc?export=download&id=<id>
  const m =
    s.match(/\/file\/d\/([^/]+)/) ||
    s.match(/[?&]id=([^&]+)/) ||
    s.match(/\/uc\?[^#]*id=([^&]+)/);
  const id = m ? m[1] : "";
  if (id) return `https://drive.google.com/uc?export=view&id=${id}`;
  return s;
};

// Extract Drive file ID when possible
const driveId = (u) => {
  const s = String(u || "");
  const m = s.match(/(?:\/file\/d\/|[?&]id=|\/uc\?[^#]*id=)([^/&?#]+)/);
  return m && m[1] ? m[1] : "";
};

// Prefer thumbnail endpoint for inline <img> to avoid 404/content-disposition issues
const driveThumb = (u) => {
  const s = String(u || "");
  if (/googleusercontent\.com\//.test(s)) return s; // already a served image
  const id = driveId(s);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1000` : s;
};

function computeStatus(payments, memberId, pricingRows) {
  const today = new Date();
  let membershipEnd = null, coachEnd = null;

  // Build a lookup from Particulars -> flags from Pricing
  const map = new Map();
  const rows = Array.isArray(pricingRows) ? pricingRows : [];
  const truthy = (v) => {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "yes" || s === "y" || s === "true" || s === "1";
  };
  const pick = (o, keys) => {
    for (const k of keys) {
      if (o && Object.prototype.hasOwnProperty.call(o, k)) return o[k];
      const alt = Object.keys(o || {}).find((kk) => kk.toLowerCase().replace(/\s+/g, "") === k.toLowerCase().replace(/\s+/g, ""));
      if (alt) return o[alt];
    }
    return undefined;
  };
  rows.forEach((r) => {
    const name = String(pick(r, ["Particulars"]) || "").trim();
    if (!name) return;
    const gymFlag = truthy(pick(r, ["Gym membership","Gym Membership","GymMembership","Membership"]))
    const coachFlag = truthy(pick(r, ["Coach subscription","Coach Subscription","CoachSubscription","Coach"]))
    map.set(name.toLowerCase(), { gym: gymFlag, coach: coachFlag });
  });

  for (const raw of payments) {
  const p = norm(raw);
  const pid = String(firstOf(p, ["memberid","member_id","member_id_","id"]) || "").trim().toLowerCase();
    if (!pid || pid !== memberId.toLowerCase()) continue;

    const tag = String(firstOf(p, ["particulars","type","item","category","product","paymentfor","plan","description"]) || "").trim();
    const gymUntil = asDate(firstOf(p, ["gymvaliduntil","gym_valid_until","gym_until"]));
    const coachUntil = asDate(firstOf(p, ["coachvaliduntil","coach_valid_until","coach_until"]));
    const end = asDate(firstOf(p, ["enddate","end_date","valid_until","expiry","expires","until","end"]));
    if (!gymUntil && !coachUntil && !end) continue;

    // Determine type using Pricing flags if available; fallback to name heuristics
    const flags = map.get(tag.toLowerCase()) || { gym: null, coach: null };
    const impliesCoach = flags.coach === true || (flags.coach === null && /coach|trainer|pt/i.test(tag));
    const impliesGym = flags.gym === true || (flags.gym === null && /member|gym/i.test(tag));

    // Prefer explicit per-category outcome columns if present
    if (gymUntil) {
      membershipEnd = !membershipEnd || gymUntil > membershipEnd ? gymUntil : membershipEnd;
    } else if (impliesGym && end) {
      membershipEnd = !membershipEnd || end > membershipEnd ? end : membershipEnd;
    }
    if (coachUntil) {
      coachEnd = !coachEnd || coachUntil > coachEnd ? coachUntil : coachEnd;
    } else if (impliesCoach && end) {
      coachEnd = !coachEnd || end > coachEnd ? end : coachEnd;
    }
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
        // Our API returns a plain object { member, payments, gymEntries, progress }
        // without an { ok } flag, so treat absence of errors as success.
        const [bundle, pricingRes] = await Promise.all([
          fetchMemberBundle(id, { ttlMs: 0 }),
          fetchPricing(),
        ]);
        const m = bundle.member ? norm(bundle.member) : null;
        const pays = (bundle.payments || []).map(norm);
        const gyms = (bundle.gymEntries || []).map(norm);
        const progs = (bundle.progress || []).map(norm);
        const pricingRows = (pricingRes?.rows || pricingRes?.data || []).map((r) => r);
        return { m, pays, gyms, progs, pricingRows };
      }

      async function loadViaLegacy() {
        const [mRes, pRes, gRes, prRes] = await Promise.all([
          fetchMembers(), fetchPayments(), fetchGymEntries(), fetchProgressTracker(),
        ]);
        const rows = (mRes?.rows ?? mRes?.data ?? []).map(norm);
        const m = rows.find((r) => String(firstOf(r, ["memberid","member_id","member_id_","id"]) || "").trim().toLowerCase() === id.toLowerCase()) || null;
        const pays = (pRes?.rows ?? pRes?.data ?? []).filter((r) =>
          String(firstOf(norm(r), ["memberid","member_id","member_id_","id"]) || "").trim().toLowerCase() === id.toLowerCase()
        );
        const gyms = (gRes?.rows ?? gRes?.data ?? []).filter((r) =>
          String(firstOf(norm(r), ["memberid","member_id","member_id_","id"]) || "").trim().toLowerCase() === id.toLowerCase()
        );
        const progs = (prRes?.rows ?? prRes?.data ?? []).filter((r) =>
          String(firstOf(norm(r), ["memberid","member_id","member_id_","id"]) || "").trim().toLowerCase() === id.toLowerCase()
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
          // compute status using Pricing flags where available
          setStatus(computeStatus(data.pays, mid, data.pricingRows || []));
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
  const id = String(firstOf(member, ["memberid","member_id","member_id_","id"]) || "").trim(); // define ID here
  const photoRaw = firstOf(member, ["photourl","photo_url","photo"]);
  const photoUrl = driveImg(photoRaw);

  const { membershipState, coachActive } = status;
  const studentRaw = firstOf(member, ["student"]);
  const isStudent = typeof studentRaw === "string" ? studentRaw.trim().toLowerCase().startsWith("y") : !!studentRaw;
  const [openPayment, setOpenPayment] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openQr, setOpenQr] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  // Reset image-failed flag whenever the computed photo URL changes
  useEffect(() => { setImgFailed(false); }, [photoUrl]);

  async function refreshBundle() {
    try {
      const idLower = String(id || "").toLowerCase();
      if (!idLower) return;
      const [bundle, pricingRes] = await Promise.all([
        fetchMemberBundle(idLower),
        fetchPricing(),
      ]);
      const m = bundle.member ? norm(bundle.member) : null;
      const pays = (bundle.payments || []).map(norm);
      const gyms = (bundle.gymEntries || []).map(norm);
      const progs = (bundle.progress || []).map(norm);
      if (m) setMember(m);
      setPayments(pays.sort((a,b)=>{
        const da = asDate(firstOf(a,["date","paid_on","created","timestamp"])) || new Date(0);
        const db = asDate(firstOf(b,["date","paid_on","created","timestamp"])) || new Date(0);
        return db - da;
      }));
      setVisits(
        gyms.map((r)=>{
          const n = norm(r);
          return { date: asDate(firstOf(n,["date"])), timeIn:firstOf(n,["timein","time_in"]), timeOut:firstOf(n,["timeout","time_out"]), totalHours:firstOf(n,["totalhours","total_hours","hours"]), coach:firstOf(n,["coach"]), focus:firstOf(n,["focus"]) };
        }).filter((x)=>!!x.date).sort((a,b)=>b.date-a.date)
      );
      setProgress(
        progs.sort((a,b)=>{
          const da = asDate(firstOf(a,["date","recorded","log_date","timestamp"])) || new Date(0);
          const db = asDate(firstOf(b,["date","recorded","log_date","timestamp"])) || new Date(0);
          return db - da;
        })
      );
      const pricingRows = (pricingRes?.rows || pricingRes?.data || []).map((r) => r);
      setStatus(computeStatus(pays, idLower, pricingRows));
    } catch(_) {}
  }

  return (
    <div className="content">
      <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
      <h2>{display(nick || firstName || "Member")}</h2>

      <div className="member-card">
        <div className="member-photo">
          <div className="photo-box">
            {photoUrl && !imgFailed ? (
              <img
                src={driveThumb(photoUrl)}
                alt="photo"
                onError={(e) => {
                  const el = e.currentTarget;
                  if (!el.dataset.retry && photoRaw) {
                    el.dataset.retry = "1";
                    const id = driveId(photoRaw) || driveId(photoUrl);
                    if (id) el.src = `https://drive.google.com/uc?export=view&id=${id}`;
                    else el.style.display = "none";
                  } else if (el.dataset.retry === "1") {
                    el.dataset.retry = "2";
                    const id = driveId(photoRaw) || driveId(photoUrl);
                    if (id) el.src = `https://drive.google.com/uc?export=download&id=${id}`;
                    else setImgFailed(true);
                  } else {
                    setImgFailed(true);
                  }
                }}
              />
            ) : (
              <div style={{ color: "var(--muted)", padding: 16 }}>No photo</div>
            )}
          </div>
        </div>

        <div className="member-info">
          <div className="member-grid">
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

        {/* Member ID hidden per request */}
          </div>

  {/* Highlighted Membership & Coach sub-card */}
  <div style={{ background: "#fff7fa", border: "1px solid #ffe4ec", borderRadius: 14, padding: 16, marginTop: 12, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div className="label" style={{ textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Gym Membership</div>
              <div className="value" style={{ marginBottom: 10 }}>
                {membershipState === "active" && <span className="pill ok">Active</span>}
                {membershipState === "expired" && <span className="pill bad">Expired</span>}
                {membershipState == null && "-"}
              </div>
              <div className="label" style={{ fontSize: 12, marginTop: 6, marginBottom: 2 }}>Valid until</div>
              <div className="value" style={{ fontWeight: 800 }}>{fmtDate(status.membershipEnd)}</div>
            </div>
            <div>
              <div className="label" style={{ textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6 }}>Coach Subscription</div>
              <div className="value" style={{ marginBottom: 10 }}>{coachActive ? <span className="pill ok">Available</span> : "-"}</div>
              <div className="label" style={{ fontSize: 12, marginTop: 6, marginBottom: 2 }}>Valid until</div>
              <div className="value" style={{ fontWeight: 800 }}>{fmtDate(status.coachEnd)}</div>
            </div>
          </div>
        </div>

          {/* Actions */}
          <div className="member-actions">
            <button
              className="primary-btn"
              onClick={() => setOpenEdit(true)}
              title="Edit member details"
            >
              ✏️ Edit
            </button>
            <button
              className="primary-btn"
              onClick={() => setOpenPayment(true)}
              title="Manage payments"
            >
              💳 Payments
            </button>
            <button
              className="primary-btn"
              onClick={() => setOpenQr(true)}
              title="Show QR code for this member"
            >
              ▣ QR Code
            </button>
            <button
              className="primary-btn"
              onClick={() => navigate(`/members/${encodeURIComponent(id)}/progress/0`)}
              title="Track or view progress"
            >
              📈 Progress
            </button>
          </div>
        </div>
      </div>

      {/* Payment modal */}
      <PaymentModal
        open={openPayment}
        onClose={() => setOpenPayment(false)}
        memberId={id}
        onSaved={() => { setOpenPayment(false); refreshBundle(); }}
        membershipEnd={status.membershipEnd}
        coachEnd={status.coachEnd}
        isStudent={isStudent}
        birthDate={bday}
      />

      {/* Edit Member modal */}
      <EditMemberModal
        open={openEdit}
        onClose={() => setOpenEdit(false)}
        member={member}
        onSaved={() => { setOpenEdit(false); refreshBundle(); }}
      />

      {/* QR Code modal */}
      <QrCodeModal
        open={openQr}
        onClose={() => setOpenQr(false)}
        memberId={id}
        nickname={nick || firstName || ""}
      />

      {/* QR Code modal */}
      <QrCodeModal
        open={openQr}
        onClose={() => setOpenQr(false)}
        memberId={id}
        nickname={nick || `${firstName || ""} ${lastName || ""}`.trim()}
      />

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
      <table className="aligned payments-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Particulars</th>
            <th>
              Gym Membership
              <br />
              <span className="th-sub">Valid Until</span>
            </th>
            <th>
              Coach Subscription
              <br />
              <span className="th-sub">Valid Until</span>
            </th>
            <th>Mode</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {payments.length === 0 ? (
            <tr><td colSpan={6}>-</td></tr>
          ) : payments.slice(0, 30).map((p, i) => {
            const paid = asDate(firstOf(p, ["date","paid_on","created","timestamp"]));
            const particulars = firstOf(p, ["particulars","type","item","category","product","paymentfor","plan","description"]);
            const gymUntil = asDate(firstOf(p, ["gymvaliduntil","gym_valid_until","gym_until"]));
            const coachUntil = asDate(firstOf(p, ["coachvaliduntil","coach_valid_until","coach_until"]));
            const mode = firstOf(p, ["mode","payment_mode","method","via"]);
            const cost = firstOf(p, ["cost","amount","price","total","paid"]);
            return (
              <tr key={i}>
                <td>{fmtDate(paid)}</td>
                <td>{display(particulars)}</td>
                <td>{fmtDate(gymUntil)}</td>
                <td>{fmtDate(coachUntil)}</td>
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
