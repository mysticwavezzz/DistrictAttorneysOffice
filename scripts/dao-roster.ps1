#Requires -Version 7.0

# Read-only Criminal Division roster report using the signed local DAO API client.
[CmdletBinding()]
param(
  [string]$Division = "Criminal Division",
  [switch]$FullRoster
)

$ErrorActionPreference = "Stop"
$caseOpsScript = Join-Path $PSScriptRoot "dao-caseops.ps1"
if (-not (Test-Path -LiteralPath $caseOpsScript)) { throw "The local DAO client was not found: $caseOpsScript" }

$command = if ($FullRoster) { "roster" } else { "unassigned-attorneys" }
& $caseOpsScript $command -Division $Division
