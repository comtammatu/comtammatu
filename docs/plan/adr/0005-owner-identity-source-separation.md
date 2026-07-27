# ADR 0005 — Owner Identity Source Separation

**Status:** Accepted (2026-05-07)
**Context:** Owner identity separation after H3a security hardening
**Decision drivers:** 4-agent debate (planner + analyst + architect + critic)

This ADR remains active because the schema has a current `tenants.owner_user_id`
column, but runtime owner-bypass intentionally still uses `positions.code='owner'`.
It prevents future work from merging three different concepts: legal signatory,
HR owner position, and canonical owner auth identity.

## Context

The H3a security audit (2026-05-07) closed the silent-demote vector in `has_permission()` owner-bypass by enforcing `profiles.position_id NOT NULL` with FK `ON DELETE RESTRICT` and adding defensive guards in `handle_new_user` and the canonical staff assignment RPC. After H3a, a profile cannot reach a NULL `position_id` state via any code path.

The rejected alternative was to add `tenants.owner_user_id UUID` and immediately extend `has_permission()` with a second OR branch (defense-in-depth dual source). The intent was "make owner-bypass robust against position_id NULL" — but H3a already closed that vector.

Three concepts were conflated in original code:

1. `tenants.representative TEXT` — legal representative name for legal documents
2. `positions.code='owner'` — HR label (display, JWT user_role derivation)
3. (none) — Canonical auth identity for RLS owner-bypass

## Decision

**Adopt minimum-regret synthesis (Architect's Antithesis):**

1. **Keep `tenants.owner_user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT NOT NULL`** as the canonical owner auth identity column (this ADR + archived migration `20260601500000`, now folded into the baseline).
2. **Do not update `has_permission()` / `_auth_is_owner()` / `has_permission_any()`** to add a second OR branch without a new owner-gated decision. No functional regression to fix — H3a sufficient.
3. **Three concepts kept separate** with clear semantics:

| Column                   | Type                              | Purpose                                    | Owner-bypass?              |
| ------------------------ | --------------------------------- | ------------------------------------------ | -------------------------- |
| `tenants.representative` | TEXT                              | Legal representative name                  | ❌ Never                   |
| `positions.code='owner'` | (lookup via profiles.position_id) | HR label, JWT user_role source             | ✅ Currently               |
| `tenants.owner_user_id`  | UUID FK auth.users                | Canonical auth identity column             | ❌ Not used by current RLS |

## Why minimum-regret over full dual-source

**Architect Antithesis (steelman against full H3b):**

- H3a enforces `profiles.position_id NOT NULL` + FK RESTRICT + raise on every code path that could null it.
- Silent-demote vector (the bug class H3b would defend) is **already closed** at source.
- Adding redundant column + has_permission OR branch creates:
  - **Drift surface:** positions.code='owner' user can desync with tenants.owner_user_id via direct SQL.
  - **Hot-path EXISTS query** for a class of bugs already prevented (~0.1ms × 100s req/s).
  - **6-step migration** with backfill + index + function update + ADR.
- "Defense-in-depth" framing assumes failure modes independent. In practice both sources go through same admin paths → failures correlate.

**Synthesis path:**

- Keep the column as canonical owner identity data.
- Keep permission helpers single-source unless a real second silent-demote incident or owner-approved transfer flow requires a new decision.
- Avoids drift: no two sources of truth in active use yet.

## Consequences

**Positive:**

- Canonical owner auth identity exists in schema without changing current RLS behavior.
- Backfill verified at migration time (every tenant has identifiable owner).
- Three-concept model documented; future engineers know which to use.
- Migration is reversible (column drop only).

**Negative / Trade-offs:**

- Column exists but unused by RLS. Slight schema bloat (1 UUID per tenant).
- Ownership transfer needs an explicit owner-approved RPC; there is no current UI/RPC mutation path.
- If H3a invariants ever weakened (e.g. NOT NULL constraint dropped), defense-in-depth via this column is NOT in place — deliberate, ADR documents fallback path.

## Alternatives Rejected

**A. Full dual-source (original H3b):**

- Add column + extend has_permission + extend has_permission_any + extend \_auth_is_owner.
- Rejected: solves a problem H3a already prevents; introduces drift surface.

**B. Single source migration (replace position-based check):**

- Drop `positions.code='owner'` check entirely; rely solely on `tenants.owner_user_id`.
- Rejected: invasive — breaks `_auth_position_id_from_role` mapping (`20260423020000_auth_v2_m5_bridge.sql:108`), JWT user_role derivation, 17+ SQL sites referencing 'owner' position code.

**C. No-op (defer entire H3b):**

- Don't ship anything until ownership transfer UI is designed.
- Rejected: data foundation work is independent of UI; better to land schema now.

**D. Multi-owner support (UNIQUE removed):**

- Allow N owners per tenant via no UNIQUE constraint.
- Rejected: not in scope. Backfill picks 1 deterministic owner; UNIQUE not added because no business rule forbids same user owning multiple tenants. If multi-owner becomes real requirement, separate ADR.

## Backfill Semantics

```sql
UPDATE tenants t
   SET owner_user_id = sub.user_id
  FROM (
    SELECT DISTINCT ON (p.tenant_id)
      p.tenant_id,
      p.id AS user_id
    FROM profiles p
    JOIN positions po ON po.id = p.position_id
    WHERE po.code = 'owner' AND p.is_active = TRUE
    ORDER BY p.tenant_id, p.created_at ASC
  ) AS sub
 WHERE t.id = sub.tenant_id;
```

**Tie-break:** oldest active owner by `profiles.created_at`. Multi-owner tenants surface `RAISE WARNING` so operator can verify post-apply. No silent arbitrary pick.

## Future work (NOT in this ADR)

- **`transfer_ownership(p_new_user_id UUID)` RPC:** atomic UPDATE + audit log + permission gate (only current owner can transfer).
- **UI surface:** `/settings/general` ownership-transfer flow.
- **has_permission dual-source flip:** if second silent-demote incident observed, single PR adds OR branch using already-populated column.
- **Tenant-scope CHECK trigger:** `tenants.owner_user_id` should reference profile in same tenant (Postgres FK can't express; needs trigger). Defer until transfer_ownership RPC ships.

## References

- `supabase/migrations/20260717151345_baseline.sql` — current schema baseline with `tenants.owner_user_id`
- `supabase/migration-archive/20260601500000_h3b_tenants_owner_user_id.sql` — implementation history
- `supabase/migration-archive/20260601100000_auth_v3_h3a_position_id_required.sql` — H3a (closes silent-demote at source)
- `supabase/migration-archive/20260423040000_auth_v2_m5_hotfix_has_permission.sql` — current owner-bypass lineage (positions-based)
- `supabase/migration-archive/20260401000000_initial_schema.sql:28` — `tenants.representative TEXT` (legal name, NOT auth)
- `tasks/regressions.md` — TENANT-OWNER-USER-ID-CANONICAL (new), PROFILES-POSITION-ID-MUST-NOT-NULL (H3a sibling)
- `docs/modules/auth.md` — Invariants section
