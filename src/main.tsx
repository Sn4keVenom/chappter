// src/main.tsx — browser entry point.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles/global.css";
import App from "./App";
import { bootstrapDemoSession } from "./mocks/bootstrap";

// Demo Mode populates the auth store before the first render, exactly as the
// mobile app did, so the router's very first evaluation already knows whether
// there is a signed-in user and never flashes the login screen.
bootstrapDemoSession();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
