"use client";

import { useState, type FormEvent } from "react";
import { createCivilMatter } from "@/app/dashboard/civil/actions";
import { PdfUploadInput } from "@/components/pdf-upload-input";
import { PendingSubmitButton } from "@/components/pending-submit-button";

type PartyRole = "Plaintiff" | "Defendant" | "Other";
type Party = { name: string; role: PartyRole };
const steps = ["Matter", "Parties", "Documents", "Review"] as const;

export function CivilMatterOpeningForm({ attorneys, canAssign, previewOnly = false }: { attorneys: { id: string; displayName: string }[]; canAssign: boolean; previewOnly?: boolean }) {
  const [step, setStep] = useState(0);
  const [parties, setParties] = useState<Party[]>([{ name: "", role: "Plaintiff" }, { name: "", role: "Defendant" }]);
  const [title, setTitle] = useState("");
  const [matterType, setMatterType] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");

  function validateStep(currentStep: number) {
    if (currentStep === 0 && (!title.trim() || !matterType || !summary.trim())) {
      setError("Enter the matter title, matter type, and a short factual summary before continuing.");
      return false;
    }
    if (currentStep === 1 && (!parties.some((party) => party.role === "Plaintiff" && party.name.trim()) || !parties.some((party) => party.role === "Defendant" && party.name.trim()))) {
      setError("Add at least one named plaintiff and one named defendant before continuing.");
      return false;
    }
    setError("");
    return true;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    if (!validateStep(0)) { event.preventDefault(); setStep(0); return; }
    if (!validateStep(1)) { event.preventDefault(); setStep(1); }
  }

  return <div className="case-opening-shell">
    <ol className="case-opening-steps" aria-label="Civil matter opening steps">
      {steps.map((label, index) => <li key={label}><button type="button" aria-current={step === index ? "step" : undefined} className={step === index ? "current" : index < step ? "complete" : ""} onClick={() => { if (index <= step || validateStep(step)) setStep(index); }}><span>{index + 1}</span>{label}</button></li>)}
    </ol>

    <form action={previewOnly ? undefined : createCivilMatter} className="case-opening-form" noValidate onSubmit={submit}>
      {error && <p className="message error" role="alert">{error}</p>}
      <fieldset hidden={step !== 0}>
        <legend>Matter information</legend>
        <div className="field-row">
          <div className="field"><label htmlFor="civil-title">Matter title</label><input id="civil-title" name="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder="Example: County v. Name" /></div>
          <div className="field"><label htmlFor="civil-type">Matter type</label><select id="civil-type" name="matterType" value={matterType} onChange={(event) => setMatterType(event.target.value)}><option value="">Select matter type</option><option>Civil Complaint</option><option>County Litigation</option><option>Civil Rights Matter</option><option>Other Civil Matter</option></select></div>
        </div>
        <div className="field"><label htmlFor="civil-summary">Factual summary</label><textarea id="civil-summary" name="summary" value={summary} onChange={(event) => setSummary(event.target.value)} rows={5} maxLength={4000} placeholder="Briefly state the issue, the County's connection, and any known procedural posture." /></div>
        {canAssign && <div className="field"><label htmlFor="civil-assignee">Assigned Civil Division attorney</label><select id="civil-assignee" name="assignedAttorneyId" defaultValue=""><option value="">Assign by current workload</option>{attorneys.map((attorney) => <option key={attorney.id} value={attorney.id}>{attorney.displayName}</option>)}</select><small>Automatic assignment uses the active Civil Division roster and current caseload.</small></div>}
      </fieldset>

      <fieldset hidden={step !== 1}>
        <legend>Parties</legend>
        <p className="note-inline">Identify at least one plaintiff and one defendant. Add other named parties if known.</p>
        <div className="case-party-list">{parties.map((party, index) => <div className="case-party-row" key={index}>
          <div className="field"><label htmlFor={`civil-party-${index}`}>{party.role} name</label><input id={`civil-party-${index}`} name="partyName" value={party.name} maxLength={100} placeholder="Person, office, or entity" onChange={(event) => setParties((current) => current.map((item, row) => row === index ? { ...item, name: event.target.value } : item))} /></div>
          <div className="field"><label htmlFor={`civil-role-${index}`}>Role</label><select id={`civil-role-${index}`} name="partyRole" value={party.role} onChange={(event) => setParties((current) => current.map((item, row) => row === index ? { ...item, role: event.target.value as PartyRole } : item))}><option>Plaintiff</option><option>Defendant</option><option>Other</option></select></div>
          <button type="button" className="govbtn-outline" onClick={() => setParties((current) => current.length > 2 ? current.filter((_, row) => row !== index) : current)} disabled={parties.length <= 2}>Remove</button>
        </div>)}</div>
        <button type="button" className="govbtn-outline" onClick={() => setParties((current) => current.length < 20 ? [...current, { name: "", role: "Other" }] : current)} disabled={parties.length >= 20}>Add party</button>
      </fieldset>

      <fieldset hidden={step !== 2}>
        <legend>Initiating pleading</legend>
        <p className="note-inline">Attach the civil complaint if it is ready. It will be saved as a draft filing for office review. Criminal AOPC, charge, and arraignment fields are not part of this workflow.</p>
        <div className="field"><label htmlFor="civil-complaint-title">Pleading title</label><input id="civil-complaint-title" name="complaintTitle" maxLength={200} defaultValue="Initial Civil Complaint" /></div>
        <div className="field"><label htmlFor="civil-complaint-pdf">Complaint PDF (optional)</label><PdfUploadInput id="civil-complaint-pdf" name="complaintPdf" /></div>
      </fieldset>

      <fieldset hidden={step !== 3}>
        <legend>Review matter</legend>
        <div className="case-review-summary">
          <p><strong>Matter</strong><span>{title || "Title not entered"} · {matterType || "Type not selected"}</span></p>
          <p><strong>Parties</strong><span>{parties.filter((party) => party.name.trim()).map((party) => `${party.name.trim()} (${party.role})`).join(", ") || "None listed"}</span></p>
          <p><strong>Summary</strong><span>{summary || "No summary entered"}</span></p>
          <p><strong>Opening pleading</strong><span>Optional civil complaint PDF</span></p>
          <p className="note-inline">Opening the matter creates an unfiled Civil Division record. The complaint remains a separate review and court-filing step.</p>
        </div>
        {previewOnly && <p className="message" role="note">Preview only. No matter will be created.</p>}
      </fieldset>

      <div className="case-opening-controls">
        <button type="button" className="govbtn-outline" onClick={() => { setError(""); setStep((current) => Math.max(0, current - 1)); }} disabled={step === 0}>Back</button>
        {step < steps.length - 1 ? <button type="button" className="govbtn" onClick={() => { if (validateStep(step)) setStep((current) => current + 1); }}>Continue</button> : previewOnly ? <button type="button" className="govbtn" disabled>Open Civil Matter</button> : <PendingSubmitButton label="Open Civil Matter" pendingLabel="Opening…" />}
      </div>
    </form>
  </div>;
}
