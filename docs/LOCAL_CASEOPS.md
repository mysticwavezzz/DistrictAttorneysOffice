# Local case operations

`scripts/dao-caseops.ps1` provides signed case lookup and assignment commands for the authorized DAO owner account on one Windows computer. It does not automate the portal UI. The portal checks the account's current Roblox group permissions for each request, restricts the docket to that account's case visibility, checks assignee eligibility, records an assignment history comment, and sends the usual assignment notification.

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
```

Use `-AssigneeId UNASSIGNED` to preview or apply unassignment. Assignment requests include the case's current assignee as a precondition, so a changed case returns a conflict and is not overwritten.

## Scope and security

The credential can only be created from the authenticated `M_ysticWavezzz` owner account, is bound server-side to that account, and the API rechecks live Roblox group roles and the current roster before returning case data or changing an assignment. Each request is signed by the Windows certificate key; copying the token or public certificate to another computer is not enough to sign requests. The token is stored encrypted for the current Windows user and expires after 90 days. Revoke it immediately if the computer or Windows account is compromised.

The API exposes only case listing, eligible attorney listing, and case reassignment. It does not expose filing upload, case creation, review decisions, or approval actions.
