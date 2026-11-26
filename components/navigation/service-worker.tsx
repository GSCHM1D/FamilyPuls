"use client";
import { useEffect } from "react";

/** Registers the service worker (static assets only – never health data). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}

/** Removes every Cache Storage entry and tells the service worker to do the same (used on logout). */
export async function clearClientCaches() {
  try {
    if ("caches" in window) {
      for (const key of await caches.keys()) await caches.delete(key);
    }
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_CACHES" });
  } catch {
    /* ignore */
  }
}
