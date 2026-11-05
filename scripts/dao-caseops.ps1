#Requires -Version 7.0

# Local case operations for the authorized DAO account on this Windows computer.
# The API token is protected with Windows DPAPI; requests are signed by a
# non-exportable P-256 key in the current Windows user's certificate store.
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
  [Parameter(Position = 0)]
  [ValidateSet("setup", "save-token", "cases", "case-detail", "attorneys", "assign", "reconcile", "case-comments", "delete-case-comments", "submit-filing", "create-case", "update-case", "filed-in-court")]
  [string]$Command = "cases",

  [ValidateSet("mine", "unassigned", "all")]
  [string]$Scope = "mine",

  [string]$CaseNumber,
  [string[]]$CaseNumbers,
  [string]$AssigneeId,
  [string[]]$CommentIds,
  [string]$ExportPath,
  [string]$Title,
  [string]$PdfPath,
  [string]$CaseTitle,
  [string]$DefendantName,
  [string[]]$CoDefendants,
  [string]$Division = "Criminal Division",
  [string]$AssignedJudge,
  [string]$Summary = "",
  [string]$Stage,
  [string]$Disclosures,
  [string]$Outcome,
  [string]$ArraignmentAt,
  [string]$DiscoveryGivenAt,
  [string]$DiscoveryDueAt,
  [string]$PretrialAt,
  [string]$ClosedAt,
  [Alias("CiTitle")][string]$OpeningFilingTitle = "Initial Filing",
  [Alias("CiPdfPath")][string]$OpeningFilingPdfPath,
  [string]$AopcTitle = "Affidavit of Probable Cause (AOPC)",
  [string]$AopcPdfPath,
  [switch]$Local,
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$script:DefaultBaseUrl = if ($Local) { "http://localhost:3000" } else { "https://districtattorneysoffice-production.up.railway.app" }
$script:ConfigDirectory = Join-Path $env:LOCALAPPDATA "DistrictAttorneyCaseOps"
$script:ConfigPath = Join-Path $script:ConfigDirectory $(if ($Local) { "config-local.json" } else { "config.json" })
$script:CredentialPath = Join-Path $script:ConfigDirectory $(if ($Local) { "credential-local.dpapi" } else { "credential.dpapi" })
$script:CertificateSubject = "CN=Harrison DAO Local CaseOps Device Key"

function Ensure-ConfigDirectory {
  if (-not (Test-Path -LiteralPath $script:ConfigDirectory)) {
    New-Item -ItemType Directory -Path $script:ConfigDirectory -Force | Out-Null
  }
}

function Get-LocalConfig {
  if (-not (Test-Path -LiteralPath $script:ConfigPath)) {
    throw "Run 'setup' first: pwsh -File .\scripts\dao-caseops.ps1 setup"
  }
  $config = Get-Content -LiteralPath $script:ConfigPath -Raw | ConvertFrom-Json
  if ($Local -and $config.baseUrl -ne "http://localhost:3000") { throw "The local profile must point to http://localhost:3000. Run setup -Local first." }
  return $config
}

