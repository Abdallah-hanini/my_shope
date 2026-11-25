<# .SYNOPSIS Stops the shop server. Data is kept. #>
Import-Module (Join-Path $PSScriptRoot 'ErpShop.psm1') -Force
Invoke-ErpCompose stop
