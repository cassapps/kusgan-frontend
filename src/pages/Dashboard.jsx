
import { useEffect, useState, useMemo } from "react";
import { fetchMembers, fetchPayments, fetchGymEntries, fetchGymEntriesFresh, fetchPricing, fetchDashboard, gymQuickAppend } from "../api/sheets";
import { fmtTime, fmtDate, display } from "./MemberDetail.jsx";
import VisitViewModal from "../components/VisitViewModal";
import CheckInConfirmModal from "../components/CheckInConfirmModal";
import events from "../lib/events";
import RefreshBadge from '../components/RefreshBadge.jsx';

function todayYMD() {
  const now = new Date();
  return now.toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function Dashboard() {
  // state/hooks
  const [stats, setStats] = useState({
    totalMembers: 0,
    activeGym: 0,
    activeCoach: 0,
    visitedToday: 0,
    coachToday: 0,
    checkedIn: 0,
    cashToday: 0,
    gcashToday: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [gymEntries, setGymEntries] = useState([]);
  const [pricing, setPricing] = useState([]);
  const [showAllGym, setShowAllGym] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutMemberId, setCheckoutMemberId] = useState(null);
  const [checkoutInitialEntry, setCheckoutInitialEntry] = useState(null);

  // Generate gym entry rows (computed after state is declared to avoid TDZ)
    const gymEntryRows = useMemo(() => (gymEntries || []).filter(e => {
    const d = e.Date || e.date;
    const ymd = d ? new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
    return ymd === todayYMD();
  }).map((e, idx) => {
    const member = (members || []).find(m => {
      const pid = String(e.MemberID || e.member_id || e.id || e.member || "").trim();
      if (!pid) return false;
      return String(m.MemberID || m.member_id || m.id || "").trim() === pid;
    });
    const timeIn = e.TimeIn || e.timein || "";
    const timeOut = e.TimeOut || e.timeout || "";
      // Prefer server/sheet-calculated hours fields (the sheet has formulas). Do not compute here.
      const totalHours = e.TotalHours || e.totalhours || e.NoOfHours || e.noofhours || e.hours || "";
    return (
      <tr key={idx} style={{ cursor: "pointer" }} onClick={() => setSelectedEntry(e)}>
        <td>{member?.NickName || member?.Nickname || member?.nickname || member?.name || (member?.FirstName ? `${member.FirstName} ${member.LastName || ""}` : "") || ""}</td>
        <td>{fmtTime(timeIn)}</td>
        <td>{fmtTime(timeOut)}</td>
          <td>{display(totalHours)}</td>
        <td>{display(e.Coach || e.coach)}</td>
        <td>{display(e.Focus || e.focus)}</td>
      </tr>
    );
  }), [gymEntries, members]);

  // Helper: compute stats from fetched arrays (returns stats object)
  const computeStatsFromData = (membersArr, paymentsArr, gymArr, pricingArr) => {
    const pricingFlags = new Map();
    const truthy = (v) => { const s = String(v ?? "").trim().toLowerCase(); return s === "yes" || s === "y" || s === "true" || s === "1"; };
    const pick = (o, keys) => { for (const k of keys) { if (o && Object.prototype.hasOwnProperty.call(o, k)) return o[k]; const alt = Object.keys(o || {}).find((kk) => kk.toLowerCase().replace(/\s+/g, "") === k.toLowerCase().replace(/\s+/g, "")); if (alt) return o[alt]; } return undefined; };
    (pricingArr || []).forEach(r => {
      const name = String(pick(r, ["Particulars"]) || "").trim();
      if (!name) return;
      const gymFlag = truthy(pick(r, ["Gym membership","Gym Membership","GymMembership","Membership"]));
      const coachFlag = truthy(pick(r, ["Coach subscription","Coach Subscription","CoachSubscription","Coach"]));
      pricingFlags.set(name.toLowerCase(), { gym: gymFlag, coach: coachFlag });
    });

    // Group payments by member id
    const paymentsByMember = new Map();
    (paymentsArr || []).forEach(p => {
      const id = String(p.MemberID || p.member_id || p.id || p.member || "").trim();
      if (!id) return;
      if (!paymentsByMember.has(id)) paymentsByMember.set(id, []);
      paymentsByMember.get(id).push(p);
    });

    function computeStatusForMember(paymentsOfMember) {
      const today = new Date();
      today.setHours(0,0,0,0);
      let membershipEnd = null, coachEnd = null;
      const rows = paymentsOfMember || [];
      for (const raw of rows) {
        const tag = String(raw.Particulars || raw.particulars || raw.type || raw.item || raw.description || "").trim();
        const key = tag.toLowerCase();
        const flags = pricingFlags.get(key) || { gym: null, coach: null };
        const gymUntil = raw.GymValidUntil || raw.gymvaliduntil || raw.gym_valid_until || raw.gym_until || raw.EndDate || raw.enddate || raw.end_date || raw.end || raw.valid_until || raw.expiry || raw.expires || raw.until;
        const coachUntil = raw.CoachValidUntil || raw.coachvaliduntil || raw.coach_valid_until || raw.coach_until;
        const end = gymUntil || coachUntil;
        if (gymUntil || end) {
          const g = gymUntil ? new Date(gymUntil) : (end ? new Date(end) : null);
          if (g && (flags.gym === true || (flags.gym === null && /member|gym/i.test(tag)))) membershipEnd = !membershipEnd || g > membershipEnd ? g : membershipEnd;
        }
        if (coachUntil || end) {
          const c = coachUntil ? new Date(coachUntil) : (end ? new Date(end) : null);
          if (c && (flags.coach === true || (flags.coach === null && /coach|trainer|pt/i.test(tag)))) coachEnd = !coachEnd || c > coachEnd ? c : coachEnd;
        }
      }
      let membershipState = null;
      if (membershipEnd) {
        const e = new Date(membershipEnd);
        e.setHours(0,0,0,0);
        membershipState = e >= today ? 'active' : 'expired';
      }
      let coachActive = false;
      if (coachEnd) {
        const c = new Date(coachEnd);
        c.setHours(0,0,0,0);
        coachActive = c >= today;
      }
      return { membershipEnd, membershipState, coachEnd, coachActive };
    }

    let activeGym = 0, activeCoach = 0;
    for (const m of (membersArr || [])) {
      const id = String(m.MemberID || m.member_id || m.id || "").trim();
      const pays = paymentsByMember.get(id) || [];
      const st = computeStatusForMember(pays);
      if (st.membershipState === 'active') activeGym++;
      if (st.coachActive) activeCoach++;
    }

    const today = todayYMD();
    const visitsToday = (gymArr || []).filter(e => {
      const d = e.Date || e.date;
      if (!d) return false;
      const s = new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
      return s === today;
    });
    const uniqueVisited = new Set(visitsToday.map(e => String(e.MemberID || e.member_id || e.id || "").trim()).filter(Boolean));
    const visitedToday = uniqueVisited.size;
    const coachToday = visitsToday.reduce((acc, e) => { const coachVal = e.Coach || e.coach || ''; return acc + (String(coachVal || '').trim() ? 1 : 0); }, 0);
    const checkedIn = visitsToday.filter(e => { const tin = String(e.TimeIn || e.timein || e.time_in || '').trim(); const tout = String(e.TimeOut || e.timeout || e.time_out || '').trim(); return tin && !tout; }).length;

    let cashToday = 0, gcashToday = 0, totalPaymentsToday = 0;
    for (const p of (paymentsArr || [])) {
      const d = p.Date || p.date || p.pay_date;
      if (!d) continue;
      const ymd = new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
      if (ymd !== today) continue;
      const amt = parseFloat(p.Cost || p.amount || 0) || 0;
      totalPaymentsToday += amt;
      const mode = String(p.Mode || p.mode || p.method || "").toLowerCase();
      if (mode === 'cash') cashToday += amt;
      if (mode === 'gcash') gcashToday += amt;
    }

    return { totalMembers: (membersArr || []).length, activeGym, activeCoach, visitedToday, coachToday, checkedIn, cashToday, gcashToday, totalPaymentsToday };
  };
  // Generate payment rows
  const paymentRows = useMemo(() => (payments || []).filter(p => {
    const d = p.Date || p.date || p.pay_date;
    const ymd = d ? new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
    return ymd === todayYMD();
  }).map((p, idx) => {
    const member = (members || []).find(m => {
      const pid = String(p.MemberID || p.member_id || p.id || p.member || "").trim();
      if (!pid) return false;
      return String(m.MemberID || m.member_id || m.id || "").trim() === pid;
    });
    const gymValidRaw = p.gymvaliduntil || p.GymValidUntil || p.gym_valid_until || p.gym_until || p.EndDate || p.Enddate || p.enddate || p.end_date || p.end || p.valid_until || p.expiry || p.expires || p.until || "";
    const coachValidRaw = p.coachvaliduntil || p.CoachValidUntil || p.coach_valid_until || p.coach_until || "";
    const gymValid = fmtDate(gymValidRaw);
    const coachValid = fmtDate(coachValidRaw);
    return (
      <tr key={idx}>
        <td>{member?.NickName || member?.Nickname || member?.nickname || member?.name || (member?.FirstName ? `${member.FirstName} ${member.LastName || ""}` : "") || ""}</td>
        <td>{display(p.Particulars || p.particulars || p.type || p.item || p.category || p.product || p.paymentfor || p.plan || p.description)}</td>
        <td>{display(gymValid)}</td>
        <td>{display(coachValid)}</td>
        <td>{display(p.Mode || p.mode || p.method)}</td>
        <td>{display((parseFloat(p.Cost||p.amount||0) || 0).toLocaleString())}</td>
      </tr>
    );
  }), [payments, members]);
 

  useEffect(() => {
    async function loadStats() {
  setLoading(true);
  // Try server-side aggregate first for fastest dashboard render
      try {
        const dashRes = await fetchDashboard();
        if (dashRes && dashRes.ok) {
          const { totalMembers=0, activeGym=0, activeCoach=0, visitedToday=0, coachToday=0, checkedIn=0, cashToday=0, gcashToday=0, totalPaymentsToday=0 } = dashRes;
          setStats({ totalMembers, activeGym, activeCoach, visitedToday, coachToday, checkedIn, cashToday, gcashToday, totalPaymentsToday });
          setLoading(false);
          // Still fetch full data for tables in background (non-blocking)
          (async () => {
            setIsRefreshing(true);
            try {
              const [membersRes, paymentsRes, gymRes, pricingRes] = await Promise.all([
                fetchMembers(), fetchPayments(), fetchGymEntries(), fetchPricing()
              ]);
              setMembers(membersRes?.rows || membersRes?.data || []);
              setPayments(paymentsRes?.rows || paymentsRes?.data || []);
              setGymEntries(gymRes?.rows || gymRes?.data || []);
              setPricing(pricingRes?.rows || pricingRes?.data || []);
              // Recompute authoritative stats from the freshly fetched rows so UI reflects actual data
              try {
                const computed = computeStatsFromData(
                  membersRes?.rows || membersRes?.data || [],
                  paymentsRes?.rows || paymentsRes?.data || [],
                  gymRes?.rows || gymRes?.data || [],
                  pricingRes?.rows || pricingRes?.data || []
                );
                setStats(computed);
              } catch (e) {
                console.warn('Failed to recompute stats after background fetch', e);
              }
            } catch (_){ }
            finally { setIsRefreshing(false); }
          })();
          return;
        }
      } catch (e) {
        // ignore and fallback to client-side compute
      }

      // Fallback: fetch full data and compute client-side (already optimized)
      // Fetch in parallel (cached GETs will help)
      setIsRefreshing(true);
      const [membersRes, paymentsRes, gymRes, pricingRes] = await Promise.all([
        fetchMembers(),
        fetchPayments(),
        fetchGymEntries(),
        fetchPricing(),
      ]);
      const membersData = membersRes?.rows || membersRes?.data || [];
      const paymentsData = paymentsRes?.rows || paymentsRes?.data || [];
      const gymEntriesData = gymRes?.rows || gymRes?.data || [];
      const pricingData = pricingRes?.rows || pricingRes?.data || [];
      setMembers(membersData);
      setPayments(paymentsData);
      setGymEntries(gymEntriesData);
      setPricing(pricingData);
  setIsRefreshing(false);
  // Small optimization: do the heavy computations off the main paint path so the UI can render quickly.
      const membersArr = membersData;
      const paymentsArr = paymentsData;
      const gymArr = gymEntriesData;
      const pricingArr = pricingData;

      // Quick immediate stats to show something while we compute rest
      setStats((s) => ({ ...s, totalMembers: membersArr.length }));
      // allow browser to render before heavy compute
      setTimeout(() => {
        // Build pricing flags map once
        const pricingFlags = new Map();
        const truthy = (v) => { const s = String(v ?? "").trim().toLowerCase(); return s === "yes" || s === "y" || s === "true" || s === "1"; };
        const pick = (o, keys) => { for (const k of keys) { if (o && Object.prototype.hasOwnProperty.call(o, k)) return o[k]; const alt = Object.keys(o || {}).find((kk) => kk.toLowerCase().replace(/\s+/g, "") === k.toLowerCase().replace(/\s+/g, "")); if (alt) return o[alt]; } return undefined; };
        pricingArr.forEach(r => {
          const name = String(pick(r, ["Particulars"]) || "").trim();
          if (!name) return;
          const gymFlag = truthy(pick(r, ["Gym membership","Gym Membership","GymMembership","Membership"]));
          const coachFlag = truthy(pick(r, ["Coach subscription","Coach Subscription","CoachSubscription","Coach"]));
          pricingFlags.set(name.toLowerCase(), { gym: gymFlag, coach: coachFlag });
        });

        // Group payments by member id to avoid N*M filters
        const paymentsByMember = new Map();
        paymentsArr.forEach(p => {
          const id = String(p.MemberID || p.member_id || p.id || p.member || "").trim();
          if (!id) return;
          if (!paymentsByMember.has(id)) paymentsByMember.set(id, []);
          paymentsByMember.get(id).push(p);
        });

        // Helper to compute status using grouped payments
        function computeStatusForMember(paymentsOfMember) {
          const today = new Date();
          // Normalize to start-of-day so "valid until today" counts as active for the whole day
          today.setHours(0,0,0,0);
          let membershipEnd = null, coachEnd = null;
          const rows = paymentsOfMember || [];
          for (const raw of rows) {
            const tag = String(raw.Particulars || raw.particulars || raw.type || raw.item || raw.description || "").trim();
            const key = tag.toLowerCase();
            const flags = pricingFlags.get(key) || { gym: null, coach: null };
            const gymUntil = raw.GymValidUntil || raw.gymvaliduntil || raw.gym_valid_until || raw.gym_until || raw.EndDate || raw.enddate || raw.end_date || raw.end || raw.valid_until || raw.expiry || raw.expires || raw.until;
            const coachUntil = raw.CoachValidUntil || raw.coachvaliduntil || raw.coach_valid_until || raw.coach_until;
            const end = gymUntil || coachUntil;
            if (gymUntil || end) {
              const g = gymUntil ? new Date(gymUntil) : (end ? new Date(end) : null);
              if (g && (flags.gym === true || (flags.gym === null && /member|gym/i.test(tag)))) membershipEnd = !membershipEnd || g > membershipEnd ? g : membershipEnd;
            }
            if (coachUntil || end) {
              const c = coachUntil ? new Date(coachUntil) : (end ? new Date(end) : null);
              if (c && (flags.coach === true || (flags.coach === null && /coach|trainer|pt/i.test(tag)))) coachEnd = !coachEnd || c > coachEnd ? c : coachEnd;
            }
          }
          let membershipState = null;
          if (membershipEnd) {
            const e = new Date(membershipEnd);
            e.setHours(0,0,0,0);
            membershipState = e >= today ? 'active' : 'expired';
          }
          let coachActive = false;
          if (coachEnd) {
            const c = new Date(coachEnd);
            c.setHours(0,0,0,0);
            coachActive = c >= today;
          }
          return { membershipEnd, membershipState, coachEnd, coachActive };
        }

        // Compute member-level stats with linear passes
        let activeGym = 0, activeCoach = 0;
        for (const m of membersArr) {
          const id = String(m.MemberID || m.member_id || m.id || "").trim();
          const pays = paymentsByMember.get(id) || [];
          const st = computeStatusForMember(pays);
          if (st.membershipState === 'active') activeGym++;
          if (st.coachActive) activeCoach++;
        }

        // Visits today (single pass)
        const today = todayYMD();
        const visitsToday = [];
        for (const e of gymArr) {
          const d = e.Date || e.date;
          if (!d) continue;
          const s = new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
          if (s === today) visitsToday.push(e);
        }

        // Member Visits: unique members that have at least one entry today
        const uniqueVisited = new Set(visitsToday.map(e => String(e.MemberID || e.member_id || e.id || "").trim()).filter(Boolean));
        const visitedToday = uniqueVisited.size;

        // Coaching Sessions: count of today's GymEntries where the Coach column is not blank
        const coachToday = visitsToday.reduce((acc, e) => {
          const coachVal = e.Coach || e.coach || '';
          return acc + (String(coachVal || '').trim() ? 1 : 0);
        }, 0);

        // Currently Checked-In: entries today that have a TimeIn and no TimeOut yet
        const checkedIn = visitsToday.filter(e => {
          const tin = String(e.TimeIn || e.timein || e.time_in || '').trim();
          const tout = String(e.TimeOut || e.timeout || e.time_out || '').trim();
          return tin && !tout;
        }).length;

        // Revenue today (single pass over payments)
        let cashToday = 0, gcashToday = 0, totalPaymentsToday = 0;
        for (const p of paymentsArr) {
          const d = p.Date || p.date || p.pay_date;
          if (!d) continue;
          const ymd = new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
          if (ymd !== today) continue;
          const amt = parseFloat(p.Cost || p.amount || 0) || 0;
          totalPaymentsToday += amt;
          const mode = String(p.Mode || p.mode || p.method || "").toLowerCase();
          if (mode === 'cash') cashToday += amt;
          if (mode === 'gcash') gcashToday += amt;
        }

        setStats({ totalMembers: membersArr.length, activeGym, activeCoach, visitedToday, coachToday, checkedIn, cashToday, gcashToday, totalPaymentsToday });
    setLoading(false);
    setShowLoadingToast(false);
      }, 20);
    };
    loadStats();
    // subscribe to gym entry adds so the Dashboard can refresh quickly
    const unsub = events.on('gymEntry:added', async (entry) => {
      try {
        // fetch fresh authoritative gym entries when an entry is reported added
        setIsRefreshing(true);
        const gymRes = await fetchGymEntriesFresh();
        setGymEntries(gymRes?.rows || gymRes?.data || []);
        setIsRefreshing(false);
      } catch (e) {}
    });
    const unsub2 = events.on('member:updated', async () => {
      try { const membersRes = await fetchMembers(); setMembers(membersRes?.rows || membersRes?.data || []); } catch (e) {}
    });
    // Periodic refresh: poll gym entries every 15s so dashboard reflects recent checkins/outs
    const pollInterval = setInterval(async () => {
      try {
        // periodic poll should fetch fresh rows so other clients' changes appear quickly
        const gymRes = await fetchGymEntriesFresh();
        setGymEntries(gymRes?.rows || gymRes?.data || []);
      } catch (e) { /* ignore */ }
    }, 15000);
    return () => { unsub(); unsub2(); clearInterval(pollInterval); };
  }, []);

  // Checkout handler: attempt to close an open gym entry for the given member id.
  const handleCheckout = async (entry, payload = {}) => {
    if (!entry) return;
    const memberId = String(entry.MemberID || entry.member_id || entry.id || entry.member || "").trim();
    if (!memberId) return;
    try {
      setIsRefreshing(true);
      const today = todayYMD();
      // request backend to set TimeOut for today's open row for this member
      const res = await gymQuickAppend(memberId, { wantsOut: true, ...(payload || {}) });
      // poll until authoritative TimeOut appears (or timeout)
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const checkFn = (rowsArr) => {
        try {
          return (rowsArr || []).some(r => {
            const pid = String(r?.MemberID || r?.member_id || r?.id || r?.member || "").trim();
            if (!pid || pid !== memberId) return false;
            const dateRaw = r.Date || r.date || r.Timestamp || r.timestamp || '';
            const ymd = dateRaw ? new Date(dateRaw).toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '';
            if (ymd !== today) return false;
            const tout = String(r?.TimeOut || r?.timeout || r?.time_out || '').trim();
            return !!tout && tout !== '-' && tout !== '—';
          });
        } catch (e) { return false; }
      };
      let confirmed = false;
      for (let i = 0; i < 8; i++) {
        try {
          const gymRes = await fetchGymEntriesFresh();
          const arr = gymRes?.rows || gymRes?.data || [];
          setGymEntries(arr);
          if (checkFn(arr)) { confirmed = true; break; }
        } catch (e) {}
        await wait(300);
      }
      if (!confirmed) {
        // final authoritative reload (no-cache)
        const gymRes = await fetchGymEntriesFresh();
        setGymEntries(gymRes?.rows || gymRes?.data || []);
      }
    } catch (e) {
      console.error('checkout failed', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Parent-level request from VisitViewModal to open the Confirm Checkout popup.
  const requestCheckoutPopup = (entry) => {
    if (!entry) return;
    const memberId = String(entry.MemberID || entry.member_id || entry.id || entry.member || "").trim();
    if (!memberId) return;
    setCheckoutMemberId(memberId);
    setCheckoutInitialEntry(entry || null);
    setShowCheckoutModal(true);
    // close the visit modal (selected entry) since the popup will handle the confirm
    setSelectedEntry(null);
  };

  return (
    <div className="dashboard-content">
      <h2 className="dashboard-title">Daily Dashboard <RefreshBadge show={isRefreshing && !loading} /></h2>
        <div className="dashboard-grid-3x3">
          {/* First row */}
          <div className="dashboard-card"><div className="dashboard-label">Total Members</div><div className="dashboard-value magenta">{stats.totalMembers}</div></div>
          <div className="dashboard-card"><div className="dashboard-label">Active Gym Memberships</div><div className="dashboard-value magenta">{stats.activeGym}</div></div>
          <div className="dashboard-card"><div className="dashboard-label">Active Coach Subscriptions</div><div className="dashboard-value magenta">{stats.activeCoach}</div></div>
          {/* Second row */}
          <div className="dashboard-card"><div className="dashboard-label">Member Visits</div><div className="dashboard-value magenta">{stats.visitedToday}</div></div>
          <div className="dashboard-card"><div className="dashboard-label">Coaching Sessions</div><div className="dashboard-value magenta">{stats.coachToday}</div></div>
          <div className="dashboard-card"><div className="dashboard-label">Currently Checked-In</div><div className="dashboard-value magenta">{stats.checkedIn}</div></div>
          {/* Third row */}
          <div className="dashboard-card"><div className="dashboard-label">Cash Revenue</div><div className="dashboard-value magenta">₱ {stats.cashToday.toLocaleString()}</div></div>
          <div className="dashboard-card"><div className="dashboard-label">GCash Revenue</div><div className="dashboard-value magenta">₱ {stats.gcashToday.toLocaleString()}</div></div>
          <div className="dashboard-card"><div className="dashboard-label">Total Revenue</div><div className="dashboard-value magenta">₱ { (stats.totalPaymentsToday || 0).toLocaleString() }</div></div>
        </div>
        {/* Gym Entries Table */}
        <div style={{marginTop:24}} className="panel">
          <div className="panel-header">Gym Entries Today</div>
          <table className="aligned">
            <thead>
              <tr>
                <th>Nick Name</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th>Total Hours</th>
                <th>Coach</th>
                <th>Focus</th>
              </tr>
            </thead>
            <tbody>
              {gymEntryRows}
            </tbody>
          </table>
        </div>
        {/* Visit detail modal */}
        <VisitViewModal
          open={!!selectedEntry}
          onClose={() => setSelectedEntry(null)}
          row={selectedEntry}
          onCheckout={(entry) => requestCheckoutPopup(entry)}
        />

        <CheckInConfirmModal
          open={showCheckoutModal}
          memberId={checkoutMemberId}
          initialEntry={checkoutInitialEntry}
          onClose={() => { setShowCheckoutModal(false); setCheckoutMemberId(null); setCheckoutInitialEntry(null); }}
          onSuccess={async () => {
            // The modal already performed the server update (upsert/quick append).
            // Avoid calling the checkout endpoint again to prevent duplicate appends.
            // Just fetch authoritative rows and refresh the dashboard view.
            try {
              const gymRes = await fetchGymEntriesFresh();
              setGymEntries(gymRes?.rows || gymRes?.data || []);
            } catch (e) { console.error(e); }
            setShowCheckoutModal(false);
            setCheckoutMemberId(null);
            setCheckoutInitialEntry(null);
          }}
        />
        {/* Payments Today Table */}
        <div style={{marginTop:24}} className="panel">
          <div className="panel-header">Payments Today</div>
          <table className="aligned">
            <thead>
              <tr>
                <th>Nick Name</th>
                <th>Particulars</th>
                <th>Gym Membership<br/>Valid Until</th>
                <th>Coach Subscription<br/>Valid Until</th>
                <th>Mode</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {paymentRows}
            </tbody>
          </table>
        </div>
        {loading && <div style={{marginTop:24}}>Loading…</div>}
      </div>
  );
}
