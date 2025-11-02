import { GoogleLogin } from '@react-oauth/google';
import { useEffect, useState } from "react";

const SHEET_ID = "1yDYPce2_XCI3T57eRnZsrM98u-kZwzMAyNMlNh_-C0s";
const RANGE = "Members!A1:Q100";

export default function Login({ setToken }) {
  const [sheetData, setSheetData] = useState(null);

  // Use setToken from props only!
  // Remove: const [token, setToken] = useState("");

  useEffect(() => {
    function start() {
      gapi.client.init({
        apiKey: API_KEY,
        clientId: CLIENT_ID,
        scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
        discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
      });
    }
    gapi.load("client:auth2", start);
  }, []);

  const handleLogin = async () => {
    const GoogleAuth = gapi.auth2.getAuthInstance();
    await GoogleAuth.signIn();
    const user = GoogleAuth.currentUser.get();
    const accessToken = user.getAuthResponse().access_token;
    setToken(accessToken);
    alert("Login successful! Access token received.");
  };

  const fetchSheet = async () => {
    const res = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: RANGE,
    });
    setSheetData(res.result);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "20vh" }}>
      <img src="/kusgan-frontend/kusgan-logo.png" alt="Kusgan Logo" style={{ width: 180, marginBottom: 32 }} />
      <GoogleLogin
        onSuccess={credentialResponse => {
          setToken(credentialResponse.credential);
        }}
        onError={() => {
          alert("Login Failed");
        }}
      />
      {token && (
        <div>
          <button onClick={fetchSheet}>Fetch Members Data</button>
        </div>
      )}
      {sheetData && (
        <pre>{JSON.stringify(sheetData, null, 2)}</pre>
      )}
    </div>
  );
}