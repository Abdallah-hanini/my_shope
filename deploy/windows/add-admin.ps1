<#
.SYNOPSIS
  Creates a shop administrator: a Keycloak sign-in (temporary password, must change it and enrol an
  authenticator app at first sign-in) linked to an ERP platform-administrator account.
#>
param(
  [Parameter(Mandatory)][string]$Username,
  [Parameter(Mandatory)][string]$Email,
  [Parameter(Mandatory)][string]$FirstName,
  [Parameter(Mandatory)][string]$LastName
)
Import-Module (Join-Path $PSScriptRoot 'ErpShop.psm1') -Force
$cfg = Read-ErpEnv

Write-ErpStep "Creating sign-in account '$Username' in Keycloak"
$out = Invoke-ErpCompose exec -T keycloak bash /erp-scripts/bootstrap-admin.sh $Username $Email $FirstName $LastName | Out-String
$userId = [regex]::Match($out, 'USER_ID=(\S+)').Groups[1].Value
$temp = [regex]::Match($out, 'TEMP_PASSWORD=(\S+)').Groups[1].Value
if (-not $userId) { throw "Keycloak did not return a user id:`n$out" }

Write-ErpStep 'Linking the account as ERP platform administrator'
Invoke-ErpCompose exec -T api node apps/api/dist/cli/bootstrap-admin.js `
  --issuer "$($cfg.ERP_PUBLIC_URL)/auth/realms/erp" --subject $userId --email $Email --name "$FirstName $LastName"

Write-Host ''
if ($temp) {
  Write-Host "Temporary password for ${Username}: $temp" -ForegroundColor Yellow
  Write-Host 'It is shown once. At first sign-in the user must choose a new password and scan the authenticator QR code.'
} else {
  Write-Host "Account '$Username' already existed in Keycloak; its password was not changed."
}
