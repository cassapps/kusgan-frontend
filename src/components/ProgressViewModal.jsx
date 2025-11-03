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
  const date = pick(r, ["Date","date","recorded","log_date","timestamp"]);
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

        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12 }}>
          <div className="field"><span className="label">Date</span><input readOnly value={date||""} /></div>
          <div className="field"><span className="label">No.</span><input readOnly value={no||""} /></div>
          <div className="field"><span className="label">Weight</span><input readOnly value={weight||""} /></div>
          <div className="field"><span className="label">BMI</span><input readOnly value={bmi||""} /></div>
          <div className="field"><span className="label">Muscle Mass</span><input readOnly value={muscle||""} /></div>
          <div className="field"><span className="label">Body Fat</span><input readOnly value={bodyfat||""} /></div>
          <div className="field"><span className="label">Visceral Fat</span><input readOnly value={visceral||""} /></div>
          <div className="field"><span className="label">Chest</span><input readOnly value={chest||""} /></div>
          <div className="field"><span className="label">Waist</span><input readOnly value={waist||""} /></div>
          <div className="field"><span className="label">Hips</span><input readOnly value={hips||""} /></div>
          <div className="field"><span className="label">Shoulders</span><input readOnly value={shoulders||""} /></div>
          <div className="field"><span className="label">Arms</span><input readOnly value={arms||""} /></div>
          <div className="field"><span className="label">Forearms</span><input readOnly value={forearms||""} /></div>
          <div className="field"><span className="label">Thighs</span><input readOnly value={thighs||""} /></div>
          <div className="field"><span className="label">Calves</span><input readOnly value={calves||""} /></div>
          <div className="field"><span className="label">Blood Pressure</span><input readOnly value={bp||""} /></div>
          <div className="field"><span className="label">Resting Heart Rate</span><input readOnly value={rhr||""} /></div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <span className="label">Comments</span>
          <textarea readOnly rows={3} value={comments||""} style={{ width: "100%", borderRadius: 8, border: "1px solid #e5e7eb", padding: 10, fontFamily: "inherit" }} />
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
