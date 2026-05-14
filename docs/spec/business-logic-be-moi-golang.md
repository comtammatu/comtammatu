# Go Backend Business Logic Reference

**Audience:** Developers migrating remaining modules from Next.js/Supabase backend to the new Go service.

**Date:** May 2026  
**Status:** Active (Phase 1-3 ABAC migration complete; MoMo/VietQR payment flow live)  
**Quality bar:** Every claim cites `file:line` from the actual codebase. Unverified claims marked `(unverified)`.

---

## Reading Order

Start here in this sequence:

1. **Entry point** — `cmd/server/main.go` — understand router setup, middleware order, public vs authenticated routes.
2. **Auth + JWT** — `internal/auth/jwt.go`, `internal/auth/claims.go` — how custom claims flow from Supabase.
3. **Middleware stack** — `internal/middleware/{auth,cors,logger,abac}.go` — request interceptors and context injection.
4. **HTTP utilities** — `internal/httputil/respond.go` — standard JSON/error envelope shape.
5. **ABAC (authorization)** — `internal/abac/evaluator.go` — per-user permission evaluation and caching.
6. **Database layer** — `internal/db/pool.go`, `internal/queries/` — connection pooling and query execution.
7. **Handler packages** — `internal/handler/*/handler.go` — individual feature modules.
8. **Payment providers** — `internal/payment/{momo,config}/` — external provider integration.

---

## Project Layout

```
backend/
├── cmd/server/main.go                    # Entry point, chi router setup
├── config/config.go                      # Env var loading + validation
├── internal/
│   ├── auth/                            # JWT parsing, claims, module ACL
│   │   ├── jwt.go                       # ParseToken, supabaseClaims
│   │   ├── claims.go                    # Claims struct, StaffRole constants
│   │   ├── acl.go                       # ModuleKey, moduleACLMap, CanAccess
│   │   └── acl_test.go
│   ├── middleware/                      # HTTP interceptors
│   │   ├── auth.go                      # Authenticate, ClaimsFrom context helper
│   │   ├── abac.go                      # RequirePermission, ABAC gate
│   │   ├── cors.go                      # ParseOrigins, CORS header setup
│   │   └── logger.go                    # Structured slog request logging
│   ├── httputil/
│   │   └── respond.go                   # WriteJSON, WriteError, NotImplemented
│   ├── db/
│   │   ├── pool.go                      # pgx pool Open + Ping
│   │   └── sqlc/                        # Generated queries (unused; hand-written queries preferred)
│   ├── abac/
│   │   ├── evaluator.go                 # Permission cache + evaluation logic
│   │   └── evaluator_test.go
│   ├── handler/
│   │   ├── auth/                        # POST /auth/login, GET /auth/me
│   │   ├── health/                      # GET /health
│   │   ├── menu/                        # Categories, items, variants, daily limits
│   │   ├── staff/                       # User CRUD, permission grants/revokes
│   │   ├── settings/                    # Branches, areas, tables, POS config, payment settings
│   │   ├── orders/                      # Order CRUD, payment confirmation, shift close
│   │   ├── payments/                    # VietQR config, VietQR confirm endpoint
│   │   ├── kds/                         # Ticket list, mark ready/recall
│   │   ├── notifications/               # List, unread count, mark read
│   │   └── webhooks/                    # MoMo IPN (POST /webhooks/momo)
│   ├── payment/
│   │   ├── momo/                        # MoMo provider API, signing, webhook verification
│   │   └── config/                      # Load PAYMENT_* from system_settings
│   ├── queries/                         # sqlc input definitions (mostly unused)
│   └── schema/                          # sqlc schema mirror
├── internal/middleware/
│   └── abac.go                          # PermissionChecker interface, RequirePermission
├── supabase/migrations/                 # SQL migrations tracked by supabase CLI
│   ├── 20260602000000_branches_pos_config.sql
│   ├── 20260603000000_webhook_events_tenant_scoped_unique.sql
│   └── ... (phase 1-3 ABAC migrations in parent git history)
└── sqlc.yaml                            # sqlc code generation config
```

---

## Cross-Cutting Conventions

### Claims Extraction

Every handler reads claims from the request context:

```go
claims := middleware.ClaimsFrom(r.Context())
if claims == nil {
    httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
    return
}
// claims.TenantID, claims.BranchID, claims.UserRole, claims.Position
```

**File:** `internal/middleware/auth.go:67-69`

### JSON Response Shape

All success responses:
```go
httputil.WriteJSON(w, http.StatusOK, map[string]any{
    "key1": value1,
    "key2": value2,
})
```

All errors:
```go
httputil.WriteError(w, http.StatusBadRequest, "human-readable message")
// Writes: {"error": "human-readable message"}
```

**File:** `internal/httputil/respond.go:8-23`

### SQL Query Execution Pattern

Hand-written queries (preferred over sqlc for complex logic):

```go
const q = `SELECT ... WHERE tenant_id = $1 AND branch_id = $2`
rows, err := h.pool.Query(ctx, q, claims.TenantID, branchID)
// or for single row:
row := h.pool.QueryRow(ctx, q, claims.TenantID, branchID)
var id int64
if err := row.Scan(&id); err != nil { ... }
```

Every query **always** filters by `tenant_id` (at minimum) to enforce tenant isolation. **File:** `internal/handler/menu/handler.go:81-85`

### Nullable Column Scanning

For nullable columns, use `sql.Null*` types then post-scan to the struct field:

```go
var createdAt sql.NullTime
if err := rows.Scan(&c.ID, ..., &createdAt); err != nil { ... }
if createdAt.Valid {
    c.CreatedAt = createdAt.Time
}
```

**File:** `internal/handler/menu/handler.go:94-100`

### ABAC Permission Gating

Per-handler optional ABAC:

```go
type Handler struct {
    pool    *pgxpool.Pool
    checker middleware.PermissionChecker  // May be nil
}

func (h *Handler) perm(key string) func(http.Handler) http.Handler {
    if h.checker == nil {
        return func(next http.Handler) http.Handler { return next }  // No-op in tests
    }
    return middleware.RequirePermission(h.checker, key)
}

// In Routes():
r.With(h.perm("menu:write")).Post("/items", h.createItem)
```

**File:** `internal/handler/menu/handler.go:25-68` | `internal/handler/staff/handler.go:33-46`

