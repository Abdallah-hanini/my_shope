<# .SYNOPSIS Backs up, pulls the latest code from GitHub, rebuilds and restarts. #>
Import-Module (Join-Path $PSScriptRoot 'ErpShop.psm1') -Force
Assert-ErpPrerequisites
Write-ErpStep 'Backing up before upgrade'
Invoke-ErpCompose exec -T backup /bin/sh /erp-backup/backup.sh once
Write-ErpStep 'Fetching the latest version'
& git -C (Get-ErpRepoRoot) pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'git pull failed (local changes or diverged history). Nothing was changed.' }
$added = Update-ErpEnvFile
if ($added.Count -gt 0) { Write-ErpStep "Added new settings to deploy/.env: $($added -join ', '). Back up deploy/.env again." }
Write-ErpStep 'Rebuilding and restarting (database migrations run automatically)'
Invoke-ErpCompose up -d --build --wait --wait-timeout 900
Write-Host 'Upgrade finished.' -ForegroundColor Green
