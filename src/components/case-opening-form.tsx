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
  initialFilingDue: string;
  discDue: string;
  pretrial: string;
  appealBy: string;
  parties: Party[];
  filingTitle: string;
  filingName: string;
  aopcTitle: string;
  aopcName: string;
};
export type IntakeDraft = { ticketId: string; title: string; defendant: string; summary: string; requiresAopc: boolean; approvedAopcTitle: string | null; possibleDuplicates: { id: string; caseNumber: string; title: string; stage: string | null }[] };

export function CaseOpeningForm({
  officerName,
  canCreate,
  canAssign,
  requiresCriminalDocuments,
  reviewersCanAutoApprove,
  attorneys,
  revision,
  intakeDraft,
}: {
  officerName: string;
  canCreate: boolean;
  canAssign: boolean;
  requiresCriminalDocuments: boolean;
  reviewersCanAutoApprove: boolean;
  attorneys: { id: string; displayName: string }[];
  revision?: RevisionDraft;
  intakeDraft?: IntakeDraft;
}) {
  const [step, setStep] = useState(0);
  const [parties, setParties] = useState<Party[]>(revision?.parties.length ? revision.parties : [{ name: intakeDraft?.defendant ?? "", role: "Defendant" }]);
  const [caseTitle, setCaseTitle] = useState(revision?.title ?? intakeDraft?.title ?? "");
  const [caseType, setCaseType] = useState(revision?.type || "Criminal");
  const [judge, setJudge] = useState(revision?.assignedJudge ?? "");
  const [documentName, setDocumentName] = useState(revision?.filingTitle ?? (intakeDraft?.requiresAopc ? "Affidavit of Probable Cause (AOPC)" : intakeDraft?.approvedAopcTitle ?? ""));
  const [aopcName, setAopcName] = useState(revision?.aopcTitle ?? intakeDraft?.approvedAopcTitle ?? "Affidavit of Probable Cause (AOPC)");
  const [validationError, setValidationError] = useState("");

  function advance() {
    if (step === 0 && !caseTitle.trim()) {
      setValidationError("Enter a case title before continuing.");
      return;
    }
    if (step === 1 && !parties.some((party) => party.name.trim())) {
      setValidationError("Add at least one person or party before continuing.");
      return;
    }
    if (step === 2) {
      const ciSelected = Boolean((document.getElementById("criminal-information-pdf") as HTMLInputElement | null)?.files?.length);
      const aopcSelected = Boolean((document.getElementById("aopc-pdf") as HTMLInputElement | null)?.files?.length);
      if (requiresCriminalDocuments && !ciSelected && !revision?.filingName) { setValidationError("Attach the Criminal Information PDF before continuing."); return; }
      if (requiresCriminalDocuments && !aopcSelected && !intakeDraft?.approvedAopcTitle && !revision?.aopcName) { setValidationError("Attach the separate AOPC PDF before continuing."); return; }
    }
    setValidationError("");
    setStep((current) => Math.min(steps.length - 1, current + 1));
  }

  function updateParty(index: number, update: Partial<Party>) {
    setParties((current) => current.map((party, item) => item === index ? { ...party, ...update } : party));
    if (update.name?.trim()) setValidationError("");
  }

  return (
    <section className="case-opening-shell">
      <header className="case-opening-heading">
        <p className="eyebrow">Casework</p>
        <h1>{revision ? "Revise Case Submission" : "Open a Case"}</h1>
        <p className="lede">{revision ? "Update the case details or replace the complaint, then send this same submission back for review." : "Enter the case information and parties to create an unfiled staff case record. Filing with the court is a separate action."}</p>
      </header>

      {revision && <p className="message" role="status"><strong>Returned for revision.</strong> {revision.rejectionNote || "Update the submission and resubmit it for review."}</p>}
      {revision && <p className="message" role="note">Resubmitting returns this request to the leadership review queue.</p>}
      {intakeDraft && <div className="message investigator-case-source"><strong>Approved investigator intake.</strong> Confirm the defendant and case title, then review possible duplicates. {intakeDraft.requiresAopc ? "This intake contains an investigative report only. Attach a separate AOPC PDF as the initial filing; the report cannot be used in its place." : "The approved AOPC PDF will be attached as the initial filing."}{intakeDraft.possibleDuplicates.length > 0 && <div><p>Possible existing cases to check before opening:</p><ul>{intakeDraft.possibleDuplicates.map((item) => <li key={item.id}><a href={`/dashboard/cases/${item.id}`} target="_blank" rel="noreferrer">{item.caseNumber} · {item.title}</a>{item.stage ? ` · ${item.stage}` : ""}</li>)}</ul></div>}</div>}
      {!revision && canCreate && !reviewersCanAutoApprove && (
        <p className="message" role="note">Opening the case creates an unfiled record. When you press File on the case page, the initial complaint will go to your division’s review inbox.</p>
      )}
      {!revision && canCreate && reviewersCanAutoApprove && (
        <p className="message message-success" role="note">Opening the case creates an unfiled record. You can file it directly with the court from its case page.</p>
      )}
      {!revision && !canCreate && <p className="message" role="note">This case-opening request will remain private until an authorized reviewer approves it.</p>}

      <ol className="case-opening-steps" aria-label="Case submission steps">
        {steps.map((label, index) => (
          <li key={label}>
            <button type="button" aria-current={step === index ? "step" : undefined} className={step === index ? "current" : index < step ? "complete" : ""} onClick={() => setStep(index)}>
              <span>{index + 1}</span>{label}
            </button>
          </li>
        ))}
      </ol>

      <form action={createCase} className="case-opening-form" noValidate onSubmit={(event) => {
        if (!caseTitle.trim()) {
          event.preventDefault();
          setStep(0);
          setValidationError("Enter a case title before submitting.");
        } else if (!parties.some((party) => party.name.trim())) {
          event.preventDefault();
          setStep(1);
          setValidationError("Add at least one person or party before submitting.");
        } else {
          const ciSelected = Boolean((document.getElementById("criminal-information-pdf") as HTMLInputElement | null)?.files?.length);
          const aopcSelected = Boolean((document.getElementById("aopc-pdf") as HTMLInputElement | null)?.files?.length);
          if (requiresCriminalDocuments && !ciSelected && !revision?.filingName) { event.preventDefault(); setStep(2); setValidationError("Attach the Criminal Information PDF before submitting."); }
          else if (requiresCriminalDocuments && !aopcSelected && !intakeDraft?.approvedAopcTitle && !revision?.aopcName) { event.preventDefault(); setStep(2); setValidationError("Attach the separate AOPC PDF before submitting."); }
        }
      }}>
        {validationError && <p className="message error" role="alert">{validationError}</p>}
        {revision && <input type="hidden" name="reviseRequestId" value={revision.requestId} />}
        {intakeDraft && <input type="hidden" name="intakeTicketId" value={intakeDraft.ticketId} />}
        {revision?.caseNumber && <input type="hidden" name="caseNumber" value={revision.caseNumber} />}
        {revision && <input type="hidden" name="summary" value={revision.summary} />}
        {intakeDraft && <input type="hidden" name="summary" value={intakeDraft.summary} />}
        <fieldset hidden={step !== 0}>
          <legend>Case information</legend>
          <div className="field-row">
            <div className="field"><label htmlFor="case-title">Case title</label><input id="case-title" name="title" required maxLength={200} placeholder="Example: State v. PlayerName" value={caseTitle} aria-invalid={Boolean(validationError)} onChange={(event) => { setCaseTitle(event.target.value); setValidationError(""); }} /></div>
            <div className="field"><label htmlFor="case-type">Case type</label><input id="case-type" name="type" maxLength={100} placeholder="Criminal" value={caseType} onChange={(event) => setCaseType(event.target.value)} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label htmlFor="case-judge">Assigned judge</label><input id="case-judge" name="assignedJudge" maxLength={120} placeholder="Not assigned yet" value={judge} onChange={(event) => setJudge(event.target.value)} /></div>
            {canAssign && <div className="field"><label htmlFor="case-attorney">Assigned attorney</label><select id="case-attorney" name="assignedAttorneyId" defaultValue={revision?.assignedAttorneyId ?? ""}><option value="">Auto assign by workload</option>{attorneys.map((attorney) => <option key={attorney.id} value={attorney.id}>{attorney.displayName}</option>)}</select><small>Automatic assignment balances active caseload, case type, rank, and division group.</small></div>}
          </div>
          <h3>Manually entered case dates (optional)</h3>
          <div className="field-row">
            <div className="field"><label htmlFor="initial-filing-due">Filing / portal reconciliation target</label><input id="initial-filing-due" type="date" name="initialFilingDue" defaultValue={revision?.initialFilingDue ?? ""} /><small>Internal office target only. Not a court deadline. Reconcile an externally filed case instead of filing it again.</small></div>
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
          <legend>Required case documents</legend>
          <p className="note-inline">{requiresCriminalDocuments ? "A Criminal Division case cannot open without both a Criminal Information and a separate AOPC. An investigative report is supporting material and does not replace the AOPC." : "Attach the documents needed for this case. Portal approval and filing with the court remain separate steps."}</p>
          {revision?.filingName && <p className="message">Current Criminal Information: {revision.filingTitle || revision.filingName}</p>}
          <div className="field"><label htmlFor="criminal-information-title">Criminal Information title</label><input id="criminal-information-title" name="criminalInformationTitle" maxLength={200} value={documentName} onChange={(event) => setDocumentName(event.target.value)} /></div>
          <div className="field"><label htmlFor="criminal-information-pdf">Criminal Information PDF {requiresCriminalDocuments && !revision?.filingName && "(required)"}</label><PdfUploadInput id="criminal-information-pdf" name="criminalInformationPdf" required={requiresCriminalDocuments && !revision?.filingName} /></div>
          {intakeDraft?.approvedAopcTitle && !revision?.aopcName ? <p className="message message-success">Approved AOPC attached from investigator intake: {intakeDraft.approvedAopcTitle}</p> : <>
            {revision?.aopcName && <p className="message">Current AOPC: {revision.aopcTitle || revision.aopcName}</p>}
            <div className="field"><label htmlFor="aopc-title">AOPC title</label><input id="aopc-title" name="aopcTitle" maxLength={200} value={aopcName} onChange={(event) => setAopcName(event.target.value)} /></div>
            <div className="field"><label htmlFor="aopc-pdf">Separate AOPC PDF {requiresCriminalDocuments && !revision?.aopcName && "(required)"}</label><PdfUploadInput id="aopc-pdf" name="aopcPdf" required={requiresCriminalDocuments && !revision?.aopcName} /></div>
          </>}
        </fieldset>

        <fieldset hidden={step !== 3}>
          <legend>Review submission</legend>
          <div className="case-review-summary">
            <p><strong>Case</strong><span>{caseTitle || "Title not entered"} · {caseType || "Type not set"}</span></p>
            <p><strong>Assigned judge</strong><span>{judge || "Not assigned"}</span></p>
            <p><strong>Parties</strong><span>{parties.filter((party) => party.name.trim()).map((party) => `${party.name.trim()} (${party.role})`).join(", ") || "None listed"}</span></p>
            <p><strong>Criminal Information</strong><span>{documentName || revision?.filingName || "No PDF attached"}</span></p>
            <p><strong>AOPC</strong><span>{intakeDraft?.approvedAopcTitle || aopcName || revision?.aopcName || "No PDF attached"}</span></p>
            <p><strong>Submitting officer</strong><span>{officerName}</span></p>
            <p><strong>Next step</strong><span>{revision ? "Resubmission for review" : canCreate ? "Save an unfiled case with both required documents; court filing remains a separate action" : "Reviewer approval before the case record is created"}</span></p>
            <p className="note-inline">{revision ? "Check your changes, then resubmit this request for another review." : canCreate ? "No court filing is created until you use File on the case page." : "Check the case information and parties before submitting."}</p>
          </div>
        </fieldset>

        <div className="case-opening-controls">
          <button type="button" className="govbtn-outline" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0}>Back</button>
          {step < steps.length - 1 ? (
            <button type="button" className="govbtn" onClick={advance}>Continue</button>
          ) : (
            <PendingSubmitButton label={revision ? "Resubmit for Review" : canCreate ? "Save Unfiled Case" : "Submit for Review"} pendingLabel="Saving…" />
          )}
        </div>
      </form>
    </section>
  );
}
