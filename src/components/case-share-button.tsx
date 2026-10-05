"use client";

import { useState, useTransition } from "react";
import { createCaseSharePreviewLink } from "@/app/dashboard/cases/[id]/share-action";

export function CaseShareButton({ caseId }: { caseId: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState("");

  function copyShareLink() {
    setMessage("");
    setFallbackUrl("");
    startTransition(async () => {
      const result = await createCaseSharePreviewLink(caseId);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      try {
        await navigator.clipboard.writeText(result.url);
        setMessage("Share preview link copied. Anyone with the link can view these basic case details.");
      } catch {
        setFallbackUrl(result.url);
        setMessage("Copy the link below. Anyone with it can view these basic case details.");
      }
    });
  }

  return <div className="case-share-control" style={{ display: "grid", gap: 4, flex: "1 1 200px", maxWidth: 250 }}>
    <button type="button" className="govbtn-outline" onClick={copyShareLink} disabled={isPending}>
      {isPending ? "Creating link…" : "Copy share preview"}
    </button>
    <small style={{ color: "var(--ink-soft)", lineHeight: 1.35 }}>Anyone with the link can view the case number, title, type, and status. It expires after 7 days.</small>
    {message && <p role="status" aria-live="polite">{message}</p>}
    {fallbackUrl && <input aria-label="Share preview link" style={{ width: "100%" }} readOnly value={fallbackUrl} onFocus={(event) => event.currentTarget.select()} />}
  </div>;
}
