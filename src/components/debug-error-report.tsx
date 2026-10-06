"use client";

import { useState } from "react";

type DebugErrorReportProps = {
  supportReference?: string;
};

function safeReference(value?: string) {
  return value && /^[A-Za-z0-9_-]{6,64}$/.test(value) ? value : "Not provided";
}

export default function DebugErrorReport({ supportReference }: DebugErrorReportProps) {
  const [report, setReport] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  function openReport() {
    setReport([
      "Website error report",
      "Issue: A page failed to load.",
      `Support reference: ${safeReference(supportReference)}`,
      `Time: ${new Date().toISOString()}`,
      "Private account, case, URL, and technical details are intentionally omitted.",
    ].join("\n"));
    setCopyStatus("");
  }

  async function copyReport() {
    if (!report) return;

    try {
      await navigator.clipboard.writeText(report);
      setCopyStatus("Report copied. Send it to the bug reviewer.");
    } catch {
      setCopyStatus("Copy was blocked. Select the report text and copy it manually.");
    }
  }

  return (
    <div className="debug-error-report">
      <button className="govbtn" type="button" onClick={openReport}>DEBUG</button>
      {report && (
        <div className="debug-error-report__details">
          <label htmlFor="debug-error-report-text">Privacy-safe report</label>
          <textarea
            id="debug-error-report-text"
            readOnly
            rows={5}
            value={report}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button className="govbtn" type="button" onClick={copyReport}>Copy report</button>
          {copyStatus && <p role="status" className="note-inline">{copyStatus}</p>}
        </div>
      )}
    </div>
  );
}
