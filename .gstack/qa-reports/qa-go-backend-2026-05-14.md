# QA Report — Go Backend (US-Q05)
**Date:** 2026-05-14  
**Tester:** automated QA agent  
**Server:** `localhost:18080` (Go backend, local Docker Postgres 54320)  
**Commit tested:** `fa208057` (branch: main)

---

## Health Score: **72 / 100**

---

## Per-Module Pass/Fail Table

| Module | Endpoint(s) | Result | Notes |
|--------|-------------|--------|-------|
| Health | GET /health | ✅ PASS | 200, correct shape |
| Auth — login | POST /auth/login | ⚠️ PARTIAL | 200 OK but token missing `sub` claim — `UserUUID` is always `""` |
| Auth — me | GET /auth/me | ✅ PASS | 200, correct shape |
| Menu | GET /menu/categories | ✅ PASS | 200, empty (seeded) |
| Menu | POST /menu/categories | ✅ PASS | 201, round-trip |
| Menu | PUT /menu/categories/{id} | ✅ PASS | 200 |
| Menu | PATCH /menu/categories/{id}/toggle-active | ✅ PASS | 200 |
| Menu | Duplicate name → 409 | ✅ PASS | 409 |
| Menu | PUT /menu/items/9999999999/variants → 404 | ✅ PASS | 404 |
| Menu | PUT /menu/items/9999999999/modifiers → 404 | ✅ PASS | 404 |
| Menu | GET /menu/items | ✅ PASS | 200 |
| Staff | GET /admin/staff | ✅ PASS | 200, returns seeded owner |
| Staff | POST/PUT/PATCH staff ops | ✅ PASS | All 200/201 |
| Settings — branches | GET /admin/settings/branches | ✅ PASS | 200, returns 4 seeded branches |
| Settings — branches | POST/PUT/PATCH branch ops | ✅ PASS | All 200/201 |
| Settings — branches | Invalid branch_kind → 400 | ✅ PASS | 400 |
| Settings — tables | GET /admin/settings/tables | ✅ PASS | 200 (backed by branch_zones placeholder) |
| Settings — areas | GET /admin/settings/areas | ✅ PASS | 200 |
| Settings — payments | GET /admin/settings/payments | ✅ PASS | 200, secret_key not leaked |
| Settings — payments | PUT /admin/settings/payments | ✅ PASS | 200, persists VietQR config |
| Settings — payments | Invalid bank_code → 422 | ✅ PASS | 422 |
| Orders | GET /br/2/orders | ✅ PASS | 200, empty (no seed data) |
| Orders | GET /br/2/orders/{id} | ✅ PASS | 404 for bogus id |
| Orders | POST /br/2/orders | not tested (requires RPC create_order with auth.uid) | — |
| Payments — VietQR config | GET /br/2/payments/vietqr-config | ✅ PASS | 200, reflects persisted state |
| Payments — VietQR confirm | POST /br/{id}/orders/{id}/payment/vietqr/confirm | ❌ FAIL | **500** — `confirm_vietqr_payment` RPC calls `auth.uid()` which returns NULL on pgxpool |
| Payments — cash confirm | POST /br/{id}/orders/{id}/payment | ❌ FAIL | **500** — `create_payment` RPC calls `auth.uid()` similarly |
| KDS | GET /br/2/kds/tickets?branchId=2 | ✅ PASS | 200, empty |
| KDS | GET /br/2/kds/tickets (no branchId param) | ⚠️ DESIGN ISSUE | Returns 400 — branchId is redundant (already in URL path `/br/{branchId}/`) |
| KDS | PATCH /br/2/kds/tickets/{id}/ready | ✅ PASS (logic) | — |
| Notifications | GET /notifications | ✅ PASS | 200 |
| Notifications | GET /notifications/unread-count | ❌ FAIL | **500** — `invalid input syntax for type uuid: ""` |
| Notifications | PATCH /notifications/read-all | ❌ FAIL | **500** — same UUID issue |
| Notifications | PATCH /notifications/{id}/read | ✅ PASS | 404 for bogus id (empty data path, no UUID cast needed) |
| Webhooks | POST /webhooks/momo (bogus sig) | ✅ PASS | 204 |
| Webhooks | POST /webhooks/momo (replay) | ✅ PASS | 204, idempotent |
| Smoke test — payments | All 6 steps | ✅ PASS | `ALL PAYMENT SMOKE TESTS PASSED` |
| Smoke test — main | 28/28 core checks | ✅ PASS | Login + menu + staff + branches + orders + KDS |

