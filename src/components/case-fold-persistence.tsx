"use client";

import { useEffect } from "react";
import { readDashboardFoldPreferences, saveDashboardFoldPreference } from "@/lib/ui-preferences";

export function CaseFoldPersistence({ accountId, caseId }: { accountId: string; caseId: string }) {
  useEffect(() => {
    const folds = Array.from(document.querySelectorAll<HTMLDetailsElement>("details.case-detail-fold[id], details.case-edit-subfold[id]"));
    const keys = new Map(folds.map((fold) => [fold, `case:${caseId}:${fold.id}`]));
    const preferences = readDashboardFoldPreferences(accountId);
    const onToggle = (event: Event) => {
      const fold = event.currentTarget as HTMLDetailsElement;
      const key = keys.get(fold);
      if (key) saveDashboardFoldPreference(accountId, key, fold.open);
    };

    for (const fold of folds) {
      const key = keys.get(fold);
      if (!key) continue;
      if (typeof preferences[key] === "boolean") fold.open = preferences[key];
      fold.addEventListener("toggle", onToggle);
    }
    return () => folds.forEach((fold) => fold.removeEventListener("toggle", onToggle));
  }, [accountId, caseId]);

  return null;
}
