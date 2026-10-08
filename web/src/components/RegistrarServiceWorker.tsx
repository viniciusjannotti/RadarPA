"use client";

import { useEffect } from "react";

/** Registra o service worker (só em produção: em dev ele atrapalharia o HMR). */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.warn("Service worker não registrado:", err);
    });
  }, []);
  return null;
}
