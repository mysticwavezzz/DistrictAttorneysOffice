# Local case operations

`scripts/dao-caseops.ps1` provides signed, browserless case operations for the authorized DAO owner account on one Windows computer. It does not automate the portal UI. The portal checks the account's current permissions for each request, restricts the docket to that account's case visibility, checks assignee eligibility, and records case history for changes.

## One-time setup

Run from the repository folder in PowerShell 7:

```powershell
pwsh -File .\scripts\dao-caseops.ps1 setup
```

The script creates a P-256 signing key in the current Windows user's certificate store with a non-exportable private key. It copies only the public certificate to the clipboard. While signed in to the DAO site as the authorized owner, open **Settings → Local case operations**, paste the certificate, name the computer, and create the credential. It is shown once.

Save the credential on that same Windows account and computer:

```powershell
pwsh -File .\scripts\dao-caseops.ps1 save-token
```

The script prompts securely and stores the credential with Windows DPAPI under `%LOCALAPPDATA%\DistrictAttorneyCaseOps`. The portal credential expires after 90 days and can be revoked from the settings page. Only one active credential is allowed for the owner account.

For local development, run `setup -Local`. It creates a separate local signing key, config file, and DPAPI credential and targets only `http://localhost:3000`; it never reuses the production credential file. A local test database must have its own automation credential registered before authenticated requests will work.

## Commands

List cases assigned to the owner:

```powershell
pwsh -File .\scripts\dao-caseops.ps1 cases
```

List the accessible docket or unassigned cases:

```powershell
pwsh -File .\scripts\dao-caseops.ps1 cases -Scope all
pwsh -File .\scripts\dao-caseops.ps1 cases -Scope unassigned
```

Read-only reconciliation flags unassigned cases, missing court-filing records, unset stages, and overdue initial-filing targets. It does not change case data. `-ExportPath` saves a CSV to an existing local folder.

```powershell
pwsh -File .\scripts\dao-caseops.ps1 reconcile -Scope all
pwsh -File .\scripts\dao-caseops.ps1 reconcile -Scope all -ExportPath .\work\case-reconciliation.csv
pwsh -File .\scripts\dao-caseops.ps1 reconcile -Scope all -Local
```

List eligible attorneys and their portal IDs:

```powershell
pwsh -File .\scripts\dao-caseops.ps1 attorneys
```

Preview an assignment:

```powershell
pwsh -File .\scripts\dao-caseops.ps1 assign -CaseNumber DA-2026-0001 -AssigneeId USER_ID
```

Apply it after the confirmation prompt:

```powershell
pwsh -File .\scripts\dao-caseops.ps1 assign -CaseNumber DA-2026-0001 -AssigneeId USER_ID -Apply
pwsh -File .\scripts\dao-caseops.ps1 assign -CaseNumbers DA-2026-0001,DA-2026-0002 -AssigneeId USER_ID
pwsh -File .\scripts\dao-caseops.ps1 assign -CaseNumbers DA-2026-0001,DA-2026-0002 -AssigneeId USER_ID -Apply
```

Bulk assignments are preview-only unless `-Apply` is supplied. Applying them prompts separately for each case, and the portal checks the expected prior assignee to avoid overwriting a concurrent change.

Use `-AssigneeId UNASSIGNED` to preview or apply unassignment. Assignment requests include the case's current assignee as a precondition, so a changed case returns a conflict and is not overwritten.

## Scope and security

The credential can only be created from the authenticated `M_ysticWavezzz` owner account, is bound server-side to that account, and the API rechecks live Roblox group roles and the current roster before returning case data or changing an assignment. Each request is signed by the Windows certificate key; copying the token or public certificate to another computer is not enough to sign requests. The token is stored encrypted for the current Windows user and expires after 90 days. Revoke it immediately if the computer or Windows account is compromised.

The API exposes case listing and detail, eligible-attorney listing, case reassignment, guarded case-field updates, recording an opening filing as filed in court, selected manual-note management, PDF filing upload, and case creation. Mutating commands preview first and require `-Apply`; the API independently checks live portal permissions and concurrent changes.

Open a new Criminal Division case with a separate AOPC PDF; an opening filing PDF is optional and can be added later:

```powershell
pwsh -File .\scripts\dao-caseops.ps1 create-case `
  -CaseTitle "People v. ExampleUser" `
  -DefendantName "ExampleUser" `
  -OpeningFilingTitle "Complaint" `
  -OpeningFilingPdfPath "C:\path\to\opening filing.pdf" `
  -AopcPdfPath "C:\path\to\AOPC.pdf"
