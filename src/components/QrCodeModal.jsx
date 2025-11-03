import { useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";

export default function QrCodeModal({ open, onClose, memberId, nickname }) {
  const value = useMemo(() => String(memberId || ""), [memberId]);
  if (!open) return null;

  const copyId = async () => {
    try { await navigator.clipboard.writeText(value); } catch {}
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 800 }}>QR Code</div>
          <button className="button btn-lg" style={{ background: "#555" }} onClick={onClose}>Close</button>
        </div>

        <div style={{ textAlign: "center", marginTop: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{nickname || "Member"}</div>
          <div style={{ color: "#666", fontSize: 13, marginBottom: 14 }}>Member ID</div>
          <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700, fontSize: 18, marginBottom: 14 }}>{value}</div>

          <div style={{ background: "#fff", padding: 16, borderRadius: 12, border: "1px solid #e7e8ef", display: "inline-block" }}>
            <QRCodeSVG value={value} size={280} includeMargin={true} level="M" />
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "center" }}>
            <button className="button btn-lg" onClick={copyId}>Copy ID</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,.6)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  modal: {
    width: "min(420px, 92vw)", background: "#fff", borderRadius: 12,
    padding: 16, border: "1px solid #e7e8ef", boxShadow: "0 6px 24px rgba(0,0,0,.2)",
  },
};
