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
        setMessage("Case preview link copied. Use it in Discord for the case-specific preview.");
      } catch {
        setFallbackUrl(result.url);
        setMessage("Copy this case preview link for Discord. It shows only basic case details.");
      }
    });
  }

  return <div className="case-share-control" style={{ display: "grid", gap: 4, flex: "1 1 200px", maxWidth: 250 }}>
    <button type="button" className="govbtn-outline" onClick={copyShareLink} disabled={isPending}>
      {isPending ? "Creating link…" : "Copy link with Discord preview"}
    </button>
    <small style={{ color: "var(--ink-soft)", lineHeight: 1.35 }}>Use this link when sharing in Discord. It shows only the case number, title, type, and status, and expires after 7 days. The regular case link stays private.</small>
    {message && <p role="status" aria-live="polite">{message}</p>}
    {fallbackUrl && <input aria-label="Share preview link" style={{ width: "100%" }} readOnly value={fallbackUrl} onFocus={(event) => event.currentTarget.select()} />}
  </div>;
}
