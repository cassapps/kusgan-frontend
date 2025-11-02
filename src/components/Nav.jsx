import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import React from "react";

// Replace the helper with this
function phDateDisplay() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "long",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());
  const weekday = (parts.find(p => p.type === "weekday")?.value || "").toUpperCase();
  const mon = parts.find(p => p.type === "month")?.value || "Jan";
  const day = parseInt(parts.find(p => p.type === "day")?.value || "01", 10);
  const yr  = parts.find(p => p.type === "year")?.value || "0000";
  return { weekday, text: `${mon}-${day}, ${yr}` }; // e.g., "Nov-2, 2025"
}

export default function Nav({ onLogout = () => {} }) {
  // Drive the banner from PH time
  const [datePH, setDatePH] = useState(phDateDisplay());
  useEffect(() => {
    const tick = () => setDatePH(phDateDisplay());
    const id = setInterval(tick, 60_000);
    tick();
    return () => clearInterval(id);
  }, []);

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/kusgan-frontend/kusgan-logo.png" alt="Kusgan logo" className="brand-logo" style={{ width: 350, height: "auto" }}/>
      </div>

      <div className="sidebar-info">
        <div className="date">
          <div style={{ fontSize: "14px", fontStyle: "italic", color: "#e9e9ee", marginBottom: "5px" }}>Today is</div>
          <div style={{ fontWeight: "600", fontSize: "20px", color: "#e9e9ee", marginBottom: "25px" }}>
            {datePH.weekday} {datePH.text}
          </div>
        </div>
      </div>

      <nav className="nav">
        <NavLink to="/" end>🏠 Dashboard</NavLink>
        <NavLink to="/attendance">🕒 Staff Attendance</NavLink>
        <NavLink to="/members">💪 All Members</NavLink>
        <NavLink to="/payments">💰 Payments</NavLink>
        <NavLink to="/checkin">🎟️ Member Check-In</NavLink>
      </nav>
      <div className="sidebar-footer">
        <button className="button logout-btn" onClick={onLogout}>Logout</button>
      </div>
    </aside>
  );
}
