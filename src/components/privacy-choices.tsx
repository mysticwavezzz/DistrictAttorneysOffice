"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const CONSENT_KEY = "da-optional-analytics";
type Choice = "accepted" | "rejected" | null;

export function PrivacyChoices() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<Choice>(null);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CONSENT_KEY);
      setChoice(stored === "accepted" || stored === "rejected" ? stored : null);
    } catch {
      setChoice("rejected");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || choice !== "accepted") return;
    void fetch("/api/analytics/pageview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  }, [choice, pathname, ready]);

  function choose(next: Exclude<Choice, null>) {
    try { window.localStorage.setItem(CONSENT_KEY, next); } catch { /* Keep this visit's choice if storage is unavailable. */ }
    setChoice(next);
    setEditing(false);
  }

  if (!ready) return null;
  if (choice && !editing) return <button type="button" className="privacy-choice-reopen" onClick={() => setEditing(true)}>Privacy choices</button>;

  return <aside className="privacy-choice-banner" role="region" aria-label="Privacy and analytics choices">
    <div><strong>Privacy choices</strong><p>Optional, first-party analytics count public page views by page and day only when enabled. No advertising trackers are used. Your choice is stored in this browser. See our <Link href="/privacy-policy">Privacy Policy</Link>.</p></div>
    <div className="privacy-choice-actions">
      <button type="button" className="govbtn-outline" onClick={() => choose("rejected")}>Reject optional analytics</button>
      <button type="button" className="govbtn" onClick={() => choose("accepted")}>Allow optional analytics</button>
    </div>
  </aside>;
}
