# One-shot print-agent install / update / env-supplement for a branch POS PC.
# Idempotent: first run installs; later runs upgrade the service and fill missing
# .env keys. Run as Administrator from the bundle root (or via SETUP.cmd).
#
# ASCII-only file: Windows PowerShell 5.1 mis-parses UTF-8 without BOM.
#
# Examples:
#   .\scripts\setup-branch.ps1
#   .\scripts\setup-branch.ps1 -EnvFile C:\secure\phuoc-hai.env
#   .\scripts\setup-branch.ps1 -TenantId 1 -BranchId 3 -AgentId nguyen-huu-tho

param(
  [string]$EnvFile = "",
  [string]$ServiceName = "ComTamMaTu-PrintAgent",
  [string]$InstallRoot = "",
  [string]$TenantId = "",
  [string]$BranchId = "",
  [string]$AgentId = "",
  [string]$SupabaseUrl = "",
  [string]$SupabaseServiceRoleKey = "",
  [string]$WebBaseUrl = "",
  [string]$PresenceToken = "",
  [switch]$SkipDeps,
  [switch]$SkipService,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$BundleRoot = if ($InstallRoot) {
  (Resolve-Path $InstallRoot).Path
} else {
  (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$EnvPath = Join-Path $BundleRoot ".env"
$EnvExamplePath = Join-Path $BundleRoot ".env.example"
$EntryPath = Join-Path $BundleRoot "dist\index.js"
$InstallServiceScript = Join-Path $BundleRoot "scripts\install-service.ps1"
$LogDir = "C:\ProgramData\ComTamMaTu\print-agent\logs"
$OutLog = Join-Path $LogDir "agent.out.log"

$RequiredKeys = @(
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AGENT_TENANT_ID",
  "AGENT_BRANCH_ID"
)

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
  Write-Host "    OK  $Message" -ForegroundColor Green
}

function Write-WarnStep([string]$Message) {
  Write-Host "    !!  $Message" -ForegroundColor Yellow
}

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Run as Administrator (right-click SETUP.cmd -> Run as administrator), or re-launch elevated PowerShell."
  }
}

function Get-EnvMap([string]$Path) {
  $map = [ordered]@{}
  if (-not (Test-Path $Path)) { return $map }
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) { continue }
    $key, $value = $trimmed -split "=", 2
    $map[$key.Trim()] = $value.Trim()
  }
  return $map
}

function Set-EnvMapValue($Map, [string]$Key, [string]$Value) {
  if ($null -eq $Value) { return }
  if ($Value -eq "") { return }
  $Map[$Key] = $Value
}

function Write-EnvFile($Map, [string]$Path) {
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("# Generated/updated by scripts/setup-branch.ps1 - do not sync to cloud drives.")
  foreach ($key in $Map.Keys) {
    $lines.Add("$key=$($Map[$key])")
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($Path, $lines, $utf8NoBom)
}

function Test-EnvKey($Map, [string]$Key) {
  return ($Map.Keys -contains $Key)
}

function Merge-EnvExampleKeys($Map, [string]$ExamplePath) {
  if (-not (Test-Path $ExamplePath)) { return $Map }
  foreach ($line in Get-Content -LiteralPath $ExamplePath -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) { continue }
    $key, $value = $trimmed -split "=", 2
    $key = $key.Trim()
    if (-not (Test-EnvKey $Map $key)) {
      $Map[$key] = $value.Trim()
    }
  }
  return $Map
}

function Assert-RequiredEnv($Map) {
  $missing = @()
  foreach ($key in $RequiredKeys) {
    if (-not (Test-EnvKey $Map $key) -or [string]::IsNullOrWhiteSpace([string]$Map[$key])) {
      $missing += $key
    }
  }
  if ($missing.Count -gt 0) {
    Write-Error ("Missing required .env values: {0}. Provide -EnvFile from HQ, or pass -SupabaseUrl/-SupabaseServiceRoleKey/-TenantId/-BranchId." -f ($missing -join ", "))
  }
}

function Get-NodeMajor {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) { return $null }
  $raw = & $node.Source --version 2>$null
  if ($raw -match '^v?(\d+)\.') { return [int]$Matches[1] }
  return $null
}

function Refresh-ProcessPath {
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [System.Environment]::GetEnvironmentVariable("Path", "User")
}

function Get-LatestNode24Version {
  # Official dist index - first match is the newest release for that major.
  $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -TimeoutSec 60
  foreach ($row in $index) {
    if ($row.version -match '^v(24\.\d+\.\d+)$') {
      return $Matches[1]
    }
  }
  return $null
}

