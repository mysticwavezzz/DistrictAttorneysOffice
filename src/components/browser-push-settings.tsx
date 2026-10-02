"use client";

import { useEffect, useState } from "react";

function decodeBase64Url(value: string): ArrayBuffer {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  const decoded = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export function BrowserPushSettings({ publicKey }: { publicKey: string }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    void navigator.serviceWorker.getRegistration("/").then(async (registration) => {
      if (registration) setEnabled(Boolean(await registration.pushManager.getSubscription()));
    }).catch(() => undefined);
  }, []);

  async function toggle() {
    setPending(true);
    setMessage("");
    try {
      if (!publicKey) throw new Error("Computer notifications are not configured on this website yet.");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("This browser does not support computer notifications.");
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        const response = await fetch("/api/notifications/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: existing.endpoint }) });
        if (!response.ok) throw new Error("Could not turn off notifications for this device.");
        await existing.unsubscribe();
        setEnabled(false);
        setMessage("Computer notifications are off for this device.");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Allow notifications in your browser settings, then try again.");
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeBase64Url(publicKey) });
        const response = await fetch("/api/notifications/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
        if (!response.ok) {
          const result = await response.json().catch(() => ({})) as { error?: string };
          await subscription.unsubscribe();
          throw new Error(result.error ?? "Could not save this browser subscription.");
        }
        setEnabled(true);
        setMessage("Computer notifications are on for this device.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update computer notifications.");
    } finally {
      setPending(false);
    }
  }

  return <div className="browser-push-settings"><button type="button" className="govbtn-outline" onClick={toggle} disabled={pending || !publicKey}>{pending ? "Updating…" : enabled ? "Turn off on this device" : "Enable computer notifications"}</button>{!publicKey && <p className="hint">Computer notifications are awaiting server setup.</p>}{message && <p className="note-inline" role="status">{message}</p>}</div>;
}
