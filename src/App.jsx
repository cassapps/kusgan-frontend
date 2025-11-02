import React from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import StaffAttendance from "./pages/StaffAttendance";
import Members from "./pages/Members";
import Payments from "./pages/Payments";
import ProgressDetail from "./pages/ProgressDetail";
import "./styles.css";

export default function App() {
  const link = ({ isActive }) => "nav-link" + (isActive ? " nav-link-active" : "");
  return (
    <>
      <header className="app-header">
        <div className="brand">Kusgan Gym</div>
        <nav className="nav">
          <NavLink to="attendance" end className={link}>Attendance</NavLink>
          <NavLink to="members" end className={link}>Members</NavLink>
          <NavLink to="payments" end className={link}>Payments</NavLink>
        </nav>
      </header>

      <main className="app-main">
        <Routes>
          <Route index element={<StaffAttendance />} />
          <Route path="attendance" element={<StaffAttendance />} />
          <Route path="members" element={<Members />} />
          <Route path="payments" element={<Payments />} />
          <Route path="progress/:id" element={<ProgressDetail />} />
          <Route path="*" element={<StaffAttendance />} />
        </Routes>
      </main>
    </>
  );
}
