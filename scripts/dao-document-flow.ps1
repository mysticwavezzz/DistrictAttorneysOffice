#Requires -Version 7.0

# Converts a finalized DOCX into a native Google Doc and a shareable PDF,
# with an optional signed submission to the DAO filing review inbox.
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "Medium")]
param(
  [Parameter(Position = 0)]
  [ValidateSet("setup-google", "publish")]
  [string]$Command = "publish",

  [string]$ClientJsonPath,
  [string]$DocxPath,
  [string]$CaseNumber,
  [string]$Title,
  [string]$DriveFolderId,
  [string]$OutputDirectory,
  [switch]$SubmitToPortal,
  [switch]$ShareGoogleDoc,
  [switch]$Local
)

$ErrorActionPreference = "Stop"
$script:GoogleBaseUrl = "https://www.googleapis.com/drive/v3"
$script:GoogleUploadUrl = "https://www.googleapis.com/upload/drive/v3/files"
$script:GoogleScope = "https://www.googleapis.com/auth/drive.file"
$script:ConfigDirectory = Join-Path $env:LOCALAPPDATA "DistrictAttorneyDocumentFlow"
$script:CredentialPath = Join-Path $script:ConfigDirectory "google-credential.dpapi"
$script:AccessToken = $null
$script:AccessTokenExpiresAt = [DateTimeOffset]::MinValue
$script:GoogleCredential = $null

function Ensure-ConfigDirectory {
  if (-not (Test-Path -LiteralPath $script:ConfigDirectory)) {
    New-Item -ItemType Directory -Path $script:ConfigDirectory -Force | Out-Null
  }
}

function ConvertTo-Base64Url([byte[]]$Bytes) {
  return [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function New-RandomBase64Url([int]$ByteCount) {
  $bytes = [byte[]]::new($ByteCount)
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $random.GetBytes($bytes) }
  finally { $random.Dispose() }
  return (ConvertTo-Base64Url $bytes)
}

function ConvertTo-Sha256Hex([byte[]]$Bytes) {
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try { $hash = $sha256.ComputeHash($Bytes) }
  finally { $sha256.Dispose() }
  return [BitConverter]::ToString($hash).Replace("-", "").ToLowerInvariant()
}

function ConvertTo-FormBody([System.Collections.IDictionary]$Values) {
  $items = foreach ($key in $Values.Keys) {
    if ($null -ne $Values[$key]) {
      [uri]::EscapeDataString([string]$key) + "=" + [uri]::EscapeDataString([string]$Values[$key])
    }
  }
  return ($items -join "&")
}

function Save-GoogleCredential([System.Collections.IDictionary]$Credential) {
  if (-not $IsWindows) { throw "Google credential storage is limited to Windows DPAPI on this computer." }
  Ensure-ConfigDirectory
  $json = $Credential | ConvertTo-Json -Compress
  $secure = ConvertTo-SecureString -String $json -AsPlainText -Force
  $protected = ConvertFrom-SecureString -SecureString $secure
  [IO.File]::WriteAllText($script:CredentialPath, $protected, [Text.UTF8Encoding]::new($false))
  $json = $null
}

function Get-GoogleCredential {
  if ($script:GoogleCredential) { return $script:GoogleCredential }
  if (-not (Test-Path -LiteralPath $script:CredentialPath)) {
    throw "Run setup-google with your Google OAuth Desktop client JSON before publishing."
  }
  if (-not $IsWindows) { throw "Google credential storage is limited to Windows DPAPI on this computer." }
  $protected = Get-Content -LiteralPath $script:CredentialPath -Raw
  $secure = ConvertTo-SecureString -String $protected
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $json = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $script:GoogleCredential = $json | ConvertFrom-Json
    return $script:GoogleCredential
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $json = $null
  }
}

function Invoke-GoogleTokenExchange([System.Collections.IDictionary]$Form) {
  $body = ConvertTo-FormBody $Form
  try {
    return Invoke-RestMethod -Method POST -Uri "https://oauth2.googleapis.com/token" -ContentType "application/x-www-form-urlencoded" -Body $body
  } catch {
    $detail = $_.ErrorDetails.Message
    if (-not $detail) { $detail = $_.Exception.Message }
    throw "Google authorization failed: $detail"
  } finally {
    $body = $null
  }
}