```

If there is no opening filing yet, omit both opening-filing parameters; the separate AOPC remains required:

```powershell
pwsh -File .\scripts\dao-caseops.ps1 create-case `
  -CaseTitle "People v. ExampleUser" `
  -DefendantName "ExampleUser" `
  -AopcPdfPath "C:\path\to\AOPC.pdf"
```

The command previews the case and any supplied PDFs without writing anything. `-OpeningFilingPdfPath` and its title are optional; when supplied, the PDF can be any filing and its portal title is set with `-OpeningFilingTitle`. It does not have to be a Criminal Information. The separate AOPC remains required for Criminal Division cases. To create the case after reviewing the preview, add `-Apply`; PowerShell asks for confirmation. It creates an unfiled staff case, auto-assigns an eligible Criminal Division attorney by workload, and attaches the AOPC and any supplied opening filing as drafts. Nothing is approved or filed with the court. Use `-CoDefendants name1,name2`, `-AssignedJudge`, `-Stage`, `-Summary`, `-AopcTitle`, or `-AssigneeId` when needed; a manually selected assignee must be eligible under the caller's current permissions. Each supplied PDF must be valid, unencrypted, and 5 MB or smaller. Repeating the same title, defendant list, and PDFs returns the existing case rather than creating another; if the same title has different documents, the command stops for manual review. `-CiPdfPath` and `-CiTitle` remain aliases for the renamed opening-filing parameters.

Case creation requires the signed endpoint `POST /api/automation/cases/create`, deployed to the portal. It requires live `cases:create` permission and current Criminal Division assignment authority, applies current roster/group eligibility, records case history and activity, and does not accept court filing dates or action numbers. Approved investigator intake conversion remains in the portal workflow.

The signed local API also accepts a PDF filing for an existing active case. This avoids the browser file picker: the script reads a PDF from this computer and sends it through the same permission-checked portal API. The filing is added to the case and, when required, placed in the Review Inbox as pending. It is not approved and is not marked filed in court.

Preview an upload:

```powershell
pwsh -File .\scripts\dao-caseops.ps1 submit-filing -CaseNumber HCR-26-0025 -Title "Motion" -PdfPath "C:\path\to\filing.pdf"
```

Submit after reviewing the preview; PowerShell will request confirmation:

```powershell
pwsh -File .\scripts\dao-caseops.ps1 submit-filing -CaseNumber HCR-26-0025 -Title "Motion" -PdfPath "C:\path\to\filing.pdf" -Apply
```

The command requires the one-time local case-operations setup above, accepts PDFs up to 5 MB, checks the PDF header and end marker, and refuses archived or draft cases. It reports the case and Review Inbox links after submission and avoids creating a duplicate when the same title and PDF were already submitted by the same account.

Read the complete visible docket for a case, including filing status, case history, events, evidence links, and tasks:

```powershell
pwsh -File .\scripts\dao-caseops.ps1 case-detail -CaseNumber HCR-26-0025
```

Update selected case fields. The update carries the version timestamp returned by the detail request, so a concurrent edit fails with a conflict rather than being overwritten. Dates should be entered as ISO 8601 values with a timezone.

```powershell
pwsh -File .\scripts\dao-caseops.ps1 update-case -CaseNumber HCR-26-0025 -Stage "Pretrial" -AssignedJudge "Judge Name"
pwsh -File .\scripts\dao-caseops.ps1 update-case -CaseNumber HCR-26-0025 -Stage "Pretrial" -AssignedJudge "Judge Name" -Apply
```

After the approved opening filing has actually been filed in court, record that fact in the portal. This records the current time; it does not file anything with the court.

```powershell
pwsh -File .\scripts\dao-caseops.ps1 filed-in-court -CaseNumber HCR-26-0025
pwsh -File .\scripts\dao-caseops.ps1 filed-in-court -CaseNumber HCR-26-0025 -Apply
```

These added case endpoints must be deployed to the DAO portal before the production commands work. The local script and API changes do not deploy themselves.

## Current coverage boundary

This is the first browserless operations tranche, not a claim that every portal feature is scriptable yet. Public pages, investigator ticket conversations and review, tip decryption/review, general filing approvals, roster profile CRUD and rank control, announcements, settings/configuration, training, weekly reports, and records requests still need dedicated permission-checked endpoints and matching commands. They must not be exposed through a generic unrestricted database-write command.

List manual notes written by the signed-in account on accessible Criminal Division cases, then preview or remove selected IDs. Deletion rejects system history, notes by other staff, and notes outside the Criminal Division.

```powershell
pwsh -File .\scripts\dao-caseops.ps1 case-comments
pwsh -File .\scripts\dao-caseops.ps1 delete-case-comments -CommentIds ID1,ID2
pwsh -File .\scripts\dao-caseops.ps1 delete-case-comments -CommentIds ID1,ID2 -Apply
```
