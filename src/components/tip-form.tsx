"use client";

import { useRef, useState, type FormEvent } from "react";

type SubmitState = "idle" | "submitting" | { receipt: string } | { error: string };

export function TipForm({
  crimeTypes,
  defaultRobloxIdentity = "",
  defaultDiscordIdentity = "",
}: {
  crimeTypes: readonly string[];
  defaultRobloxIdentity?: string;
  defaultDiscordIdentity?: string;
}) {
  const [state, setState] = useState<SubmitState>("idle");
  const [crimeType, setCrimeType] = useState("");
  const renderedAtRef = useRef(Date.now());
  const submissionReferenceRef = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting") return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (!submissionReferenceRef.current) submissionReferenceRef.current = `HCD-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const data = new FormData(form);
    const body = {
      submitterRoblox: String(data.get("submitterRoblox") ?? ""),
      submitterDiscord: String(data.get("submitterDiscord") ?? ""),
      legalAcknowledgment: data.get("legalAcknowledgment") === "on",
      crimeType: String(data.get("crimeType") ?? ""),
      crimeTypeOther: String(data.get("crimeTypeOther") ?? ""),
      incidentDateTime: String(data.get("incidentDateTime") ?? ""),
      location: String(data.get("location") ?? ""),
      suspectRoblox: String(data.get("suspectRoblox") ?? ""),
      suspectDiscord: String(data.get("suspectDiscord") ?? ""),
      suspectInformation: String(data.get("suspectInformation") ?? ""),
      narrative: String(data.get("narrative") ?? ""),
      evidence: String(data.get("evidence") ?? ""),
      witnesses: String(data.get("witnesses") ?? ""),
      identityWaiver: data.get("identityWaiver") === "on",
      truthAffirmation: data.get("truthAffirmation") === "on",
      signature: String(data.get("signature") ?? "").toUpperCase(),
      submissionReference: submissionReferenceRef.current,
      website: String(data.get("website") ?? ""),
      renderedAt: renderedAtRef.current,
    };
    setState("submitting");
    try {
      const response = await fetch("/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null) as { success?: boolean; error?: string; receipt?: string } | null;
      if (!response.ok || !result?.success || !result.receipt) {
        setState({ error: result?.error ?? "We couldn't submit your report. Please try again." });
        return;
      }
      setState({ receipt: result.receipt ?? "Reference unavailable" });
      formRef.current?.reset();
      setCrimeType("");
    } catch {
      setState({ error: "A connection error occurred. Please check your connection and try again." });
    }
  }

  if (typeof state === "object" && "receipt" in state) {
    return <div className="message message-success" role="status"><strong>Report submitted.</strong> Reference: <span className="mono">{state.receipt}</span>. Keep this number if you contact investigators through Discord. Your reference was included with the report sent to the office&apos;s Google Form and its Discord webhook. This confirmation does not guarantee an investigation or reply. <button type="button" className="linklike" onClick={() => { renderedAtRef.current = Date.now(); submissionReferenceRef.current = null; setState("idle"); }}>Submit another report</button></div>;
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} onInvalid={(event) => { if (event.target instanceof HTMLElement) { const section = event.target.closest("details.tip-form-section"); if (section instanceof HTMLDetailsElement) section.open = true; } }} className="formbox tip-form">
      <div className="field" style={{ position: "absolute", left: "-10000px" }} aria-hidden="true"><label htmlFor="tip-website">Leave blank</label><input id="tip-website" name="website" tabIndex={-1} autoComplete="off" /></div>
      <p className="section-lede">Complete each section below. Required fields are marked with an asterisk.</p>
      <details className="tip-form-section" open>
      <summary><h2>1. Submitter information</h2></summary>
      <div className="field-row">
        <div className="field"><label htmlFor="tip-roblox">Your Roblox username and ID *</label><input id="tip-roblox" name="submitterRoblox" required maxLength={120} defaultValue={defaultRobloxIdentity} placeholder="Username / numeric ID" /></div>
        <div className="field"><label htmlFor="tip-discord">Your Discord username and ID *</label><input id="tip-discord" name="submitterDiscord" required maxLength={120} defaultValue={defaultDiscordIdentity} placeholder="Username / numeric ID" /></div>
      </div>
      <div className="field">
        <label className="checkline"><input type="checkbox" name="legalAcknowledgment" required /> I understand that knowingly false or malicious reports are prohibited, and I wish to proceed.</label>
      </div>

      </details>
      <details className="tip-form-section">
      <summary><h2>2. Incident and evidence</h2></summary>
      <fieldset className="field"><legend className="field-label">Type of crime / incident *</legend><div className="choice-list">{crimeTypes.map((type) => <label className="checkline" key={type}><input type="radio" name="crimeType" value={type} required checked={crimeType === type} onChange={() => setCrimeType(type)} />{type === "Other:" ? "Other" : type}</label>)}</div></fieldset>
      {crimeType === "Other:" && <div className="field"><label htmlFor="tip-other">Describe the other incident type *</label><input id="tip-other" name="crimeTypeOther" required maxLength={120} /></div>}
      <div className="field-row">
        <div className="field"><label htmlFor="tip-date">Date and time of incident *</label><input id="tip-date" name="incidentDateTime" type="datetime-local" required /></div>
        <div className="field"><label htmlFor="tip-location">Location of incident *</label><input id="tip-location" name="location" required maxLength={300} /></div>
      </div>
      <div className="field-row">
        <div className="field"><label htmlFor="suspect-roblox">Suspect Roblox username *</label><input id="suspect-roblox" name="suspectRoblox" required maxLength={120} placeholder="Type N/A if unknown" /></div>
        <div className="field"><label htmlFor="suspect-discord">Suspect Discord username *</label><input id="suspect-discord" name="suspectDiscord" required maxLength={120} placeholder="Type N/A if unknown" /></div>
      </div>
      <div className="field"><label htmlFor="suspect-info">Suspect information *</label><textarea id="suspect-info" name="suspectInformation" required maxLength={2000} rows={3} placeholder="Names, descriptions, clothing, vehicles, affiliations, or N/A if unknown." /></div>
      <div className="field"><label htmlFor="tip-narrative">Describe what happened before, during, and after the incident *</label><textarea id="tip-narrative" name="narrative" required minLength={20} maxLength={8000} rows={7} /></div>
      <div className="field"><label htmlFor="tip-evidence">Photo/video evidence links *</label><textarea id="tip-evidence" name="evidence" required maxLength={2000} rows={2} placeholder="Paste links or type N/A." /></div>
      <div className="field"><label htmlFor="tip-witnesses">Witnesses and their involvement *</label><textarea id="tip-witnesses" name="witnesses" required maxLength={2000} rows={2} placeholder="Provide known witnesses or type N/A." /></div>

      </details>
      <details className="tip-form-section">
      <summary><h2>3. Final review and declaration</h2></summary>
      <div className="field"><label className="checkline"><input type="checkbox" name="identityWaiver" required /> I understand this is not anonymous to the form owner or investigators, and I may be contacted if additional information is needed.</label></div>
      <div className="field"><label className="checkline"><input type="checkbox" name="truthAffirmation" required /> I affirm that this report is accurate and submitted in good faith.</label></div>
      <div className="field"><label htmlFor="tip-signature">Electronic signature: Roblox username in ALL CAPS *</label><input id="tip-signature" name="signature" required maxLength={120} pattern="[A-Z0-9_ ]+" onChange={(event) => { event.currentTarget.value = event.currentTarget.value.toUpperCase(); }} /></div>
      </details>

      {typeof state === "object" && "error" in state && <p className="message message-error" role="alert">{state.error} Your entries are still here. Check your connection and retry; do not submit a second copy in Google Forms.</p>}
      <button type="submit" className="govbtn" disabled={state === "submitting"}>{state === "submitting" ? "Submitting report…" : typeof state === "object" && "error" in state ? "Retry submission" : "Submit Official Tip"}</button>
    </form>
  );
}
