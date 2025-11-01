import { Routes, Route } from "react-router-dom";
import Nav from "./components/Nav";
import Topbar from "./components/Topbar";
import Dashboard from "./pages/Dashboard";
import Members from "./pages/Members";
import Payments from "./pages/Payments";
import CheckIn from "./pages/CheckIn";
import Staff from "./pages/Staff"; // ✅ new page
import "./styles.css";

export default function App() {
  return (
    <div className="app">
      {/* Left Sidebar */}
      <Nav />

      {/* Right Section */}
      <div>
        {/* Top bar always visible */}
        <Topbar attendant="KIM ARCEO" />

        {/* Page Routes */}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/staff" element={<Staff />} />  {/* ✅ staff attendance */}
          <Route path="/members" element={<Members />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/checkin" element={<CheckIn />} />
        </Routes>
      </div>
    </div>
  );
}
