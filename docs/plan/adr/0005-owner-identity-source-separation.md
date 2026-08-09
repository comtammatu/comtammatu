# ADR 0005 — Owner Identity Source Separation

**Status:** Accepted (2026-05-07)

**Decision owner:** Owner (4-agent debate: planner + analyst + architect + critic)

**Context note:** Schema has `tenants.owner_user_id`, but runtime owner-bypass
still uses `positions.code='owner'`. This ADR keeps legal signatory, HR owner
position, and canonical owner auth identity separate.

## Context

H3a closed the silent-demote vector in `has_permission()` owner-bypass
(`profiles.position_id NOT NULL`, FK `ON DELETE RESTRICT`, defensive guards).
The rejected alternative was immediate dual-source owner-bypass via
`tenants.owner_user_id`. Three concepts had been conflated:

1. `tenants.representative TEXT` — legal representative name
2. `positions.code='owner'` — HR label / JWT `user_role` source
3. (none) — canonical auth identity for RLS owner-bypass

## Decision

Minimum-regret synthesis:

1. Keep `tenants.owner_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT NOT NULL` as the canonical owner auth identity column (baseline; history in archived `20260601500000`).
2. Do **not** extend `has_permission()` / `_auth_is_owner()` / `has_permission_any()` with a second OR branch without a new owner-gated decision — H3a is sufficient.
3. Keep the three concepts separate:

| Column | Purpose | Owner-bypass? |
| --- | --- | --- |
| `tenants.representative` | Legal representative name | Never |
| `positions.code='owner'` | HR label, JWT `user_role` | Currently yes |
| `tenants.owner_user_id` | Canonical auth identity column | Not used by current RLS |

Backfill (already applied): oldest active owner by `profiles.created_at` per
tenant; multi-owner tenants raise `WARNING`.

Rejected: full dual-source H3b; replace position-based check entirely; defer
column until transfer UI; multi-owner without UNIQUE (out of scope).

## Consequences

- Canonical owner identity exists in schema without changing current RLS.
- Column unused by RLS until an owner-approved transfer flow or a second
  silent-demote incident warrants a new decision.
- Ownership transfer needs an explicit audited RPC; no current UI/RPC path.
- Dual-source flip, tenant-scope CHECK trigger, and transfer UI are **not** in
  this ADR.

## Verification

- Baseline includes `tenants.owner_user_id`; permission helpers remain
  position-based.
- Live contracts: `docs/modules/auth.md`; regressions
  `TENANT-OWNER-USER-ID-CANONICAL`, `PROFILES-POSITION-ID-MUST-NOT-NULL`.
