# Install Cơm Tấm Má Tư print-agent as a Windows Service via NSSM.
# Run as Administrator. Reads configuration from .env next to the exe.

param(
  [string]$ServiceName = "ComTamMaTu-PrintAgent",
  [string]$ExePath    = (Join-Path $PSScriptRoot "..\dist-bin\comtammatu-print-agent.exe"),
  [string]$WorkingDir = (Join-Path $PSScriptRoot "..\dist-bin"),
  [string]$EnvFile    = (Join-Path $PSScriptRoot "..\dist-bin\.env"),
  [string]$LogDir     = "C:\ProgramData\ComTamMaTu\print-agent\logs"
)

$ErrorActionPreference = "Stop"

function Require-Nssm {
  $nssm = Get-Command nssm.exe -ErrorAction SilentlyContinue
  if (-not $nssm) {
    Write-Error "nssm.exe not found in PATH. Install from https://nssm.cc/ or via 'choco install nssm'."
  }
  return $nssm.Source
}

$nssm = Require-Nssm

if (-not (Test-Path $ExePath)) {
  Write-Error "Agent exe not found at $ExePath. Run 'pnpm -F @comtammatu/print-agent build && pnpm -F @comtammatu/print-agent package' first."
}

if (-not (Test-Path $EnvFile)) {
  Write-Error ".env not found at $EnvFile. Copy .env.example and fill in SUPABASE_URL / SERVICE_ROLE_KEY / AGENT_TENANT_ID / AGENT_BRANCH_ID."
}

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

# Remove existing service if present
& $nssm stop $ServiceName confirm 2>$null | Out-Null
& $nssm remove $ServiceName confirm 2>$null | Out-Null

& $nssm install $ServiceName $ExePath
& $nssm set $ServiceName AppDirectory $WorkingDir
& $nssm set $ServiceName Description "Cơm Tấm Má Tư thermal print agent (LAN + USB)"
& $nssm set $ServiceName Start SERVICE_AUTO_START
& $nssm set $ServiceName AppStdout (Join-Path $LogDir "agent.out.log")
& $nssm set $ServiceName AppStderr (Join-Path $LogDir "agent.err.log")
& $nssm set $ServiceName AppRotateFiles 1
& $nssm set $ServiceName AppRotateBytes 10485760
& $nssm set $ServiceName AppThrottle 1500
& $nssm set $ServiceName AppExit Default Restart
& $nssm set $ServiceName AppRestartDelay 5000

# Load env vars from .env into service environment
$envLines = Get-Content $EnvFile | Where-Object { $_ -and -not $_.StartsWith("#") -and $_.Contains("=") }
$envArgs = @()
foreach ($line in $envLines) {
  $k, $v = $line -split "=", 2
  $envArgs += "$($k.Trim())=$($v.Trim())"
}
if ($envArgs.Count -gt 0) {
  & $nssm set $ServiceName AppEnvironmentExtra $envArgs
}

& $nssm start $ServiceName
Write-Host "Service '$ServiceName' installed and started. Logs: $LogDir" -ForegroundColor Green
