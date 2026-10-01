"use client";

import { useState } from "react";
import { createCase } from "@/app/dashboard/cases/actions";
import { PdfUploadInput } from "@/components/pdf-upload-input";
import { PendingSubmitButton } from "@/components/pending-submit-button";

const steps = ["Case information", "Parties", "Documents", "Review"] as const;
const partyRoles = ["Defendant", "Co-defendant", "Witness", "Reporting officer", "Other"] as const;
type PartyRole = (typeof partyRoles)[number];
type Party = { name: string; role: PartyRole };
export type RevisionDraft = {
  requestId: string;
  rejectionNote: string;
  title: string;
  caseNumber: string;
  type: string;
  assignedJudge: string;
  assignedAttorneyId: string;
  summary: string;
  discDue: string;
  pretrial: string;
  appealBy: string;
  parties: Party[];
  filingTitle: string;
  filingName: string;
};

export function CaseOpeningForm({
  officerName,
  canAssign,
  reviewersCanAutoApprove,
  attorneys,
  revision,
}: {
  officerName: string;
  canAssign: boolean;
  reviewersCanAutoApprove: boolean;
  attorneys: { id: string; displayName: string }[];
  revision?: RevisionDraft;
}) {
  const [step, setStep] = useState(0);
  const [parties, setParties] = useState<Party[]>(revision?.parties.length ? revision.parties : [{ name: "", role: "Defendant" }]);
  const [caseTitle, setCaseTitle] = useState(revision?.title ?? "");
  const [caseType, setCaseType] = useState(revision?.type || "Criminal");
  const [judge, setJudge] = useState(revision?.assignedJudge ?? "");
  const [documentName, setDocumentName] = useState(revision?.filingTitle ?? "");

  function updateParty(index: number, update: Partial<Party>) {
    setParties((current) => current.map((party, item) => item === index ? { ...party, ...update } : party));
  }

  return (
    <section className="case-opening-shell">
      <header className="case-opening-heading">
        <p className="eyebrow">Casework</p>
        <h1>{revision ? "Revise Case Submission" : "Open a Case"}</h1>
        <p className="lede">{revision ? "Update the case details or replace the complaint, then send this same submission back for review." : "Enter the case information, list the people involved, attach an initial filing if available, and review before submitting."}</p>
      </header>

      {revision && <p className="message" role="status"><strong>Returned for revision.</strong> {revision.rejectionNote || "Update the submission and resubmit it for review."}</p>}
      {revision && <p className="message" role="note">Resubmitting returns this request to the leadership review queue.</p>}
      {!revision && !reviewersCanAutoApprove && (
        <p className="message" role="note">This submission will remain private until a Supervising Assistant District Attorney or the District Attorney reviews it.</p>
      )}
      {!revision && reviewersCanAutoApprove && (
        <p className="message message-success" role="note">As a Supervising Assistant District Attorney or District Attorney, your submission is added to the docket immediately.</p>
      )}

      <ol className="case-opening-steps" aria-label="Case submission steps">
        {steps.map((label, index) => (
          <li key={label}>
            <button type="button" aria-current={step === index ? "step" : undefined} className={step === index ? "current" : index < step ? "complete" : ""} onClick={() => setStep(index)}>
              <span>{index + 1}</span>{label}
            </button>
          </li>
        ))}
      </ol>

      <form action={createCase} className="case-opening-form" noValidate>
        {revision && <input type="hidden" name="reviseRequestId" value={revision.requestId} />}
        {revision?.caseNumber && <input type="hidden" name="caseNumber" value={revision.caseNumber} />}
        {revision && <input type="hidden" name="summary" value={revision.summary} />}
        <fieldset hidden={step !== 0}>
          <legend>Case information</legend>
          <div className="field-row">
            <div className="field"><label htmlFor="case-title">Case title</label><input id="case-title" name="title" required maxLength={200} placeholder="Example: State v. PlayerName" value={caseTitle} onChange={(event) => setCaseTitle(event.target.value)} /></div>
            <div className="field"><label htmlFor="case-type">Case type</label><input id="case-type" name="type" maxLength={100} placeholder="Criminal" value={caseType} onChange={(event) => setCaseType(event.target.value)} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="case-judge">Assigned judge</label><input id="case-judge" name="assignedJudge" maxLength={120} placeholder="Not assigned yet" value={judge} onChange={(event) => setJudge(event.target.value)} /></div>
            {canAssign && <div className="field"><label htmlFor="case-attorney">Assigned attorney</label><select id="case-attorney" name="assignedAttorneyId" defaultValue={revision?.assignedAttorneyId ?? ""}><option value="">Assign to submitting officer</option>{attorneys.map((attorney) => <option key={attorney.id} value={attorney.id}>{attorney.displayName}</option>)}</select></div>}
          </div>
          <h3>Key deadlines (optional)</h3>
          <div className="field-row">
            <div className="field"><label htmlFor="disc-due">Discovery due</label><input id="disc-due" type="date" name="discDue" defaultValue={revision?.discDue ?? ""} /></div>
            <div className="field"><label htmlFor="pretrial-date">Pretrial</label><input id="pretrial-date" type="date" name="pretrial" defaultValue={revision?.pretrial ?? ""} /></div>
            <div className="field"><label htmlFor="appeal-date">Appeal deadline</label><input id="appeal-date" type="date" name="appealBy" defaultValue={revision?.appealBy ?? ""} /></div>
          </div>
        </fieldset>

        <fieldset hidden={step !== 1}>
          <legend>People and parties</legend>
          <p className="note-inline">List the defendant or other people connected to the case. Add only information staff need to identify each person in the case.</p>
          <div className="case-party-list">
            {parties.map((party, index) => (
              <div className="case-party-row" key={index}>
                <div className="field"><label htmlFor={`party-name-${index}`}>{party.role === "Defendant" || party.role === "Co-defendant" ? "Roblox username or name" : "Name / username"}</label><input id={`party-name-${index}`} name="partyName" value={party.name} onChange={(event) => updateParty(index, { name: event.target.value })} maxLength={100} placeholder="Enter exact username or name" /></div>
                <div className="field"><label htmlFor={`party-role-${index}`}>Role in case</label><select id={`party-role-${index}`} name="partyRole" value={party.role} onChange={(event) => updateParty(index, { role: event.target.value as PartyRole })}>{partyRoles.map((role) => <option key={role}>{role}</option>)}</select></div>
                <button type="button" className="govbtn-outline" aria-label={`Remove person ${index + 1}`} onClick={() => setParties((current) => current.filter((_, item) => item !== index))} disabled={parties.length === 1}>Remove</button>
              </div>
            ))}
          </div>
          <button type="button" className="govbtn-outline" onClick={() => setParties((current) => current.length < 20 ? [...current, { name: "", role: "Defendant" }] : current)} disabled={parties.length >= 20}>Add person</button>
        </fieldset>

        <fieldset hidden={step !== 2}>
          <legend>Initial filing</legend>
          <p className="note-inline">Upload the initial complaint or supporting document as a PDF. If this request already has a PDF, leave the upload empty to keep it or choose a replacement.</p>
          {revision?.filingName && <p className="message">Current attachment: {revision.filingTitle || revision.filingName}</p>}
          <div className="field"><label htmlFor="initial-filing-title">Document name</label><input id="initial-filing-title" name="initialFilingTitle" maxLength={200} placeholder="Example: Charging complaint" value={documentName} onChange={(event) => setDocumentName(event.target.value)} /></div>
          <div className="field"><label htmlFor="initial-pdf">Upload PDF (max 5 MB)</label><PdfUploadInput id="initial-pdf" name="initialPdf" /></div>
        </fieldset>

        <fieldset hidden={step !== 3}>
          <legend>Review submission</legend>
          <div className="case-review-summary">
            <p><strong>Case</strong><span>{caseTitle || "Title not entered"} · {caseType || "Type not set"}</span></p>
            <p><strong>Assigned judge</strong><span>{judge || "Not assigned"}</span></p>
            <p><strong>Parties</strong><span>{parties.filter((party) => party.name.trim()).map((party) => `${party.name.trim()} (${party.role})`).join(", ") || "None listed"}</span></p>
            <p><strong>Initial filing</strong><span>{documentName || revision?.filingName || "No PDF attached"}</span></p>
            <p><strong>Submitting officer</strong><span>{officerName}</span></p>
            <p><strong>Review path</strong><span>{reviewersCanAutoApprove ? "Immediate docket entry" : "Supervisory review before docket entry"}</span></p>
            <p className="note-inline">{revision ? "Check your changes, then resubmit this request for another review." : "Check the case information and parties before submitting to the docket."}</p>
          </div>
        </fieldset>

        <div className="case-opening-controls">
          <button type="button" className="govbtn-outline" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>Back</button>
          {step < steps.length - 1 ? (
            <button type="button" className="govbtn" onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}>Continue</button>
          ) : (
            <PendingSubmitButton label={revision ? "Resubmit for Review" : reviewersCanAutoApprove ? "Open Case" : "Submit for Review"} pendingLabel="Submitting…" />
          )}
        </div>
      </form>
    </section>
  );
}