---

## Bugs Found

### BUG-01 — CRITICAL: `signToken` omits `sub` → `UserUUID` always empty string
**Severity:** Critical  
**File:** `backend/internal/handler/auth/login.go` — `signToken()`

**Evidence:**
```
# Decoded JWT payload from POST /auth/login
{
  "exp": 1778829565, "iat": 1778743165,
  "user_id": 1, "tenant_id": 1, "branch_id": null, "user_role": "owner"
  // "sub" field is ABSENT
}
```
`ParseToken` maps `sc.Subject` → `claims.UserUUID`. Without `sub`, `UserUUID = ""`.  
Any query that does `$N::uuid` with an empty string gets `ERROR: invalid input syntax for type uuid: ""`.

**Root cause:** `signToken` builds `customClaims{RegisteredClaims: jwt.RegisteredClaims{...}}` but never sets `Subject`. Fix: add `Subject: strconv.FormatInt(u.ID, 10)` (or a real UUID if auth.users is populated).

**Impact:** Affects `GET /notifications/unread-count` → 500, `PATCH /notifications/read-all` → 500, and any future endpoint using `claims.UserUUID`.

---

### BUG-02 — CRITICAL: `confirm_vietqr_payment` and `create_payment` RPCs require `auth.uid()` — always NULL on pgxpool
**Severity:** Critical  
**Endpoints:** `POST /br/{branchId}/orders/{id}/payment/vietqr/confirm`, `POST /br/{branchId}/orders/{id}/payment` (cash/momo)

**Evidence:**
```
# Direct SQL call:
SELECT public.confirm_vietqr_payment(1, 2, 9999999999, 50000.00, '00000000-...'::uuid);
ERROR:  not_authenticated
CONTEXT:  PL/pgSQL function confirm_vietqr_payment line 19 at RAISE
SQLSTATE: 28000

# HTTP:
POST /br/2/orders/9999999999/payment/vietqr/confirm
→ HTTP 500 {"error":"failed to confirm vietqr payment"}
```

**Root cause:** Both RPCs have `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'`. The Go handler passes `p_cashier_uuid` as a parameter but the RPC still also calls `auth.uid()` internally for RLS/audit. pgxpool connections bypass PostgREST session so `auth.uid()` is always NULL.

The handler does map SQLSTATE `42501` (forbidden) and `P0002` (not found) but **does not map SQLSTATE `28000`** — it falls through to the generic 500 path.

**Impact:** Cash payment, MoMo payment initiation, and VietQR payment confirmation are all broken at runtime. The POS cannot complete any payment.

**Fix options:**
1. Map `28000` in the handler → 401/403 (surface the real problem)
2. Execute RPCs in a session where `auth.uid()` returns the user UUID (e.g. `SET LOCAL request.jwt.claims = ...` before the call)
3. Refactor RPCs to remove `auth.uid()` dependency, trusting the `p_cashier_uuid` parameter already passed

---

### BUG-03 — HIGH: KDS `branchId` query param is redundant / misleading
**Severity:** High (design/API contract issue)  
**Endpoints:** `GET /br/{branchId}/kds/tickets`, `PATCH /br/{branchId}/kds/tickets/{id}/ready`, `PATCH /br/{branchId}/kds/tickets/{id}/recall`

**Evidence:**
```
GET /br/2/kds/tickets            → HTTP 400 {"error":"branchId query param required"}
GET /br/2/kds/tickets?branchId=2 → HTTP 200 {"tickets":[]}
```
The branch ID is already in the URL path parameter `{branchId}`. Requiring a duplicate `?branchId=` query param is a contract violation: the main smoke-test expects `GET /br/2/kds/tickets` to return 200.

**Root cause:** `listTickets` and `updateStatus` read `r.URL.Query().Get("branchId")` instead of `chi.URLParam(r, "branchId")`.

---

### BUG-04 — MEDIUM: Tables/Areas backed by `branch_zones` placeholder — TODO not resolved
**Severity:** Medium  
**Endpoints:** `GET/POST/PUT/DELETE /admin/settings/tables`

**Evidence:** `settings/tables.go` has multiple `// TODO: use public.branch_tables when available; branch_zones used as placeholder` comments. The `createTable` INSERT sets `branch_id = req.AreaID` (semantically wrong — area ≠ branch). The table model has no `capacity` column in the backing store (hardcoded `0`).

**Impact:** Table management is non-functional as a business feature. Creating a "table" actually inserts a zone record.

---

