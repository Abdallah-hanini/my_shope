<# .SYNOPSIS Shows service health and the latest backup. #>
Import-Module (Join-Path $PSScriptRoot 'ErpShop.psm1') -Force
$cfg = Read-ErpEnv
Invoke-ErpCompose ps --format 'table {{.Service}}\t{{.Status}}'
$last = Join-Path $cfg.ERP_BACKUP_DIR 'LAST_SUCCESS.txt'
$fail = Join-Path $cfg.ERP_BACKUP_DIR 'LAST_FAILURE.txt'
if (Test-Path $fail) { Write-Host "BACKUP FAILURE: $(Get-Content $fail)" -ForegroundColor Red }
if (Test-Path $last) { Write-Host "Last successful backup (UTC): $(Get-Content $last)" } else { Write-Host 'No successful backup yet.' -ForegroundColor Yellow }
Write-Host "Open $($cfg.ERP_PUBLIC_URL) in a browser."
