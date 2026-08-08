#!/usr/bin/env bash
# ============================================================================
# Build a lean deploy zip for branch POS PCs:
#   dist/index.js + SETUP.cmd + setup/install/uninstall PS1 + .env.example
#   + short INSTALL.md + VERSION
#
# Never packages secrets (.env / branch.env). HQ sends branch.env separately.
#
# Output: apps/print-agent/dist-bundle/print-agent-bundle-vX.Y.Z.zip
# Branch IT:
#   1. Unzip to C:\ComTamMaTu\print-agent\
#   2. Place HQ branch.env next to SETUP.cmd
#   3. SETUP.cmd -EnvFile branch.env (Run as administrator)
#
# Run from repo root: bash apps/print-agent/scripts/build-bundle.sh
# ============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
AGENT_DIR="$REPO_ROOT/apps/print-agent"
OUT_DIR="$AGENT_DIR/dist-bundle"

VERSION=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$AGENT_DIR/package.json" | head -1)
if [[ -z "$VERSION" ]]; then
  echo "ERROR: cannot extract version from package.json" >&2
  exit 1
fi

BUNDLE_NAME="print-agent-bundle-v${VERSION}"
STAGING="$OUT_DIR/$BUNDLE_NAME"

echo "==> Building lean bundle v${VERSION}"

if [[ ! -f "$AGENT_DIR/dist/index.js" ]]; then
  echo "ERROR: dist/index.js not found. Run 'pnpm --filter @comtammatu/print-agent build' first." >&2
  exit 1
fi

DIST_MTIME=$(stat -f %m "$AGENT_DIR/dist/index.js" 2>/dev/null || stat -c %Y "$AGENT_DIR/dist/index.js")
SRC_MTIME=$(find "$AGENT_DIR/src" -name '*.ts' -exec stat -f %m {} \; 2>/dev/null | sort -n | tail -1 || \
            find "$AGENT_DIR/src" -name '*.ts' -exec stat -c %Y {} \; | sort -n | tail -1)
if [[ "$SRC_MTIME" -gt "$DIST_MTIME" ]]; then
  echo "!!  WARN: src/ is newer than dist/. Consider 'pnpm build' before bundling." >&2
fi

rm -rf "$STAGING"
mkdir -p "$STAGING/dist" "$STAGING/scripts"

echo "==> Copy lean artifacts to $STAGING"
cp "$AGENT_DIR/dist/index.js"                    "$STAGING/dist/index.js"
cp "$AGENT_DIR/SETUP.cmd"                        "$STAGING/SETUP.cmd"
cp "$AGENT_DIR/.env.example"                     "$STAGING/.env.example"
cp "$AGENT_DIR/scripts/setup-branch.ps1"         "$STAGING/scripts/setup-branch.ps1"
cp "$AGENT_DIR/scripts/install-service.ps1"      "$STAGING/scripts/install-service.ps1"
cp "$AGENT_DIR/scripts/uninstall-service.ps1"    "$STAGING/scripts/uninstall-service.ps1"
printf '%s\n' "$VERSION" > "$STAGING/VERSION"

# Branch-facing install only — no HQ provision CLI, no developer README.
cat > "$STAGING/INSTALL.md" <<EOF
# Print Agent v${VERSION} — Cài tại chi nhánh

## Một thao tác (lần đầu hoặc nâng cấp)

1. Unzip vào \`C:\\ComTamMaTu\\print-agent\\\`
2. Copy \`branch.env\` do HQ gửi vào cùng thư mục (cạnh \`SETUP.cmd\`)
3. Chuột phải \`SETUP.cmd\` → **Run as administrator**

\`\`\`bat
SETUP.cmd -EnvFile branch.env
\`\`\`

Script tự: tải/cài **Node.js 24.x** từ nodejs.org (không lấy Current 25+),
cài NSSM (nếu thiếu), tạo/cập nhật \`.env\`, cài service AutoStart
\`ComTamMaTu-PrintAgent\`, kiểm Running + Realtime SUBSCRIBED.

Nâng cấp: unzip đè bản mới → chạy lại \`SETUP.cmd\` (giữ \`.env\` cũ).

## Smoke test

- [ ] POS badge xanh "Máy in: online"
- [ ] In thử 1 receipt
- [ ] Hoàn thành 1 món KDS → phiếu bếp in trong ~3s

\`branch.env\` và secret **không** nằm trong zip — chỉ nhận từ HQ.
EOF

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

rm -rf "$STAGING"

SIZE=$(du -h "$OUT_DIR/$ARTIFACT" | cut -f1)
echo ""
echo "==> Done"
echo "    Bundle: $OUT_DIR/$ARTIFACT"
echo "    Size:   $SIZE"
echo ""
echo "Next: send zip (shared) + branch.env (per branch, separate channel)."
