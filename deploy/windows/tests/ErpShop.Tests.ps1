# Plain PowerShell checks for the pure helpers (no Docker needed). Run:
#   pwsh -File deploy/windows/tests/ErpShop.Tests.ps1
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot '..\ErpShop.psm1') -Force
$failures = 0
function Check([string]$Name, [scriptblock]$Test) {
  try { if (& $Test) { Write-Host "  ok   $Name" } else { Write-Host "  FAIL $Name"; $script:failures++ } }
  catch { Write-Host "  FAIL $Name : $_"; $script:failures++ }
}

Check 'secret is 43 URL-safe characters' { $s = New-ErpSecret; $s.Length -eq 43 -and $s -match '^[A-Za-z0-9_-]+$' }
Check 'secrets are unique' { (New-ErpSecret) -ne (New-ErpSecret) }
Check 'public URL omits :443' { (Get-ErpPublicUrl -SiteHost '192.168.1.50') -eq 'https://192.168.1.50' }
Check 'public URL keeps another port' { (Get-ErpPublicUrl -SiteHost 'erp.shop.lan' -HttpsPort 8443) -eq 'https://erp.shop.lan:8443' }
Check 'accepts IPv4 and host names' { (Test-ErpSiteHost '192.168.1.50') -and (Test-ErpSiteHost 'erp.shop.lan') -and (Test-ErpSiteHost 'shop-pc') }
Check 'rejects URLs, ports and spaces' {
  -not (Test-ErpSiteHost 'https://x') -and -not (Test-ErpSiteHost 'x:443') -and -not (Test-ErpSiteHost 'a b') -and -not (Test-ErpSiteHost '::1')
}
Check 'env content has every required key and fresh secrets' {
  $c = New-ErpEnvContent -SiteHost '192.168.1.50' -BackupDir 'D:\ERP-Backups'
  $keys = 'ERP_SITE_HOST','ERP_HTTPS_PORT','ERP_PUBLIC_URL','ERP_BACKUP_DIR','POSTGRES_PASSWORD','KEYCLOAK_DB_PASSWORD','KC_BOOTSTRAP_ADMIN_PASSWORD','ERP_WEB_CLIENT_SECRET','WEB_SESSION_SECRET','ERP_API_ADMIN_CLIENT_SECRET'
  ($keys | Where-Object { $c -notmatch "(?m)^$_=\S+" }).Count -eq 0 -and $c -notmatch 'change-me' -and $c -match '(?m)^ERP_BACKUP_DIR=D:/ERP-Backups$'
}
Check 'env content refuses a bad host' {
  try { New-ErpEnvContent -SiteHost 'https://bad' -BackupDir 'D:\x' | Out-Null; $false } catch { $_.Exception.Message -match 'IPv4 address or host name' }
}
Check 'env content is deterministic with given secrets' {
  $s = @{ POSTGRES_PASSWORD = 'a'; KEYCLOAK_DB_PASSWORD = 'b'; KC_BOOTSTRAP_ADMIN_PASSWORD = 'c'; ERP_WEB_CLIENT_SECRET = 'd'; WEB_SESSION_SECRET = 'e'; ERP_API_ADMIN_CLIENT_SECRET = 'f' }
  (New-ErpEnvContent -SiteHost 'h.lan' -BackupDir 'E:\b' -Secrets $s) -eq (New-ErpEnvContent -SiteHost 'h.lan' -BackupDir 'E:\b' -Secrets $s)
}

Check 'missing secrets are added for an older .env, existing ones untouched' {
  $old = "ERP_SITE_HOST=h`nPOSTGRES_PASSWORD=keep-me`nKEYCLOAK_DB_PASSWORD=k`nKC_BOOTSTRAP_ADMIN_PASSWORD=a`nERP_WEB_CLIENT_SECRET=w`n"
  $lines = @(Get-ErpMissingSecretLines -Content $old)
  $lines.Count -eq 2 -and $lines[0] -match '^WEB_SESSION_SECRET=[A-Za-z0-9_-]{43}$' -and $lines[1] -match '^ERP_API_ADMIN_CLIENT_SECRET=\S{43}$'
}
Check 'nothing is added when all secrets exist' {
  $full = New-ErpEnvContent -SiteHost 'h.lan' -BackupDir 'E:\b'
  @(Get-ErpMissingSecretLines -Content $full).Count -eq 0
}
Check 'an empty value counts as missing' {
  @(Get-ErpMissingSecretLines -Content "WEB_SESSION_SECRET=`n") -match '^WEB_SESSION_SECRET=\S+' | Measure-Object | ForEach-Object { $_.Count -eq 1 }
}

if ($failures) { Write-Host "$failures check(s) failed"; exit 1 } else { Write-Host 'all checks passed' }
