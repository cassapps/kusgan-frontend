import React, { useEffect, useMemo, useState } from "react";
import CameraModal from "./CameraModal";
import ModalWrapper from "./ModalWrapper";
import events from "../lib/events";
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
  const [kg, setKg] = useState("");
  const [cm, setCm] = useState("");
  const [muscle, setMuscle] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [visceralFat, setVisceralFat] = useState("");
  const [chest, setChest] = useState("");
  const [waist, setWaist] = useState("");
  const [hips, setHips] = useState("");
  const [shoulders, setShoulders] = useState("");
  const [arms, setArms] = useState("");
  const [forearms, setForearms] = useState("");
  const [thighs, setThighs] = useState("");
  const [calves, setCalves] = useState("");
  const [bp, setBp] = useState("");
  const [rhr, setRhr] = useState("");
  const [comments, setComments] = useState("");

  // Photos (max 3)
  const [photos, setPhotos] = useState([]); // array of URLs at indices 0..2
  const [camOpen, setCamOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1); // which box is being filled/replaced
  const [err, setErr] = useState("");

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
  setKg(""); setCm(""); setMuscle(""); setBodyFat(""); setVisceralFat("");
  setChest(""); setWaist(""); setHips(""); setShoulders("");
  setArms(""); setForearms(""); setThighs(""); setCalves("");
    setBp(""); setRhr(""); setComments("");
    setPhotos([]);
    setActiveIdx(-1);
  }, [open]);

  const onCapture = async (dataUrl) => {
    try {
      const file = dataUrlToFile(dataUrl, `progress-${Date.now()}.jpg`);
      if (!file) return;
      const baseId = String(memberId || "").toLowerCase();
      const res = await uploadMemberPhoto(file, baseId);
      const url = typeof res === "string" ? res : (res?.url || "");
      setPhotos((prev) => {
        const next = Array.isArray(prev) ? [...prev] : [];
        // ensure we always have 3 slots for deterministic indices
        while (next.length < 3) next.push("");
        const idx = activeIdx >= 0 && activeIdx < 3 ? activeIdx : next.findIndex((x) => !x);
        if (idx === -1) return next; // already full
        next[idx] = url;
        return next;
      });
    } catch (e) {
      const msg = e?.message || 'Failed to upload photo';
      setErr(msg);
      try { events.emit('modal:error', { message: msg, source: 'ProgressModal', error: String(e) }); } catch (ee) {}
    } finally {
      setCamOpen(false);
      setActiveIdx(-1);
    }
  };

  const removePhoto = (idx) => {
    setPhotos((prev) => {
      const next = Array.isArray(prev) ? [...prev] : [];
      if (idx < 0 || idx >= 3) return next;
      if (next.length < 3) while (next.length < 3) next.push("");
      next[idx] = ""; // clear but keep slot
      return next;
    });
  };

  const openCameraFor = (idx) => {
    setActiveIdx(idx);
    setCamOpen(true);
  };

  const save = async (e) => {
    e?.preventDefault?.();
    if (!memberId) return;
    setErr("");
    const row = {
      MemberID: memberId,
      Date: today,
      No: `Day ${dayNo}`,
      // Write to multiple weight header variants to maximize compatibility
      "Weight (lbs)": lbs ? String(lbs) : "",
      "Weight(lbs)": lbs ? String(lbs) : "",
      Weight: lbs ? String(lbs) : "",
      Weight_lbs: lbs ? String(lbs) : "",
      BMI: bmi ? String(bmi) : "",
      MuscleMass: muscle ? String(muscle) : "",
      BodyFat: bodyFat ? String(bodyFat) : "",
      VisceralFat: visceralFat ? String(visceralFat) : "",
  Photo1URL: photos[0] || "",
  Photo2URL: photos[1] || "",
  Photo3URL: photos[2] || "",
      // Height variants
      "Height (inches)": inches ? String(inches) : "",
      "Height(inches)": inches ? String(inches) : "",
      Height_in: inches ? String(inches) : "",
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
    try {
      await addProgressRow(row);
      onSaved?.();
      onClose?.();
    } catch (e) {
      const msg = e?.message || 'Failed to save progress entry';
      setErr(msg);
      try { events.emit('modal:error', { message: msg, source: 'ProgressModal', error: String(e) }); } catch (ee) {}
    }
  };

  if (!open) return null;

  return (
    <ModalWrapper open={open} onClose={onClose} title="Progress Entry" width={900} noInternalScroll={true}>
      {err && <div className="small-error" style={{ marginBottom: 8 }}>{err}</div>}
  <form onSubmit={save} style={{ width: "100%", padding: 0, background: "transparent", border: "none", boxShadow: "none", overflow: "visible" }}>

        {/* Auto info row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Member ID</div>
            <div style={{ fontWeight: 700 }}>{memberId}</div>
          </div>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Date</div>
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
          {/* BMI read-only, but label styling same as other fields */}
          <div className="field">
            <span className="label">BMI</span>
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, fontWeight: 700 }}>
              {bmi || "-"}
            </div>
          </div>

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

        {/* Photos: 3 clickable boxes; each opens camera; previews sized reliably */}
        <div style={{ marginTop: 12 }}>
          <div className="label" style={{ marginBottom: 6 }}>Photos (max 3)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[0,1,2].map((i) => {
              const url = photos[i] || "";
              return (
                <div key={i} style={{ position: "relative" }}>
                  {/* Aspect ratio wrapper (3:4) works across Safari/Chrome */}
                  <div
                    onClick={() => openCameraFor(i)}
                    style={{
                      position: "relative",
                      width: "100%",
                      height: 0,
                      paddingTop: "133.333%",
                      borderRadius: 8,
                      border: url ? "1px solid #e5e7eb" : "1px dashed #e5e7eb",
                      cursor: "pointer",
                      overflow: "hidden",
                      background: url ? "#fff" : "#fafafa",
                    }}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={`Photo ${i+1}`}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>
                        Click to add
                      </div>
                    )}
                  </div>
                  {url && (
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() => removePhoto(i)}
                      style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,.55)", color: "#fff", borderRadius: 6, padding: "4px 6px", border: 0 }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Comments */}
        <div className="field" style={{ marginTop: 12 }}>
          <span className="label">Comments</span>
          <textarea rows={4} value={comments} onChange={(e)=>setComments(e.target.value)} style={{ width: "100%", borderRadius: 8, border: "1px solid #e5e7eb", padding: 12, fontFamily: "inherit", resize: "vertical", fontSize: 16 }} />
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" className="back-btn" onClick={onClose} style={{ background: "#e5e7eb", color: "#111", fontWeight: 700 }}>Cancel</button>
          <button type="submit" className="primary-btn">💾 Save Progress</button>
        </div>

        <CameraModal open={camOpen} onClose={()=>setCamOpen(false)} onCapture={onCapture} />
        </form>
      </ModalWrapper>
    );
}
