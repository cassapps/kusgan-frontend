import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App";

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