function Initialize-LocalKey {
  if (-not $IsWindows) { throw "This local credential tool is limited to Windows." }
  Ensure-ConfigDirectory

  $config = if (Test-Path -LiteralPath $script:ConfigPath) { Get-LocalConfig } else { $null }
  $certificate = $null
  if ($config -and $config.thumbprint) {
    $certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$($config.thumbprint)" -ErrorAction SilentlyContinue
  }
  if (-not $certificate) {
    $certificate = Get-ChildItem Cert:\CurrentUser\My | Where-Object Subject -eq $script:CertificateSubject | Sort-Object NotAfter -Descending | Select-Object -First 1
  }
  if (-not $certificate) {
    $certificate = New-SelfSignedCertificate `
      -Subject $script:CertificateSubject `
      -CertStoreLocation "Cert:\CurrentUser\My" `
      -KeyAlgorithm ECDSA_nistP256 `
      -KeyExportPolicy NonExportable `
      -KeyUsage DigitalSignature `
      -Provider "Microsoft Software Key Storage Provider" `
      -NotAfter (Get-Date).AddYears(5)
  }

  $config = [ordered]@{
    baseUrl = $script:DefaultBaseUrl
    thumbprint = $certificate.Thumbprint
  }
  [System.IO.File]::WriteAllText($script:ConfigPath, ($config | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))

  $der = $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
  $base64 = [Convert]::ToBase64String($der)
  $lines = for ($offset = 0; $offset -lt $base64.Length; $offset += 64) {
    $base64.Substring($offset, [Math]::Min(64, $base64.Length - $offset))
  }
  $pem = "-----BEGIN CERTIFICATE-----`n$($lines -join "`n")`n-----END CERTIFICATE-----"
  Set-Clipboard -Value $pem
  Write-Host "Device signing key is ready. The private key stays in the Windows certificate store and cannot be exported."
  Write-Host "The public certificate is copied to the clipboard. Paste it at: $($script:DefaultBaseUrl)/settings/local-automation"
  Write-Host "Config saved under your Windows profile: $script:ConfigPath"
}

function Save-LocalToken {
  if (-not $IsWindows) { throw "This local credential tool is limited to Windows." }
  $config = Get-LocalConfig
  $certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$($config.thumbprint)" -ErrorAction SilentlyContinue
  if (-not $certificate -or -not $certificate.HasPrivateKey) { throw "The local signing key is missing. Revoke the portal credential and run setup again." }

  $secureToken = Read-Host "Paste the one-time DAO credential" -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try {
    $tokenText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($tokenText -notmatch '^dao_[A-Za-z0-9_-]{43}$') { throw "That credential format is not valid." }
    Ensure-ConfigDirectory
    $protected = ConvertFrom-SecureString -SecureString $secureToken
    [System.IO.File]::WriteAllText($script:CredentialPath, $protected, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Credential stored encrypted for this Windows user on this PC."
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $tokenText = $null
  }
}

function Get-LocalTokenText {
  if (-not (Test-Path -LiteralPath $script:CredentialPath)) { throw "Run 'save-token' once to store the portal credential on this PC." }
  $protected = Get-Content -LiteralPath $script:CredentialPath -Raw
  $secureToken = ConvertTo-SecureString -String $protected
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Get-Sha256Hex([string]$value) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($value)
  return [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
}

function Invoke-DaoApi([string]$Method, [string]$Path, [string]$Body = "") {
  $config = Get-LocalConfig
  $token = Get-LocalTokenText
  $certificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$($config.thumbprint)" -ErrorAction SilentlyContinue
  if (-not $certificate -or -not $certificate.HasPrivateKey) { throw "The local signing key is missing. Revoke the portal credential and run setup again." }

  $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
  $bodyHash = Get-Sha256Hex $Body
  $signedMessage = "$timestamp`n$($Method.ToUpperInvariant())`n$Path`n$bodyHash"
  $signer = [System.Security.Cryptography.X509Certificates.ECDsaCertificateExtensions]::GetECDsaPrivateKey($certificate)
  if (-not $signer) { throw "The certificate does not contain a usable P-256 signing key." }
  try {
    $signature = $signer.SignData([System.Text.Encoding]::UTF8.GetBytes($signedMessage), [System.Security.Cryptography.HashAlgorithmName]::SHA256)
  } finally {
    $signer.Dispose()
  }

  $headers = @{
    Authorization = "Bearer $token"
    "X-DAO-Timestamp" = $timestamp
    "X-DAO-Signature" = [Convert]::ToBase64String($signature)
  }
  $request = @{
    Uri = "$($config.baseUrl.TrimEnd('/'))$Path"
    Method = $Method.ToUpperInvariant()
    Headers = $headers
    ErrorAction = "Stop"
  }
  if ($Method -ne "GET") {
    $request.ContentType = "application/json; charset=utf-8"
    $request.Body = $Body
  }

  try {
    $response = Invoke-WebRequest @request
    if (-not $response.Content) { return $null }
    return $response.Content | ConvertFrom-Json
  } catch {
    $detail = $_.ErrorDetails.Message
    if (-not $detail) { $detail = $_.Exception.Message }
    try {
      $problem = $detail | ConvertFrom-Json
      if ($problem.error) { $detail = $problem.error }
    } catch { }
    throw "DAO request failed: $detail"
  } finally {
    $token = $null
    $signedMessage = $null
  }
}

function Get-DaoCases([string]$RequestedScope) {
  $items = [System.Collections.Generic.List[object]]::new()
  $cursor = $null
  do {
    $path = "/api/automation/cases?scope=$RequestedScope&limit=200"
    if ($cursor) { $path += "&cursor=$([uri]::EscapeDataString($cursor))" }
    $page = Invoke-DaoApi -Method GET -Path $path
    foreach ($item in $page.items) { $items.Add($item) }
    $cursor = $page.nextCursor
  } while ($cursor)
  return $items
}

function Get-DaoCaseDetail([string]$Number) {
  if (-not $Number) { throw "Provide -CaseNumber." }
  $safeNumber = [uri]::EscapeDataString($Number)
  return Invoke-DaoApi -Method GET -Path "/api/automation/cases/$safeNumber"
}

function Convert-OptionalIsoDate([string]$Value, [string]$Name) {
  if (-not $Value) { return $null }
  $parsed = [DateTimeOffset]::MinValue
  if (-not [DateTimeOffset]::TryParse($Value, [ref]$parsed)) { throw "$Name must be a valid date/time, preferably ISO 8601 (for example 2026-11-05T18:00:00-05:00)." }
  return $parsed.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
}

function Update-DaoCase {
  $detail = Get-DaoCaseDetail -Number $CaseNumber
  $case = $detail.case
  $body = [ordered]@{ expectedUpdatedAt = ([DateTimeOffset]::Parse($case.updatedAt)).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ") }
  if ($null -ne $Stage) { $body.stage = $Stage }
  if ($null -ne $AssignedJudge) { $body.assignedJudge = $AssignedJudge }
  if ($Summary.Length -gt 0) { $body.summary = $Summary }
  if ($null -ne $Disclosures) { $body.disclosures = $Disclosures }
  if ($null -ne $Outcome) { $body.outcome = $Outcome }
  $dateFields = @(
    @{ Key = "arraignmentAt"; Value = $ArraignmentAt; Label = "Arraignment date" },
    @{ Key = "discGiven"; Value = $DiscoveryGivenAt; Label = "Discovery served date" },
    @{ Key = "discDue"; Value = $DiscoveryDueAt; Label = "Discovery due date" },
    @{ Key = "pretrial"; Value = $PretrialAt; Label = "Pretrial date" },
    @{ Key = "closedOn"; Value = $ClosedAt; Label = "Closed date" }
  )
  foreach ($entry in $dateFields) {
    if ($entry.Value) { $body[$entry.Key] = Convert-OptionalIsoDate -Value $entry.Value -Name $entry.Label }
  }
  if ($body.Keys.Count -eq 1) { throw "Provide at least one update field such as -Stage, -AssignedJudge, or -Outcome." }
  [pscustomobject]@{ CaseNumber = $case.caseNumber; Title = $case.title; CurrentStage = $case.stage; ProposedFields = (($body.Keys | Where-Object { $_ -ne "expectedUpdatedAt" }) -join ", ") } | Format-List
  if (-not $Apply) { Write-Host "Preview only. Add -Apply to save these fields. The portal records the change in the case history."; return }
  if ($PSCmdlet.ShouldProcess($CaseNumber, "Update case fields: $($body.Keys -join ', ')")) {
    $json = $body | ConvertTo-Json -Compress
    $safeNumber = [uri]::EscapeDataString($CaseNumber)
    $saved = Invoke-DaoApi -Method PATCH -Path "/api/automation/cases/$safeNumber" -Body $json
    Write-Host "Updated $($saved.caseNumber) at $($saved.updatedAt)."
  }
}

function Mark-DaoCaseFiledInCourt {
  $detail = Get-DaoCaseDetail -Number $CaseNumber
  $case = $detail.case
  $initial = @($case.filings | Where-Object { $_.isInitial -and $_.status -eq "ACCEPTED" })
  if ($case.courtFiledAt) { Write-Host "Already recorded filed in court: $($case.courtFiledAt)"; return }
  if (-not $initial.Count) { throw "No approved opening filing is attached. The portal will not mark this case filed." }
  [pscustomobject]@{ CaseNumber = $case.caseNumber; Title = $case.title; ApprovedInitialFiling = $initial[0].title; Action = "Record the current time as filed in court" } | Format-List
  if (-not $Apply) { Write-Host "Preview only. Add -Apply after the court filing actually occurs. This does not submit anything to the court."; return }
  if ($PSCmdlet.ShouldProcess($CaseNumber, "Record opening filing as filed in court now")) {
    $safeNumber = [uri]::EscapeDataString($CaseNumber)
    $saved = Invoke-DaoApi -Method POST -Path "/api/automation/cases/$safeNumber/court-filing" -Body "{}"
    Write-Host "Recorded $($saved.caseNumber) as filed in court at $($saved.filedAt)."
  }
}

function Read-CaseOpeningPdf([string]$Path, [string]$Label) {
  if (-not $Path) { throw "Provide a local file path to the separate $Label PDF." }
  $resolvedPath = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
  $file = Get-Item -LiteralPath $resolvedPath
  if ($file.Length -gt 5MB) { throw "$Label PDF files must be 5 MB or smaller." }
  if ($file.Length -lt 16) { throw "$Label PDF is too small to be a valid PDF." }
  $bytes = [System.IO.File]::ReadAllBytes($resolvedPath)
  if ([System.Text.Encoding]::ASCII.GetString($bytes, 0, 5) -ne "%PDF-") { throw "$Label file does not have a PDF header." }
  $tailLength = [Math]::Min(8192, $bytes.Length)
  $tail = [System.Text.Encoding]::Latin1.GetString($bytes, $bytes.Length - $tailLength, $tailLength)
  if ($tail -match "/Encrypt\b") { throw "$Label PDF is password-protected. Remove the password before opening the case." }
  if ($tail -notmatch "%%EOF\s*$") { throw "$Label PDF appears incomplete. Re-export it before opening the case." }
  return @{ File = $file; Bytes = $bytes }
}

function New-CaseFromPdfs {
  if (-not $CaseTitle -or -not $CaseTitle.Trim()) { throw "Provide -CaseTitle." }
  if (-not $DefendantName -or -not $DefendantName.Trim()) { throw "Provide -DefendantName." }
  if ($Division -ne "Criminal Division") { throw "This command currently opens Criminal Division cases only." }
  if ($OpeningFilingPdfPath -and (-not $OpeningFilingTitle -or -not $OpeningFilingTitle.Trim())) { throw "Provide -OpeningFilingTitle." }
  if (-not $AopcTitle -or -not $AopcTitle.Trim()) { throw "Provide -AopcTitle." }

  $opening = if ($OpeningFilingPdfPath) { Read-CaseOpeningPdf -Path $OpeningFilingPdfPath -Label "Opening filing" } else { $null }
  $aopc = Read-CaseOpeningPdf -Path $AopcPdfPath -Label "AOPC"
  $partyNames = @($DefendantName.Trim()) + @($CoDefendants | Where-Object { $_ } | ForEach-Object { $_.Trim() })
  if ($partyNames.Count -gt 20) { throw "A case can include no more than 20 defendants." }
  if (@($partyNames | ForEach-Object { $_.ToLowerInvariant() } | Select-Object -Unique).Count -ne $partyNames.Count) { throw "A defendant name was entered more than once." }

  [pscustomobject]@{
    CaseTitle = $CaseTitle.Trim()
    Division = $Division
    DefendantNames = $partyNames -join ", "
    Stage = if ($Stage) { $Stage.Trim() } else { "Intake" }
    AssignedJudge = if ($AssignedJudge) { $AssignedJudge.Trim() } else { "Not set" }
    Assignee = if ($AssigneeId) { $AssigneeId } else { "Automatic workload assignment" }
    OpeningFiling = if ($opening) { "$($opening.File.Name) · $($opening.Bytes.Length) bytes" } else { "None (not required)" }
    AOPC = "$($aopc.File.Name) · $($aopc.Bytes.Length) bytes"
    Result = if ($opening) { "Unfiled staff case; opening filing and AOPC attached as drafts" } else { "Unfiled staff case; AOPC attached as a draft, no opening filing" }
  } | Format-List

  if (-not $Apply) {
    Write-Host "Preview only. Add -Apply to create the unfiled case and attach the opening filing and AOPC. No court filing will occur."
    return
  }
  if ($PSCmdlet.ShouldProcess($CaseTitle.Trim(), "Create Criminal Division case with an opening filing and separate AOPC PDF")) {
    $payload = @{
      title = $CaseTitle.Trim()
      defendantName = $DefendantName.Trim()
      coDefendants = @($CoDefendants | Where-Object { $_ } | ForEach-Object { $_.Trim() })
      division = $Division
      assignedJudge = if ($AssignedJudge) { $AssignedJudge.Trim() } else { "" }
      stage = if ($Stage) { $Stage.Trim() } else { "Intake" }
      summary = $Summary.Trim()
      assignedAttorneyId = if ($AssigneeId) { $AssigneeId } else { "" }
      openingFiling = if ($opening) { @{
        title = $OpeningFilingTitle.Trim()
        fileName = $opening.File.Name
        base64 = [Convert]::ToBase64String($opening.Bytes)
      } } else { $null }
      aopc = @{
        title = $AopcTitle.Trim()
        fileName = $aopc.File.Name
        base64 = [Convert]::ToBase64String($aopc.Bytes)
      }
    } | ConvertTo-Json -Depth 8 -Compress

    $result = Invoke-DaoApi -Method POST -Path "/api/automation/cases/create" -Body $payload
    $action = if ($result.alreadyCreated) { "Already exists; no duplicate was made" } else { "Created unfiled case" }
    Write-Host "$action $($result.caseNumber): $($result.title)"
    if ($result.assignedAttorney) { Write-Host "Assigned to: $($result.assignedAttorney)" }
    Write-Host "Case: $($script:DefaultBaseUrl)$($result.caseUrl)"
    Write-Host "Status: $($result.status). The opening filing and AOPC are attached as drafts; nothing was filed in court."
  }
}

function Submit-CaseFiling {
  if (-not $CaseNumber) { throw "Provide -CaseNumber, for example HCR-26-0025." }
  if (-not $Title -or -not $Title.Trim()) { throw "Provide -Title for the filing." }
  if (-not $PdfPath) { throw "Provide -PdfPath to the finalized PDF." }
  $resolvedPdfPath = (Resolve-Path -LiteralPath $PdfPath -ErrorAction Stop).Path
  $pdfFile = Get-Item -LiteralPath $resolvedPdfPath
  if ($pdfFile.Length -gt 5MB) { throw "PDF files must be 5 MB or smaller." }
  if ($pdfFile.Length -lt 16) { throw "This file is too small to be a valid PDF." }
  $pdfBytes = [System.IO.File]::ReadAllBytes($resolvedPdfPath)
  if ([System.Text.Encoding]::ASCII.GetString($pdfBytes, 0, 5) -ne "%PDF-") { throw "The selected file does not have a PDF header." }
  $tailLength = [Math]::Min(8192, $pdfBytes.Length)
  $tail = [System.Text.Encoding]::Latin1.GetString($pdfBytes, $pdfBytes.Length - $tailLength, $tailLength)
  if ($tail -match "/Encrypt\b") { throw "Password-protected PDFs are not accepted. Remove the password before uploading." }
  if ($tail -notmatch "%%EOF\s*$") { throw "This PDF appears incomplete. Re-export it before uploading." }

  [pscustomobject]@{
    CaseNumber = $CaseNumber
    Title = $Title.Trim()
    PdfFile = $pdfFile.Name
    SizeBytes = $pdfFile.Length
    Destination = "DAO filing review inbox"
  } | Format-List
  if (-not $Apply) {
    Write-Host "Preview only. Add -Apply to submit this PDF to the DAO portal for review."
    return
  }
  if ($PSCmdlet.ShouldProcess("$CaseNumber · $($Title.Trim())", "Upload PDF to DAO filing review inbox")) {
    $payload = @{
      title = $Title.Trim()
      pdfFileName = $pdfFile.Name
      pdfBase64 = [Convert]::ToBase64String($pdfBytes)
    } | ConvertTo-Json -Compress
    $safeCaseNumber = [uri]::EscapeDataString($CaseNumber)
    $result = Invoke-DaoApi -Method POST -Path "/api/automation/cases/$safeCaseNumber/filings" -Body $payload
    Write-Host "Filing $($result.status.ToLowerInvariant()) for $($result.caseNumber): $($result.title)"
    Write-Host "Case record: $($script:DefaultBaseUrl)$($result.caseUrl)"
    if ($result.reviewUrl) { Write-Host "Review inbox: $($script:DefaultBaseUrl)$($result.reviewUrl)" }
    if ($result.alreadySubmitted) { Write-Host "This exact PDF was already submitted; no duplicate was created." }
    Write-Host "This command does not approve the filing or mark it filed in court."
  }
}

switch ($Command) {
  "setup" {
    Initialize-LocalKey
  }
  "save-token" {
    Save-LocalToken
  }
  "create-case" {
    New-CaseFromPdfs
  }
  "case-detail" {
    $detail = Get-DaoCaseDetail -Number $CaseNumber
    $detail.case | ConvertTo-Json -Depth 12
  }
  "update-case" {
    Update-DaoCase
  }
  "filed-in-court" {
    Mark-DaoCaseFiledInCourt
  }
  "cases" {
    $cases = Get-DaoCases -RequestedScope $Scope
    $cases | Select-Object caseNumber, title, stage, division, divisionGroup, @{ Name = "Assigned"; Expression = { $_.assignedAttorney.displayName ?? "Unassigned" } }, @{ Name = "Submitted By"; Expression = { $_.createdBy.displayName } }, archived | Format-Table -AutoSize
    Write-Host "$($cases.Count) case(s). Scope: $Scope."
  }
  "reconcile" {
    $cases = Get-DaoCases -RequestedScope $Scope | Where-Object { -not $_.archived }
    $today = [DateTimeOffset]::Now
    $report = foreach ($case in $cases) {
      $issues = [System.Collections.Generic.List[string]]::new()
      if (-not $case.assignedAttorneyId) { $issues.Add("Unassigned") }
      if (-not $case.courtFiledAt -and $case.initialFilingStatus -ne "ACCEPTED") { $issues.Add("Court filing not recorded") }
      if (-not $case.stage) { $issues.Add("Stage not set") }
      if ($case.initialFilingDue -and [DateTimeOffset]::Parse($case.initialFilingDue) -lt $today -and $case.initialFilingStatus -ne "ACCEPTED") { $issues.Add("Initial filing target overdue") }
      [pscustomobject]@{
        CaseNumber = $case.caseNumber
        Title = $case.title
        Division = $case.division
        Attorney = if ($case.assignedAttorney) { $case.assignedAttorney.displayName } else { "Unassigned" }
        Stage = $case.stage
        CourtFiledAt = $case.courtFiledAt
        InitialFilingStatus = $case.initialFilingStatus ?? "Not submitted"
        LastFilingAt = $case.latestFilingAt
        AopcCount = $case.aopcCount
        ReviewFlags = $issues -join "; "
      }
    }
    $report | Format-Table -AutoSize
    $flagged = @($report | Where-Object ReviewFlags)
    Write-Host "$($cases.Count) open case(s); $($flagged.Count) have reconciliation flags. This report is read-only."
    if ($ExportPath) {
      $parent = Split-Path -Parent $ExportPath
      if ($parent -and -not (Test-Path -LiteralPath $parent)) { throw "Export folder does not exist: $parent" }
      $report | Export-Csv -LiteralPath $ExportPath -NoTypeInformation -Encoding utf8
      Write-Host "Reconciliation CSV saved to $ExportPath"
    }
  }
  "case-comments" {
    $result = Invoke-DaoApi -Method GET -Path "/api/automation/case-comments"
    $items = @($result.items)
    $items | Select-Object id, @{ Name = "Case"; Expression = { $_.case.caseNumber } }, @{ Name = "Title"; Expression = { $_.case.title } }, createdAt, @{ Name = "Text"; Expression = { $_.body } } | Format-List
    Write-Host "$($items.Count) manual note(s) authored by this account in accessible Criminal Division cases. Read-only."
  }
  "delete-case-comments" {
    $ids = @($CommentIds) | Where-Object { $_ } | Select-Object -Unique
    if (-not $ids.Count) { throw "Provide one or more exact -CommentIds from the case-comments list." }
    $available = (Invoke-DaoApi -Method GET -Path "/api/automation/case-comments").items
    $targets = @($available | Where-Object { $ids -contains $_.id })
    if ($targets.Count -ne $ids.Count) { throw "Every requested ID must be a manual note authored by this account in an accessible Criminal Division case. No changes were made." }
    $targets | Select-Object id, @{ Name = "Case"; Expression = { $_.case.caseNumber } }, @{ Name = "Title"; Expression = { $_.case.title } }, createdAt, @{ Name = "Text"; Expression = { $_.body } } | Format-List
    if (-not $Apply) {
      Write-Host "Preview only. Add -Apply to remove exactly these notes. System history and court records cannot be removed by this command."
      break
    }
    if ($PSCmdlet.ShouldProcess("$($ids.Count) selected note(s)", "Permanently delete only manual notes authored by this account")) {
      $body = @{ ids = $ids } | ConvertTo-Json -Compress
      $result = Invoke-DaoApi -Method DELETE -Path "/api/automation/case-comments" -Body $body
      Write-Host "Removed $($result.deletedCount) selected manual note(s)."
    }
  }
  "attorneys" {
    $result = Invoke-DaoApi -Method GET -Path "/api/automation/attorneys"
    $result.items | Select-Object displayName, id | Format-Table -AutoSize
    Write-Host "$($result.items.Count) eligible attorney(s). Use the ID when assigning."
  }
  "submit-filing" {
    Submit-CaseFiling
  }
  "assign" {
    $requestedNumbers = @($CaseNumbers) + @($CaseNumber) | Where-Object { $_ } | Select-Object -Unique
    if (-not $requestedNumbers.Count) { throw "Provide -CaseNumber or -CaseNumbers." }
    if (-not $AssigneeId) { throw "Provide -AssigneeId, or use UNASSIGNED to clear the assignment." }
    $allCases = Get-DaoCases -RequestedScope "all"
    $targets = foreach ($number in $requestedNumbers) {
      $match = $allCases | Where-Object caseNumber -eq $number | Select-Object -First 1
      if (-not $match) { throw "Case $number was not found in the cases this account may assign." }
      $match
    }

    $assignee = $null
    if ($AssigneeId -ne "UNASSIGNED") {
      $assignee = (Invoke-DaoApi -Method GET -Path "/api/automation/attorneys").items | Where-Object id -eq $AssigneeId | Select-Object -First 1
      if (-not $assignee) { throw "That attorney is not in the eligible list for this account." }
    }
    $nextName = if ($assignee) { $assignee.displayName } else { "Unassigned" }
    $preview = foreach ($case in $targets) {
      [pscustomobject]@{ CaseNumber = $case.caseNumber; Title = $case.title; CurrentAttorney = if ($case.assignedAttorney) { $case.assignedAttorney.displayName } else { "Unassigned" }; ProposedAttorney = $nextName }
    }
    $preview | Format-Table -AutoSize
    if (-not $Apply) {
      Write-Host "Preview only for $($targets.Count) case(s). Add -Apply to apply each assignment; PowerShell will ask for confirmation."
      break
    }
    foreach ($case in $targets) {
      if ($PSCmdlet.ShouldProcess($case.caseNumber, "Assign to $nextName")) {
        $payload = @{ expectedAssignedAttorneyId = $case.assignedAttorneyId; assignedAttorneyId = if ($assignee) { $assignee.id } else { $null } } | ConvertTo-Json -Compress
        $safeCaseNumber = [uri]::EscapeDataString($case.caseNumber)
        $result = Invoke-DaoApi -Method POST -Path "/api/automation/cases/$safeCaseNumber/assignment" -Body $payload
        if ($result.changed) { Write-Host "Assignment saved for $($result.case.caseNumber)." } else { Write-Host "No change. $($result.case.caseNumber) is already assigned to $nextName." }
      }
    }
  }
}