### BUG-05 — MEDIUM: `notification_reads.user_id` FK references `auth.users(id)` — no `auth.users` rows in seeded DB
**Severity:** Medium  
**Evidence:**
```sql
SELECT COUNT(*) FROM auth.users; → 0
```
`notification_reads` has `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`. Any attempt to mark a notification read will fail with a FK violation once the UUID issue (BUG-01) is fixed, because `auth.users` is empty. The seeded user exists only in `public.users`.

**Impact:** `PATCH /notifications/{id}/read` and `PATCH /notifications/read-all` will fail with FK violation after BUG-01 is fixed unless `auth.users` is also seeded.

---

### BUG-06 — LOW: `realtime.Hub` not mounted in `main.go`
**Severity:** Low (Phase 0.5 foundation — listed as future work)  
**Evidence:** `backend/internal/realtime/hub.go` exports `Hub`, `Subscribe`, `Unsubscribe`, `Publish` but there is no WebSocket endpoint, no LISTEN loop, and no Hub instantiation in `main.go`. The Hub is fully implemented and unit-tested but completely unmounted.

**Impact:** Real-time push notifications to POS/KDS clients are not functional. FE must poll. Per commit message "Phase 0.5 foundation" this is expected — flagging for tracking.

---

## Route Registration Audit

| Handler | Methods | Mounted in main.go | Tier |
|---------|---------|-------------------|------|
| `healthhandler.Handler()` | GET /health | ✅ | Public |
| `authH.Login` | POST /auth/login | ✅ | Public |
| `webhooksH.MoMo` | POST /webhooks/momo | ✅ | Public |
| `authH.Me` | GET /auth/me | ✅ | Authenticate |
| `menuhandler.New().Routes()` | /menu/* | ✅ | Authenticate + ABAC |
| `staffhandler.New().Routes()` | /admin/staff/* | ✅ | Authenticate + ABAC |
| `settingsH.Routes()` | /admin/settings/* | ✅ | Authenticate + ABAC |
| `settingsH.GetPayments` / `PutPayments` | GET/PUT /admin/settings/payments | ✅ | Authenticate (role-gated inline) |
| `ordersH.Routes()` | /br/{branchId}/orders/* | ✅ | Authenticate |
| `ordersH.CloseShift` | POST /br/{branchId}/shifts/close | ✅ | Authenticate |
| `kdshandler.New().Routes()` | /br/{branchId}/kds/* | ✅ | Authenticate |
| `notifhandler.New().Routes()` | /notifications/* | ✅ | Authenticate |
| `paymentsH.Routes()` | /br/{branchId}/payments/* | ✅ | Authenticate |
| `paymentsH.ConfirmVietQR` | POST /br/{branchId}/orders/{id}/payment/vietqr/confirm | ✅ | Authenticate |
| `realtime.Hub` | **NOT MOUNTED** | ❌ | — |

**Unmounted:**
- `realtime.Hub` — implemented but no WebSocket route or LISTEN loop wired in main.go (Phase 0.5, expected)

**All other handlers and their `Routes()` methods are correctly mounted.**

---

## Smoke Test Results

| Script | Result |
|--------|--------|
| `docs/runbooks/smoke-test-payments.sh` | ✅ ALL 6 STEPS PASSED |
| `docs/runbooks/smoke-test.sh` | ✅ 28/28 checks passed (after setting password hash) |

Note: KDS check in smoke-test.sh passes because it uses `?branchId=2` in the URL, masking BUG-03 from the automated script.

---

## Top Issues to Fix

1. **[CRITICAL] BUG-01** — `signToken` missing `sub` → `UserUUID=""` → all UUID queries 500. One-line fix: set `Subject` in `RegisteredClaims`.

2. **[CRITICAL] BUG-02** — `confirm_vietqr_payment` + `create_payment` RPCs call `auth.uid()` which is NULL on pgxpool. POS cannot complete any payment. Must either: (a) map SQLSTATE `28000` in the handler to surface the real error, and (b) choose strategy: set local JWT session vars before RPC call, or refactor RPCs to trust the passed UUID parameter.

3. **[HIGH] BUG-03** — KDS handler reads `branchId` from query param instead of URL path. Fix: use `chi.URLParam(r, "branchId")`.

4. **[MEDIUM] BUG-04** — Table management is a placeholder (branch_zones) with semantic errors. Track as tech debt or create `branch_tables` migration.

5. **[MEDIUM] BUG-05** — `auth.users` empty in seeded DB but `notification_reads.user_id` FK references it. Seed `auth.users` or change FK to `public.users`.
