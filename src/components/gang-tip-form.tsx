"use client";

import { ChangeEvent, ClipboardEvent, FormEvent, useRef, useState } from "react";

type Props = { username: string; robloxUserId: string };
const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "application/pdf", "text/plain"]);

export function GangTipForm({ username, robloxUserId }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileNotice, setFileNotice] = useState("");
  const [receipt, setReceipt] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function appendFiles(incoming: FileList | File[]) {
    const accepted = Array.from(incoming).filter((file) => file.size > 0);
    setFiles((current) => {
      const next = [...current];
      const skipped: string[] = [];
      for (const file of accepted) {
        if (!ALLOWED_TYPES.has(file.type)) { skipped.push("Unsupported file type"); continue; }
        if (file.size > MAX_FILE_SIZE) { skipped.push("A file exceeded 5 MB"); continue; }
        if (next.length >= MAX_FILES) { skipped.push("The five-file limit was reached"); continue; }
        if (next.reduce((sum, existing) => sum + existing.size, 0) + file.size > MAX_TOTAL_BYTES) { skipped.push("The 15 MB combined limit was reached"); continue; }
        if (next.some((existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) { skipped.push("A duplicate file was skipped"); continue; }
        next.push(file);
      }
      setFileNotice(skipped.length ? [...new Set(skipped)].join(". ") + ". Remove a file or choose different evidence." : "");
      return next;
    });
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    const pasted = Array.from(event.clipboardData.files);
    if (pasted.length) { event.preventDefault(); appendFiles(pasted); }
  }

  function onFilesChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.currentTarget.files) appendFiles(event.currentTarget.files);
    event.currentTarget.value = "";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setReceipt("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    form.delete("evidenceFiles");
    for (const file of files) form.append("evidenceFiles", file, file.name);
    try {
      const response = await fetch("/api/gang-tips", { method: "POST", body: form, credentials: "same-origin" });
      const result = await response.json() as { error?: string; receipt?: string };
      if (!response.ok || !result.receipt) throw new Error(result.error || "Could not submit this report.");
      setReceipt(result.receipt); setFiles([]); setFileNotice(""); formElement.reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not submit this report."); }
    finally { setBusy(false); }
  }

  if (receipt) return <div className="message message-success" role="status"><strong>Report received.</strong> Keep this reference for your records: <span className="mono">{receipt}</span>. This confirms receipt only. It is not a finding that anyone is a gang member or has committed an offense.</div>;

  return <form className="formbox tip-form gang-tip-form" onSubmit={submit} onInvalid={(event) => { if (event.target instanceof HTMLElement) { const section = event.target.closest("details.tip-form-section"); if (section instanceof HTMLDetailsElement) section.open = true; } }}>
    <p className="section-lede">Complete each section below. Required fields are marked with an asterisk.</p>
    <details className="tip-form-section" open><summary><h2>1. Submitter information</h2></summary>
      <div className="field"><label htmlFor="gang-tip-reporter">Your Roblox username and ID *</label><input id="gang-tip-reporter" value={`${username} / ${robloxUserId}`} readOnly aria-readonly="true"/><small>This identity comes from your Roblox sign-in and cannot be edited here.</small></div>
    </details>
    <details className="tip-form-section"><summary><h2>2. Incident and evidence</h2></summary>
      <div className="field-row"><div className="field"><label htmlFor="gang-name">Suspected gang name <span className="hint">Optional</span></label><input id="gang-name" name="suspectedGangName" maxLength={120}/></div><div className="field"><label htmlFor="gang-date">Incident date and time <span className="hint">Optional</span></label><input id="gang-date" name="incidentDateTime" type="datetime-local"/></div></div>
      <div className="field"><label htmlFor="gang-members">Suspected gang members <span className="hint">Required</span></label><textarea id="gang-members" name="suspectedGangMembers" required rows={3} maxLength={4000} placeholder="List usernames or descriptions. Separate confirmed observations from guesses."/></div>
      <div className="field-row"><div className="field"><label htmlFor="gang-location">Where did this happen? <span className="hint">Optional</span></label><input id="gang-location" name="location" maxLength={300}/></div><div className="field"><label htmlFor="gang-witnesses">Witnesses <span className="hint">Optional</span></label><textarea id="gang-witnesses" name="witnesses" rows={2} maxLength={2000}/></div></div>
      <div className="field"><label htmlFor="gang-narrative">What did you observe? <span className="hint">Required</span></label><textarea id="gang-narrative" name="narrative" required minLength={20} maxLength={8000} rows={6} placeholder="Include dates, actions, context, and how you know. Do not present an assumption as a confirmed fact."/></div>
      <div className="field"><label htmlFor="gang-links">Evidence links <span className="hint">Optional, one link per line</span></label><textarea id="gang-links" name="evidenceLinks" rows={3} maxLength={4000} placeholder="https://…"/></div>
      <div className="field"><label htmlFor="gang-files">Attach evidence <span className="hint">Up to 5 files, 5 MB each, 15 MB total</span></label><input ref={fileInput} id="gang-files" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,application/pdf,text/plain" onChange={onFilesChange}/></div>
      <div className="gang-tip-paste" tabIndex={0} onPaste={onPaste} onClick={() => fileInput.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileInput.current?.click(); }} aria-label="Paste or choose evidence files">Paste copied evidence here with Ctrl+V, or click to choose files.</div>
      {fileNotice && <p className="message error" role="status">{fileNotice}</p>}
      {files.length > 0 && <ul className="gang-tip-files">{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}><span>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span><button type="button" className="linklike" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></li>)}</ul>}
    </details>
    <details className="tip-form-section"><summary><h2>3. Final review and declaration</h2></summary>
      <div className="field"><label className="checkline"><input type="checkbox" name="agreement" required/> I am submitting this in good faith. I understand this report is an allegation for review, not a finding that anyone is a gang member or guilty of an offense. I will not submit passwords or real-world sensitive information.</label></div>
    </details>
    {error && <p className="message error" role="alert">{error}</p>}
    <button className="govbtn" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit Gang Tip"}</button>
  </form>;
}
