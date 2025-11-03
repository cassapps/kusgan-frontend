import React, { useEffect, useMemo, useState } from "react";
import CameraModal from "./CameraModal";
import { addProgressRow, uploadMemberPhoto } from "../api/sheets";

// Manila timezone helpers
const MANILA_TZ = "Asia/Manila";
const manilaTodayYMD = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const displayManila = (dOrYmd) => {
  if (!dOrYmd) return "-";
  let date;
  if (typeof dOrYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dOrYmd)) {
    const [y, m, d] = dOrYmd.split("-").map(Number);
    date = new Date(Date.UTC(y, m - 1, d));
  } else {
    date = dOrYmd instanceof Date ? dOrYmd : new Date(dOrYmd);
  }
  if (isNaN(date)) return "-";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: MANILA_TZ, month: "short", day: "numeric", year: "numeric" }).formatToParts(date);
  const m = parts.find((p) => p.type === "month")?.value || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  const y = parts.find((p) => p.type === "year")?.value || "";
  return `${m}-${day}, ${y}`;
};

// Inclusive day count: MemberSince is Day 1
function inclusiveDayNo(memberSinceYMD, todayYMD) {
  if (!memberSinceYMD || !todayYMD) return 1;
  const [y1, m1, d1] = memberSinceYMD.split("-").map(Number);
  const [y2, m2, d2] = todayYMD.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  const diffDays = Math.floor((b - a) / 86400000);
  return Math.max(1, diffDays + 1);
}

function dataUrlToFile(dataUrl, filename = `photo-${Date.now()}.jpg`) {
  try {
    const arr = dataUrl.split(",");
    const mime = (arr[0].match(/:(.*?);/)?.[1]) || "image/jpeg";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    return new File([u8], filename, { type: mime });
  } catch {
    return null;
  }
}

