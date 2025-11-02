export default function MainLayout({ token }) {
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <nav style={{ width: 220, background: "#eee", padding: 24 }}>
        {/* Add your navbar links here */}
        <div style={{ fontWeight: "bold", marginBottom: 24 }}>Kusgan</div>
        <a href="/dashboard">Dashboard</a>
        {/* Add more links as needed */}
      </nav>
      <main style={{ flex: 1, padding: 32 }}>
        {/* Add your dashboard or main content here */}
        <h2>Welcome to Kusgan Dashboard!</h2>
        {/* You can use the token prop for API calls */}
      </main>
    </div>
  );
}