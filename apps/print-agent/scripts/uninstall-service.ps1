param([string]$ServiceName = "ComTamMaTu-PrintAgent")

$ErrorActionPreference = "Continue"

$nssm = (Get-Command nssm.exe -ErrorAction SilentlyContinue)?.Source
if (-not $nssm) { Write-Error "nssm.exe not in PATH"; exit 1 }

& $nssm stop $ServiceName confirm 2>$null | Out-Null
& $nssm remove $ServiceName confirm
Write-Host "Service '$ServiceName' removed." -ForegroundColor Yellow
