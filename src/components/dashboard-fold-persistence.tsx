"use client";

import { useEffect } from "react";
import { readDashboardFoldPreferences, saveDashboardFoldPreference } from "@/lib/ui-preferences";

const SECTION_KEYS: Record<string, string> = {
  "attention-heading": "needs-attention",
  "my-work-heading": "my-work",
  "deadlines-heading": "upcoming-deadlines",
  "recent-filings-heading": "recent-filings",
  "admin-heading": "administration",
  "activity-heading": "recent-activity",
};

export function DashboardFoldPersistence({ accountId }: { accountId: string }) {
  useEffect(() => {
    const dashboard = document.querySelector(".dashboard-overview");
    const root: ParentNode = dashboard ?? document;

    const preferences = readDashboardFoldPreferences(accountId);
    const disclosures = Array.from(root.querySelectorAll<HTMLDetailsElement>(dashboard ? "details.dashboard-fold" : "details[data-fold-key]"));
    const preferenceKey = (details: HTMLDetailsElement) => details.dataset.foldKey ?? SECTION_KEYS[details.querySelector("summary")?.id ?? ""];
    const onToggle = (event: Event) => {
      const details = event.currentTarget as HTMLDetailsElement;
      const key = preferenceKey(details);
      if (key) saveDashboardFoldPreference(accountId, key, details.open);
    };

    for (const details of disclosures) {
      const key = preferenceKey(details);
      if (!key) continue;
      if (typeof preferences[key] === "boolean") details.open = preferences[key];
      details.addEventListener("toggle", onToggle);
    }

    return () => {
      for (const details of disclosures) details.removeEventListener("toggle", onToggle);
    };
  }, [accountId]);

  return null;
}
