<# .SYNOPSIS Starts the shop server (normally automatic when Docker Desktop starts). #>
Import-Module (Join-Path $PSScriptRoot 'ErpShop.psm1') -Force
Assert-ErpPrerequisites
Invoke-ErpCompose up -d --no-build --wait --wait-timeout 600
