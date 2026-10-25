#Requires -Version 7.0

# Local case operations for the authorized DAO account on this Windows computer.
# The API token is protected with Windows DPAPI; requests are signed by a
# non-exportable P-256 key in the current Windows user's certificate store.
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
  [Parameter(Position = 0)]
  [ValidateSet("setup", "save-token", "cases", "attorneys", "assign", "reconcile")]
  [string]$Command = "cases",

  [ValidateSet("mine", "unassigned", "all")]
  [string]$Scope = "mine",

  [string]$CaseNumber,
  [string[]]$CaseNumbers,
  [string]$AssigneeId,
  [string]$ExportPath,
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

switch ($Command) {
  "setup" {
    Initialize-LocalKey
  }
  "save-token" {
    Save-LocalToken
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
  "attorneys" {
    $result = Invoke-DaoApi -Method GET -Path "/api/automation/attorneys"
    $result.items | Select-Object displayName, id | Format-Table -AutoSize
    Write-Host "$($result.items.Count) eligible attorney(s). Use the ID when assigning."
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
