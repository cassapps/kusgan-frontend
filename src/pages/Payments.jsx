import { useState } from "react";

export default function Payments(){
  const [rows, setRows] = useState([
    {date:"2025-11-01", member:"Alex Johnson", method:"GCash", amount:1200},
    {date:"2025-11-01", member:"Sarah Miller", method:"Cash", amount:1500},
    {date:"2025-10-31", member:"Juan Dela Cruz", method:"GCash", amount:300},
  ]);
  return (
    <div className="content">
      <h2>Payments</h2>
      <div className="card" style={{marginTop:8}}>
        <table>
          <thead>
            <tr><th>Date</th><th>Member</th><th>Method</th><th>Amount</th></tr>
          </thead>
          <tbody>
            {rows.map((r,i)=> (
              <tr key={i}>
                <td>{r.date}</td>
                <td>{r.member}</td>
                <td>{r.method}</td>
                <td>₱ {r.amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
