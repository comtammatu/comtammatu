#!/usr/bin/env bash
# Smoke test for the Phase-5 payment endpoints.
#
# Requires:
#   BASE_URL  (defaults to http://localhost:8080)
#   JWT       (a Supabase access_token for an owner/super_manager user)
#   BRANCH_ID (a branch id the user can act on)
#
# Run:  BASE_URL=http://localhost:8080 JWT=... BRANCH_ID=1 ./docs/runbooks/smoke-test-payments.sh
#
# Exits non-zero on the first failed assertion. Designed to be safe to re-run —
# all writes are idempotent.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
: "${JWT:?JWT env var is required (Supabase access_token)}"
: "${BRANCH_ID:?BRANCH_ID env var is required}"

AUTH=(-H "Authorization: Bearer ${JWT}")
JSON=(-H "Content-Type: application/json")

# Tiny assertion helper. usage: expect "$status" "200" "GET /foo"
expect() {
  local got="$1" want="$2" label="$3"
  if [[ "${got}" != "${want}" ]]; then
    echo "FAIL  ${label}: expected ${want}, got ${got}" >&2
    exit 1
  fi
  echo "PASS  ${label} (${got})"
}

# Each step uses -w to capture HTTP status separately from the body so we can
# assert + log both. Bodies are kept in temp files for grep-based assertions
# without piping through jq (which the production runbook may not have).
TMPDIR=$(mktemp -d)
trap 'rm -rf "${TMPDIR}"' EXIT

# ─── Step 1: GET /admin/settings/payments returns config without leaking secret ──
status=$(curl -s -o "${TMPDIR}/payments.json" -w "%{http_code}" "${AUTH[@]}" "${BASE_URL}/admin/settings/payments")
expect "${status}" "200" "GET /admin/settings/payments"
if grep -qiE '"secret_key"\s*:\s*"[^"]' "${TMPDIR}/payments.json"; then
  echo "FAIL  secret_key leaked in GET response — should never appear" >&2
  cat "${TMPDIR}/payments.json" >&2
  exit 1
fi
echo "PASS  secret_key not leaked"

# ─── Step 2: PUT /admin/settings/payments persists VietQR bank config ──
status=$(curl -s -o "${TMPDIR}/payments-put.json" -w "%{http_code}" -X PUT "${AUTH[@]}" "${JSON[@]}" \
  -d '{"enable_vietqr":true,"vietqr_bank_code":"TCB","vietqr_account_no":"12345678","vietqr_account_name":"COM TAM MA TU"}' \
  "${BASE_URL}/admin/settings/payments")
expect "${status}" "200" "PUT /admin/settings/payments (vietqr)"
if ! grep -q '"bank_code":"TCB"' "${TMPDIR}/payments-put.json"; then
  echo "FAIL  PUT response did not echo bank_code=TCB" >&2
  cat "${TMPDIR}/payments-put.json" >&2
  exit 1
fi
echo "PASS  PUT echoes persisted VietQR config"

# ─── Step 3: GET /br/{branchId}/payments/vietqr-config returns the persisted config ──
status=$(curl -s -o "${TMPDIR}/vietqr-config.json" -w "%{http_code}" "${AUTH[@]}" \
  "${BASE_URL}/br/${BRANCH_ID}/payments/vietqr-config")
expect "${status}" "200" "GET /br/${BRANCH_ID}/payments/vietqr-config"
if ! grep -q '"enabled":true' "${TMPDIR}/vietqr-config.json"; then
  echo "FAIL  vietqr-config did not return enabled=true after PUT" >&2
  cat "${TMPDIR}/vietqr-config.json" >&2
  exit 1
fi
echo "PASS  GET vietqr-config reflects persisted state"

# ─── Step 4: PUT validation rejects invalid bank_code ──
status=$(curl -s -o "${TMPDIR}/payments-bad.json" -w "%{http_code}" -X PUT "${AUTH[@]}" "${JSON[@]}" \
  -d '{"vietqr_bank_code":"contains spaces!"}' \
  "${BASE_URL}/admin/settings/payments")
expect "${status}" "422" "PUT /admin/settings/payments rejects invalid bank_code"

# ─── Step 5: MoMo webhook with bogus signature returns 204 + records ignored event ──
# Forge a payload that decodes to a real tenant via extraData. The signature is
# garbage so claimEvent stores signature_valid=false. MoMo treats 204 as ACK so
# the webhook stops retrying — that's exactly the behaviour we want.
EXTRA_DATA=$(printf '{"tenantId":1,"orderId":1}' | base64)
status=$(curl -s -o "${TMPDIR}/momo-webhook.json" -w "%{http_code}" -X POST "${JSON[@]}" \
  -d "{\"signature\":\"deadbeef\",\"requestId\":\"smoke-$(date +%s)\",\"extraData\":\"${EXTRA_DATA}\",\"orderId\":\"MOMO-1-aabbccdd\",\"resultCode\":0,\"amount\":50000}" \
  "${BASE_URL}/webhooks/momo")
expect "${status}" "204" "POST /webhooks/momo (bogus signature)"

# ─── Step 6: MoMo webhook is idempotent — replay returns 204 immediately ──
REQ_ID="smoke-replay-$(date +%s)"
curl -s -o /dev/null -X POST "${JSON[@]}" \
  -d "{\"signature\":\"deadbeef\",\"requestId\":\"${REQ_ID}\",\"extraData\":\"${EXTRA_DATA}\",\"orderId\":\"MOMO-1-aabbccdd\",\"resultCode\":0,\"amount\":50000}" \
  "${BASE_URL}/webhooks/momo"
status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${JSON[@]}" \
  -d "{\"signature\":\"deadbeef\",\"requestId\":\"${REQ_ID}\",\"extraData\":\"${EXTRA_DATA}\",\"orderId\":\"MOMO-1-aabbccdd\",\"resultCode\":0,\"amount\":50000}" \
  "${BASE_URL}/webhooks/momo")
expect "${status}" "204" "POST /webhooks/momo (replay)"

echo ""
echo "ALL PAYMENT SMOKE TESTS PASSED"
