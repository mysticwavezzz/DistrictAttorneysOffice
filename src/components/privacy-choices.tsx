"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { privacyConsentKey } from "@/lib/ui-preferences";

const CONSENT_KEY = "da-optional-analytics";
type Choice = "accepted" | "rejected" | null;

export function PrivacyChoices({ generation }: { generation: string }) {
  const pathname = usePathname();
  const [choice, setChoice] = useState<Choice>(null);
  const [ready, setReady] = useState(false);
  const [resolvedGeneration, setResolvedGeneration] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(privacyConsentKey(generation)) ?? (generation === "initial" ? window.localStorage.getItem(CONSENT_KEY) : null);
      setChoice(stored === "accepted" || stored === "rejected" ? stored : null);
    } catch {
      setChoice(null);
    }
    setResolvedGeneration(generation);
    setReady(true);
  }, [generation]);

  useEffect(() => {
    if (!ready || resolvedGeneration !== generation || choice !== "accepted") return;
    void fetch("/api/analytics/pageview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  }, [choice, generation, pathname, ready, resolvedGeneration]);

  function choose(next: Exclude<Choice, null>) {
    try { window.localStorage.setItem(privacyConsentKey(generation), next); } catch { /* Keep this visit's choice if storage is unavailable. */ }
    setChoice(next);
  }

  if (!ready || resolvedGeneration !== generation) return null;
  if (choice) return null;

  return <aside className="privacy-choice-banner" role="region" aria-label="Privacy and analytics choices">
    <div><strong>Privacy choices</strong><p>Optional, first-party analytics count public page views by page and day only when enabled. No advertising trackers are used. Your choice is stored in this browser. See our <Link href="/privacy-policy">Privacy Policy</Link>.</p></div>
    <div className="privacy-choice-actions">
      <button type="button" className="govbtn-outline" onClick={() => choose("rejected")}>Reject optional analytics</button>
      <button type="button" className="govbtn" onClick={() => choose("accepted")}>Allow optional analytics</button>
    </div>
  </aside>;
}
