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

  # 4. Menu categories
  echo "--- /menu/categories ---"
  STATUS=$(run_auth GET /menu/categories)
  check "GET /menu/categories" "$STATUS" "200"

  # 5. Staff list
  echo "--- /admin/staff ---"
  STATUS=$(run_auth GET /admin/staff)
  check "GET /admin/staff" "$STATUS" "200"

  # 6. Branches list
  echo "--- /admin/settings/branches ---"
  STATUS=$(run_auth GET /admin/settings/branches)
  check "GET /admin/settings/branches" "$STATUS" "200"

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
else
  echo "  SKIP  authenticated endpoint checks (no token)"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