function Start-GoogleSetup {
  if (-not $IsWindows) { throw "This setup flow is limited to Windows." }
  if (-not $ClientJsonPath) { throw "Provide -ClientJsonPath to the OAuth Desktop client JSON downloaded from Google Cloud." }
  $clientPath = (Resolve-Path -LiteralPath $ClientJsonPath).Path
  $clientFile = Get-Content -LiteralPath $clientPath -Raw | ConvertFrom-Json
  $client = $clientFile.installed
  if (-not $client -or -not $client.client_id) {
    throw "The selected JSON is not a Google OAuth Desktop client. Download the Desktop app client JSON and retry."
  }
  if (-not $PSCmdlet.ShouldProcess("This Windows user and Google Drive", "Authorize and store an encrypted Drive credential")) { return }

  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  $port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
  $redirectUri = "http://127.0.0.1:$port/"
  $state = New-RandomBase64Url 32
  $verifier = New-RandomBase64Url 48
  $verifierBytes = [Text.Encoding]::ASCII.GetBytes($verifier)
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try { $challengeBytes = $sha256.ComputeHash($verifierBytes) }
  finally { $sha256.Dispose() }
  $challenge = ConvertTo-Base64Url $challengeBytes
  $authorizationQuery = ConvertTo-FormBody ([ordered]@{
    client_id = $client.client_id
    redirect_uri = $redirectUri
    response_type = "code"
    scope = $script:GoogleScope
    access_type = "offline"
    prompt = "consent"
    state = $state
    code_challenge = $challenge
    code_challenge_method = "S256"
  })
  $authorizationUrl = "https://accounts.google.com/o/oauth2/v2/auth?$authorizationQuery"
  $listenerClient = $null
  try {
    Start-Process $authorizationUrl
    Write-Host "Finish Google authorization in the browser opened on this computer."
    $pendingAccept = $listener.BeginAcceptTcpClient($null, $null)
    if (-not $pendingAccept.AsyncWaitHandle.WaitOne([TimeSpan]::FromMinutes(5))) {
      throw "Google sign-in timed out. Run setup-google again when ready."
    }
    $listenerClient = $listener.EndAcceptTcpClient($pendingAccept)
    $stream = $listenerClient.GetStream()
    $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
    $requestLine = $reader.ReadLine()
    while ($null -ne ($headerLine = $reader.ReadLine()) -and $headerLine.Length -gt 0) { }
    if ($requestLine -notmatch "^GET\s+(\S+)\s+HTTP/") { throw "Google returned an invalid local authorization response." }
    $callbackUri = [uri]::new("http://127.0.0.1$($Matches[1])")
    $queryValues = @{}
    foreach ($pair in $callbackUri.Query.TrimStart("?").Split("&", [StringSplitOptions]::RemoveEmptyEntries)) {
      $parts = $pair.Split("=", 2)
      $key = [uri]::UnescapeDataString($parts[0].Replace("+", " "))
      $value = if ($parts.Count -gt 1) { [uri]::UnescapeDataString($parts[1].Replace("+", " ")) } else { "" }
      $queryValues[$key] = $value
    }
    $page = if ($queryValues.error) {
      "<html><body><p>Google authorization failed. You may close this window.</p></body></html>"
    } else {
      "<html><body><p>Google Drive is connected. You may close this window.</p></body></html>"
    }
    $pageBytes = [Text.Encoding]::UTF8.GetBytes($page)
    $responseHeader = "HTTP/1.1 200 OK`r`nContent-Type: text/html; charset=utf-8`r`nContent-Length: $($pageBytes.Length)`r`nConnection: close`r`n`r`n"
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($responseHeader)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    $stream.Write($pageBytes, 0, $pageBytes.Length)
    $stream.Flush()

    if ($queryValues.error) { throw "Google authorization was not completed: $($queryValues.error)" }
    if ($queryValues.state -ne $state) { throw "The Google authorization state did not match. Run setup-google again." }
    if (-not $queryValues.code) { throw "Google did not return an authorization code. Run setup-google again." }
    $form = [ordered]@{
      code = $queryValues.code
      client_id = $client.client_id
      client_secret = $client.client_secret
      redirect_uri = $redirectUri
      grant_type = "authorization_code"
      code_verifier = $verifier
    }
    $token = Invoke-GoogleTokenExchange $form
    if (-not $token.refresh_token) {
      throw "Google did not return a refresh token. Revoke this app's Drive access in your Google Account and run setup-google again."
    }
    Save-GoogleCredential ([ordered]@{
      client_id = [string]$client.client_id
      client_secret = [string]$client.client_secret
      refresh_token = [string]$token.refresh_token
      scope = $script:GoogleScope
      saved_at = [DateTimeOffset]::Now.ToString("o")
    })
    Write-Host "Google Drive is connected. The refresh credential is encrypted for this Windows account."
    Write-Host "Credential file: $script:CredentialPath"
  } finally {
    if ($listenerClient) { $listenerClient.Dispose() }
    $listener.Stop()
    $authorizationQuery = $null
    $authorizationUrl = $null
    $verifier = $null
  }
}

