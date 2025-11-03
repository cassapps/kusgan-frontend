import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import QrScanModal from "../components/QrScanModal";
import { fetchMemberBundle, fetchPricing, fetchMembers, gymClockIn, gymClockOut } from "../api/sheets";

// Helper copied to keep page self-contained
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

  const idLower = String(memberId||"").trim().toLowerCase();
  for (const raw of payments) {
    const p = Object.fromEntries(Object.entries(raw||{}).map(([k,v])=>[String(k||"").toLowerCase().replace(/\s+/g,""), v]));
    const pid = String(p.memberid||p.member_id||p.member_id_||p.id||"").trim().toLowerCase();
    if (!pid || pid !== idLower) continue;
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

const FOCUSES = ["Full body", "Upper body", "Lower body", "Chest", "Other"];
const COACHES = ["Coach Jojo", "Coach Elmer"];

// Drive helpers (normalize and prefer thumbnail endpoint for <img>)
const driveId = (u) => {
  const s = String(u || "");
  const m = s.match(/(?:\/file\/d\/|[?&]id=|\/uc\?[^#]*id=)([^/&?#]+)/);
  return m && m[1] ? m[1] : "";
};
const driveImg = (u) => {
  const s = String(u || "");
  if (!s) return "";
  const anyUrl = s.match(/https?:\/\/[^\s}]+/);
  if (anyUrl) {
    const direct = anyUrl[0];
    if (/googleusercontent\.com\//.test(direct)) return direct;
    const mid = direct.match(/(?:\/file\/d\/|[?&]id=|\/uc\?[^#]*id=)([^/&?#]+)/);
    if (mid && mid[1]) return `https://drive.google.com/uc?export=view&id=${mid[1]}`;
    return direct;
  }
  if (/googleusercontent\.com\//.test(s)) return s;
  const id = driveId(s);
  return id ? `https://drive.google.com/uc?export=view&id=${id}` : s;
};
const driveThumb = (u) => {
  const s = String(u || "");
  if (/googleusercontent\.com\//.test(s)) return s;
  const id = driveId(s);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1000` : s;
};

export default function CheckIn(){
  const [scannerOpen, setScannerOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [members, setMembers] = useState([]);
  const [bundle, setBundle] = useState(null);
  const [pricing, setPricing] = useState([]);
  const [status, setStatus] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [coach, setCoach] = useState("");
  const [focus, setFocus] = useState(FOCUSES[0]);
  const [resultText, setResultText] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [comments, setComments] = useState("");
  const [workouts, setWorkouts] = useState("");
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const toastTimeout = useRef(null);

  // Load members for dropdown
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Fetch all members, payments, and pricing
        const [memRes, payRes, priceRes] = await Promise.all([
          fetchMembers(),
          import("../api/sheets").then(m => m.fetchPayments()),
          import("../api/sheets").then(m => m.fetchPricing()),
        ]);
        if (!alive) return;
        const members = (memRes?.rows || memRes?.data || []).slice();
        const payments = payRes?.rows || payRes?.data || [];
        const pricing = priceRes?.rows || priceRes?.data || [];
        // Only include members with active gym membership
        const filtered = members.filter(m => {
          const id = m.MemberID || m.member_id || m.id;
          const pay = payments.filter(p => String(p.MemberID||p.member_id||p.id||"").trim() === String(id).trim());
          const status = computeStatus(pay, id, pricing);
          return status.membershipState === "active";
        });
        filtered.sort((a,b)=>{
          const an = String(a.Nickname||a.NickName||a["Nick Name"]||"").toLowerCase();
          const bn = String(b.Nickname||b.NickName||b["Nick Name"]||"").toLowerCase();
          return an.localeCompare(bn);
        });
        setMembers(filtered);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { alive = false; };
  }, []);

  const loadData = async (id) => {
    const [b, p] = await Promise.all([fetchMemberBundle(id), fetchPricing()]);
    const rows = (p?.rows || p?.data || []);
    setBundle(b);
    setPricing(rows);
    const st = computeStatus(b.payments || [], id, rows);
    setStatus(st);
    return { b, rows, status: st };
  };

  const onDetected = async (raw) => {
    const id = String(raw||"").trim();
    if (!id) return;
    setMemberId(id);
    const loaded = await loadData(id);
    const r = loaded?.b?.member || null;
    const freshStatus = loaded?.status;
    const nick = r ? (r.NickName || r.Nickname || r["Nick Name"] || r.nick_name || r.nickname || "Member") : "Member";
    // Check membership status using freshly loaded status
    if (!r || freshStatus?.membershipState !== "active") {
      setResultText(null);
      setConfirmOpen(true);
      setTimeout(() => {
        setResultText("NO ACTIVE GYM MEMBERSHIP");
      }, 100);
      return;
    }
    // Determine if there's an open entry today (use freshly loaded bundle)
    const todayYMD = new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
    const todays = (loaded?.b?.gymEntries || []).filter(r => {
      const d = r?.Date || r?.date; if (!d) return false; const ymd = new Date(d); const s = new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(ymd); return s === todayYMD; });
    const open = todays.find(r => !String(r?.TimeOut||"").trim());
    if (open){
      setIsCheckedIn(true);
      setResultText("");
      setConfirmOpen(true); // show card to confirm check-out
    } else {
      setIsCheckedIn(false);
      setResultText("");
      setConfirmOpen(true); // show card to confirm check-in + options
    }
  };

  const confirmCheckIn = async () => {
    await gymClockIn(memberId, {
      Coach: status?.coachActive ? coach : undefined,
      Focus: status?.coachActive ? focus : undefined,
      Comments: comments
    });
    const timeStr = new Intl.DateTimeFormat('en-US', { timeZone: MANILA_TZ, month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }).format(new Date());
    const name = m?.nick || 'Member';
    setResultText(`${name} checked in on ${timeStr}.`);
    setShowToast(true);
    setConfirmOpen(false);
    setComments("");
    setWorkouts("");
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => {
      setShowToast(false);
      setResultText("");
    }, 3500);

  };

  const confirmCheckOut = async () => {
    await gymClockOut(memberId, {
      Workouts: workouts
    });
    const timeStr = new Intl.DateTimeFormat('en-US', { timeZone: MANILA_TZ, month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }).format(new Date());
    const name = m?.nick || 'Member';
    setResultText(`${name} checked out on ${timeStr}.`);
    setShowToast(true);
    setConfirmOpen(false);
    setWorkouts("");
    setComments("");
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => {
      setShowToast(false);
      setResultText("");
    }, 3500);
  };

  const m = useMemo(()=>{
    const r = bundle?.member || null;
    if (!r) return null;
    const get = (keys) => keys.map(k=>r[k]).find(v=>v!==undefined && v!=="");
    const first = get(["FirstName","First","first"]);
    const last = get(["LastName","Last","last"]);
    const nick = get(["NickName","Nickname","Nick Name","nick_name","nickname"]);
    const rawPhoto = get(["PhotoURL","Photo","photo","photo_url"]);
    const photo = driveThumb(driveImg(rawPhoto));
    const memberSince = r.MemberSince || r["Member Since"] || r.Joined || r["Join Date"] || r["join_date"];
    return { first, last, nick, photo, memberSince };
  }, [bundle]);

  return (
    <div className="content">
      <h2>Member Check-In</h2>

      {/* Unified card container for a less bare layout */}
      <div className="card" style={{ marginTop: 8, marginBottom: 12, maxWidth: 480, minHeight: 600, marginLeft:'auto', marginRight:'auto', padding:16, border:'2px solid #d7d9e5', background:'#fff', boxShadow:'0 10px 24px rgba(0,0,0,.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:12, alignItems:'center', width:'100%' }}>
          {/* Top-centered logo to make the card less bare */}
          <img
            src={`${import.meta.env.BASE_URL}favicon.png`}
            onError={(e)=>{ try { e.currentTarget.onerror = null; e.currentTarget.src = `${import.meta.env.BASE_URL}kusgan-logo.png`; } catch(_){} }}
            alt="Kusgan logo"
            style={{ width:250, height:250, objectFit:'contain', opacity:1, marginBottom:8 }}
          />
          <div style={{ maxWidth: 420, width:'100%', margin:'0 auto' }}>
            <button className="primary-btn" style={{ fontSize: '1.1rem', height: 54, width:'100%' }} onClick={()=>setScannerOpen(true)}>
              ▣ Scan QR Code
            </button>
          </div>
          <div style={{ color:'#666', textAlign:'center', marginTop:24 }}>or select a member below</div>
          <div style={{ maxWidth: 420, width:'100%', margin:'0 auto' }}>
            <select value={memberId} onChange={e=>setMemberId(e.target.value)} style={{ width:'100%', height:44, padding:'8px 12px', border:'1px solid #e7e8ef', borderRadius:10 }}>
              <option value="">Select member…</option>
              {members.map(m => (
                <option key={m.MemberID} value={m.MemberID}>
                  {(m.Nickname||m.NickName||m["Nick Name"]||"Member")} — {(m.FirstName||m.First||"")} {(m.LastName||m.Last||"")}
                </option>
              ))}
            </select>
          </div>
          <div style={{ maxWidth: 420, width:'100%', margin:'0 auto' }}>
            <button className="primary-btn" style={{ fontSize: '1.1rem', height: 54, width:'100%' }} onClick={()=>{ if(memberId) onDetected(memberId); }}>
              Proceed
            </button>
          </div>
        </div>
      </div>

      <QrScanModal open={scannerOpen} onClose={()=>setScannerOpen(false)} onDetected={onDetected} />

      {confirmOpen && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', marginBottom:8 }}>
              <button className="button btn-lg" style={{ background:'#555' }} onClick={()=>{ setConfirmOpen(false); setResultText(""); }}>{resultText?"Close":"Cancel"}</button>
            </div>

            {resultText === "NO ACTIVE GYM MEMBERSHIP" ? (
              <div style={{ color:'#d6002a', fontWeight:900, fontSize:32, textAlign:'center', padding:'32px 0' }}>{resultText}</div>
            ) : m ? (
              <>
                {/* Top row: bigger photo + names */}
                <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:16, alignItems:'center' }}>
                  <div style={{ width:150, height:200, borderRadius:12, overflow:'hidden', border:'1px solid #e7e8ef', background:'#fafbff' }}>
                    {m.photo ? <img src={m.photo} alt="Member" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <div style={{ display:'flex', width:'100%', height:'100%', alignItems:'center', justifyContent:'center', color:'#999' }}>No Photo</div>}
                  </div>
                  <div>
                    <div style={{ fontWeight:900, fontSize:28, lineHeight:1.1 }}>{m.nick || '-'}</div>
                    <div style={{ fontWeight:700, fontSize:18, color:'#444', marginTop:4 }}>{[m.first,m.last].filter(Boolean).join(' ') || '-'}</div>
                    <div style={{ fontStyle:'italic', color:'#666', marginTop:8 }}>Member Since</div>
                    <div style={{ fontWeight:800, fontSize:16 }}>{fmtDate(m.memberSince)}</div>
                  </div>
                </div>

                {/* Status tiles (copy of Member Detail) */}
                <div className="status-tiles" style={{ marginTop:14 }}>
                  {(() => {
                    const memState = status?.membershipState == null ? 'none' : status.membershipState;
                    const coachState = status?.coachEnd ? (status.coachEnd >= new Date() ? 'active' : 'expired') : 'none';
                    return (
                      <>
                        <div className={`status-tile ${memState}`}>
                          <div className="title">Gym Membership</div>
                          <div style={{ marginBottom: 10 }}>
                            {memState === 'active' && <span className="pill ok">Active</span>}
                            {memState === 'expired' && <span className="pill bad">Expired</span>}
                            {memState === 'none' && <span className="pill" style={{ background:'#fff', color:'#555', borderColor:'#ddd' }}>None</span>}
                          </div>
                          <div className="label">Valid until</div>
                          <div className="value">{fmtDate(status?.membershipEnd)}</div>
                        </div>
                        <div className={`status-tile ${coachState}`}>
                          <div className="title">Coach Subscription</div>
                          <div style={{ marginBottom: 10 }}>
                            {coachState === 'active' && <span className="pill ok">Active</span>}
                            {coachState === 'expired' && <span className="pill bad">Expired</span>}
                            {coachState === 'none' && <span className="pill" style={{ background:'#fff', color:'#555', borderColor:'#ddd' }}>None</span>}
                          </div>
                          <div className="label">Valid until</div>
                          <div className="value">{fmtDate(status?.coachEnd)}</div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </>
            ) : <div>Loading…</div>}

            {!resultText && (
              <>
                {isCheckedIn ? (
                  <>
                    <div className="field" style={{ marginTop:16 }}>
                      <label className="label">Workouts Done</label>
                      <textarea value={workouts} onChange={e=>setWorkouts(e.target.value)} placeholder="Describe workouts done (optional)" style={{ width:'100%', minHeight:48, borderRadius:8, border:'1px solid #e7e8ef', padding:'8px 12px', fontSize:15, resize:'vertical' }} />
                    </div>
                    <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
                      <button className="primary-btn" onClick={confirmCheckOut}>Confirm Check-Out</button>
                    </div>
                  </>
                ) : (
                  <>
                    {status?.coachActive && (
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:14 }}>
                        <div className="field">
                          <label className="label">Coach</label>
                          <select value={coach} onChange={e=>setCoach(e.target.value)}>
                            <option value="">(Select)</option>
                            {COACHES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="field">
                          <label className="label">Workout Focus</label>
                          <select value={focus} onChange={e=>setFocus(e.target.value)}>
                            {FOCUSES.map(f => <option key={f} value={f}>{f}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                    <div className="field" style={{ marginTop:16 }}>
                      <label className="label">Comments</label>
                      <textarea value={comments} onChange={e=>setComments(e.target.value)} placeholder="Add comments (optional)" style={{ width:'100%', minHeight:48, borderRadius:8, border:'1px solid #e7e8ef', padding:'8px 12px', fontSize:15, resize:'vertical' }} />
                    </div>
                    <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
                      <button className="primary-btn" onClick={confirmCheckIn}>Confirm Check-In</button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast message for check-in */}
      {showToast && (
        <div style={{ position:'fixed', top:24, right:24, zIndex:2000, pointerEvents:'none' }}>
          <div style={{ background:'#333', color:'#fff', fontWeight:600, fontSize:16, borderRadius:8, boxShadow:'0 2px 12px rgba(0,0,0,.12)', padding:'10px 22px', minWidth:180, textAlign:'left', letterSpacing:0.1 }}>
            {resultText}
          </div>
        </div>
      )}
    </div>
  );
}

const overlayStyle = { position:'fixed', inset:0, background:'rgba(0,0,0,.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 };
const modalStyle = { width:'min(720px, 96vw)', background:'#fff', borderRadius:12, padding:16, border:'1px solid #e7e8ef', boxShadow:'0 6px 24px rgba(0,0,0,.2)' };
