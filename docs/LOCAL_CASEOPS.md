# Local case operations

`scripts/dao-caseops.ps1` provides signed case lookup, read-only docket reconciliation, and assignment commands for the authorized DAO owner account on one Windows computer. It does not automate the portal UI. The portal checks the account's current permissions for each request, restricts the docket to that account's case visibility, checks assignee eligibility, records an assignment history comment, and sends the usual assignment notification.

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

The API exposes only case listing, eligible attorney listing, and case reassignment. Reconciliation adds filing-status and due-date fields to the authorized case listing. It does not expose filing upload, case creation, review decisions, or approval actions.

List manual notes written by the signed-in account on accessible Criminal Division cases, then preview or remove selected IDs. Deletion rejects system history, notes by other staff, and notes outside the Criminal Division.

```powershell
pwsh -File .\scripts\dao-caseops.ps1 case-comments
pwsh -File .\scripts\dao-caseops.ps1 delete-case-comments -CommentIds ID1,ID2
pwsh -File .\scripts\dao-caseops.ps1 delete-case-comments -CommentIds ID1,ID2 -Apply
```
