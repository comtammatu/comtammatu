# ============================================================================
# Migrate Cơm Tấm Má Tư print-agent từ .exe (pkg) sang Node path.
#
# Bối cảnh: trước commit 98ce5c7 (2026-04), agent ship qua @yao-pkg/pkg thành
# `comtammatu-print-agent.exe`. ESM render-bitmap.js gây pkg fail → team chuyển
# sang chạy thẳng `node dist/index.js` qua NSSM. Một số chi nhánh deploy trước
# thời điểm đó vẫn chạy .exe legacy → script này migrate sang Node path để
# nhận được fixes mới (B1, B2, B4, B5, B6 từ release 2026-05-03+).
#
# Run as Administrator. Idempotent — chạy lại được nhiều lần an toàn.
# ============================================================================

param(
  [string]$ServiceName = "ComTamMaTu-PrintAgent",
  [string]$BackupDir   = "C:\ProgramData\ComTamMaTu\print-agent\backup-exe-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
)

$ErrorActionPreference = "Stop"

function Write-Step { param([string]$Msg) Write-Host "==> $Msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Msg) Write-Host "OK  $Msg" -ForegroundColor Green }
function Write-Warn { param([string]$Msg) Write-Host "!!  $Msg" -ForegroundColor Yellow }

# ─── 1. Pre-flight: Node 24+ + NSSM + Admin ────────────────────────────────

Write-Step "Pre-flight checks"

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
  Write-Error "Phải chạy script này với quyền Administrator (right-click → Run as Administrator)."
}

$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Error "node.exe không tìm thấy trong PATH. Cài Node.js 24+ từ https://nodejs.org/ trước khi chạy script này."
}
$nodeVersionRaw = & node --version
$nodeMajor = [int]($nodeVersionRaw -replace '^v(\d+)\..*', '$1')
if ($nodeMajor -lt 24) {
  Write-Error "Node version $nodeVersionRaw quá cũ. Yêu cầu >= 24.0.0. Cài bản mới từ nodejs.org."
}
Write-Ok "Node $nodeVersionRaw ($($nodeCmd.Source))"

$nssmCmd = Get-Command nssm.exe -ErrorAction SilentlyContinue
if (-not $nssmCmd) {
  Write-Error "nssm.exe không tìm thấy. Cài qua 'choco install nssm' hoặc tải từ https://nssm.cc/."
}
Write-Ok "NSSM ($($nssmCmd.Source))"

# ─── 2. Verify dist/ mới có tồn tại ────────────────────────────────────────

$distPath = Resolve-Path (Join-Path $PSScriptRoot "..\dist\index.js") -ErrorAction SilentlyContinue
if (-not $distPath) {
  Write-Error "Không tìm thấy dist/index.js. Phải build agent ở máy dev/CI (pnpm build) rồi copy thư mục apps/print-agent/dist/ sang máy này trước khi chạy migration."
}
Write-Ok "Found dist/index.js at $distPath"

$envPath = Resolve-Path (Join-Path $PSScriptRoot "..\dist-bin\.env") -ErrorAction SilentlyContinue
if (-not $envPath) {
  Write-Warn ".env không có ở dist-bin/.env — nếu service hiện tại đang dùng .env ở chỗ khác, copy về dist-bin/ trước khi tiếp tục."
  $proceed = Read-Host "Tiếp tục anyway? (y/N)"
  if ($proceed -ne "y") { Write-Host "Aborted." ; exit 1 }
}

# ─── 3. Inspect existing service state ─────────────────────────────────────

Write-Step "Inspect current service"

$service = Get-Service $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
  Write-Warn "Service '$ServiceName' chưa tồn tại — không cần migrate, chỉ cần install lần đầu. Chạy install-service.ps1 thay vì script này."
  exit 0
}

$currentApp = & $nssmCmd.Source get $ServiceName Application 2>$null
Write-Host "Current service Application: $currentApp"

$isExe = $currentApp -like "*.exe" -and $currentApp -notlike "*\node.exe"
if (-not $isExe) {
  Write-Ok "Service đã chạy node.exe ($currentApp) — không cần migrate."
  Write-Host "Nếu chỉ muốn cập nhật code mới, dừng service + copy dist/ mới + start service."
  exit 0
}
Write-Ok "Service đang chạy .exe legacy: $currentApp"

# ─── 4. Backup .exe + .env hiện tại ────────────────────────────────────────

Write-Step "Backup current deployment to $BackupDir"

New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

if (Test-Path $currentApp) {
  Copy-Item $currentApp $BackupDir -Force
  Write-Ok "Backed up .exe"
}

$currentDir = & $nssmCmd.Source get $ServiceName AppDirectory 2>$null
if ($currentDir -and (Test-Path (Join-Path $currentDir ".env"))) {
  Copy-Item (Join-Path $currentDir ".env") (Join-Path $BackupDir ".env") -Force
  Write-Ok "Backed up .env"
}

$serviceConfigBackup = @{
  ServiceName = $ServiceName
  Application = $currentApp
  AppDirectory = $currentDir
  AppParameters = (& $nssmCmd.Source get $ServiceName AppParameters 2>$null)
} | ConvertTo-Json
Set-Content -Path (Join-Path $BackupDir "nssm-config.json") -Value $serviceConfigBackup -Encoding UTF8
Write-Ok "Backed up NSSM config to nssm-config.json"

# ─── 5. Stop + remove old service ──────────────────────────────────────────

Write-Step "Stop và remove service cũ (.exe)"

& $nssmCmd.Source stop $ServiceName confirm | Out-Null
& $nssmCmd.Source remove $ServiceName confirm | Out-Null
Write-Ok "Service cũ removed"

# ─── 6. Re-run install-service.ps1 (Node path) ─────────────────────────────

Write-Step "Install service mới (Node path)"

$installScript = Join-Path $PSScriptRoot "install-service.ps1"
if (-not (Test-Path $installScript)) {
  Write-Error "install-service.ps1 không tìm thấy ở $installScript. Phải copy đầy đủ thư mục apps/print-agent/scripts/ sang máy này."
}

& $installScript -ServiceName $ServiceName
Write-Ok "Install xong"

# ─── 7. Verify ────────────────────────────────────────────────────────────

Write-Step "Verify service state"

Start-Sleep -Seconds 5
$newService = Get-Service $ServiceName
if ($newService.Status -ne "Running") {
  Write-Warn "Service status = $($newService.Status) (expected Running). Check log:"
  Write-Host "  Get-Content C:\ProgramData\ComTamMaTu\print-agent\logs\agent.err.log -Tail 30"
  Write-Warn "Nếu fail, rollback bằng cách restore từ $BackupDir + chạy lại install-service.ps1 với -EntryPath trỏ về .exe cũ."
  exit 1
}
Write-Ok "Service Running"

$newApp = & $nssmCmd.Source get $ServiceName Application 2>$null
Write-Ok "New Application: $newApp"

Write-Host ""
Write-Host "Migration thành công." -ForegroundColor Green
Write-Host "Backup ở: $BackupDir"
Write-Host ""
Write-Host "Tiếp theo:"
Write-Host "  1. Tail log để confirm SUBSCRIBED:"
Write-Host "     Get-Content C:\ProgramData\ComTamMaTu\print-agent\logs\agent.out.log -Wait -Tail 20"
Write-Host "  2. Mở POS, kiểm tra badge 'Máy in: online' xanh."
Write-Host "  3. In thử 1 receipt + 1 phiếu hủy (món có note) để verify fixes mới."
