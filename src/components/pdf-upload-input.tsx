"use client";

import { useState } from "react";
import { MAX_CASE_PDF_BYTES } from "@/lib/filing-limits";

export function PdfUploadInput({ id, name, required = false, maxSize = MAX_CASE_PDF_BYTES }: { id: string; name: string; required?: boolean; maxSize?: number }) {
  const [message, setMessage] = useState("");
  const describedBy = `${id}-help`;
  return <>
    <input id={id} name={name} type="file" accept="application/pdf,.pdf" required={required} aria-describedby={describedBy} onChange={async (event) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      setMessage("");
      if (!file) return;
      if (file.size > maxSize) { setMessage(`File is too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)} MB.`); input.value = ""; return; }
      const head = await file.slice(0, 5).text();
      const tail = await file.slice(Math.max(0, file.size - 8192)).text();
      if (head !== "%PDF-") { setMessage("This file does not appear to be a PDF."); input.value = ""; return; }
      if (/\/Encrypt\b/.test(tail)) { setMessage("Password-protected PDFs are not accepted. Remove the password and try again."); input.value = ""; return; }
      if (!/%%EOF\s*$/.test(tail)) { setMessage("This PDF appears incomplete. Re-export it and try again."); input.value = ""; return; }
      setMessage(`${file.name} passed the basic PDF checks. The server will validate it again when submitted.`);
    }} />
    <span id={describedBy} className="pdf-upload-feedback" role="status" aria-live="polite">{message || `PDF only. Up to ${Math.round(maxSize / 1024 / 1024)} MB. Encrypted or incomplete files are rejected.`}</span>
  </>;
}
