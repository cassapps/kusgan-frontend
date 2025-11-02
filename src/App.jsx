import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";

import Nav from "./components/Nav";
import Dashboard from "./pages/Dashboard";
import Members from "./pages/Members";
import MemberDetail from "./pages/MemberDetail";
import AddMember from "./pages/AddMember";
import Payments from "./pages/Payments";
import CheckIn from "./pages/CheckIn";
import StaffAttendance from "./pages/StaffAttendance";
import ProgressDetail from "./pages/ProgressDetail";
import "./styles.css";

// Simple Login card (logo + Google button)
function LoginCard({ onLogin }) {
  const logoSrc = `${import.meta.env.BASE_URL}kusgan-logo.png`;
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        margin: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, rgba(255,182,213,0.94), rgba(180,196,255,0.92))",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <div
        style={{
          width: 420,
          minHeight: 520,
          padding: "56px 48px",
          borderRadius: 28,
          background: "#11121d",
          boxShadow: "0 36px 70px rgba(0,0,0,0.40)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          color: "#fff",
          textAlign: "center",
        }}
      >
        <img
          src={logoSrc}
          alt="Kusgan Logo"
          style={{
            width: 160,
            height: 160,
            objectFit: "cover",
            borderRadius: "22px",
            boxShadow: "0 10px 28px rgba(215,38,96,0.35)",
            marginBottom: 32,
            background: "#000",
          }}
        />
        <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: "0 0 14px" }}>
          Kusgan Fitness Gym
        </h1>
        <p style={{ margin: "0 0 40px", color: "#c9c9da", lineHeight: 1.6 }}>
          Please sign in with Google to access the dashboard.
        </p>
        <GoogleLogin
          onSuccess={(res) => onLogin(res.credential)}
          onError={() => alert("Login failed.")}
        />
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("authToken");
    if (saved) setToken(saved);
  }, []);

  const handleLogin = (cred) => {
    setToken(cred);
    localStorage.setItem("authToken", cred);
  };

  const handleLogout = () => {
    setToken("");
    localStorage.removeItem("authToken");
  };

  if (!token) return <LoginCard onLogin={handleLogin} />;

  return (
    <div className="app">
      <Nav onLogout={handleLogout} />
      <div className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/attendance" element={<StaffAttendance />} />
          <Route path="/members" element={<Members />} />
          <Route path="/members/add" element={<AddMember />} />
          {/* Keep one canonical route */}
          <Route path="/members/:memberId" element={<MemberDetail />} />
          <Route path="/members/:id/progress/:index" element={<ProgressDetail />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/members/new" element={<Navigate to="/members/add" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}