### JWT Claims Structure

Custom claims injected by Supabase `custom_access_token_hook()`:

```go
type Claims struct {
    UserID   int64      `json:"user_id"`         // PK in public.users
    UserUUID string     `json:"user_uuid"`       // JWT sub — FK to auth.users.id
    TenantID int64      `json:"tenant_id"`       // Required; zero means hook didn't fire
    BranchID *int64     `json:"branch_id"`       // nil for tenant-level roles
    AreaID   *int64     `json:"area_id"`
    UserRole StaffRole  `json:"user_role"`       // See StaffRole constants
    Position string     `json:"position,omitempty"`
}
```

**File:** `internal/auth/claims.go:34-44`

### The Critical pgxpool-no-auth-rpc Regression Rule

**Load-bearing gotcha:**

Auth RPCs (e.g., `public.has_permission(branch_id, key)`) use `SECURITY DEFINER` to read from `auth.uid()` and custom JWT claims. These **return NULL on plain pgxpool connections** because pgxpool has no JWT context.

**Workaround:** Explicit parameter binding. Example from notifications handler:

```go
// WRONG (will fail silently with NULL in the notification_reads query):
// const q = `SELECT ... FROM ... WHERE user_id = auth.uid()::uuid`

// RIGHT (bind UUID explicitly from claims):
userUUID := claims.UserUUID
const q = `SELECT ... WHERE user_id = $3::uuid`
rows, err := h.pool.Query(ctx, q, claims.TenantID, cursor, userUUID)
```

**File:** `internal/handler/notifications/handler.go:47-73` (comment at line 48-49)

**Why this matters:** Old migration code (`create_payment`, `close_pos_session`) calls `auth.uid()` internally via `SECURITY DEFINER`. The Go backend bypasses these via inline HTTP logic instead.

---

## Package Breakdown

### 1. Entry Point

**File:** `cmd/server/main.go`

**Responsibilities:**
- Load config via `config.Load()`
- Open pgxpool via `db.Open(ctx, dsn)`
- Set up chi router with global middleware stack (order matters):
  1. `RequestID` — generates X-Request-Id
  2. `RealIP` — honours X-Forwarded-For
  3. `Logger` — structured slog output
  4. `CORS` — validates Origin, sets headers
  5. `Recoverer` — catches panics, returns 500
- Mount public routes (health, login, MoMo webhook)
- Mount authenticated routes (JWT gate + optional ABAC)
- Graceful shutdown on SIGINT/SIGTERM with 10s timeout

**Public routes:**
- `GET /health` — simple status check
- `POST /auth/login` — password auth
- `POST /webhooks/momo` — IPN webhook (HMAC verified)

**Authenticated routes (Authenticate middleware applied):**
- `GET /auth/me` — echo claims
- `GET/POST /menu` → `/menu/categories` and variants
- `GET/POST/PUT/DELETE /admin/staff` → user management
- `GET/PUT /admin/settings` → branch/area/table config, POS config
- `GET/PUT /admin/settings/payments` — payment credentials (owner/super_manager only)
- `GET/POST/DELETE /br/{branchId}/orders` and nested items/payment endpoints
- `GET/PATCH /br/{branchId}/kds` — KDS ticket endpoints
- `GET/PATCH /notifications` — notification endpoints
- `GET /br/{branchId}/payments/vietqr-config` — VietQR bank details
- `POST /br/{branchId}/orders/{id}/payment/vietqr/confirm` — VietQR payment confirm

**Gotcha:** Payment settings (`/admin/settings/payments`) is mounted separately outside the handler.Routes() group because it gates on tenant-level permission, not branch-level. **File:** `cmd/server/main.go:86-92`

---

### 2. Config

**File:** `config/config.go`

**Responsibilities:**
- Load from `.env` (optional in production) via `godotenv.Load()`
- Read into structured `Config` struct
- Validate required vars (SUPABASE_JWT_SECRET, ALLOWED_ORIGINS)
- Block wildcard origins in production

**Fields:**
- `AppEnv` — "development" (default) or "production"
- `Port` — server port (default "8080")
- `JWTSecret` — SUPABASE_JWT_SECRET (required, used for HMAC verification)
- `AllowedOrigins` — comma-separated origin list, parsed into slice

**Validation:**
- Fails if SUPABASE_JWT_SECRET is missing
- Fails if ALLOWED_ORIGINS is empty
- Fails if production mode and origins contain wildcard `*`

---

### 3. Authentication (JWT + Custom Claims)

**Files:** `internal/auth/jwt.go`, `internal/auth/claims.go`

**Responsibility:** Parse Supabase-issued JWT tokens and extract custom claims injected by the `custom_access_token_hook()`.