function Install-Node24FromOfficialMsi([string]$Version) {
  $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
  $url = "https://nodejs.org/dist/v$Version/node-v$Version-win-$arch.msi"
  $msi = Join-Path $env:TEMP "node-v$Version-win-$arch.msi"
  Write-Host "    Downloading Node.js v$Version ($arch) from nodejs.org..."
  Write-Host "    $url"
  Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing
  Write-Host "    Installing Node.js v$Version silently (msiexec)..."
  $proc = Start-Process -FilePath "msiexec.exe" `
    -ArgumentList "/i `"$msi`" /qn /norestart" `
    -Wait -PassThru
  Remove-Item -LiteralPath $msi -Force -ErrorAction SilentlyContinue
  # 0 = success, 3010 = success reboot required
  if ($proc.ExitCode -notin 0, 3010) {
    Write-Error "Node.js MSI install failed (msiexec exit $($proc.ExitCode)). Install v24.x from https://nodejs.org/ and re-run."
  }
}

function Ensure-Node24 {
  $major = Get-NodeMajor
  if ($major -eq 24) {
    Write-Ok "Node.js v24 already installed"
    return
  }
  if ($null -ne $major) {
    Write-WarnStep "Node.js major $major found; print-agent requires v24.x. Installing Node.js 24.x..."
  } else {
    Write-Host "    Node.js not found. Installing Node.js 24.x (default)..."
  }

  $version = Get-LatestNode24Version
  if (-not $version) {
    Write-Error "Could not resolve latest Node.js 24.x from https://nodejs.org/dist/index.json"
  }
  Write-Host "    Target: Node.js v$version"

  # Prefer official 24.x MSI so we never accidentally install Current (e.g. 25+).
  Install-Node24FromOfficialMsi -Version $version
  Refresh-ProcessPath

  $major = Get-NodeMajor
  if ($major -ne 24) {
    # Fallback: winget LTS pinned to the same 24.x version when MSI path did not register node yet.
    $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
    if ($winget) {
      Write-WarnStep "node.exe still not v24 after MSI; trying winget OpenJS.NodeJS.LTS --version $version"
      & $winget.Source install -e --id OpenJS.NodeJS.LTS --version $version `
        --accept-package-agreements --accept-source-agreements
      Refresh-ProcessPath
      $major = Get-NodeMajor
    }
  }

  if ($major -ne 24) {
    Write-Error "Node.js 24.x is required after install (got major=$major). Install manually from https://nodejs.org/dist/latest-v24.x/ then re-run."
  }
  Write-Ok "Node.js v$version installed"
}

function Ensure-Nssm {
  $nssm = Get-Command nssm.exe -ErrorAction SilentlyContinue
  if ($nssm) {
    Write-Ok "NSSM already on PATH ($($nssm.Source))"
    return
  }

  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if ($winget) {
    Write-Host "    Installing NSSM via winget..."
    & $winget.Source install -e --id NSSM.NSSM --accept-package-agreements --accept-source-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
    $nssm = Get-Command nssm.exe -ErrorAction SilentlyContinue
    if ($nssm) {
      Write-Ok "NSSM installed via winget"
      return
    }
  }

  $choco = Get-Command choco.exe -ErrorAction SilentlyContinue
  if ($choco) {
    Write-Host "    Installing NSSM via Chocolatey..."
    & $choco.Source install nssm -y
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
    $nssm = Get-Command nssm.exe -ErrorAction SilentlyContinue
    if ($nssm) {
      Write-Ok "NSSM installed via Chocolatey"
      return
    }
  }

  Write-Error "nssm.exe not found. Install from https://nssm.cc/ or 'winget install NSSM.NSSM', then re-run."
}

function Migrate-LegacyEnv {
  $legacy = Join-Path $BundleRoot "dist-bin\.env"
  if ((Test-Path $legacy) -and -not (Test-Path $EnvPath)) {
    Move-Item -LiteralPath $legacy -Destination $EnvPath
    Write-Ok "Moved legacy dist-bin\.env -> .env"
  }
}

function Prepare-EnvFile {
  Migrate-LegacyEnv

  $map = Get-EnvMap $EnvPath
  if ($map.Count -eq 0 -and (Test-Path $EnvExamplePath)) {
    $map = Get-EnvMap $EnvExamplePath
    Write-Ok "Seeded .env from .env.example"
  }

  if ($EnvFile) {
    if (-not (Test-Path -LiteralPath $EnvFile)) {
      Write-Error "EnvFile not found: $EnvFile"
    }
    $overlay = Get-EnvMap $EnvFile
    foreach ($key in $overlay.Keys) {
      Set-EnvMapValue $map $key $overlay[$key]
    }
    Write-Ok "Merged values from $EnvFile"
  }

  Set-EnvMapValue $map "SUPABASE_URL" $SupabaseUrl
  Set-EnvMapValue $map "SUPABASE_SERVICE_ROLE_KEY" $SupabaseServiceRoleKey
  Set-EnvMapValue $map "AGENT_TENANT_ID" $TenantId
  Set-EnvMapValue $map "AGENT_BRANCH_ID" $BranchId
  Set-EnvMapValue $map "AGENT_ID" $AgentId
  Set-EnvMapValue $map "WEB_BASE_URL" $WebBaseUrl
  Set-EnvMapValue $map "PRINT_AGENT_PRESENCE_TOKEN" $PresenceToken

  $beforeKeys = @($map.Keys)
  $map = Merge-EnvExampleKeys $map $EnvExamplePath
  $added = @($map.Keys | Where-Object { $beforeKeys -notcontains $_ })
  if ($added.Count -gt 0) {
    Write-Ok ("Supplemented missing keys: {0}" -f ($added -join ", "))
  }

  Assert-RequiredEnv $map
  Write-EnvFile $map $EnvPath
  Write-Ok ".env ready at $EnvPath"
}

function Install-OrUpdateService {
  if (-not (Test-Path $EntryPath)) {
    Write-Error "dist\index.js missing at $EntryPath. Unzip the full print-agent bundle first."
  }
  if (-not (Test-Path $InstallServiceScript)) {
    Write-Error "install-service.ps1 missing at $InstallServiceScript"
  }

  & $InstallServiceScript `
    -ServiceName $ServiceName `
    -EntryPath $EntryPath `
    -WorkingDir $BundleRoot `
    -EnvFile $EnvPath `
    -LogDir $LogDir

  Write-Ok "Service install script finished"
}

function Assert-ServiceHealthy {
  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if (-not $svc) {
    Write-Error "Service '$ServiceName' not found after install."
  }
  if ($svc.Status -ne "Running") {
    Start-Service $ServiceName
    Start-Sleep -Seconds 2
    $svc.Refresh()
  }
  if ($svc.Status -ne "Running") {
    Write-Error "Service '$ServiceName' is $($svc.Status). Check $LogDir\agent.err.log"
  }
  Write-Ok "Service Running"

  # Best-effort Realtime subscribe proof - do not fail hard on slow networks.
  $deadline = (Get-Date).AddSeconds(15)
  $subscribed = $false
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $OutLog) {
      $tail = Get-Content -LiteralPath $OutLog -Tail 80 -ErrorAction SilentlyContinue
      if ($tail -match "realtime status=SUBSCRIBED") {
        $subscribed = $true
        break
      }
    }
    Start-Sleep -Seconds 1
  }
  if ($subscribed) {
    Write-Ok "Realtime SUBSCRIBED in agent.out.log"
  } else {
    Write-WarnStep "No SUBSCRIBED line yet in agent.out.log - check network/credentials if POS badge stays offline"
  }
}

