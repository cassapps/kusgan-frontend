import React from "react";
import { fmtDate, fmtTime } from "../pages/MemberDetail.jsx";

// Small helpers copied from ProgressViewModal / MemberDetail
const pick = (o, keys = []) => {
  if (!o) return "";
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(o, k)) return o[k];
    const alt = Object.keys(o).find(kk => kk.toLowerCase().replace(/\s+/g, "") === k.toLowerCase().replace(/\s+/g, ""));
    if (alt) return o[alt];
  }
  return "";
};

const driveId = (u = "") => {
  const m = String(u || "").match(/(?:\/file\/d\/|[?&]id=|\/uc\?[^#]*id=)([^\/#?]+)/);
  return m && m[1] ? m[1] : "";
};
const driveThumb = (u = "") => {
  const s = String(u || "");
  if (/googleusercontent\.com\//.test(s)) return s;
  const id = driveId(s);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1000` : s;
};

export default function VisitViewModal({ open, onClose, row }) {
  if (!open) return null;
  const r = row || {};
  const memberId = pick(r, ["MemberID", "memberid", "member_id", "id"]);
  const dateRaw = pick(r, ["Date", "date", "visit_date", "timestamp"]);
  const timeIn = pick(r, ["TimeIn", "timein", "time_in"]);
  const timeOut = pick(r, ["TimeOut", "timeout", "time_out"]);
  const totalHours = pick(r, ["TotalHours", "totalhours", "hours"]);
  const coach = pick(r, ["Coach", "coach"]);
  const focus = pick(r, ["Focus", "focus"]);
  const workouts = pick(r, ["Workouts", "workouts", "done", "workouts_done"]);
  const comments = pick(r, ["Comments", "comments", "notes"]);
  const photo = pick(r, ["Photo", "photo", "photo_url", "PhotoURL"]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ width: "min(720px, 96vw)", maxHeight: "92vh", overflow: "auto", background: "#fff", borderRadius: 14, padding: 16, border: "1px solid var(--light-border)", boxShadow: "0 20px 60px rgba(0,0,0,.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Visit Details</div>
          <button type="button" className="button" onClick={onClose} style={{ background: "#eee", color: "#333" }}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <span style={{ fontSize: 14, fontStyle: "italic", color: "var(--muted)", display: "block", marginBottom: 4 }}>Member ID</span>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{memberId || "-"}</div>
          </div>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            <span style={{ fontSize: 14, fontStyle: "italic", color: "var(--muted)", display: "block", marginBottom: 4 }}>Date</span>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{fmtDate(dateRaw) || "-"}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            ["Time In", timeIn],
            ["Time Out", timeOut],
            ["Total Hours", totalHours],
          ].map(([label, val]) => (
            <div key={label} className="field">
              <span className="label" style={{ display: "block", marginBottom: 6 }}>{label}</span>
              <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, fontWeight: 700, fontSize: 18 }}>
                {label === "Time In" || label === "Time Out" ? (val ? fmtTime(val) : "-") : (val ? String(val) : "-")}
              </div>
            </div>
          ))}
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <span className="label">Coach</span>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, fontSize: 16, minHeight: 44 }}>{coach || "-"}</div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <span className="label">Focus</span>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, fontSize: 16, minHeight: 44 }}>{focus || "-"}</div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <span className="label">Workouts Done</span>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, fontSize: 16, minHeight: 72 }}>{workouts || "-"}</div>
        </div>

        <div className="field" style={{ marginTop: 12 }}>
          <span className="label">Comments</span>
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, fontSize: 16, minHeight: 72 }}>{comments || "-"}</div>
        </div>

        {photo ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ position: "relative", width: "100%", height: 0, paddingTop: "56.25%", borderRadius: 8, border: "1px solid #e5e7eb", overflow: "hidden" }}>
              <img src={driveThumb(photo)} alt="Photo" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          </div>
        ) : null}

        <div style={{ textAlign: "right", marginTop: 14 }}>
          <button className="primary-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
