import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

// Runtime diagnostics: helps debug blank-screen issues in dev
try {
  console.log('[app] starting main.jsx', { base: import.meta.env.BASE_URL, hasClientId: Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID) });
  const rootEl = document.getElementById('root');
  if (rootEl) rootEl.innerHTML = '<div style="padding:20px;font-family:sans-serif;color:#333">Mounting Kusgan app...</div>';
} catch (e) {
  // ignore
}

// Render wrapped in try/catch to surface render-time errors into the DOM
try {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ""}>
        <HashRouter>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </HashRouter>
      </GoogleOAuthProvider>
    </React.StrictMode>
  );
} catch (err) {
  console.error('[app] render failure', err);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="padding:20px;font-family:sans-serif;color:#900"><h2>Render error</h2><pre>${String(err)}</pre></div>`;
  }
}
