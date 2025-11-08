import React from "react";
import { fmtDate, fmtTime } from "../pages/MemberDetail.jsx";
import { useNavigate } from "react-router-dom";
import CheckInConfirmModal from './CheckInConfirmModal';

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

import ModalWrapper from "./ModalWrapper";

export default function VisitViewModal({ open, onClose, row, onCheckout }) {
  if (!open) return null;
  const navigate = useNavigate();
  const r = row || {};
  const [busy, setBusy] = React.useState(false);
  const memberId = pick(r, ["MemberID", "memberid", "member_id", "id"]);
  const dateRaw = pick(r, ["Date", "date", "visit_date", "timestamp"]);
  const timeIn = pick(r, ["TimeIn", "timein", "time_in"]);
  const timeOut = pick(r, ["TimeOut", "timeout", "time_out"]);
  const totalHours = pick(r, ["TotalHours", "totalhours", "NoOfHours", "noofhours", "hours"]);
  const coach = pick(r, ["Coach", "coach"]);
  const focus = pick(r, ["Focus", "focus"]);
  const workouts = pick(r, ["Workouts", "workouts", "done", "workouts_done"]);
  const comments = pick(r, ["Comments", "comments", "notes"]);
  const photo = pick(r, ["Photo", "photo", "photo_url", "PhotoURL"]);

  const [openCheckoutModal, setOpenCheckoutModal] = React.useState(false);

  const handleCheckoutSuccess = () => {
    // notify parent that a checkout occurred so it can refresh if needed
    if (typeof onCheckout === 'function') {
      try { onCheckout(row, { checkedOut: true }); } catch (e) { console.error(e); }
    }
  };

  return (
    <>
  <ModalWrapper open={open} onClose={onClose} title="Visit Details" noInternalScroll={true}>

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
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          {/* Show Check Out if entry has no TimeOut: navigate to Check-In page to use the unified confirm modal */}
          {(!timeOut) ? (
            <button
              className="primary-btn"
              onClick={() => {
                try {
                  // If parent provided an onCheckout handler, delegate to it so parent can show a global popup
                  if (typeof onCheckout === 'function') {
                    try { onCheckout(row); } catch (e) { console.error(e); }
                    // close this modal right away
                    onClose && onClose();
                    return;
                  }
                  // otherwise open inline Check-In confirm modal (shortcut) for checkout
                  setOpenCheckoutModal(true);
                } catch (e) { console.error(e); }
              }}
            >
              Check Out
            </button>
          ) : null}
          <button className="primary-btn" onClick={onClose}>Close</button>
        </div>
    </ModalWrapper>
    {openCheckoutModal && (
      <CheckInConfirmModal
        open={openCheckoutModal}
        onClose={() => { setOpenCheckoutModal(false); /* keep parent modal open so user can see updates; close parent if desired */ }}
        memberId={memberId}
        initialEntry={row}
        onSuccess={() => { setOpenCheckoutModal(false); onClose && onClose(); handleCheckoutSuccess(); }}
      />
    )}
    </>
  );
}