**Flow:**
1. Middleware extracts `Authorization: Bearer <token>` header
2. Calls `auth.ParseToken(tokenStr, jwtSecret)`
3. Validates HS256 signature (using raw SUPABASE_JWT_SECRET)
4. Checks `TenantID != 0` (if zero, hook didn't fire → return `ErrClaimsMissing`)
5. Returns `*Claims` with TenantID, BranchID, UserRole, Position, UserUUID

**StaffRole constants:** `owner`, `super_manager`, `area_manager`, `branch_manager`, `warehouse_manager`, `production_manager`, `cashier`, `waiter`, `chef`, `office`

**Critical validation:** `TenantID == 0` indicates the custom JWT hook was not applied or the token came from a different issuer. This is a security gate. **File:** `internal/auth/jwt.go:49-52`

---

### 4. Authorization (ABAC)

**Files:** `internal/abac/evaluator.go`, `internal/auth/acl.go`

**Two layers:**

#### Layer 1: Module ACL (route-level, coarse-grained)

`auth/acl.go` defines `moduleACLMap`, a single source of truth mirroring `MODULE_ACL` from the Next.js shared types.

```go
ModuleMenu: {
    PathPrefix: "/menu",
    AllowedRoles: {owner, super_manager, area_manager, branch_manager},
}
```

Applied via middleware:
```go
r.Use(middleware.RequireModule(auth.ModuleMenu))
```

**Not currently enforced in the Go backend** (handlers use RequirePermission instead). **File:** `internal/auth/acl.go:29-119`

#### Layer 2: ABAC (fine-grained, per-user)

`abac/evaluator.go` implements attribute-based access control:

```go
type Evaluator struct {
    pool  *pgxpool.Pool
    cache sync.Map  // map[int64]*cachedPerms, TTL 5 minutes
}

func (e *Evaluator) Can(ctx, userID, tenantID int64, branchID *int64, permKey string) (bool, error)
```

**Evaluation logic:**
1. Load user's role from `users.user_role`
2. Merge role defaults from `role_permission_defaults` (read-only baseline)
3. Overlay user-specific overrides from `user_permissions` (temporal: `valid_from` ≤ now ≤ `valid_until`)
4. Deny beats allow: if any deny matches the key + scope, return false
5. Otherwise, check for allow match (nil branch_id = applies to all branches)
6. Default deny if nothing matches

**Caching:** Resolved permissions cached per user for 5 minutes. Invalidated manually after permission writes. **File:** `internal/abac/evaluator.go:26-151`

**Usage in handlers:**
```go
type Handler struct {
    pool    *pgxpool.Pool
    checker middleware.PermissionChecker  // abac.Evaluator
}

func (h *Handler) perm(key string) func(http.Handler) http.Handler {
    return middleware.RequirePermission(h.checker, key)
}
```

---

### 5. Middleware Stack

**File:** `internal/middleware/`

#### Authenticate (`auth.go`)

Validates JWT from `Authorization: Bearer` header:
- Missing token → 401
- Invalid signature / expired → 401
- Custom claims missing (hook didn't fire) → 403
- Parses claims into request context for downstream handlers

**File:** `internal/middleware/auth.go:21-45`

#### RequirePermission

Gates HTTP handler behind a permission check:
```go
func RequirePermission(checker PermissionChecker, key string) func(http.Handler) http.Handler
```

Calls `checker.Can(ctx, userID, tenantID, branchID, key)` and returns 403 if denied.

**File:** `internal/middleware/abac.go:1-23`

#### CORS

Sets `Access-Control-Allow-*` headers for origins in `ALLOWED_ORIGINS`:
- Validates origin against whitelist
- Supports credentials (httpOnly cookies)
- Handles preflight OPTIONS

**File:** `internal/middleware/cors.go:9-33`

#### Logger

Structured request logging via slog:
```json
{"time":"...", "msg":"request", "method":"POST", "path":"/auth/login", "status":200, "duration_ms":42}
```

**File:** `internal/middleware/logger.go`

---

### 6. HTTP Utilities

**File:** `internal/httputil/respond.go`

Three helper functions:

```go
WriteJSON(w ResponseWriter, status int, v any)  // Encodes v as JSON
WriteError(w ResponseWriter, status int, msg string)  // {"error": msg}
NotImplemented(w ResponseWriter)  // 501 {"error": "not implemented"}
```

All responses are JSON. Status codes and messages are always explicit (no implicit 200).

---

### 7. Health Check Handler

**File:** `internal/handler/health/handler.go`

**Endpoint:** `GET /health` (public, no auth)

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-05-14T12:34:56Z",
  "service": "comtammatu-backend"
}
```

Used by load balancers and Docker health checks. No database calls.

---

### 8. Authentication Handler

**File:** `internal/handler/auth/` (handler.go, login.go, types.go)

#### POST /auth/login (public, no auth)

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secret",
  "tenant_id": 123
}
```

**Validation:**
- Both email and password required and non-empty
- tenant_id > 0

**Flow:**
1. Query `public.users` by (email, tenant_id)
2. Check `is_active = true` (soft-delete)
3. Verify `password_hash` against plaintext via bcrypt
4. Error if `password_hash = ''` (account never activated)
5. Sign a JWT with custom claims and return token + metadata

**JWT signing:**
- 24-hour expiration
- Algorithm: HS256 (SUPABASE_JWT_SECRET)
- Claims include tenant_id, branch_id, user_role, position

**Response:**
```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user_role": "cashier",
  "tenant_id": 123,
  "branch_id": 456
}
```

**Errors:**
- 400 — missing email/password/tenant_id
- 401 — invalid credentials, account not activated, account deactivated
- 500 — internal error (never expose raw DB error)

**Note:** Signing happens in the handler itself (not via Supabase PostgREST). The JWT issued here does not match Supabase's token (different issuer, different custom claims). This handler is for testing only; production uses Supabase Auth. **File:** `internal/handler/auth/login.go`

#### GET /auth/me (authenticated)

**Response:** Echo back the claims from context:
```json
{
  "tenant_id": 123,
  "branch_id": 456,
  "user_role": "cashier",
  "position": "staff_id_001"
}
```

**File:** `internal/handler/auth/handler.go:49-62`

---

### 9. Menu Handler

**File:** `internal/handler/menu/handler.go`, `types.go`

**Endpoints:**

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET    | /menu/categories | menu:read | List active categories |
| POST   | /menu/categories | menu:write | Create category (tenant-scoped) |
| GET    | /menu/categories/{id} | menu:read | Get one |
| PUT    | /menu/categories/{id} | menu:write | Update |
| DELETE | /menu/categories/{id} | menu:write | Soft-delete (is_active = false) |
| GET    | /menu/items | menu:read | List |
| POST   | /menu/items | menu:write | Create |
| GET    | /menu/items/{id} | menu:read | Get |
| PUT    | /menu/items/{id} | menu:write | Update |
| DELETE | /menu/items/{id} | menu:write | Soft-delete |
| GET    | /menu/items/{id}/variants | menu:read | List variants |
| POST   | /menu/items/{id}/variants | menu:write | Create |
| GET    | /menu/items/{id}/modifiers | menu:read | List modifiers |
| POST   | /menu/items/{id}/modifiers | menu:write | Create |
| GET    | /menu/items/{id}/daily-limit | menu:read | Get daily-limit config (per-branch) |
| PUT    | /menu/items/{id}/daily-limit | menu:write | Update daily-limit |

**Key design:**
- All queries filter by `claims.TenantID` (multi-tenant isolation)
- Soft-delete via `is_active` flag (no hard deletes)
- Daily limits stored in `branch_menu_item_daily_limits` (branch-specific quotas)
- Nullable fields (`sortOrder`, `createdAt`) scanned via `sql.Null*`

**Permission gating:** Implemented via optional `middleware.PermissionChecker`. Nil checker skips ABAC (for tests). **File:** `internal/handler/menu/handler.go:25-70`

---

### 10. Staff Handler

**File:** `internal/handler/staff/handler.go`, `types.go`

**Endpoints:**

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET    | /admin/staff | staff:view | List users |
| POST   | /admin/staff | staff:manage | Create user (no password initially) |
| GET    | /admin/staff/{id} | staff:view | Get one |
| PUT    | /admin/staff/{id} | staff:manage | Update fields (email, full_name, branch_id, user_role) |
| DELETE | /admin/staff/{id} | staff:manage | Deactivate (is_active = false) |
| GET    | /admin/staff/{id}/permissions | staff:assign_permission | List user permissions |
| POST   | /admin/staff/{id}/permissions | staff:assign_permission | Grant permission |
| DELETE | /admin/staff/{id}/permissions/{permKey} | staff:assign_permission | Revoke permission |
| POST   | /admin/staff/{id}/set-password | staff:manage | Hash + activate account |

**Elevated role gate:** Assigning `owner` or `super_manager` role requires `staff:assign_elevated_role` permission. **File:** (unverified — check handler.go for exact line)

**Password hashing:** Uses `golang.org/x/crypto/bcrypt` with default cost. No plaintext stored.

**Tenant isolation:** All queries filter by `claims.TenantID`.

**Permission grants:**
- Insert into `user_permissions(user_id, tenant_id, permission_key, branch_id, effect, valid_from, valid_until)`
- Optional `valid_until` = no expiry
- Calls `evaluator.Invalidate(userID)` to clear ABAC cache

**File:** `internal/handler/staff/handler.go:40-59`

---

### 11. Settings Handler

**Files:** `internal/handler/settings/` (handler.go, payments.go, tables.go)

#### Branches

**Endpoints:**

| Method | Path | Permission |
|--------|------|------------|
| GET    | /admin/settings/branches | settings:branch |
| POST   | /admin/settings/branches | settings:branch |
| GET    | /admin/settings/branches/{id} | settings:branch |
| PUT    | /admin/settings/branches/{id} | settings:branch |
| DELETE | /admin/settings/branches/{id} | settings:branch |

All tenant-scoped. Soft-delete via `is_active = false`.

#### Areas (branch_zones)

Same CRUD as branches under `settings:branch` permission.

#### Tables

CRUD under `settings:branch`. Tables live under branches.

#### POS Config

**Endpoints:**

| Method | Path | Permission |
|--------|------|------------|
| GET    | /admin/settings/branches/{id}/pos-config | settings:branch |
| PUT    | /admin/settings/branches/{id}/pos-config | settings:branch |

**Shape:** Stored in `branches.pos_config` (JSONB):
```json
{
  "shift_start_time": "06:00",
  "cash_float_default": "500000.00"
}
```

**Validation:**
- `shift_start_time` matches `HH:MM` (00:00–23:59) via regex `^([01]\d|2[0-3]):[0-5]\d$` **File:** `internal/handler/settings/handler.go:68`
- `cash_float_default` matches NUMERIC(15,2) shape via regex `^\d{1,13}(\.\d{1,2})?$` **File:** `internal/handler/settings/handler.go:72`

#### Payment Settings

**Endpoints:**

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| GET    | /admin/settings/payments | owner, super_manager | Tenant-level, returns all PAYMENT_* keys |
| PUT    | /admin/settings/payments | owner, super_manager | Partial update (omit = no change) |

**Request shape:**
```json
{
  "enable_momo": true,
  "enable_vietqr": false,
  "momo_partner_code": "...",
  "momo_access_key": "...",
  "momo_secret_key": "...",
  "momo_sandbox": true,
  "vietqr_bank_code": "970410",
  "vietqr_account_no": "0123456789",
  "vietqr_account_name": "Restaurant ABC"
}
```

**Validation:**
- `bank_code` — alphanumeric, 1–32 chars
- `account_no` — alphanumeric, 1–32 chars
- `account_name` — anything, 0–64 chars
- `momo_secret_key` / `access_key` — alphanumeric+symbols, 16–64 chars (rejects PEM dumps, typos)

**Secret handling:** `momo_secret_key` is never included in GET response. Instead, returns `secret_key_set: bool` so the UI shows "configured ✓" without exposing the credential. **File:** `internal/handler/settings/payments.go:14-30`

**Storage:** Writes to `system_settings(tenant_id, key, value)` table (not encrypted at-rest; tenant responsibility to gate database access).

---

### 12. Orders Handler

**File:** `internal/handler/orders/` (handler.go, payment_momo.go, shifts.go, types.go)

#### Order CRUD

**Endpoints:**

| Method | Path | Notes |
|--------|------|-------|
| GET    | /br/{branchId}/orders | List (limit 100, DESC by created_at) |
| POST   | /br/{branchId}/orders | Create order |
| GET    | /br/{branchId}/orders/{id} | Get |
| DELETE | /br/{branchId}/orders/{id} | Void (sets status = 'cancelled') |
| POST   | /br/{branchId}/orders/{id}/items | Append items (batch insert) |
| PATCH  | /br/{branchId}/orders/{id}/items/{itemId}/serve | Mark item served |
| POST   | /br/{branchId}/orders/{id}/payment | Confirm payment (cash/momo/vietqr branch) |

**All queries:**
- Filter by `claims.TenantID` AND `branchId` (URL param)
- Parse branchId from URL (return 400 if invalid)

#### Create Order

**Request:**
```json
{
  "table_id": 1,
  "order_type": "dine_in",
  "customer_count": 2,
  "note": "extra napkins",
  "pos_session_id": 7,
  "items": [{ "menu_item_id": 1, "quantity": 2, "unit_price": "50000.00" }]
}
```

`items` is required (validated: non-empty). `pos_session_id` is optional. **File:** `internal/handler/orders/types.go:40-41`, `handler.go:156-165`

**Returns:** Order ID, order_number (auto-incremented per branch)

#### Append Items

**Request:**
```json
{
  "items": [
    {
      "menu_item_id": 123,
      "quantity": 2,
      "unit_price": "50000.00",
      "notes": "no ice"
    }
  ]
}
```

Batch inserts into `order_items`. Validates order exists + tenant/branch match.

#### Serve Item

**Endpoint:** `PATCH /br/{branchId}/orders/{id}/items/{itemId}/serve`

Updates item status to 'served'. Guards against serving already-served items.

#### Confirm Payment

**Endpoint:** `POST /br/{branchId}/orders/{id}/payment`

Three branches based on `method`:

**1. Cash:**
```json
{
  "method": "cash",
  "amount": "200000.00"
}
```
- Creates payment row directly via `create_payment` RPC
- Returns immediately

**2. MoMo:**
```json
{
  "method": "momo",
  "amount": "100000"
}
```
- Validates amount is whole VND (no fractional cents) via regex `^\d{1,13}(\.0{1,2})?$` **File:** `internal/handler/orders/payment_momo.go:20-25`
- Loads tenant MoMo config from `system_settings`
- Calls MoMo `/create` endpoint with HMAC-SHA256 signature
- Inserts pending payment row
- Persists raw MoMo response in `provider_data` column
- Returns `{ payment_id, status, provider_ref, qr_data, qr_info }` for POS to render the QR (`qr_data` is the `qrCodeUrl` from MoMo; `qr_info` is the full raw MoMo response). **File:** `internal/handler/orders/payment_momo.go:154-160`

**3. VietQR:**
Calling `POST /payment` with `method=vietqr` returns **422** with message `"vietqr uses POST /payment/vietqr/confirm"`. The cashier must call the confirm endpoint directly — there is no intermediate redirect_url step. **File:** `internal/handler/orders/handler.go:363-366`

#### Confirm VietQR Payment

**Endpoint:** `POST /br/{branchId}/orders/{id}/payment/vietqr/confirm`

Calls `confirm_vietqr_payment` RPC. Maps PostgreSQL SQLSTATE to HTTP:
- `P0002` → 404 (payment not found)
- `42501` → 403 (permission denied by RLS)
- `22023` or `P0001` → 422 (constraint violation, e.g. amount mismatch)

**File:** `internal/handler/payments/handler.go` (unverified exact line range)

#### Close Shift

**Endpoint:** `POST /br/{branchId}/shifts/close`

Calls `close_pos_session` RPC. Transitions session from 'open' to 'closed', finalizes order total, marks cash float mismatch if any.

**File:** `internal/handler/orders/shifts.go`

---

### 13. Payments Handler

**File:** `internal/handler/payments/handler.go`

#### VietQR Config

**Endpoint:** `GET /br/{branchId}/payments/vietqr-config`

Returns bank transfer details:
```json
{
  "enabled": true,
  "bank_code": "970410",
  "account_no": "0123456789",
  "account_name": "Restaurant ABC"
}
```

If disabled:
```json
{
  "enabled": false,
  "bank_code": "",
  "account_no": "",
  "account_name": ""
}
```

This graceful fallback (enabled=false instead of 404) allows the POS to hide the VietQR button without branching logic. **File:** `internal/handler/payments/handler.go:56-73`

---

### 14. KDS Handler

**File:** `internal/handler/kds/handler.go`

**Endpoints:**

| Method | Path | Notes |
|--------|------|-------|
| GET    | /br/{branchId}/kds/tickets | List pending+preparing tickets |
| PATCH  | /br/{branchId}/kds/tickets/{id}/ready | Mark ready (status='ready') |
| PATCH  | /br/{branchId}/kds/tickets/{id}/recall | Recall (status='pending') |

**Filters:** Only tickets with status IN ('pending', 'preparing'). Ordered by created_at ASC (oldest first).

**Fields returned:**
- id, tenant_id, branch_id, station_id, order_id, order_item_id
- status, bumped_at, created_at, updated_at

**Mark ready:** Updates status to 'ready', optionally bumps bumped_at to now.

**Recall:** Reverts status from 'ready' back to 'pending' (chef mistake recovery).

---

### 15. Notifications Handler

**File:** `internal/handler/notifications/handler.go`, `types.go`

**Endpoints:**

| Method | Path | Notes |
|--------|------|-------|
| GET    | /notifications | List with cursor pagination (50 per page) |
| GET    | /notifications/unread-count | Count unread |
| PATCH  | /notifications/{id}/read | Mark single read (idempotent) |
| PATCH  | /notifications/read-all | Mark all as read |

#### List Notifications

**Query params:** `?cursor=<id>` (optional, for pagination)

**Cursor pagination:**
- First page: no cursor → fetch last 50 notifications
- Next page: cursor=<last_notif_id> → fetch 50 before that ID

**Fields returned per notification:**
- id, kind, severity, title, body, entity_type, entity_id, action_url, is_read, created_at

**Join:** `notifications n LEFT JOIN notification_reads nr ON ... WHERE nr.user_id = $3::uuid` to determine is_read status.

**Critical detail:** Uses explicit `$3::uuid` parameter (UserUUID from claims) instead of `auth.uid()` because auth.uid() returns NULL on plain pgxpool. **File:** `internal/handler/notifications/handler.go:47-73`

#### Mark Single Read

**Endpoint:** `PATCH /notifications/{id}/read`

**Logic:** INSERT into `notification_reads(notification_id, user_id)` via RPC or direct query. Idempotent (ON CONFLICT DO NOTHING).

#### Mark All Read

**Endpoint:** `PATCH /notifications/read-all`

**Logic:** Bulk insert all unread notifications for this user into `notification_reads`. Uses SELECT + ON CONFLICT for idempotency.

---

### 16. Webhooks Handler

**File:** `internal/handler/webhooks/momo.go`

#### MoMo IPN Webhook

**Endpoint:** `POST /webhooks/momo` (public, no auth)

**Purpose:** Receive asynchronous payment confirmation from MoMo Payment Gateway after customer completes payment.

**Flow:**
1. Verify HMAC-SHA256 signature on request body
2. Extract tenant_id, request_id from payload
3. Load tenant MoMo config (credentials)
4. Re-verify signature with loaded secret
5. Insert webhook event (idempotency anchor)
6. Process payment state change (pending → completed/failed)

**Idempotency mechanism:**
- `webhook_events` table: UNIQUE(tenant_id, provider, external_id)
- First webhook insert succeeds; retries hit UNIQUE constraint and are skipped
- Status already updated on first insert; subsequent hits find webhook row and exit early

**Response:** Always 204 No Content (MoMo treats non-204 as retryable failure)

**Signature verification:**
- Extract `signature` field from payload
- Reconstruct 13-field alphabetical string
- Compute HMAC-SHA256 with MoMo secret_key
- Use `crypto/subtle.ConstantTimeCompare` to prevent timing attacks
- Invalid signature → store empty payload (`{}`) and return 204 (DoS guard: reject junk early without DB bloat)

**File:** `internal/handler/webhooks/momo.go:29-100`

---

### 17. MoMo Provider Package

**File:** `internal/payment/momo/` (provider.go, signature.go, provider_test.go)

**Responsibilities:**
- Sign MoMo Payment Gateway v2 requests
- Verify IPN webhook signatures
- Call MoMo `/create` endpoint

#### CreatePayment

**Input:**
```go
type CreateRequest struct {
    TenantID    int64
    OrderID     int64
    OrderNumber string
    Amount      int64       // VND, integer (no cents)
    Description string
    IPNURL      string      // Publicly reachable HTTPS in production
    RedirectURL string      // Optional
}
```

**Signature (10 fields, alphabetical order):**
```
accessKey|amount|description|ipnUrl|orderId|orderInfo|partnerCode|redirectUrl|requestId|secretKey
```

HMAC-SHA256 with secretKey, hex-encoded.

**POST to MoMo:**
- Sandbox: `https://test-payment.momo.vn/v2/gateway/api/create`
- Production: `https://payment.momo.vn/v2/gateway/api/create`
- Timeout: 30s (MoMo's internal timeout ≈ 25s; we add headroom)

**Response:**
```json
{
  "partnerCode": "...",
  "resultCode": 0,
  "message": "Successful",
  "orderId": "...",
  "requestId": "...",
  "qrCodeUrl": "...",
  "deeplink": "...",
  "appLink": "...",
  "payUrl": "..."
}
```

On error, resultCode != 0. Handler must inspect and surface meaningful error to POS.

**File:** `internal/payment/momo/provider.go:1-70`

#### VerifyWebhook

**Input:** Raw webhook payload + signature string

**Signature (13 fields, alphabetical order):**
```
accessKey|amount|description|errorCode|message|orderId|orderInfo|orderType|partnerCode|requestId|responseTime|status|transId
```

HMAC-SHA256 with secretKey, hex-encoded.

**Returns:**
```go
type VerificationResult struct {
    Valid   bool
    OrderID int64
}
```

Uses `crypto/subtle.ConstantTimeCompare` to prevent timing attacks.

**File:** `internal/payment/momo/signature.go`

#### Test Coverage

Unit tests in `provider_test.go`:
- Known-vector HMAC verification (test vectors from MoMo docs)
- Signature builder correctness (field order, format)
- Valid + tampered signature detection
- JSON float → scientific notation regression guard (Go's JSON encoder may use 1e5 instead of 100000; test ensures we handle both)

**File:** `internal/payment/momo/provider_test.go`

---

### 18. Payment Config Package

**File:** `internal/payment/config/config.go`

**Responsibility:** Load per-tenant payment provider settings from `system_settings` table with optional env-var fallback.

**Flow:**
1. Query `system_settings` for PAYMENT_* keys by tenant_id
2. For any missing keys, fall back to matching env vars (PAYMENT_ENABLE_MOMO, VIETQR_*, MOMO_*)
3. Return fully-populated `Payment` struct (zero values for missing, never error for "not configured")

**Fields:**
```go
type Payment struct {
    EnableMoMo   bool   // PAYMENT_ENABLE_MOMO env var or system_settings key
    EnableVietQR bool
    MoMo         MoMo   // {PartnerCode, AccessKey, SecretKey (never returned), Sandbox}
    VietQR       VietQR // {BankCode, AccountNo, AccountName}
}
```

**Secret handling:** `SecretKey` is never included in API responses. Handlers check `SecretKey != ""` to determine if configured, but never serialize it.

**Env-var fallback gated on:** PAYMENT_ENABLE_MOMO=true sentinel row exists in system_settings. This allows admins to opt-in to env-var override without exposing all env vars. **File:** (unverified exact line)

---

### 19. Database Layer

**File:** `internal/db/pool.go`

**Responsibility:** Create pgx connection pool from DSN.

**Configuration:**
- MaxConns = 20 (reasonable default for small–medium multi-tenant system)
- Pings DB on Open() to verify connectivity before returning
- Wraps all pgx errors with context (`"parse database DSN: %w"`, etc.)

**Usage pattern:**
```go
pool, err := db.Open(ctx, os.Getenv("DATABASE_URL"))
defer pool.Close()

// Query
rows, err := pool.Query(ctx, q, tenantID, ...)

// QueryRow
row := pool.QueryRow(ctx, q, tenantID, ...)
var id int64
if err := row.Scan(&id); err != nil { ... }

// Exec
_, err := pool.Exec(ctx, q, tenantID, ...)
```

All queries from handlers use this pool.

---

## Tenant Isolation

**Single mechanism: filter every query by tenant_id**

Every query **must** include `WHERE tenant_id = $1 AND ...` at minimum. Branch-level queries add `AND branch_id = $2`.

Example from menu handler:
```go
const q = `SELECT ... FROM public.menu_categories WHERE tenant_id = $1 AND is_active = true`
rows, err := h.pool.Query(ctx, q, claims.TenantID)
```

This is enforced by code review, not by database-level RLS (though RLS is configured in the schema for defense-in-depth).

**No implicit tenant scope:** Claims carry tenant_id; queries must explicitly bind it.

---

## Validation Patterns

### Regex Validators

Named regexes defined at package scope (not inline):

```go
var (
    posShiftTimeRe = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)  // HH:MM
    posCashFloatRe = regexp.MustCompile(`^\d{1,13}(\.\d{1,2})?$`)    // NUMERIC(15,2)
    momoAmountRe   = regexp.MustCompile(`^\d{1,13}(\.0{1,2})?$`)    // Whole VND only
    momoKeyRe      = regexp.MustCompile(`^[A-Za-z0-9+/=_-]{16,64}$`)  // Secret key format
)
```

**File locations:**
- `internal/handler/settings/handler.go:68, 72` (POS config)
- `internal/handler/orders/payment_momo.go:25` (MoMo amount)
- `internal/handler/settings/payments.go:49-56` (payment credentials)

### Structured Request Validation

JSON request bodies are unmarshaled into typed structs:

```go
type LoginRequest struct {
    Email    string `json:"email"`
    Password string `json:"password"`
    TenantID int64  `json:"tenant_id"`
}

var req LoginRequest
if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
    httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
    return
}
// Then validate fields
if req.Email == "" || req.TenantID <= 0 { ... }
```

No Zod (this is Go, not TypeScript). Validation is imperative per-field.

---

## Error Handling

### Levels

1. **HTTP response:** Always `WriteError(w, status, "message")`
   - Never expose raw DB error messages to client
   - Use generic messages for auth errors ("invalid credentials" not "user not found")

2. **Server logs:** Structured slog with context
   ```go
   slog.ErrorContext(ctx, "query failed", "query", q, "err", err, "tenant_id", tenantID)
   ```

3. **Idempotent endpoints:** Return 204 or 200 regardless of side-effect success (webhooks, mark-as-read)

### Common Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | GET returned data |
| 201 | Created | POST created resource |
| 204 | No Content | Webhook accepted (always), mark-as-read |
| 400 | Bad Request | Invalid ID, missing required field, regex mismatch |
| 401 | Unauthorized | Missing JWT, invalid signature, hook didn't fire |
| 403 | Forbidden | Valid JWT but permission denied |
| 404 | Not Found | Resource doesn't exist or belongs to different tenant |
| 422 | Unprocessable Entity | Constraint violation (UNIQUE, FK), amount mismatch |
| 500 | Internal Server Error | Unexpected DB error, panic recovered |

---

## Database Tables Touched

### Core

- `public.tenants` — Tenant rows (unverified structure in Go code)
- `public.users` — Staff with email, password_hash, full_name, user_role, is_active
- `public.branches` — Branches per tenant, includes pos_config (JSONB)
- `public.branch_zones` (areas) — Areas within branches
- `public.branch_tables` — Dining tables

### Menu

- `public.menu_categories` — Categories (name, sort_order, is_active)
- `public.menu_items` — Items (name, image_url, is_active)
- `public.menu_variants` — Item variants (size, color, etc.)
- `public.menu_modifiers` — Modifiers (extra toppings, sauces, etc.)
- `public.branch_menu_item_daily_limits` — Per-branch item quotas

### Orders + Payments

- `public.orders` — Order header (order_number, table_id, status, subtotal, total_amount, payment_method, payment_status)
- `public.order_items` — Line items (menu_item_id, quantity, unit_price, status)
- `public.payments` — Payment records (status, amount, method, provider, provider_data)
- `public.webhook_events` — Webhook events (idempotency anchor, tenant-scoped UNIQUE)

### KDS

- `public.kds_tickets` — Tickets (order_id, order_item_id, status, bumped_at)

### Staff + Permissions

- `public.user_permissions` — Per-user ABAC overrides (temporal: valid_from, valid_until)
- `public.role_permission_defaults` — Role baseline permissions (read-only reference)

### System

- `public.system_settings` — Tenant-wide config (PAYMENT_*, NEXT_PUBLIC_APP_URL, etc.)
- `public.notifications` — Notifications (tenant-scoped, optional expires_at)
- `public.notification_reads` — Notification read status (user_id, notification_id)

### Not yet migrated from Next.js backend:
- Inventory (tables, triggers, RPCs)
- Procurement
- Finance/Accounting
- Nhân sự & tiền lương
- Reports
- Audit logs (not critical for MVP)
- Print services
- CRM

---

## Known Gotchas

### 1. The pgxpool-no-auth-rpc Regression Rule

**Critical:** Auth RPCs that call `auth.uid()` return NULL on plain pgxpool connections because pgxpool has no JWT context.

**Workaround:** Explicitly bind UUID from claims as a query parameter.

**Example:**
```go
// WRONG
const q = `SELECT ... WHERE user_id = auth.uid()::uuid`

// RIGHT
const q = `SELECT ... WHERE user_id = $3::uuid`
rows, err := h.pool.Query(ctx, q, tenantID, cursor, claims.UserUUID)
```

**Files affected:**
- `internal/handler/notifications/handler.go:47-73` (comment at line 48-49)
- Any future migration of user-scoped queries

**Why:** Supabase's `auth.uid()` is a SQL function that reads the JWT from the connection context. PostgreSQL connections from pgxpool have no JWT; connections from Supabase PostgREST do. The Go backend is a direct pgxpool client, not PostgREST.

### 2. Middleware Order Matters

**File:** `cmd/server/main.go:61-66`

Order:
1. RequestID
2. RealIP
3. Logger
4. CORS
5. Recoverer

Changing this order will break logging (no request ID in logs) or CORS (CORS headers applied after OPTIONS return).

### 3. Permission Cache TTL is 5 Minutes

**File:** `internal/abac/evaluator.go:68-71`

Permission grants/revokes take up to 5 minutes to take effect. Developers must call `evaluator.Invalidate(userID)` after writes, or acceptance tests must wait 5 seconds for the next cache miss.

### 4. Soft-Deletes Use is_active Flag

**All entities:** Categories, items, users, branches, areas, tables

Deleted entities are marked `is_active = false`, not hard-deleted. This preserves FK references and audit trails. Queries must include `WHERE ... AND is_active = true` to hide deleted rows.

**File:** Menu handler `listCategories` at `internal/handler/menu/handler.go:81-85`

### 5. Payment Settings Gate is Role-Based, Not Permission-Based

**File:** `internal/handler/settings/payments.go:63-74`

Payment credentials (especially MoMo secret_key) are tenant-wide secrets. The gate is `owner | super_manager` role **inline in the handler**, not via ABAC. This is a deliberate security boundary: no permission override can grant access to payment settings.

```go
var paymentSettingsAllowedRoles = map[string]bool{
    "owner":         true,
    "super_manager": true,
}
func gatePaymentSettings(w http.ResponseWriter, role string) bool {
    if !paymentSettingsAllowedRoles[role] {
        httputil.WriteError(w, http.StatusForbidden, "...")
        return false
    }
    return true
}
```

### 6. MoMo Amount Must Be Whole VND (No Fractional Cents)

**File:** `internal/handler/orders/payment_momo.go:20-25`

MoMo's `/create` endpoint integer-rounds amounts. A request like `50000.50` becomes `50000` internally, but the local payment row stores `50000.50`. When the IPN arrives with amount = 50000, the exact-match guard fails and the customer's money is effectively lost.

**Solution:** Reject fractional-cent amounts up front via regex `^\d{1,13}(\.0{1,2})?$` (whole VND or `.00` / `.0` only).

### 7. Secret Keys Never Leave the Server

**File:** `internal/handler/settings/payments.go:14-30`

MoMo secret_key and other secrets are stored in `system_settings` but:
- Never returned in GET responses (replaced by `secret_key_set: bool`)
- Never serialized to client JSON
- Only used server-side for signing

If an admin accidentally pastes the secret into a request, it's stored but the UI can't read it back (only a boolean flag).

### 8. Webhook Events Use Idempotent INSERT with UNIQUE Constraint

**File:** `internal/handler/webhooks/momo.go:75-100` (unverified exact line range)

Migration `20260603000000_webhook_events_tenant_scoped_unique.sql` adds:
```sql
UNIQUE(tenant_id, provider, external_id)
```

First webhook POST inserts the row and processes the payment. Retries (MoMo resends if we don't return 204) hit the UNIQUE constraint and skip re-processing. Always return 204 No Content so MoMo thinks we're done.

### 9. Nullable Columns Require sql.Null* Type

**File:** `internal/handler/menu/handler.go:94-100`

Scanning nullable columns requires a wrapper type:
```go
var sortOrder sql.NullInt32
if err := rows.Scan(..., &sortOrder); err != nil { ... }
if sortOrder.Valid {
    c.SortOrder = &sortOrder.Int32  // or c.SortOrder = sortOrder.Int32 if non-pointer
}
```

Forgetting `.Valid` check can panic or assign garbage zero values.

### 10. JWT Claims TenantID == 0 Means Hook Didn't Fire

**File:** `internal/auth/jwt.go:49-52`

If `TenantID == 0` in the parsed claims, the Supabase custom_access_token_hook() did not run (e.g., service-role token, misconfigured hook). Reject with `ErrClaimsMissing` (403, not 401).

This is a security gate. Tenant-scoped queries with TenantID = 0 would expose all tenants' data.

---

## Migrations Added by Go Backend Work

| File | Purpose | Status |
|------|---------|--------|
| `20260602000000_branches_pos_config.sql` | Add `branches.pos_config` (JSONB) | Applied |
| `20260603000000_webhook_events_tenant_scoped_unique.sql` | Add UNIQUE(tenant_id, provider, external_id) on webhook_events | Applied |
| Phase 1-3 ABAC migrations (in parent git history) | Create `user_permissions`, `role_permission_defaults` tables | Applied |

All migrations are applied via `supabase db push` in development/staging; production uses manual apply (owner responsibility). After apply, run `pnpm db:types` to regenerate TypeScript types.

---

## Cross-Package Dependencies

```
cmd/server/main.go
  ├── imports: config, db, all handlers, middleware, abac
  ├── uses: chi router, signal handling, graceful shutdown

handler/* (all)
  ├── imports: httputil, middleware, db/pool, payment/config
  ├── uses: pgxpool queries, WriteJSON/WriteError, ClaimsFrom

internal/auth/
  ├── imports: jwt/v5
  └── no DB access (pure JWT validation + claims definition)

internal/middleware/
  ├── imports: auth (for claims types)
  └── no DB access

internal/abac/
  ├── imports: pgxpool (for permission queries)
  ├── uses: sync.Map for cache
  └── called by: handlers via RequirePermission middleware

internal/payment/{momo,config}/
  ├── imports: pgxpool (config only)
  ├── uses: crypto/hmac, encoding/json, net/http
  └── called by: orders handler, webhooks handler

internal/handler/webhooks/momo.go
  ├── imports: payment/{momo,config}, httputil
  ├── uses: pgxpool (webhook_events insert, config load)
  └── no auth required (HMAC verified instead)
```

---

## Not Yet Migrated (Appendix)

The following modules remain in the Next.js/Supabase backend and have not been migrated to Go:

- **Inventory management** — tables, stock counts, adjustments, RPCs
- **Inventory procurement** — supplier management, GRNs, delivery receipts
- **Finance/Accounting** — manual journal entries, period reconciliation, GL posting
- **Nhân sự & tiền lương** — employee contracts, salary scales, tax withholding (PIT), salary slips
- **Reports** — financial summaries, revenue KPIs, hour-by-hour cashier breakdowns
- **Audit logs** — detailed transaction history (not critical for MVP)
- **Print services** — print template AST, receipt printing, document generation
- **CRM** — customer feedback, loyalty programs
- **Production/Warehouse** — shortage details, kitchen management (KDS is in Go, but order → production link may not be)
- **E-invoicing** — tax invoice generation, compliance reporting

These will be migrated in Phase 2+ based on priority (revenue impact, frequency of use, complexity).

---

## Success Criteria for Future Migration

When migrating a new module from Next.js to Go:

1. **Declare the handler struct** with pool and optional checker (ABAC)
2. **Define request/response types** (JSON marshaling)
3. **Write query functions** that always filter by tenant_id (and branch_id if applicable)
4. **Add validation** via regex or struct field checks (no Zod)
5. **Gate with permissions** via optional checker (or RequireModule for coarse-grained access)
6. **Return JSON** via WriteJSON or WriteError (never raw DB errors)
7. **Test with ABAC disabled** (checker = nil) then with evaluator
8. **Update main.go** to mount the new handler and pass eval as checker
9. **Run `pnpm typecheck && pnpm lint && pnpm build`** (monorepo type safety)
10. **Document the handler** in this file

---

## References

- **Go backend entry point:** `cmd/server/main.go`
- **Config system:** `config/config.go`
- **JWT + claims:** `internal/auth/jwt.go`, `internal/auth/claims.go`
- **ABAC evaluator:** `internal/abac/evaluator.go`
- **HTTP error envelope:** `internal/httputil/respond.go`
- **Middleware stack:** `internal/middleware/`
- **Handler packages:** `internal/handler/*/handler.go`
- **MoMo provider:** `internal/payment/momo/provider.go`
- **Migrations:** `supabase/migrations/2026060[23]000000_*.sql`
- **Monorepo type safety:** `pnpm typecheck` (includes Go backend if shared types exist)

---

## Version History

| Date | Author | Change |
|------|--------|--------|
| 2026-05-14 | Explorer | Initial comprehensive reference (Phase 1-3 ABAC + MoMo/VietQR live) |

