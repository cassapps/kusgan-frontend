
import { useEffect, useState, useMemo } from "react";
import { fetchMembers, fetchPayments, fetchGymEntries, fetchPricing, fetchDashboard } from "../api/sheets";
import { fmtTime, fmtDate, display } from "./MemberDetail.jsx";
import VisitViewModal from "../components/VisitViewModal";
import events from "../lib/events";

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
  const [showLoadingToast, setShowLoadingToast] = useState(false);
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [gymEntries, setGymEntries] = useState([]);
  const [pricing, setPricing] = useState([]);
  const [showAllGym, setShowAllGym] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);

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
    let totalHours = "";
    if (timeIn && timeOut) {
      const t1 = new Date(`${todayYMD()}T${timeIn}`);
      const t2 = new Date(`${todayYMD()}T${timeOut}`);
      totalHours = ((t2-t1)/1000/60/60).toFixed(2);
    }
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
      setShowLoadingToast(true);
  // Try server-side aggregate first for fastest dashboard render
      try {
        const dashRes = await fetchDashboard();
        if (dashRes && dashRes.ok) {
          const { totalMembers=0, activeGym=0, activeCoach=0, visitedToday=0, coachToday=0, checkedIn=0, cashToday=0, gcashToday=0, totalPaymentsToday=0 } = dashRes;
          setStats({ totalMembers, activeGym, activeCoach, visitedToday, coachToday, checkedIn, cashToday, gcashToday, totalPaymentsToday });
          setLoading(false);
          setShowLoadingToast(false);
          // Still fetch full data for tables in background (non-blocking)
          (async () => {
            try {
              const [membersRes, paymentsRes, gymRes, pricingRes] = await Promise.all([
                fetchMembers(), fetchPayments(), fetchGymEntries(), fetchPricing()
              ]);
              setMembers(membersRes?.rows || membersRes?.data || []);
              setPayments(paymentsRes?.rows || paymentsRes?.data || []);
              setGymEntries(gymRes?.rows || gymRes?.data || []);
              setPricing(pricingRes?.rows || pricingRes?.data || []);
            } catch (_){}
          })();
          return;
        }
      } catch (e) {
        // ignore and fallback to client-side compute
      }

      // Fallback: fetch full data and compute client-side (already optimized)
      // Fetch in parallel (cached GETs will help)
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
          return { membershipEnd, membershipState: membershipEnd == null ? null : (membershipEnd >= today ? 'active' : 'expired'), coachEnd, coachActive: !!(coachEnd && coachEnd >= today) };
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
        const uniqueVisited = new Set(visitsToday.map(e => String(e.MemberID || e.member_id || e.id || "").trim()).filter(Boolean));
        const visitedToday = uniqueVisited.size;

        // Coach subset from uniqueVisited, use paymentsByMember map
        let coachToday = 0;
        for (const id of uniqueVisited) {
          const pays = paymentsByMember.get(id) || [];
          const st = computeStatusForMember(pays);
          if (st.coachActive) coachToday++;
        }

        const checkedIn = visitsToday.filter(e => !String(e.TimeOut || e.timeout || "").trim()).length;

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
    }
    loadStats();
    // subscribe to gym entry adds so the Dashboard can refresh quickly
    const unsub = events.on('gymEntry:added', async (entry) => {
      try {
        const gymRes = await fetchGymEntries();
        setGymEntries(gymRes?.rows || gymRes?.data || []);
      } catch (e) {}
    });
    const unsub2 = events.on('member:updated', async () => {
      try { const membersRes = await fetchMembers(); setMembers(membersRes?.rows || membersRes?.data || []); } catch (e) {}
    });
    return () => { unsub(); unsub2(); };
  }, []);

  return (
    <>
      {showLoadingToast && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, background: '#2563eb', color: '#fff', padding: '10px 0', textAlign: 'center', fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
          Loading dashboard data, please wait...
        </div>
      )}
      <div className="dashboard-content">
        <h2 className="dashboard-title">Daily Dashboard</h2>
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
        <VisitViewModal open={!!selectedEntry} onClose={() => setSelectedEntry(null)} row={selectedEntry} />
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
    </>
  );
}
