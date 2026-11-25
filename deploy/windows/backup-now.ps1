<# .SYNOPSIS Takes a database backup immediately (in addition to the automatic schedule). #>
Import-Module (Join-Path $PSScriptRoot 'ErpShop.psm1') -Force
Write-ErpStep 'Backing up databases'
Invoke-ErpCompose exec -T backup /bin/sh /erp-backup/backup.sh once