$setupFailed = $false
try {
  Write-Host "Com Tam Ma Tu - print-agent branch setup" -ForegroundColor White
  Write-Host "Bundle: $BundleRoot"

  Write-Step "Administrator check"
  Assert-Administrator
  Write-Ok "Elevated"

  if (-not $SkipDeps) {
    Write-Step "Dependencies (Node 24 + NSSM)"
    Ensure-Node24
    Ensure-Nssm
  } else {
    Write-Step "Dependencies skipped (-SkipDeps)"
  }

  Write-Step "Environment (.env create / merge / supplement)"
  Prepare-EnvFile

  if (-not $SkipService) {
    Write-Step "Windows service install / update"
    Install-OrUpdateService
    Write-Step "Health check"
    Assert-ServiceHealthy
  } else {
    Write-Step "Service install skipped (-SkipService)"
  }

  Write-Host ""
  Write-Host "Done. Branch agent is ready for smoke test:" -ForegroundColor Green
  Write-Host "  1. Open POS -> badge 'May in: online' (green)"
  Write-Host "  2. Print one receipt / complete one KDS item"
  Write-Host "  3. Re-run this script after unzipping a newer bundle to upgrade"
} catch {
  $setupFailed = $true
  Write-Host ""
  Write-Host "SETUP FAILED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Full error:" -ForegroundColor Yellow
  Write-Host $_
} finally {
  if (-not $NoPause) {
    Write-Host ""
    try {
      Read-Host "Press Enter to close this window"
    } catch {
      # non-interactive host
    }
  }
}
if ($setupFailed) { exit 1 }
