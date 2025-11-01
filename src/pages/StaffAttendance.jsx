import { useState } from "react";

export default function StaffAttendance(){
  const [rows, setRows] = useState([
    {name:"Coach Mike", timeIn:"7:45 AM", timeOut:"", status:"On Duty"},
    {name:"Coach Bea", timeIn:"8:30 AM", timeOut:"", status:"On Duty"},
    {name:"Frontdesk Kim", timeIn:"8:00 AM", timeOut:"", status:"On Duty"},
  ]);
  return (
    <div className="content">
      <h2>Staff Attendance</h2>
      <div className="card" style={{marginTop:8}}>
        <table>
          <thead>
            <tr><th>Name</th><th>Time In</th><th>Time Out</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((r,i)=> (
              <tr key={i}>
                <td>{r.name}</td>
                <td>{r.timeIn}</td>
                <td>{r.timeOut || "-"}</td>
                <td><span className="badge">{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
