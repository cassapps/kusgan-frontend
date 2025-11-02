import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

const STAFF = [
  "Coach ELMER", "Coach JOJO", "SHEENA", "PAT",
  "XYZA", "BEZZA", "JEANETTE", "JOHANNA",
];

const todayKey = () => {
  const d = new Date();
  return `attendance-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function computePrimaryAttendant() {
  try {
    const raw = localStorage.getItem(todayKey());
    if (!raw) return "—";
    const data = JSON.parse(raw);
    let best = null;
    for (const name of STAFF) {
      const list = data[name] || [];
      const last = list[list.length - 1];
      if (last && !last.out) {
        if (!best || new Date(last.in) < new Date(best.inISO)) {
          best = { name, inISO: last.in };
        }
      }
    }
    return best ? best.name.toUpperCase() : "—";
  } catch {
    return "—";
  }
}

function formatBannerDate() {
  const d = new Date();
  const weekday = d.toLocaleString(undefined, { weekday: "long" }).toUpperCase();
  const month = d.toLocaleString(undefined, { month: "long" });
  const day = d.getDate();
  const year = d.getFullYear();
  return `${weekday}, ${month} ${day}, ${year}`;
}

export default function Nav({ onLogout = () => {} }) {
  const [primary, setPrimary] = useState(computePrimaryAttendant());
  const [now, setNow] = useState(formatBannerDate());

  // Update date every minute
  useEffect(() => {
    const i = setInterval(() => setNow(formatBannerDate()), 60_000);
    return () => clearInterval(i);
  }, []);

  // Update primary attendant periodically
  useEffect(() => {
    const onUpdate = () => setPrimary(computePrimaryAttendant());
    window.addEventListener("kusgan-attendance-updated", onUpdate);
    const i = setInterval(onUpdate, 30_000);
    return () => {
      window.removeEventListener("kusgan-attendance-updated", onUpdate);
      clearInterval(i);
    };
  }, []);

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/kusgan-frontend/kusgan-logo.png" alt="Kusgan logo" className="brand-logo"  style={{ width: 350, height: "auto" }}/>
      </div>

<div className="sidebar-info">
  <div className="date">
    <div style={{ fontSize: "14px", fontStyle: "italic", color: "#e9e9ee", marginBottom: "5px" }}>Today is</div>
    <div style={{ fontWeight: "600", fontSize: "20px", color: "#e9e9ee", marginBottom: "25px" }}>
      {new Date().toLocaleString(undefined, { weekday: "long" }).toUpperCase()}{' '}
      {new Date().toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" })}
    </div>

    <div style={{ fontSize: "14px", fontStyle: "italic", color: "#e9e9ee" }}>Primary Attendant</div>
    <div style={{ fontWeight: "600", fontSize: "20px", color: "magenta" }}>{primary}</div>
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
        <button className="button logout-btn" onClick={onLogout}>
          Logout
        </button>
      </div>
    </aside>
  );
}
