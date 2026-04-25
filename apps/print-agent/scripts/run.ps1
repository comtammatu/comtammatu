# Chạy print-agent ở foreground (không cài service).
# Dùng cho dev/test nhanh. Service production: xem install-service.ps1.
# Chạy qua Node trực tiếp (bỏ pkg do ESM issue với render-bitmap).

param(
  [string]$NodePath  = (Get-Command node.exe -ErrorAction SilentlyContinue).Source,
  [string]$EntryPath = (Join-Path $PSScriptRoot "..\dist\index.js"),
  [string]$EnvFile   = (Join-Path $PSScriptRoot "..\dist-bin\.env")
)

$ErrorActionPreference = "Stop"

if (-not $NodePath) {
  Write-Error "node.exe không có trong PATH. Cài Node 24+ từ https://nodejs.org/."
}
if (-not (Test-Path $EntryPath)) {
  Write-Error "Không tìm thấy dist/index.js tại $EntryPath. Chạy 'pnpm -F @comtammatu/print-agent build' trước."
}
if (-not (Test-Path $EnvFile)) {
  Write-Error "Không tìm thấy .env tại $EnvFile. Copy .env.example và điền SUPABASE_URL / SERVICE_ROLE_KEY / AGENT_TENANT_ID / AGENT_BRANCH_ID."
}

Get-Content $EnvFile | Where-Object { $_ -and -not $_.StartsWith("#") -and $_.Contains("=") } | ForEach-Object {
  $k, $v = $_ -split "=", 2
  [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), "Process")
}

Write-Host "Starting print-agent via $NodePath ..." -ForegroundColor Green
& $NodePath $EntryPath
