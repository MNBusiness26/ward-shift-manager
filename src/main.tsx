import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// PWA service worker registration (production only, never inside iframe/preview)
if ("serviceWorker" in navigator) {
  const inIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  const isPreviewHost =
    window.location.hostname.includes("lovableproject.com") ||
    window.location.hostname.includes("lovable.app") && window.location.hostname.includes("id-preview");

  if (inIframe || isPreviewHost) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}