function Get-GoogleAccessToken {
  if ($script:AccessToken -and $script:AccessTokenExpiresAt -gt [DateTimeOffset]::UtcNow.AddMinutes(2)) {
    return $script:AccessToken
  }
  $credential = Get-GoogleCredential
  $token = Invoke-GoogleTokenExchange ([ordered]@{
    client_id = $credential.client_id
    client_secret = $credential.client_secret
    refresh_token = $credential.refresh_token
    grant_type = "refresh_token"
  })
  if (-not $token.access_token) { throw "Google did not return an access token." }
  $script:AccessToken = [string]$token.access_token
  $script:AccessTokenExpiresAt = [DateTimeOffset]::UtcNow.AddSeconds([Math]::Max(60, [int]$token.expires_in))
  if ($token.refresh_token -and $token.refresh_token -ne $credential.refresh_token) {
    $credential.refresh_token = [string]$token.refresh_token
    Save-GoogleCredential ([ordered]@{
      client_id = [string]$credential.client_id
      client_secret = [string]$credential.client_secret
      refresh_token = [string]$credential.refresh_token
      scope = $script:GoogleScope
      saved_at = [DateTimeOffset]::Now.ToString("o")
    })
  }
  return $script:AccessToken
}

function Invoke-GoogleJson([string]$Method, [string]$Uri, [object]$Body = $null) {
  $headers = @{ Authorization = "Bearer $(Get-GoogleAccessToken)" }
  try {
    if ($null -eq $Body) {
      return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
    }
    $json = $Body | ConvertTo-Json -Depth 12 -Compress
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -ContentType "application/json; charset=utf-8" -Body $json
  } catch {
    $detail = $_.ErrorDetails.Message
    if (-not $detail) { $detail = $_.Exception.Message }
    throw "Google Drive request failed: $detail"
  }
}

function Get-FileSha256([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try { $hash = $sha256.ComputeHash($stream) }
  finally { $stream.Dispose(); $sha256.Dispose() }
  return [BitConverter]::ToString($hash).Replace("-", "").ToLowerInvariant()
}

function Get-TextSha256([string]$Value) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
  return ConvertTo-Sha256Hex $bytes
}

function Find-DriveFlowFile([string]$FlowKey, [string]$Role) {
  $query = "appProperties has { key='daoFlowKey' and value='$FlowKey' } and appProperties has { key='daoFlowRole' and value='$Role' } and trashed = false"
  $fields = [uri]::EscapeDataString("files(id,name,mimeType,webViewLink,parents,appProperties)")
  $uri = "$script:GoogleBaseUrl/files?q=$([uri]::EscapeDataString($query))&spaces=drive&pageSize=100&fields=$fields&supportsAllDrives=true"
  $result = Invoke-GoogleJson -Method GET -Uri $uri
  return @($result.files | Where-Object { $_ })
}

