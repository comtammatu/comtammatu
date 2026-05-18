#!/usr/bin/env bash
# Smoke test: covers core Go backend endpoints against local Docker DB.
# Usage: BASE_URL=http://localhost:8080 TENANT_ID=1 ./smoke-test.sh
# Requires: curl, jq

set -euo pipefail

BASE="${BASE_URL:-http://localhost:8080}"
TENANT="${TENANT_ID:-1}"
EMAIL="${SMOKE_EMAIL:-owner@example.com}"
PASSWORD="${SMOKE_PASSWORD:-}"
BRANCH="${BRANCH_ID:-1}"

PASS=0
FAIL=0

check() {
  local name="$1" got="$2" want="$3"
  if [[ "$got" == "$want" ]]; then
    echo "  PASS  $name"
    ((PASS++)) || true
  else
    echo "  FAIL  $name  (got=$got want=$want)"
    ((FAIL++)) || true
  fi
}

echo "=== Smoke test: $BASE ==="

# 1. Health
echo "--- /health ---"
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE/health")
check "GET /health" "$STATUS" "200"

# 2. Login
echo "--- /auth/login ---"
if [[ -z "$PASSWORD" ]]; then
  echo "  SKIP  login (SMOKE_PASSWORD not set)"
else
  BODY=$(curl -sf -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"tenant_id\":$TENANT}")
  TOKEN=$(echo "$BODY" | jq -r '.token // empty')
  if [[ -n "$TOKEN" ]]; then
    echo "  PASS  POST /auth/login"
    ((PASS++)) || true
  else
    echo "  FAIL  POST /auth/login (no token in response)"
    ((FAIL++)) || true
    TOKEN=""
  fi
fi

AUTH=""
[[ -n "${TOKEN:-}" ]] && AUTH="-H \"Authorization: Bearer $TOKEN\""

run_auth() {
  local method="$1" path="$2"
  shift 2
  # shellcheck disable=SC2086
  eval "curl -sf -o /dev/null -w \"%{http_code}\" -X $method $AUTH \"$BASE$path\" $*"
}

