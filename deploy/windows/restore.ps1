<#
.SYNOPSIS
  Replaces the live ERP and Keycloak databases with a backup. Everything entered after that backup
  is lost. Takes a safety backup first, stops the applications, restores, and starts them again.
.EXAMPLE
  .\deploy\windows\restore.ps1 -Stamp 20261125T180000Z
  (restores erp-20261125T180000Z.dump and keycloak-20261125T180000Z.dump from the backup folder)
#>
param([Parameter(Mandatory)][ValidatePattern('^\d{8}T\d{6}Z$')][string]$Stamp)
Import-Module (Join-Path $PSScriptRoot 'ErpShop.psm1') -Force
$cfg = Read-ErpEnv
foreach ($db in 'erp', 'keycloak') {
  $file = Join-Path $cfg.ERP_BACKUP_DIR "$db-$Stamp.dump"
  if (-not (Test-Path $file)) { throw "Backup file not found: $file" }
}
Write-Host "This replaces ALL current data with the backup from $Stamp." -ForegroundColor Red
$answer = Read-Host 'Type RESTORE to continue'
if ($answer -cne 'RESTORE') { Write-Host 'Cancelled.'; exit 1 }

Write-ErpStep 'Safety backup of the current data'
Invoke-ErpCompose exec -T backup /bin/sh /erp-backup/backup.sh once
Write-ErpStep 'Stopping applications'
Invoke-ErpCompose stop caddy web api worker keycloak
try {
  foreach ($db in 'erp', 'keycloak') {
    Write-ErpStep "Restoring $db"
    Invoke-ErpCompose exec -T backup /bin/sh /erp-backup/restore.sh "$db-$Stamp.dump" $db
  }
} finally {
  Write-ErpStep 'Starting applications'
  Invoke-ErpCompose up -d --no-build --wait --wait-timeout 600
}
Write-Host 'Restore finished.' -ForegroundColor Green