function Start-DriveResumableUpload([string]$Path, [string]$ContentType, [System.Collections.IDictionary]$Metadata) {
  $fileLength = (Get-Item -LiteralPath $Path).Length
  $metadataJson = $Metadata | ConvertTo-Json -Depth 12 -Compress
  $query = [uri]::EscapeDataString("id,name,mimeType,webViewLink,parents,appProperties")
  $initUri = "$script:GoogleUploadUrl?uploadType=resumable&supportsAllDrives=true&fields=$query"
  $headers = @{
    Authorization = "Bearer $(Get-GoogleAccessToken)"
    "X-Upload-Content-Type" = $ContentType
    "X-Upload-Content-Length" = [string]$fileLength
  }
  try {
    $initial = Invoke-WebRequest -Method POST -Uri $initUri -Headers $headers -ContentType "application/json; charset=utf-8" -Body $metadataJson
    $sessionUri = [string](@($initial.Headers.Location)[0])
    if (-not $sessionUri) { throw "Google Drive did not return an upload session." }
    $bytes = [IO.File]::ReadAllBytes($Path)
    return Invoke-RestMethod -Method PUT -Uri $sessionUri -Headers @{ Authorization = "Bearer $(Get-GoogleAccessToken)" } -ContentType $ContentType -Body $bytes
  } catch {
    $detail = $_.ErrorDetails.Message
    if (-not $detail) { $detail = $_.Exception.Message }
    throw "Google Drive upload failed: $detail"
  } finally {
    $metadataJson = $null
  }
}

function Get-DriveFile([string]$FileId) {
  $fields = [uri]::EscapeDataString("id,name,mimeType,webViewLink,parents,appProperties")
  return Invoke-GoogleJson -Method GET -Uri "$script:GoogleBaseUrl/files/$([uri]::EscapeDataString($FileId))?fields=$fields&supportsAllDrives=true"
}

function Export-GoogleDocPdf([string]$FileId, [string]$Path) {
  $uri = "$script:GoogleBaseUrl/files/$([uri]::EscapeDataString($FileId))/export?mimeType=application%2Fpdf"
  try {
    Invoke-WebRequest -Method GET -Uri $uri -Headers @{ Authorization = "Bearer $(Get-GoogleAccessToken)" } -OutFile $Path
  } catch {
    $detail = $_.ErrorDetails.Message
    if (-not $detail) { $detail = $_.Exception.Message }
    throw "Google Docs PDF export failed: $detail"
  }
}

function Assert-CasePdf([string]$Path) {
  $file = Get-Item -LiteralPath $Path
  if ($file.Length -gt 5MB) { throw "The exported PDF is larger than the DAO website's 5 MB limit: $([Math]::Round($file.Length / 1MB, 2)) MB." }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 16 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 5) -ne "%PDF-") { throw "Google's export did not produce a readable PDF." }
  $tailStart = [Math]::Max(0, $bytes.Length - 8192)
  $tail = [Text.Encoding]::Latin1.GetString($bytes, $tailStart, $bytes.Length - $tailStart)
  if ($tail -match "/Encrypt\b") { throw "The exported PDF is password-protected and cannot be submitted to the DAO website." }
  if ($tail -notmatch "%%EOF\s*$") { throw "The exported PDF appears incomplete. Do not upload it to the DAO website." }
}

function Ensure-AnyoneViewer([string]$FileId) {
  $base = "$script:GoogleBaseUrl/files/$([uri]::EscapeDataString($FileId))/permissions"
  $fields = [uri]::EscapeDataString("permissions(id,type,role,allowFileDiscovery)")
  $listed = Invoke-GoogleJson -Method GET -Uri "$base?fields=$fields&supportsAllDrives=true"
  $anyone = @($listed.permissions | Where-Object type -eq "anyone") | Select-Object -First 1
  if (-not $anyone) {
    $anyone = Invoke-GoogleJson -Method POST -Uri "$base?supportsAllDrives=true&fields=id,type,role,allowFileDiscovery" -Body @{
      type = "anyone"
      role = "reader"
      allowFileDiscovery = $false
    }
  } elseif ($anyone.role -ne "reader" -or $anyone.allowFileDiscovery -eq $true) {
    $permissionId = [uri]::EscapeDataString([string]$anyone.id)
    $anyone = Invoke-GoogleJson -Method PATCH -Uri "$base/$permissionId?supportsAllDrives=true&fields=id,type,role,allowFileDiscovery" -Body @{
      role = "reader"
      allowFileDiscovery = $false
    }
  }
  $verified = Invoke-GoogleJson -Method GET -Uri "$base?fields=$fields&supportsAllDrives=true"
  $confirmed = @($verified.permissions | Where-Object { $_.type -eq "anyone" -and $_.role -eq "reader" -and $_.allowFileDiscovery -ne $true }) | Select-Object -First 1
  if (-not $confirmed) { throw "Drive did not confirm Anyone with the link as Viewer. Do not share this link yet." }
  return $true
}

