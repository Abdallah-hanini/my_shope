<#
.SYNOPSIS
  Copies the shop's HTTPS root certificate to deploy\erp-root-ca.crt. With -Install (run as
  Administrator) it is also added to this PC's Trusted Root store.
#>
param([switch]$Install)
Import-Module (Join-Path $PSScriptRoot 'ErpShop.psm1') -Force
$target = Join-Path (Get-ErpRepoRoot) 'deploy/erp-root-ca.crt'
$pem = Invoke-ErpCompose exec -T caddy cat /data/caddy/pki/authorities/local/root.crt | Out-String
if ($pem -notmatch 'BEGIN CERTIFICATE') { throw 'Could not read the root certificate from the caddy container.' }
[System.IO.File]::WriteAllText($target, $pem.Trim() + "`n")
Write-Host "Root certificate written to $target"
if ($Install) {
  Import-Certificate -FilePath $target -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
  Write-Host 'Installed in Trusted Root Certification Authorities for this PC.'
}