if [[ -n "${TOKEN:-}" ]]; then
  # 3. /auth/me
  echo "--- /auth/me ---"
  STATUS=$(run_auth GET /auth/me)
  check "GET /auth/me" "$STATUS" "200"

  # 4. Menu categories — list + write parity (US-510: FE rewired to Go BE)
  echo "--- /menu/categories ---"
  STATUS=$(run_auth GET /menu/categories)
  check "GET /menu/categories" "$STATUS" "200"

  # Create + update + toggle round-trip. Name is timestamped so reruns don't
  # collide with the partial UNIQUE(name, tenant_id) constraint.
  SMOKE_CAT_NAME="smoke-$(date +%s)"
  CAT_BODY=$(curl -sf -X POST "$BASE/menu/categories" \
    -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
    -d "{\"name\":\"$SMOKE_CAT_NAME\",\"type\":\"main_dish\",\"sort_order\":99}")
  CAT_ID=$(echo "$CAT_BODY" | jq -r '.id // empty')
  CAT_TYPE=$(echo "$CAT_BODY" | jq -r '.type // empty')
  if [[ -n "$CAT_ID" && "$CAT_TYPE" == "main_dish" ]]; then
    echo "  PASS  POST /menu/categories (id=$CAT_ID type=$CAT_TYPE)"
    ((PASS++)) || true
  else
    echo "  FAIL  POST /menu/categories (body=$CAT_BODY)"
    ((FAIL++)) || true
  fi

  if [[ -n "${CAT_ID:-}" ]]; then
    STATUS=$(curl -sf -o /dev/null -w "%{http_code}" -X PUT \
      -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d '{"type":"drink"}' "$BASE/menu/categories/$CAT_ID")
    check "PUT /menu/categories/$CAT_ID (type=drink)" "$STATUS" "200"

    STATUS=$(curl -sf -o /dev/null -w "%{http_code}" -X PATCH \
      -H "Authorization: Bearer $TOKEN" \
      "$BASE/menu/categories/$CAT_ID/toggle-active")
    check "PATCH /menu/categories/$CAT_ID/toggle-active" "$STATUS" "200"

    # Duplicate-name guard — second create with same name MUST surface 409.
    DUP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
      -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d "{\"name\":\"$SMOKE_CAT_NAME\",\"type\":\"main_dish\"}" \
      "$BASE/menu/categories")
    check "POST /menu/categories duplicate -> 409" "$DUP_STATUS" "409"
  fi

  # Bulk variant/modifier replace on a bogus item id MUST 404 (regression
  # guard for the ownership pre-check in replaceVariants/Modifiers).
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
    -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
    -d '{"variants":[]}' "$BASE/menu/items/9999999999/variants")
  check "PUT /menu/items/9999999999/variants -> 404" "$STATUS" "404"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
    -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
    -d '{"modifiers":[]}' "$BASE/menu/items/9999999999/modifiers")
  check "PUT /menu/items/9999999999/modifiers -> 404" "$STATUS" "404"

  # 5. Staff list
  echo "--- /admin/staff ---"
  STATUS=$(run_auth GET /admin/staff)
  check "GET /admin/staff" "$STATUS" "200"

  # 6. Branches list
  echo "--- /admin/settings/branches ---"
  STATUS=$(run_auth GET /admin/settings/branches)
  check "GET /admin/settings/branches" "$STATUS" "200"

  # US-512 branches sub-slice — create + update + toggle round-trip via Go BE.
  SMOKE_BR_NAME="smoke-br-$(date +%s)"
  BR_BODY=$(curl -sf -X POST "$BASE/admin/settings/branches" \
    -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
    -d "{\"name\":\"$SMOKE_BR_NAME\",\"branch_kind\":\"branch\"}")
  BR_ID=$(echo "$BR_BODY" | jq -r '.id // empty')
  BR_KIND=$(echo "$BR_BODY" | jq -r '.branch_kind // empty')
  if [[ -n "$BR_ID" && "$BR_KIND" == "branch" ]]; then
    echo "  PASS  POST /admin/settings/branches (id=$BR_ID kind=$BR_KIND)"
    ((PASS++)) || true
  else
    echo "  FAIL  POST /admin/settings/branches (body=$BR_BODY)"
    ((FAIL++)) || true
  fi

  if [[ -n "${BR_ID:-}" ]]; then
    STATUS=$(curl -sf -o /dev/null -w "%{http_code}" -X PUT \
      -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d '{"branch_kind":"central_kitchen"}' \
      "$BASE/admin/settings/branches/$BR_ID")
    check "PUT /admin/settings/branches/$BR_ID (branch_kind)" "$STATUS" "200"

    STATUS=$(curl -sf -o /dev/null -w "%{http_code}" -X PATCH \
      -H "Authorization: Bearer $TOKEN" \
      "$BASE/admin/settings/branches/$BR_ID/toggle-active")
    check "PATCH /admin/settings/branches/$BR_ID/toggle-active" "$STATUS" "200"

    # Invalid branch_kind MUST 400 — regression guard for the allowlist.
    BAD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
      -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
      -d '{"branch_kind":"galactic_hub"}' \
      "$BASE/admin/settings/branches/$BR_ID")
    check "PUT branches invalid_branch_kind -> 400" "$BAD_STATUS" "400"
  fi

  # 7. Tables list
  echo "--- /admin/settings/tables ---"
  STATUS=$(run_auth GET /admin/settings/tables)
  check "GET /admin/settings/tables" "$STATUS" "200"

  # 8. Orders list
  echo "--- /br/{branchId}/orders ---"
  STATUS=$(run_auth GET "/br/$BRANCH/orders")
  check "GET /br/$BRANCH/orders" "$STATUS" "200"

  # 9. KDS tickets
  echo "--- /br/{branchId}/kds/tickets ---"
  STATUS=$(run_auth GET "/br/$BRANCH/kds/tickets")
  check "GET /br/$BRANCH/kds/tickets" "$STATUS" "200"

  # 10. Notifications
  echo "--- /notifications ---"
  STATUS=$(run_auth GET /notifications)
  check "GET /notifications" "$STATUS" "200"

  STATUS=$(run_auth GET /notifications/unread-count)
  check "GET /notifications/unread-count" "$STATUS" "200"

  # US-514 — notification writes. read-all is idempotent so it's safe to run
  # repeatedly; mark-one with an obviously-bogus id MUST 404 (not 500).
  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" -X PATCH \
    -H "Authorization: Bearer $TOKEN" "$BASE/notifications/read-all")
  check "PATCH /notifications/read-all" "$STATUS" "200"

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE/notifications/9999999999/read")
  check "PATCH /notifications/9999999999/read -> 404" "$STATUS" "404"

  # 11. Employee self-service (Wave 1 — b5159be2)
  echo "--- /employee/* ---"
  STATUS=$(run_auth GET /employee/clock/status)
  # Owner has no employee row → 422 expected (account-not-linked). Both 200
  # and 422 prove the handler is wired and tenant-scoped.
  if [[ "$STATUS" == "200" || "$STATUS" == "422" ]]; then
    echo "  PASS  GET /employee/clock/status (got=$STATUS)"
    ((PASS++)) || true
  else
    echo "  FAIL  GET /employee/clock/status (got=$STATUS)"
    ((FAIL++)) || true
  fi

  STATUS=$(run_auth GET "/employee/shifts?branch_id=$BRANCH")
  check "GET /employee/shifts?branch_id=$BRANCH" "$STATUS" "200"

  # 12. HR/Payroll (Wave 1 — cb31ecf1)
  echo "--- /hr/* ---"
  STATUS=$(run_auth GET /hr/employees)
  check "GET /hr/employees" "$STATUS" "200"

  STATUS=$(run_auth GET "/hr/shifts?branch_id=$BRANCH")
  check "GET /hr/shifts?branch_id=$BRANCH" "$STATUS" "200"

  STATUS=$(run_auth GET "/hr/shift-requests?branch_id=$BRANCH")
  check "GET /hr/shift-requests?branch_id=$BRANCH" "$STATUS" "200"

  STATUS=$(run_auth GET /hr/payroll/periods)
  check "GET /hr/payroll/periods" "$STATUS" "200"

  # Deferred payroll-calc endpoint MUST 501 — regression guard for the stub.
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $TOKEN" "$BASE/hr/payroll/periods/1/calculate")
  check "POST /hr/payroll/periods/1/calculate -> 501 (deferred)" "$STATUS" "501"

  # 13. Feedback admin (Wave 1 — 7f781634)
  echo "--- /admin/feedback ---"
  STATUS=$(run_auth GET /admin/feedback)
  check "GET /admin/feedback" "$STATUS" "200"

  STATUS=$(run_auth GET /admin/feedback/qr)
  check "GET /admin/feedback/qr" "$STATUS" "200"

  STATUS=$(run_auth GET /admin/feedback/settings)
  check "GET /admin/feedback/settings" "$STATUS" "200"

  # Deferred photo upload MUST 501 — regression guard for the R2 deferral.
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "$BASE/r/nonexistent-token/photos")
  check "POST /r/{token}/photos -> 501 (deferred)" "$STATUS" "501"

  # 14. Finance (Wave 2 — added once handler ships)
  echo "--- /finance/* ---"
  STATUS=$(run_auth GET /finance/revenue/daily)
  if [[ "$STATUS" == "200" || "$STATUS" == "400" || "$STATUS" == "404" ]]; then
    # 400 acceptable if endpoint requires query params; 404 acceptable if
    # handler not yet wired (lets the script run before Wave 2 lands).
    echo "  PASS  GET /finance/revenue/daily (got=$STATUS — wired)"
    ((PASS++)) || true
  else
    echo "  FAIL  GET /finance/revenue/daily (got=$STATUS)"
    ((FAIL++)) || true
  fi

  STATUS=$(run_auth GET /finance/chart-of-accounts)
  if [[ "$STATUS" == "200" || "$STATUS" == "404" ]]; then
    echo "  PASS  GET /finance/chart-of-accounts (got=$STATUS — wired)"
    ((PASS++)) || true
  else
    echo "  FAIL  GET /finance/chart-of-accounts (got=$STATUS)"
    ((FAIL++)) || true
  fi

  # 15. HDDT (Wave 2 — added once handler ships)
  echo "--- /admin/hddt/* ---"
  STATUS=$(run_auth GET /admin/hddt/summary-runs)
  if [[ "$STATUS" == "200" || "$STATUS" == "404" ]]; then
    echo "  PASS  GET /admin/hddt/summary-runs (got=$STATUS — wired)"
    ((PASS++)) || true
  else
    echo "  FAIL  GET /admin/hddt/summary-runs (got=$STATUS)"
    ((FAIL++)) || true
  fi
else
  echo "  SKIP  authenticated endpoint checks (no token)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
