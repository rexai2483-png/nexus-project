import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/globals.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {/* Whole-app last resort: App.tsx already contains per-page crashes
        with its own boundary around the active page, but anything that
        throws outside that (e.g. the Sidebar itself) still needs a net
        so the user gets a message instead of a blank document. */}
    <ErrorBoundary label="NEXUS">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
