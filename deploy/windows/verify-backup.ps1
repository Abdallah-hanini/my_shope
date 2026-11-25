<# .SYNOPSIS Restores the newest backup into a temporary database, checks it, and removes it. Live data is not touched. #>
Import-Module (Join-Path $PSScriptRoot 'ErpShop.psm1') -Force
Write-ErpStep 'Verifying the newest backup'
Invoke-ErpCompose exec -T backup /bin/sh /erp-backup/backup.sh verify
