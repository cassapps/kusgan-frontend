import { NavLink } from "react-router-dom";

export default function Nav(){
  const links = [
    {to:"/", label:"Dashboard"},
    {to:"/attendance", label:"Staff Attendance"},
    {to:"/members", label:"All Members"},
    {to:"/payments", label:"Payments"},
    {to:"/checkin", label:"Member Check-In"},
  ];

  return (
    <div className="sidebar">
      {/* Logo on top, then Dashboard immediately below */}
<div className="brand">
  <img
    src={`${import.meta.env.BASE_URL}kusgan-logo.png`}
    alt="Kusgan logo"
    className="brand-logo"
  />
</div>


      <div className="nav">
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === "/"}
            className={({isActive}) => isActive ? "active" : undefined}
          >
            {l.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
