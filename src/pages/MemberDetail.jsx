import React, { useEffect, useState } from "react";
import PaymentModal from "../components/PaymentModal";
import EditMemberModal from "../components/EditMemberModal";
import QrCodeModal from "../components/QrCodeModal";
import ProgressModal from "../components/ProgressModal";
import ProgressViewModal from "../components/ProgressViewModal";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  fetchMembers,
  fetchPayments,
  fetchGymEntries,
  fetchProgressTracker,
  fetchMemberBundle,
  fetchPricing,
} from "../api/sheets";
import LoadingSkeleton from "../components/LoadingSkeleton";
import RefreshBadge from '../components/RefreshBadge.jsx';
import MemberProfileCard from "../components/MemberProfileCard";
import VisitViewModal from "../components/VisitViewModal";
import CheckInConfirmModal from "../components/CheckInConfirmModal";
import events from "../lib/events";

const toKey = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, "_");
const norm = (row) => Object.fromEntries(Object.entries(row || {}).map(([k, v]) => [toKey(k), v]));
const firstOf = (o, ks) => ks.map((k) => o[k]).find((v) => v !== undefined && v !== "");
const asDate = (v) => { if (v instanceof Date) return v; const d = new Date(v); return isNaN(d) ? null : d; };
// Manila timezone display helper: Mon-D, YYYY
const MANILA_TZ = "Asia/Manila";
// Format time as HH:MM AM/PM in Manila timezone
const fmtTime = (t) => {
  if (!t) return "-";
  // If already in HH:MM AM/PM, return as-is
  if (/^\d{1,2}:\d{2}\s?(AM|PM)$/i.test(t)) return t;
  // If ISO string, parse and format
  const d = new Date(t);
  if (!isNaN(d)) {
    return new Intl.DateTimeFormat("en-US", { timeZone: MANILA_TZ, hour: "2-digit", minute: "2-digit", hour12: true }).format(d);
  }
  // If string like "07:53:00.000Z", try to extract HH:mm and infer AM/PM
  const m = String(t).match(/(\d{2}):(\d{2})/);
  if (m) {
    let hour = parseInt(m[1], 10);
    let min = m[2];
    let ampm = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${min} ${ampm}`;
  }
  return "-";
};
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
  // Normalize to start-of-day so "valid until today" counts as active for the whole day
  today.setHours(0,0,0,0);
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

  // Normalize ends to start-of-day before comparing
  let membershipState = null;
  if (membershipEnd) {
    const e = new Date(membershipEnd);
    e.setHours(0,0,0,0);
    membershipState = e >= today ? "active" : "expired";
  }
  let coachActive = false;
  if (coachEnd) {
    const c = new Date(coachEnd);
    c.setHours(0,0,0,0);
    coachActive = c >= today;
  }
  return { membershipEnd, membershipState, coachEnd, coachActive };
}

export default function MemberDetail() {
  const [selectedVisit, setSelectedVisit] = useState(null);
  const { id: idParam, memberId: memberIdParam } = useParams();
  const navigate = useNavigate();
  const loc = useLocation();
  const passed = React.useMemo(() => (loc.state?.row ? norm(loc.state.row) : null), [loc.state?.row]);

  const [member, setMember] = useState(passed || null);
  const [loading, setLoading] = useState(!passed); // render immediately if we have a passed row
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState({ membershipState: null, coachActive: false, membershipEnd: null, coachEnd: null });
  const [visits, setVisits] = useState([]);
  const [rawGyms, setRawGyms] = useState([]);
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

      // If we already received a passed row via navigation state, use it for immediate render
      // and defer the heavier bundle fetch so the UI is responsive.
      if (passed) {
        setMember(passed);
        setLoading(false);
        // Trigger a near-immediate background refresh (debounced) so payment/status tiles update quickly
        try {
          debouncedRefreshBundle();
          // fallback extra attempt after a short delay
          if (typeof window !== 'undefined') setTimeout(() => { try { debouncedRefreshBundle(); } catch(e) {} }, 600);
        } catch (e) {
          // ignore
        }
        return;
      }

  async function loadViaBundleFresh() {
        // Our API returns a plain object { member, payments, gymEntries, progress }
        // without an { ok } flag, so treat absence of errors as success.
        const [bundle, pricingRes] = await Promise.all([
          fetchMemberBundle(id, { ttlMs: 0 }),
          fetchPricing(),
        ]);
  const m = bundle.member ? norm(bundle.member) : null;
  const pays = (bundle.payments || []).map(norm);
  const gymsRaw = (bundle.gymEntries || []).map((r) => r);
  const gyms = gymsRaw.map(norm);
  const progs = (bundle.progress || []).map(norm);
  // store raw gym rows so VisitViewModal can receive the full sheet row when opening
  setRawGyms(gymsRaw);
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
        const gymsRaw = (gRes?.rows ?? gRes?.data ?? []).filter((r) =>
          String(firstOf(norm(r), ["memberid","member_id","member_id_","id"]) || "").trim().toLowerCase() === id.toLowerCase()
        );
        const gyms = gymsRaw.map(norm);
        // store raw gym rows for modal use
        setRawGyms(gymsRaw);
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
            // Normalize payments so downstream logic (computeStatus, UI) reads consistent field names
            setPayments((data.pays || []).map(norm).sort((a, b) => {
              const da = asDate(firstOf(a, ["date","paid_on","created","timestamp"])) || new Date(0);
              const db = asDate(firstOf(b, ["date","paid_on","created","timestamp"])) || new Date(0);
              return db - da;
            }));
          setVisits(
            data.gyms.map((r) => {
              const n = norm(r);
              return {
                // keep same lightweight visit objects for list rendering
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
          // compute status using Pricing flags where available; pass normalized payments
          setStatus(computeStatus((data.pays || []).map(norm), mid, data.pricingRows || []));
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
    // subscribe to events to refresh bundle if member updated or gym entry added
    // When a member is updated elsewhere, the event payload may include the
    // updated row. Use the payload's MemberID (if present) to decide whether
    // to refresh this page. Avoid relying on the `member` variable from the
    // outer closure which can be stale.
    const unsub1 = events.on('member:updated', (payload) => {
      try {
        // Payload may be the updated row or an object like { request, response }
        const candidate = payload && payload.request ? payload.request : payload;
        const pMid = String(firstOf(candidate || {}, ["MemberID","memberid","member_id","id"]) || "").trim();
        // Determine the route/member id we care about from the params or passed row
        const routeId = decodeURIComponent(memberIdParam || idParam || "").trim();
        const passedId = String(firstOf(passed || {}, ["memberid","member_id","id"]) || "").trim();
        const targetId = routeId || passedId;
        if (pMid && targetId && pMid.toLowerCase() === targetId.toLowerCase()) {
          // small delay to let cache invalidation settle
          setTimeout(() => debouncedRefreshBundle(), 120);
        }
      } catch (e) { /* ignore */ }
    });
    const unsub2 = events.on('gymEntry:added', (entry) => {
      try { const mid = String(firstOf(member||{}, ["memberid","member_id","id"])||"").trim(); if (!mid) return; const entryMid = String(entry?.MemberID||entry?.memberid||entry?.Member||'').trim(); if (entryMid && entryMid === mid) debouncedRefreshBundle(); } catch(e) {}
    });
    const unsub3 = events.on('payment:added', (p) => {
      try {
        const mid = String(firstOf(member||{}, ["memberid","member_id","id"])||"").trim();
        if (!mid) return;
        // support shapes: { request: {...}, response: {...} } or legacy obj
        const req = p && p.request ? p.request : p;
        const resp = p && p.response ? p.response : null;
        const pMid = String(req?.MemberID || req?.memberid || resp?.MemberID || resp?.memberid || req?.Member || resp?.Member || '').trim();
        if (pMid && pMid === mid) {
          // immediate small delay to let cache invalidation settle
          setTimeout(() => debouncedRefreshBundle(), 120);
        }
      } catch(e) { console.debug('payment event handler error', e); }
    });
    return () => {
      alive = false;
      try { unsub1(); } catch(e) {}
      try { unsub2(); } catch(e) {}
      try { unsub3(); } catch(e) {}
      try { if (refreshTimer.current) { clearTimeout(refreshTimer.current); refreshTimer.current = null; } } catch(e) {}
    };
  }, [memberIdParam, idParam, passed]);

  if (loading) return <div className="content"><LoadingSkeleton /></div>;
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
  const photoSrc = driveThumb(photoUrl);

  const { membershipState, coachActive } = status;
  const studentRaw = firstOf(member, ["student"]);
  const isStudent = typeof studentRaw === "string" ? studentRaw.trim().toLowerCase().startsWith("y") : !!studentRaw;
  const [openPayment, setOpenPayment] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openQr, setOpenQr] = useState(false);
  const [openProgress, setOpenProgress] = useState(false);
  const [openProgView, setOpenProgView] = useState(false);
  const [showAllVisits, setShowAllVisits] = useState(false);
  const [showCheckInConfirm, setShowCheckInConfirm] = useState(false);
  const [viewProgressIndex, setViewProgressIndex] = useState(-1);
  const [imgFailed, setImgFailed] = useState(false);
  const [visitsLimit, setVisitsLimit] = useState(10);
  const [progressLimit, setProgressLimit] = useState(10);
  const [paymentsLimit, setPaymentsLimit] = useState(10);
  

  // Reset image-failed flag whenever the computed photo URL changes
  useEffect(() => { setImgFailed(false); }, [photoUrl]);

  async function refreshBundle() {
    setIsRefreshing(true);
    try {
      const idClean = String(id || "").trim();
      if (!idClean) return;
      console.debug("refreshBundle: fetching bundle for", idClean);
      const [bundle, pricingRes] = await Promise.all([
        // Force a fresh bundle fetch here to avoid stale cached responses so MemberDetail
        // stays in sync with the Members list after writes (e.g. addPayment).
        fetchMemberBundle(idClean, { ttlMs: 0 }),
        fetchPricing(),
      ]);
      console.debug("refreshBundle: fetched bundle", bundle, pricingRes);
      const m = bundle.member ? norm(bundle.member) : null;
      const pays = (bundle.payments || []).map(norm);
      const gymsRaw = (bundle.gymEntries || []).map((r) => r);
      const gyms = gymsRaw.map(norm);
      const progs = (bundle.progress || []).map(norm);
      if (m) setMember(m);
      // store raw gym rows so VisitViewModal can receive the full sheet row when opening
      setRawGyms(gymsRaw);
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
  setStatus(computeStatus(pays, idClean, pricingRows));
    } catch(e) {
      console.error('refreshBundle failed', e);
      // Surface a UI-visible error so users know the refresh failed
      try { setError(String(e?.message || e || 'Failed to refresh member data')); } catch (ee) {}
    }
    finally { setIsRefreshing(false); }
  }

  // Debounced refresh to avoid duplicate network calls when multiple events fire
  const refreshTimer = React.useRef(null);
  const debouncedRefreshBundle = () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshBundle();
      refreshTimer.current = null;
    }, 200);
  };

  

  return (
    <div className="content">
      {/* Header: buttons row on top, nickname centered below */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>
            {/* Unified Check In / Out button opens the CheckInConfirmModal and lets it decide */}
            <button
              className="back-btn"
              onClick={() => setShowCheckInConfirm(true)}
              disabled={membershipState !== 'active'}
              title={membershipState === 'active' ? 'Check in or out' : 'Gym membership is not active'}
            >
              Check In / Out
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>{display(nick || firstName || "Member")}</h2>
          <div><RefreshBadge show={isRefreshing && !loading} /></div>
        </div>
      </div>

      <MemberProfileCard
        member={member}
        status={status}
        isRefreshing={isRefreshing}
        onEdit={() => setOpenEdit(true)}
        onAddPayment={() => setOpenPayment(true)}
        onShowQr={() => setOpenQr(true)}
        onShowProgress={() => setOpenProgress(true)}
        onCheckIn={() => setShowCheckInConfirm(true)}
      />

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
        // Accept an optional updatedRow from the modal for optimistic UI updates
        onSaved={(updatedRow) => {
          // Close modal immediately
          setOpenEdit(false);
          try {
            if (updatedRow) {
              // Normalize and apply optimistic update to the card
              // Merge the normalized optimistic payload into the existing member
              // instead of wholesale replacing the object. This preserves any
              // fields that the modal didn't include in its optimistic payload
              // (e.g. derived fields like `member_since`) until the background
              // refresh reconciles with the authoritative DB.
              setMember((prev) => ({ ...(prev || {}), ...(norm(updatedRow) || {}) }));
            }
          } catch (e) {}
          // Immediately fetch authoritative member row from server and update UI.
          // This ensures the profile card reflects the DB (the Members list already
          // shows the updated values, so we must mirror that authoritative state).
          (async () => {
            try {
              const idClean = String(firstOf(updatedRow || member || {}, ["memberid","member_id","id","MemberID"]) || "").trim();
              if (idClean) {
                try {
                  const fresh = await fetchMemberByIdFresh(idClean);
                  if (fresh) setMember(fresh);
                } catch (e) {
                  // if fresh fetch fails, fall back to refreshing the whole bundle
                  try { refreshBundle(); } catch (e2) {}
                }
              } else {
                try { refreshBundle(); } catch (e) {}
              }
            } catch (e) {
              try { refreshBundle(); } catch (ee) {}
            }
          })();
        }}
      />

      {/* QR Code modal */}
      <QrCodeModal
        open={openQr}
        onClose={() => setOpenQr(false)}
        memberId={id}
        nickname={nick || firstName || ""}
        firstName={firstName || ""}
        lastName={lastName || ""}
        memberSince={memberSince || null}
        photo={photoSrc}
      />

      {/* Progress modal */}
      <ProgressModal
        open={openProgress}
        onClose={() => setOpenProgress(false)}
        memberId={id}
        memberSinceYMD={memberSince ? `${memberSince.getFullYear()}-${String(memberSince.getMonth()+1).padStart(2,"0")}-${String(memberSince.getDate()).padStart(2,"0")}` : ""}
        onSaved={() => { setOpenProgress(false); refreshBundle(); }}
      />

      {/* Progress view-only modal */}
      <ProgressViewModal
        open={openProgView}
        onClose={() => { setOpenProgView(false); setViewProgressIndex(-1); }}
        row={viewProgressIndex >= 0 ? progress[viewProgressIndex] : null}
      />

      <div className="panel">
        <div className="panel-header">Gym Visits</div>
  <table className="aligned">
        <thead>
          <tr>
            <th>Date</th><th>Time In</th><th>Time Out</th><th>Total Hours</th><th>Coach</th><th>Focus</th>
          </tr>
        </thead>
        <tbody>
          {visits.length === 0 ? (
            <tr><td colSpan={6}>-</td></tr>
          ) : visits.slice(0, visitsLimit).map((v, i) => (
            <tr key={i} style={{ cursor: "pointer" }} onClick={() => setSelectedVisit(v)}>
              <td>{fmtDate(v.date)}</td>
              <td>{fmtTime(v.timeIn)}</td>
              <td>{fmtTime(v.timeOut)}</td>
              <td>{display(v.totalHours)}</td>
              <td>{display(v.coach)}</td>
              <td>{display(v.focus)}</td>
            </tr>
          ))}
        </tbody>
        </table>
        {visits.length > visitsLimit && (
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <button className="button" onClick={() => setVisitsLimit((n) => (n < visits.length ? Math.min(n + 10, visits.length) : 10))}>
              {visitsLimit < visits.length ? `Load ${Math.min(10, visits.length - visitsLimit)} more` : 'Show less'}
            </button>
          </div>
        )}
      </div>

          {/* Visit detail modal (styled like progress view) */}
          <VisitViewModal open={!!selectedVisit} onClose={() => setSelectedVisit(null)} row={selectedVisit} onCheckout={() => { /* parent can handle if needed */ }} />
          {
            // Prefer passing the raw open gym row (if any) so the modal can upsert the
            // existing entry on checkout instead of appending a new one.
            (() => {
              const todayYMD = new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
              const openRaw = (rawGyms || []).find(r => {
                const d = r?.Date || r?.date; if (!d) return false; const ymd = new Date(d); const s = new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(ymd); if (s !== todayYMD) return false; const tout = String(r?.TimeOut || r?.timeout || r?.time_out || ''); return !tout.trim();
              }) || null;
              return (
                <CheckInConfirmModal
                  open={!!showCheckInConfirm}
                  memberId={id}
                  initialEntry={openRaw}
                  onClose={() => setShowCheckInConfirm(false)}
                  onSuccess={async () => {
                    setShowCheckInConfirm(false);
                    try { await debouncedRefreshBundle(); } catch (e) {}
                  }}
                />
              );
            })()
          }
          {visits.length > 200 && (
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <button className="button" onClick={() => setShowAllVisits(s => !s)}>{showAllVisits ? "Show less" : `Show all (${visits.length})`}</button>
            </div>
          )}

      <div className="panel">
        <div className="panel-header">Progress</div>
        <table className="aligned">
        <thead>
          <tr>
            <th>Date</th><th>No</th><th>Weight</th><th>BMI</th><th>Muscle Mass</th><th>Body Fat</th>
          </tr>
        </thead>
        <tbody>
          {progress.length === 0 ? (
            <tr><td colSpan={6}>-</td></tr>
          ) : progress.slice(0, progressLimit).map((r, i) => {
            const d = asDate(firstOf(r, ["date","recorded","log_date","timestamp"]));
            const no = firstOf(r, ["no","entry_no","seq","number"]);
            const weight = firstOf(r, [
              "weight","weight_kg","weight_lbs","weight_(lbs)","weight_(kg)",
              "weight(lbs)","weightkg","weightlbs"
            ]);
            const bmi = firstOf(r, ["bmi"]);
            const muscle = firstOf(r, ["musclemass","muscle_mass","muscle"]);
            const bodyfat = firstOf(r, ["bodyfat","body_fat","bf"]);
            return (
              <tr key={i} style={{ cursor: "pointer" }} onClick={() => {
                setViewProgressIndex(i);
                setOpenProgView(true);
              }}>
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
        {progress.length > progressLimit && (
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <button className="button" onClick={() => setProgressLimit((n) => (n < progress.length ? Math.min(n + 10, progress.length) : 10))}>
              {progressLimit < progress.length ? `Load ${Math.min(10, progress.length - progressLimit)} more` : 'Show less'}
            </button>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">Payments</div>
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
          ) : payments.slice(0, paymentsLimit).map((p, i) => {
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
        {payments.length > paymentsLimit && (
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <button className="button" onClick={() => setPaymentsLimit((n) => (n < payments.length ? Math.min(n + 10, payments.length) : 10))}>
              {paymentsLimit < payments.length ? `Load ${Math.min(10, payments.length - paymentsLimit)} more` : 'Show less'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Named exports for shared formatting helpers used across pages
export { fmtTime, fmtDate, display, MANILA_TZ };
