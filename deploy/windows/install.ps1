<#
.SYNOPSIS
  First-time installation (or re-start) of the shop server on this Windows PC.
.EXAMPLE
  .\deploy\windows\install.ps1 -SiteHost 192.168.1.50 -BackupDir D:\ERP-Backups
#>
param(
  [Parameter(Mandatory)][string]$SiteHost,
  [Parameter(Mandatory)][string]$BackupDir,
  [int]$HttpsPort = 443
)
Import-Module (Join-Path $PSScriptRoot 'ErpShop.psm1') -Force

Write-ErpStep 'Checking Docker Desktop'
Assert-ErpPrerequisites

$envFile = Get-ErpEnvFile
if (Test-Path $envFile) {
  Write-ErpStep 'deploy/.env already exists; keeping its secrets (delete it only for a brand-new install)'
  $added = Update-ErpEnvFile
  if ($added.Count -gt 0) { Write-ErpStep "Added new settings to deploy/.env: $($added -join ', '). Back up deploy/.env again." }
} else {
  Write-ErpStep 'Creating deploy/.env with new random secrets'
  $content = New-ErpEnvContent -SiteHost $SiteHost -BackupDir $BackupDir -HttpsPort $HttpsPort
  [System.IO.File]::WriteAllText($envFile, $content + "`n", (New-Object System.Text.UTF8Encoding $false))
}

if (-not (Test-Path $BackupDir)) {
  Write-ErpStep "Creating backup folder $BackupDir"
  New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

Write-ErpStep 'Building and starting the server (first run takes several minutes)'
Invoke-ErpCompose up -d --build --wait --wait-timeout 900

Write-ErpStep 'Exporting the shop certificate authority'
& (Join-Path $PSScriptRoot 'export-ca.ps1')

$cfg = Read-ErpEnv
Write-Host ''
Write-Host "Server is running at $($cfg.ERP_PUBLIC_URL)" -ForegroundColor Green
Write-Host 'Next steps (docs/DEPLOY_WINDOWS.md):'
Write-Host '  1. Trust deploy\erp-root-ca.crt on this PC (export-ca.ps1 -Install, as Administrator) and on staff devices.'
Write-Host '  2. Create the first administrator: .\deploy\windows\add-admin.ps1 -Username owner -Email you@example.com -FirstName ... -LastName ...'
Write-Host '  3. Copy deploy\.env to a safe offline place (USB key in a drawer). Without it, backups cannot be restored on a new PC.'
