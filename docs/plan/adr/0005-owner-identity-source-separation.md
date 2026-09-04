# ADR 0005 — Owner Identity Source Separation

**Status:** Accepted (2026-05-07)

**Decision owner:** Owner

Runtime Owner admission lives in
[`docs/modules/auth.md`](../../modules/auth.md). This ADR owns column identity
only; do not implement JWT / `canAccess` from here.

## Decision

Keep three Owner meanings in separate columns. Do **not** OR
`tenants.owner_user_id` into `has_permission()`, `auth_is_owner()`, or
`has_permission_any()` until a new owner-gated ADR.

| Column | Purpose |
| --- | --- |
| `tenants.representative` | Legal representative name; never auth |
| `positions.code='owner'` | HR label (runtime role mapping: auth.md) |
| `tenants.owner_user_id` | Canonical owner auth identity; unused by current RLS |

Ownership transfer needs an explicit audited RPC; no current UI/RPC path. Do
not UNIQUE-constrain `owner_user_id` until a business rule forbids one user
owning multiple tenants. Do not sync `representative` ↔ `owner_user_id`.

## Consequences

Canonical owner identity exists in schema without changing current RLS.
Dual-source flip, tenant-scope CHECK trigger, and transfer UI are **not** in
this ADR.

## Verification

- Baseline includes `tenants.owner_user_id`; permission helpers remain
  position-based until a new decision.
- Live contracts: `docs/modules/auth.md`; regressions
  `TENANT-OWNER-USER-ID-CANONICAL`, `PROFILES-POSITION-ID-MUST-NOT-NULL`.
