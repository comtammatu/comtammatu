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
else
  echo "  SKIP  authenticated endpoint checks (no token)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