function Get-SafeName([string]$Value) {
  $safe = $Value -replace '[<>:"/\\|?*\x00-\x1F]', "_"
  $safe = $safe.Trim().TrimEnd(".")
  if (-not $safe) { return "DAO Filing" }
  return $safe.Substring(0, [Math]::Min(100, $safe.Length))
}

function Save-Manifest([string]$Path, [System.Collections.IDictionary]$Manifest) {
  [IO.File]::WriteAllText($Path, ($Manifest | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
}

function Publish-Document {
  if (-not $DocxPath) { throw "Provide -DocxPath to a finalized .docx document." }
  if (-not $CaseNumber) { throw "Provide -CaseNumber." }
  if (-not $Title -or $Title.Trim().Length -eq 0) { throw "Provide -Title." }
  if ([IO.Path]::GetExtension($DocxPath) -ne ".docx") { throw "The source must be a .docx file. Keep the source file unchanged." }
  if ($DriveFolderId -and $DriveFolderId -notmatch "^[A-Za-z0-9_-]{10,}$") { throw "DriveFolderId does not look like a Google Drive folder ID." }
  $sourcePath = (Resolve-Path -LiteralPath $DocxPath).Path
  $sourceHash = Get-FileSha256 $sourcePath
  $flowKey = Get-TextSha256 "$CaseNumber|$($Title.Trim())|$sourceHash|$DriveFolderId"
  $googleDocTitle = "$($Title.Trim()) - $CaseNumber"
  $safeCase = Get-SafeName $CaseNumber
  $safeTitle = Get-SafeName $Title
  $baseOutput = if ($OutputDirectory) { [IO.Path]::GetFullPath($OutputDirectory) } else { [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\DAO Document Flow Output")) }
  $runFolderName = "$safeCase-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  $outputPath = Join-Path $baseOutput $runFolderName
  if (Test-Path -LiteralPath $outputPath) { $outputPath = "$outputPath-$([guid]::NewGuid().ToString('N').Substring(0, 6))" }
  $pdfPath = Join-Path $outputPath "$safeTitle.pdf"
  $manifestPath = Join-Path $outputPath "manifest.json"
  $action = "Convert the DOCX to Google Docs, export and share a PDF, and save local outputs"
  if ($SubmitToPortal) { $action += "; submit the PDF to the DAO Review Inbox as pending" }
  if (-not $PSCmdlet.ShouldProcess("$CaseNumber / $googleDocTitle", $action)) { return }

  New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
  $manifest = [ordered]@{
    caseNumber = $CaseNumber
    title = $googleDocTitle
    sourceDocx = $sourcePath
    sourceSha256 = $sourceHash
    localPdf = $pdfPath
    createdAt = [DateTimeOffset]::Now.ToString("o")
    googleDoc = $null
    googlePdf = $null
    pdfAnyoneViewerVerified = $false
    portalSubmission = if ($SubmitToPortal) { [ordered]@{ status = "not-started" } } else { $null }
  }
  Save-Manifest $manifestPath $manifest

  try {
    $docFiles = Find-DriveFlowFile -FlowKey $flowKey -Role "google-doc"
    if ($docFiles.Count -gt 1) { throw "More than one matching Google Doc already exists. Review Drive before retrying." }
    if ($docFiles.Count -eq 1) {
      $googleDoc = Get-DriveFile ([string]$docFiles[0].id)
      if ($googleDoc.mimeType -ne "application/vnd.google-apps.document") { throw "A matching Drive record exists but is not a native Google Doc." }
    } else {
      $docMetadata = [ordered]@{
        name = $googleDocTitle
        mimeType = "application/vnd.google-apps.document"
        appProperties = @{ daoFlowKey = $flowKey; daoFlowRole = "google-doc" }
      }
      if ($DriveFolderId) { $docMetadata.parents = @($DriveFolderId) }
      $uploaded = Start-DriveResumableUpload -Path $sourcePath -ContentType "application/vnd.openxmlformats-officedocument.wordprocessingml.document" -Metadata $docMetadata
      $googleDoc = Get-DriveFile ([string]$uploaded.id)
    }
    if (-not $googleDoc.webViewLink) { throw "Google Drive did not return a link for the native document." }
    $manifest.googleDoc = [ordered]@{ id = $googleDoc.id; name = $googleDoc.name; url = $googleDoc.webViewLink; sharedAsViewer = $false }
    if ($ShareGoogleDoc) {
      Ensure-AnyoneViewer -FileId ([string]$googleDoc.id) | Out-Null
      $manifest.googleDoc.sharedAsViewer = $true
    }
    Save-Manifest $manifestPath $manifest

    Export-GoogleDocPdf -FileId ([string]$googleDoc.id) -Path $pdfPath
    Assert-CasePdf $pdfPath
    $pdfFiles = Find-DriveFlowFile -FlowKey $flowKey -Role "court-pdf"
    if ($pdfFiles.Count -gt 1) { throw "More than one matching PDF already exists. Review Drive before retrying." }
    if ($pdfFiles.Count -eq 1) {
      $googlePdf = Get-DriveFile ([string]$pdfFiles[0].id)
    } else {
      $pdfMetadata = [ordered]@{
        name = "$googleDocTitle.pdf"
        mimeType = "application/pdf"
        appProperties = @{ daoFlowKey = $flowKey; daoFlowRole = "court-pdf" }
      }
      if ($DriveFolderId) { $pdfMetadata.parents = @($DriveFolderId) }
      $uploadedPdf = Start-DriveResumableUpload -Path $pdfPath -ContentType "application/pdf" -Metadata $pdfMetadata
      $googlePdf = Get-DriveFile ([string]$uploadedPdf.id)
    }
    if (-not $googlePdf.webViewLink) { throw "Google Drive did not return a link for the PDF." }
    Ensure-AnyoneViewer -FileId ([string]$googlePdf.id) | Out-Null
    $manifest.googlePdf = [ordered]@{ id = $googlePdf.id; name = $googlePdf.name; url = $googlePdf.webViewLink; sharedAsViewer = $true }
    $manifest.pdfAnyoneViewerVerified = $true
    Save-Manifest $manifestPath $manifest

    if ($SubmitToPortal) {
      $caseOpsScript = Join-Path $PSScriptRoot "dao-caseops.ps1"
      if (-not (Test-Path -LiteralPath $caseOpsScript)) { throw "The DAO case operations script is missing: $caseOpsScript" }
      $arguments = @("-NoProfile", "-File", $caseOpsScript, "submit-filing", "-CaseNumber", $CaseNumber, "-Title", $googleDocTitle, "-PdfPath", $pdfPath, "-Apply")
      if ($Local) { $arguments += "-Local" }
      $portalOutput = & pwsh @arguments -Confirm:$false 2>&1
      $portalExitCode = $LASTEXITCODE
      foreach ($line in $portalOutput) { Write-Host $line }
      if ($portalExitCode -ne 0) { throw "The document is safely on Drive, but DAO portal submission failed with exit code $portalExitCode." }
      $manifest.portalSubmission = [ordered]@{ status = "PENDING"; reviewInbox = "Submitted by dao-caseops.ps1" }
      Save-Manifest $manifestPath $manifest
    }
  } catch {
    $manifest.lastError = $_.Exception.Message
    Save-Manifest $manifestPath $manifest
    throw "$($_.Exception.Message) Partial results, if any, are recorded in $manifestPath"
  }

  Write-Host ""
  Write-Host "DOCUMENT READY"
  Write-Host "Google Doc: $($manifest.googleDoc.url)"
  Write-Host "PDF (Anyone with link, Viewer): $($manifest.googlePdf.url)"
  Write-Host "Local PDF: $pdfPath"
  Write-Host "Manifest: $manifestPath"
  if ($SubmitToPortal) { Write-Host "DAO status: Pending Review Inbox approval. This command does not approve or court-file the document." }
  if ($ShareGoogleDoc) { Write-Host "Google Doc access: Anyone with link, Viewer." } else { Write-Host "Google Doc access: private to your Google account; only the PDF is shareable by link." }
}

switch ($Command) {
  "setup-google" { Start-GoogleSetup }
  "publish" { Publish-Document }
}
