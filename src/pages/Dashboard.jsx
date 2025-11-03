
import { useEffect, useState } from "react";
import { fetchMembers, fetchPayments, fetchGymEntries, fetchPricing } from "../api/sheets";
import { fmtTime, fmtDate, display } from "./MemberDetail.jsx";

function todayYMD() {
  const now = new Date();
  return now.toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function Dashboard() {
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
  const [members, setMembers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [gymEntries, setGymEntries] = useState([]);
  const [pricing, setPricing] = useState([]);

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
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

      // Helper: compute status for each member
      function computeStatus(payments, memberId, pricingRows) {
        const today = new Date();
        let membershipEnd = null, coachEnd = null;
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
          const p = Object.fromEntries(Object.entries(raw||{}).map(([k,v])=>[String(k||"").toLowerCase().replace(/\s+/g,""), v]));
          const pid = String(p.memberid||p.member_id||p.member_id_||p.id||"").trim().toLowerCase();
          if (!pid || pid !== memberId.toLowerCase()) continue;
          const tag = String(p.particulars||p.type||p.item||p.category||p.product||p.paymentfor||p.plan||p.description||"").trim();
          const gymUntil = p.gymvaliduntil || p.gym_valid_until || p.gym_until;
          const coachUntil = p.coachvaliduntil || p.coach_valid_until || p.coach_until;
          const end = p.enddate || p.end_date || p.valid_until || p.expiry || p.expires || p.until || p.end;
          const g = gymUntil ? new Date(gymUntil) : (end ? new Date(end) : null);
          const c = coachUntil ? new Date(coachUntil) : (end ? new Date(end) : null);
          const flags = map.get(tag.toLowerCase()) || { gym: null, coach: null };
          if (g && (flags.gym === true || (flags.gym === null && /member|gym/i.test(tag)))) membershipEnd = !membershipEnd || g > membershipEnd ? g : membershipEnd;
          if (c && (flags.coach === true || (flags.coach === null && /coach|trainer|pt/i.test(tag)))) coachEnd = !coachEnd || c > coachEnd ? c : coachEnd;
        }
        return {
          membershipEnd,
          membershipState: membershipEnd == null ? null : (membershipEnd >= today ? "active" : "expired"),
          coachEnd,
          coachActive: !!(coachEnd && coachEnd >= today),
        };
      }

      // Top row: member stats
      const totalMembers = members.length;
      let activeGym = 0, activeCoach = 0;
      members.forEach(m => {
        const id = m.MemberID || m.member_id || m.id;
        const pay = payments.filter(p => String(p.MemberID||p.member_id||p.id||"").trim() === String(id).trim());
        const status = computeStatus(pay, id, pricing);
        if (status.membershipState === "active") activeGym++;
        if (status.coachActive) activeCoach++;
      });

      // Second row: visits today
      const today = todayYMD();
      const visitsToday = gymEntries.filter(e => {
        const d = e.Date || e.date;
        if (!d) return false;
        const ymd = new Date(d);
        const s = ymd.toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
        return s === today;
      });
      const uniqueVisited = new Set(visitsToday.map(e => e.MemberID || e.member_id || e.id));
      const visitedToday = uniqueVisited.size;

      // Coach subset: visited today and have active coach
      const coachToday = Array.from(uniqueVisited).filter(id => {
        const m = members.find(m => (m.MemberID || m.member_id || m.id) === id);
        if (!m) return false;
        const pay = payments.filter(p => String(p.MemberID||p.member_id||p.id||"").trim() === String(id).trim());
        const status = computeStatus(pay, id, pricing);
        return status.coachActive;
      }).length;

      // Currently checked-in: open entry today (TimeOut empty)
      const checkedIn = visitsToday.filter(e => !String(e.TimeOut||e.timeout||"").trim()).length;

      // Third row: revenue today
      const cashToday = payments.filter(p => {
        const d = p.Date || p.date || p.pay_date;
        if (!d) return false;
        const ymd = new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
        return ymd === today && String(p.Mode||p.mode||p.method||"").toLowerCase() === "cash";
      }).reduce((sum, p) => sum + (parseFloat(p.Cost||p.amount||0) || 0), 0);
      const gcashToday = payments.filter(p => {
        const d = p.Date || p.date || p.pay_date;
        if (!d) return false;
        const ymd = new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
        return ymd === today && String(p.Mode||p.mode||p.method||"").toLowerCase() === "gcash";
      }).reduce((sum, p) => sum + (parseFloat(p.Cost||p.amount||0) || 0), 0);

      // Total payments today (all modes)
      const totalPaymentsToday = payments.filter(p => {
        const d = p.Date || p.date || p.pay_date;
        if (!d) return false;
        const ymd = new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" });
        return ymd === today;
      }).reduce((sum, p) => sum + (parseFloat(p.Cost||p.amount||0) || 0), 0);

      setStats({
        totalMembers,
        activeGym,
        activeCoach,
        visitedToday,
        coachToday,
        checkedIn,
        cashToday,
        gcashToday,
        totalPaymentsToday,
      });
      setLoading(false);
    }
    loadStats();
  }, []);

  return (
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

  {/* Members Currently Checked-In Table (source: GymEntries sheet) */}
      <div style={{marginTop:48}}>
        <h3 style={{marginBottom:16}}>Members Currently Checked-In</h3>
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
            {gymEntries && gymEntries.filter(e => {
              const d = e.Date || e.date;
              const ymd = d ? new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
              return ymd === todayYMD() && !String(e.TimeOut||e.timeout||"").trim();
            }).map((e, idx) => {
              // find member row from Members sheet (by common id keys)
              const member = members.find(m => {
                const mid = String(e.MemberID || e.member_id || e.id || "").trim();
                if (!mid) return false;
                return String(m.MemberID || m.member_id || m.id || "").trim() === mid;
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
                <tr key={idx}>
                  <td>{member?.NickName || member?.Nickname || member?.nickname || member?.name || (member?.FirstName ? `${member.FirstName} ${member.LastName || ""}` : "") || ""}</td>
                  <td>{fmtTime(timeIn)}</td>
                  <td>{fmtTime(timeOut)}</td>
                  <td>{display(totalHours)}</td>
                  <td>{display(e.Coach || e.coach)}</td>
                  <td>{display(e.Focus || e.focus)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Payments Today Table (source: Payments sheet) */}
      <div style={{marginTop:24}}>
  <h3 style={{marginBottom:16}}>Payments Today</h3>
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
            {payments && payments.filter(p => {
              const d = p.Date || p.date || p.pay_date;
              const ymd = d ? new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
              return ymd === todayYMD();
            }).map((p, idx) => {
              // map payment to member (Payments sheet)
              const member = members.find(m => {
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
            })}
          </tbody>
        </table>
      </div>

      {loading && <div style={{marginTop:24}}>Loading…</div>}
    </div>
  );
}
