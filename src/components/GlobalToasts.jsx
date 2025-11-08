import React, { useEffect, useState } from "react";
import events from "../lib/events";

export default function GlobalToasts() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const off = events.on("modal:error", (payload) => {
      const id = Date.now() + Math.random();
      const item = { id, message: payload?.message || "An error occurred", source: payload?.source || "" };
      setToasts((t) => [...t, item]);
      // auto-remove after 6s
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
    });
    return () => off();
  }, []);

  if (!toasts.length) return null;
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 99999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ background: "#111", color: "#fff", padding: "10px 14px", borderRadius: 10, minWidth: 240, boxShadow: "0 8px 24px rgba(0,0,0,.2)" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{t.source || "Error"}</div>
          <div style={{ fontSize: 13 }}>{t.message}</div>
        </div>
      ))}
    </div>
  );
}
