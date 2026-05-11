# Tenant Isolation Contract

## Architecture decision

The Go backend does **not** use Supabase RLS. This is intentional: auth is fully
owned by the Go service (HS256 JWT, bcrypt passwords, pgxpool direct SQL). Supabase
is used only as a managed Postgres host; its Row Level Security policies are bypassed.

## How tenant isolation is enforced

Every handler that reads or writes data:
1. Extracts `claims.TenantID` from the verified JWT (via `middleware.ClaimsFrom`)
2. Includes `WHERE tenant_id = $N` (or `tenant_id = $N` in INSERT) in every query

Cross-tenant data is structurally impossible through the application layer because:
- Every query is parameterized with `claims.TenantID`
- The JWT is verified with `SUPABASE_JWT_SECRET` (HS256) — tokens cannot be forged
- Branch-level scoping uses `claims.BranchID` alongside `tenant_id`

## ABAC

Route-level authorization uses the `RequirePermission` middleware (see
`internal/middleware/abac.go`). Evaluation order: explicit deny → explicit allow →
role default → deny. Permissions are cached 5 minutes per user (invalidated on
grant/revoke within the same process instance).

## Multi-instance cache note

The in-process ABAC cache (`sync.Map`) is local to each Go process. In a
multi-instance deployment, revoke a permission → the change takes effect within
5 minutes on all instances (cache TTL). For security-critical revocations, restart
the affected instances or reduce the TTL in `internal/abac/evaluator.go`.

## What RLS would add (if re-enabled later)

- Defense-in-depth for direct DB access (psql, migration scripts, admin tools)
- Not needed for the HTTP API path since the app layer enforces isolation

