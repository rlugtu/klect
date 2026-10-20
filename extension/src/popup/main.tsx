import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/styles/popup.css";
import { App } from "./App";

/**
 * Popup entry. Every open is a cold mount — a popup closes on blur and has no persistence
 * between opens — so there is no router, no store, and nothing to rehydrate here.
 */
const container = document.getElementById("root");
if (!container) throw new Error("popup.html is missing its #root element");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
