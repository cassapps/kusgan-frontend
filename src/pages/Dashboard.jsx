export default function Dashboard(){
  return (
    <div className="content">
      <div className="cards">
        <div className="card">
          <div className="title">Total Members</div>
          <div className="value">312</div>
        </div>
        <div className="card">
          <div className="title">Active Today</div>
          <div className="value">27</div>
        </div>
        <div className="card">
          <div className="title">Revenue (MoM)</div>
          <div className="value">₱ 142,500</div>
        </div>
        <div className="card">
          <div className="title">Growth</div>
          <div className="value">+12%</div>
        </div>
      </div>

      <h3 style={{marginTop:24}}>Recent Activity</h3>
      <div className="card" style={{marginTop:8}}>
        <table>
          <thead>
            <tr><th>Time</th><th>Member</th><th>Action</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr><td>8:30 AM</td><td>Alex Johnson</td><td>Check-In</td><td><span className="badge ok">OK</span></td></tr>
            <tr><td>8:15 AM</td><td>Sarah Miller</td><td>Payment</td><td><span className="badge info">Receipt</span></td></tr>
            <tr><td>7:50 AM</td><td>Jan Dela Cruz</td><td>Check-In</td><td><span className="badge ok">OK</span></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
