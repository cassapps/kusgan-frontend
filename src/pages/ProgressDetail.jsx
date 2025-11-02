import React, { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getMemberById, getMemberProgress } from "../utils/membersStore";

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  const month = d.toLocaleString(undefined, { month: "short" });
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month}-${day}, ${year}`;
}
function daysSince(startIso, dateIso) {
  if (!startIso || !dateIso) return null;
  const start = new Date(startIso);
  const date = new Date(dateIso);
  const ms = date.setHours(0,0,0,0) - start.setHours(0,0,0,0);
  return Math.floor(ms / 86400000) + 1;
}

export default function ProgressDetail() {
  const { id, index } = useParams();
  const navigate = useNavigate();
  const member = useMemo(() => getMemberById(id), [id]);
  const prog = useMemo(() => getMemberProgress(id), [id]);
  const entry = prog?.[Number(index)];

  if (!member || !entry) {
    return (
      <div className="content">
        <button className="button back-btn" onClick={() => navigate(-1)}>← Back</button>
        <p>Progress not found.</p>
      </div>
    );
  }

  const dayNo = daysSince(member.memberDate, entry.date) ?? (Number(index)+1);

  return (
    <div className="content">
      <button className="button back-btn" onClick={() => navigate(-1)}>← Back</button>
      <h2>{member.nickname || `${member.firstName} ${member.lastName}`}</h2>
      <div className="card" style={{ padding:16 }}>
        <div style={{ fontWeight:800, marginBottom:8 }}>Day {dayNo} — {fmtDate(entry.date)}</div>
        <div>Weight: <b>{entry.weight ?? "—"}</b></div>
        <div>BMI: <b>{entry.bmi ?? "—"}</b></div>
        <div>Muscle Mass: <b>{entry.muscle ?? "—"}</b></div>
        <div>Body Fat: <b>{entry.bodyFat ?? "—"}</b></div>
        <div>Visceral Fat: <b>{entry.visceralFat ?? "—"}</b></div>
        {entry.photoUrl && (
          <div style={{ marginTop:12 }}>
            <img src={entry.photoUrl} alt="Progress" style={{ width:240, borderRadius:12, border:"1px solid #e7e8ef" }} />
          </div>
        )}
      </div>
    </div>
  );
}
