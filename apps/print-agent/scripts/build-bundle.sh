#!/usr/bin/env bash
# ============================================================================
# Build deploy bundle cho print-agent — zip dist/index.js (self-contained)
# + scripts cài service + .env.example + README.
#
# Output: apps/print-agent/dist-bundle/print-agent-bundle-vX.Y.Z.zip
# Ops gửi file này cho từng chi nhánh để deploy. Mỗi chi nhánh:
#   1. Unzip vào C:\ComTamMaTu\print-agent\
#   2. Copy .env.example → .env (bundle root), fill credentials
#   3. Run scripts/install-service.ps1
#
# Run từ root repo: bash apps/print-agent/scripts/build-bundle.sh
# ============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
AGENT_DIR="$REPO_ROOT/apps/print-agent"
OUT_DIR="$AGENT_DIR/dist-bundle"

# Read version from package.json (no jq dependency — sed extract)
VERSION=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$AGENT_DIR/package.json" | head -1)
if [[ -z "$VERSION" ]]; then
  echo "ERROR: cannot extract version from package.json" >&2
  exit 1
fi

BUNDLE_NAME="print-agent-bundle-v${VERSION}"
STAGING="$OUT_DIR/$BUNDLE_NAME"

echo "==> Building bundle v${VERSION}"

# 1. Ensure dist/ is fresh — fail loudly nếu chưa build
if [[ ! -f "$AGENT_DIR/dist/index.js" ]]; then
  echo "ERROR: dist/index.js not found. Chạy 'pnpm --filter @comtammatu/print-agent build' trước." >&2
  exit 1
fi

# Verify dist freshness — warn nếu source mới hơn dist
DIST_MTIME=$(stat -f %m "$AGENT_DIR/dist/index.js" 2>/dev/null || stat -c %Y "$AGENT_DIR/dist/index.js")
SRC_MTIME=$(find "$AGENT_DIR/src" -name '*.ts' -exec stat -f %m {} \; 2>/dev/null | sort -n | tail -1 || \
            find "$AGENT_DIR/src" -name '*.ts' -exec stat -c %Y {} \; | sort -n | tail -1)
if [[ "$SRC_MTIME" -gt "$DIST_MTIME" ]]; then
  echo "!!  WARN: src/ mới hơn dist/. Cân nhắc 'pnpm build' trước khi bundle." >&2
fi

# 2. Clean staging
rm -rf "$STAGING"
mkdir -p "$STAGING"

# 3. Copy artifacts — dist/index.js is a self-contained esbuild bundle
# (deps + fonts embedded), so the bundle ships no node_modules and no assets.
echo "==> Copy artifacts to $STAGING"
cp -r "$AGENT_DIR/dist"          "$STAGING/dist"
cp -r "$AGENT_DIR/scripts"       "$STAGING/scripts"
cp    "$AGENT_DIR/package.json"  "$STAGING/package.json"
cp    "$AGENT_DIR/.env.example"  "$STAGING/.env.example"
cp    "$AGENT_DIR/README.md"     "$STAGING/README.md"

# Strip dev-only scripts từ bundle (ops không cần)
rm -f "$STAGING/scripts/test-print.ts"
rm -f "$STAGING/scripts/build-bundle.sh"

# 4. Tạo INSTALL.md ngắn gọn cho ops (TL;DR)
cat > "$STAGING/INSTALL.md" <<EOF
# Print Agent v${VERSION} — Quick Install

## Chi nhánh deploy lần đầu

1. Cài Node.js 24+: https://nodejs.org/
2. Cài NSSM: \`choco install nssm\` (cần Chocolatey) hoặc tải từ https://nssm.cc/
3. Unzip bundle này vào \`C:\\ComTamMaTu\\print-agent\\\`
4. Mở thư mục, mở file \`.env.example\` → "Save As" thành \`.env\` (cùng thư mục)
5. Mở \`.env\` bằng Notepad, fill 4 dòng:
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - AGENT_TENANT_ID
   - AGENT_BRANCH_ID
6. Chạy PowerShell as Administrator:
   \`\`\`powershell
   cd C:\\ComTamMaTu\\print-agent
   .\\scripts\\install-service.ps1
   \`\`\`
7. Verify service Running:
   \`\`\`powershell
   Get-Service ComTamMaTu-PrintAgent
   \`\`\`

## Nâng cấp từ bản cũ (đã có service chạy)

1. Unzip đè bundle mới vào thư mục cũ
2. Nếu file cấu hình đang ở \`dist-bin\\.env\` (bản cũ): move nó ra thư mục gốc
   thành \`.env\` (cạnh thư mục dist)
3. Chạy lại \`scripts\\install-service.ps1\` (PowerShell as Administrator) —
   script tự gỡ service cũ và cài lại

## Smoke test sau install

Mở POS, kiểm:
- [ ] Header có badge xanh "Máy in: online"
- [ ] In thử 1 receipt → label "Tiền mặt" / "VietQR" hiện đúng (không raw)
- [ ] Huỷ 1 món có ghi chú → phiếu hủy hiện ghi chú gạch ngang
- [ ] Chốt ca → phiếu chốt ca có "Thu ngân:" (không "Người order:")

Reference: docs/runbooks/pos-kds/print-agent-rollout.md trong repo.
EOF

# 5. Zip — try zip first, fallback to tar+gzip
echo "==> Compress"
cd "$OUT_DIR"
if command -v zip >/dev/null 2>&1; then
  rm -f "${BUNDLE_NAME}.zip"
  zip -qr "${BUNDLE_NAME}.zip" "$BUNDLE_NAME"
  ARTIFACT="${BUNDLE_NAME}.zip"
else
  tar -czf "${BUNDLE_NAME}.tar.gz" "$BUNDLE_NAME"
  ARTIFACT="${BUNDLE_NAME}.tar.gz"
fi

# 6. Cleanup staging
rm -rf "$STAGING"

# 7. Report
SIZE=$(du -h "$OUT_DIR/$ARTIFACT" | cut -f1)
echo ""
echo "==> Done"
echo "    Bundle: $OUT_DIR/$ARTIFACT"
echo "    Size:   $SIZE"
echo ""
echo "Next: gửi file này cho IT chi nhánh, kèm INSTALL.md (đã có trong bundle)."
