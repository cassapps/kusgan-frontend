import React from "react";

// Minimal helpers copied from MemberDetail
const driveId = (u="") => {
  const m = String(u||"").match(/(?:\/file\/d\/|[?&]id=|\/uc\?[^#]*id=)([^\/&#?]+)/);
  return m && m[1] ? m[1] : "";
};
const driveThumb = (u="") => {
  const s = String(u||"");
  if (/googleusercontent\.com\//.test(s)) return s;
  const id = driveId(s);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1000` : s;
};

const pick = (o, keys=[]) => {
  if (!o) return "";
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(o, k)) return o[k];
    const alt = Object.keys(o).find(kk => kk.toLowerCase().replace(/\s+/g, "") === k.toLowerCase().replace(/\s+/g, ""));
    if (alt) return o[alt];
  }
  return "";
};

export default function ProgressViewModal({ open, onClose, row }){
  if (!open) return null;
  const r = row || {};
  const memberId = pick(r, ["MemberID","memberid","member_id","id"]);
  const dateRaw = pick(r, ["Date","date","recorded","log_date","timestamp"]);
  const no = pick(r, ["No","no","entry_no","seq","number"]);
  const weight = pick(r, ["Weight (lbs)","Weight(lbs)","Weight","Weight_lbs","weight","weight_lbs","weight_(lbs)"]);
  const bmi = pick(r, ["BMI","bmi"]);
  const muscle = pick(r, ["MuscleMass","muscle_mass","muscle","Muscle"]);
  const bodyfat = pick(r, ["BodyFat","body_fat","bf"]);
  const visceral = pick(r, ["VisceralFat","visceral_fat"]);
  const chest = pick(r, ["Chest"]);
  const waist = pick(r, ["Waist"]);
  const hips = pick(r, ["Hips"]);
  const shoulders = pick(r, ["Shoulders"]);
  const arms = pick(r, ["Arms"]);
  const forearms = pick(r, ["Forearms"]);
  const thighs = pick(r, ["Thighs"]);
  const calves = pick(r, ["Calves"]);
  const bp = pick(r, ["BloodPressure","blood_pressure"]);
  const rhr = pick(r, ["RestingHeart Rate","RestingHeartRate","resting_heart_rate"]);
  const comments = pick(r, ["Comments","comments","notes"]);
  const p1 = pick(r, ["Photo1URL","Photo1","photo1","photo_url","photo"]);
  const p2 = pick(r, ["Photo2URL","Photo2","photo2"]);
  const p3 = pick(r, ["Photo3URL","Photo3","photo3"]);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 }}>
      <div style={{ width: "min(900px, 96vw)", maxHeight: "92vh", overflow: "auto", background: "#fff", borderRadius: 14, padding: 16, border: "1px solid var(--light-border)", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
          <div style={{ fontWeight:800, fontSize:18 }}>Progress Details</div>
          <button type="button" className="button" onClick={onClose} style={{ background: "#eee", color: "#333" }}>✕</button>
        </div>

        {/* Top info row matching Progress entry: Member ID, Date, No. */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Member ID</div>
            <div style={{ fontWeight: 700 }}>{memberId || "-"}</div>
          </div>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Date</div>
            <div style={{ fontWeight: 700 }}>{formatPH(dateRaw) || "-"}</div>
          </div>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>No.</div>
            <div style={{ fontWeight: 700 }}>{no || "-"}</div>
          </div>
        </div>

        {/* Read-only boxes for all remaining fields (uniform scheme) */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12 }}>
          {[
            ["Weight", weight],["BMI", bmi],["Muscle Mass", muscle],
            ["Body Fat", bodyfat],["Visceral Fat", visceral],["Chest", chest],
            ["Waist", waist],["Hips", hips],["Shoulders", shoulders],
            ["Arms", arms],["Forearms", forearms],["Thighs", thighs],
            ["Calves", calves],["Blood Pressure", bp],["Resting Heart Rate", rhr],
          ].map(([label, val]) => (
            <div key={label}>
              <div className="label" style={{ marginBottom: 6 }}>{label}</div>
              <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, fontWeight: 700 }}>
                {(!val || String(val).trim() === "0") ? "-" : String(val)}
              </div>
            </div>
          ))}
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <span className="label">Comments</span>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, fontSize: 16, minHeight: 72 }}>
            {comments ? String(comments) : "-"}
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12, marginTop:12 }}>
          {[p1,p2,p3].map((u, i) => (
            <div key={i} style={{ position:"relative" }}>
              <div style={{ position:"relative", width:"100%", height:0, paddingTop:"133.333%", borderRadius:8, border: u?"1px solid #e5e7eb":"1px dashed #e5e7eb", overflow:"hidden" }}>
                {u ? (
                  <img src={driveThumb(u)} alt={`Photo ${i+1}`} style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
                ) : (
                  <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", color:"#999" }}>No photo</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Format a Date, ISO string, or yyyy-mm-dd as "Mon-D, YYYY" in Asia/Manila
const MANILA_TZ = "Asia/Manila";
function formatPH(dOrYmd){
  if (!dOrYmd) return "";
  let date;
  if (typeof dOrYmd === "string"){
    // Accept ISO or yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(dOrYmd)){
      const [y,m,d] = dOrYmd.split("-").map(Number);
      date = new Date(Date.UTC(y, m-1, d));
    } else {
      const parsed = new Date(dOrYmd);
      if (!isNaN(parsed)) date = parsed;
    }
  } else if (dOrYmd instanceof Date) {
    date = dOrYmd;
  }
  if (!date || isNaN(date)) return String(dOrYmd);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: MANILA_TZ, month: "short", day: "numeric", year: "numeric" }).formatToParts(date);
  const m = parts.find(p=>p.type==="month")?.value || "";
  const day = parts.find(p=>p.type==="day")?.value || "";
  const y = parts.find(p=>p.type==="year")?.value || "";
  return `${m}-${day}, ${y}`;
}