export default function ProgressModal({ open, onClose, memberId, memberSinceYMD, onSaved }) {
  const today = manilaTodayYMD();
  const dayNo = useMemo(() => inclusiveDayNo(memberSinceYMD, today), [memberSinceYMD, today]);

  // Form values (use metric UI as commonly used in PH: kg & cm)
  const [kg, setKg] = useState(0);
  const [cm, setCm] = useState(0);
  const [muscle, setMuscle] = useState(0);
  const [bodyFat, setBodyFat] = useState(0);
  const [visceralFat, setVisceralFat] = useState(0);
  const [chest, setChest] = useState(0);
  const [waist, setWaist] = useState(0);
  const [hips, setHips] = useState(0);
  const [shoulders, setShoulders] = useState(0);
  const [arms, setArms] = useState(0);
  const [forearms, setForearms] = useState(0);
  const [thighs, setThighs] = useState(0);
  const [calves, setCalves] = useState(0);
  const [bp, setBp] = useState("");
  const [rhr, setRhr] = useState("");
  const [comments, setComments] = useState("");

  // Photos
  const [photo1, setPhoto1] = useState("");
  const [photo2, setPhoto2] = useState("");
  const [photo3, setPhoto3] = useState("");
  const [camFor, setCamFor] = useState(null); // 1 | 2 | 3

  // Derived
  const bmi = useMemo(() => {
    const w = Number(kg) || 0;
    const hM = (Number(cm) || 0) / 100;
    if (!w || !hM) return 0;
    return Math.round((w / (hM * hM)) * 10) / 10; // one decimal
  }, [kg, cm]);

  const lbs = useMemo(() => Math.round((Number(kg) || 0) * 2.20462262185 * 10) / 10, [kg]);
  const inches = useMemo(() => Math.round(((Number(cm) || 0) / 2.54) * 10) / 10, [cm]);

  useEffect(() => {
    if (!open) return;
    // reset when opened
    setKg(0); setCm(0); setMuscle(0); setBodyFat(0); setVisceralFat(0);
    setChest(0); setWaist(0); setHips(0); setShoulders(0);
    setArms(0); setForearms(0); setThighs(0); setCalves(0);
    setBp(""); setRhr(""); setComments("");
    setPhoto1(""); setPhoto2(""); setPhoto3("");
  }, [open]);

  const onCapture = async (dataUrl) => {
    try {
      const file = dataUrlToFile(dataUrl, `progress-${Date.now()}.jpg`);
      if (!file) return;
      const baseId = String(memberId || "").toLowerCase();
      const res = await uploadMemberPhoto(file, baseId);
      const url = typeof res === "string" ? res : (res?.url || "");
      if (camFor === 1) setPhoto1(url);
      if (camFor === 2) setPhoto2(url);
      if (camFor === 3) setPhoto3(url);
    } finally {
      setCamFor(null);
    }
  };

  const save = async (e) => {
    e?.preventDefault?.();
    if (!memberId) return;
    const row = {
      MemberID: memberId,
      Date: today,
      No: `Day ${dayNo}`,
      "Weight (lbs)": lbs ? String(lbs) : "",
      BMI: bmi ? String(bmi) : "",
      MuscleMass: muscle ? String(muscle) : "",
      BodyFat: bodyFat ? String(bodyFat) : "",
      VisceralFat: visceralFat ? String(visceralFat) : "",
      Photo1URL: photo1,
      Photo2URL: photo2,
      Photo3URL: photo3,
      "Height (inches)": inches ? String(inches) : "",
      Chest: chest ? String(chest) : "",
      Waist: waist ? String(waist) : "",
      Hips: hips ? String(hips) : "",
      Shoulders: shoulders ? String(shoulders) : "",
      Arms: arms ? String(arms) : "",
      Forearms: forearms ? String(forearms) : "",
      Thighs: thighs ? String(thighs) : "",
      Calves: calves ? String(calves) : "",
      BloodPressure: bp,
      "RestingHeart Rate": rhr,
      Comments: comments,
    };
    await addProgressRow(row);
    onSaved?.();
    onClose?.();
  };

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <form onSubmit={save} style={{ width: "min(900px, 96vw)", maxHeight: "92vh", overflow: "auto", background: "#fff", borderRadius: 14, padding: 16, border: "1px solid var(--light-border)", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Progress Entry</div>
          <button type="button" className="button" onClick={onClose} style={{ background: "#eee", color: "#333" }}>✕</button>
        </div>

        {/* Auto info row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Member ID</div>
            <div style={{ fontWeight: 700 }}>{memberId}</div>
          </div>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Date (PH)</div>
            <div style={{ fontWeight: 700 }}>{displayManila(today)}</div>
          </div>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>No.</div>
            <div style={{ fontWeight: 700 }}>{`Day ${dayNo}`}</div>
          </div>
        </div>

        {/* Measurements (metric UI) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <label className="field"><span className="label">Weight (kg)</span><input type="number" step="0.1" min="0" value={kg} onChange={(e)=>setKg(e.target.value)} /></label>
          <label className="field"><span className="label">Height (cm)</span><input type="number" step="0.1" min="0" value={cm} onChange={(e)=>setCm(e.target.value)} /></label>
          <div className="field"><span className="label">BMI (auto)</span><input value={bmi || ""} readOnly /></div>

          <label className="field"><span className="label">Muscle Mass</span><input type="number" step="0.1" min="0" value={muscle} onChange={(e)=>setMuscle(e.target.value)} /></label>
          <label className="field"><span className="label">Body Fat (%)</span><input type="number" step="0.1" min="0" value={bodyFat} onChange={(e)=>setBodyFat(e.target.value)} /></label>
          <label className="field"><span className="label">Visceral Fat</span><input type="number" step="0.1" min="0" value={visceralFat} onChange={(e)=>setVisceralFat(e.target.value)} /></label>

          <label className="field"><span className="label">Chest (cm)</span><input type="number" step="0.1" min="0" value={chest} onChange={(e)=>setChest(e.target.value)} /></label>
          <label className="field"><span className="label">Waist (cm)</span><input type="number" step="0.1" min="0" value={waist} onChange={(e)=>setWaist(e.target.value)} /></label>
          <label className="field"><span className="label">Hips (cm)</span><input type="number" step="0.1" min="0" value={hips} onChange={(e)=>setHips(e.target.value)} /></label>

          <label className="field"><span className="label">Shoulders (cm)</span><input type="number" step="0.1" min="0" value={shoulders} onChange={(e)=>setShoulders(e.target.value)} /></label>
          <label className="field"><span className="label">Arms (cm)</span><input type="number" step="0.1" min="0" value={arms} onChange={(e)=>setArms(e.target.value)} /></label>
          <label className="field"><span className="label">Forearms (cm)</span><input type="number" step="0.1" min="0" value={forearms} onChange={(e)=>setForearms(e.target.value)} /></label>

          <label className="field"><span className="label">Thighs (cm)</span><input type="number" step="0.1" min="0" value={thighs} onChange={(e)=>setThighs(e.target.value)} /></label>
          <label className="field"><span className="label">Calves (cm)</span><input type="number" step="0.1" min="0" value={calves} onChange={(e)=>setCalves(e.target.value)} /></label>

          <label className="field"><span className="label">Blood Pressure</span><input placeholder="120/80" value={bp} onChange={(e)=>setBp(e.target.value)} /></label>
          <label className="field"><span className="label">Resting Heart Rate</span><input type="number" step="1" min="0" value={rhr} onChange={(e)=>setRhr(e.target.value)} /></label>
          <div />
        </div>

        {/* Photos row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 12 }}>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Photo 1</div>
            {photo1 ? (
              <img src={photo1} alt="Photo 1" style={{ width: "100%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
            ) : (
              <div style={{ width: "100%", aspectRatio: "3 / 4", border: "1px dashed #e5e7eb", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>No photo</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="button" className="button" onClick={()=>setCamFor(1)} style={{ flex: 1 }}>📷 Camera</button>
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Photo 2</div>
            {photo2 ? (
              <img src={photo2} alt="Photo 2" style={{ width: "100%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
            ) : (
              <div style={{ width: "100%", aspectRatio: "3 / 4", border: "1px dashed #e5e7eb", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>No photo</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="button" className="button" onClick={()=>setCamFor(2)} style={{ flex: 1 }}>📷 Camera</button>
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Photo 3</div>
            {photo3 ? (
              <img src={photo3} alt="Photo 3" style={{ width: "100%", aspectRatio: "3 / 4", objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb" }} />
            ) : (
              <div style={{ width: "100%", aspectRatio: "3 / 4", border: "1px dashed #e5e7eb", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>No photo</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="button" className="button" onClick={()=>setCamFor(3)} style={{ flex: 1 }}>📷 Camera</button>
            </div>
          </div>
        </div>

        {/* Comments */}
        <div className="field" style={{ marginTop: 12 }}>
          <span className="label">Comments</span>
          <textarea rows={3} value={comments} onChange={(e)=>setComments(e.target.value)} style={{ width: "100%", borderRadius: 8, border: "1px solid #e5e7eb", padding: 10, fontFamily: "inherit", resize: "vertical" }} />
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="back-btn" onClick={onClose} style={{ background: "#e5e7eb", color: "#111", fontWeight: 700 }}>Cancel</button>
          <button type="submit" className="primary-btn">💾 Save Progress</button>
        </div>

        <CameraModal open={!!camFor} onClose={()=>setCamFor(null)} onCapture={onCapture} />
      </form>
    </div>
  );
}
