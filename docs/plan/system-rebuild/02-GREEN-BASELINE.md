# 02 — Green Baseline Architecture

> Purpose: define the target technical baseline for `comtammatu` as the green system.

## Blue And Green

```text
Blue
  current comtammatu Supabase project
  source for business rules, data audit, and migration
  retained as read-only audit snapshot after cutover

Green
  new comtammatu Supabase project/database
  clean architecture baseline
  production target after verification
```

## Target Runtime

```text
Next.js App Router / PWA / print agent
  -> proxy.ts auth + ACL
  -> Server Components / Server Actions
  -> Supabase Green
      -> Auth v2
      -> Postgres RPCs + RLS
      -> Storage evidence buckets
      -> scheduled jobs
      -> realtime where required
  -> Print agent
```

## Baseline Groups

Green baseline must include the whole system, not only Inventory.

| Group | Baseline treatment |
|---|---|
| Tenant/branch/area | Keep as core hierarchy. |
| Auth/session/users | Auth v2 green baseline; preserve users or map users explicitly. |
| Positions/permissions | Clean permission catalog; no legacy role whitelist assumptions. |
| POS/order/payment | First-class core; payment server-side recompute and idempotency. |
| KDS | Realtime kitchen queue and station model. |
| HĐĐT/tax | State machine and retained evidence. |
| Finance/GL/periods | Keep by default; period close guarded at DB/API layer. |
| Inventory V2 | Clean workflow baseline: GRN, transfer, production, stocktake, WAC/ledger. |
| HR/employee/payroll | Retain if data exists; payroll/legal flows are not optional debt. |
| Print/PWA/offline | Operational dependency, not a UI afterthought. |
| Audit/logging | Write through controlled paths; no secret leakage. |

## Inventory V2 Target

Inventory green baseline should implement the V2 operational loop:

```text
Supplier -> Central Warehouse -> Central Kitchen -> Branch Warehouse -> Branch Kitchen -> POS consumption
```

Required:

- no `kitchen_use` movement type
- atomic intra-branch transfer
- explicit source/destination locations
- permission-gated transfer create/ship/receive
- simple GRN receive path
- production/BOM consumption and output
- stocktake baseline without hidden V1 conflict/recount UI
- dashboard from retained ledger/source, not stale V1 MVs

## Auth And Permissions

Target rules:

- Route access is not enough. Database/API writes need permission checks.
- Claims must carry tenant/branch/user context.
- RLS policies must be tested with positive and negative personas.
- Permission keys should represent capability, not legacy title names.
- Position-code normalization needs its own ADR if it changes persisted data.

## Transaction Boundaries

Multi-row writes must be atomic at the database/API transaction layer.

Examples:

- POS payment confirm -> payment state -> order state -> stock consumption -> finance event
- inventory transfer receive -> stock movement -> stock level projection -> outbox event
- HĐĐT issue -> invoice state -> PDF/evidence ref -> audit event
- payroll finalize -> payroll record -> journal/audit event

## Do Not Port

Do not copy these patterns from blue into green:

- legacy role whitelist checks as business authorization
- V1 Inventory latent schema because “it already exists”
- feature flag rows that describe retired behavior
- derived materialized views as source of truth
- UI-only guards without DB/API enforcement
- ad-hoc Vietnamese labels outside canonical terminology

## Implementation Sequence

1. Write baseline ADRs.
2. Build empty green database from baseline.
3. Add seed data for tenant/branch/positions/permissions.
4. Implement auth/session and claim helpers.
5. Implement POS/KDS/payment vertical slice.
6. Implement Inventory ledger and transfers.
7. Add Finance/HR/Employee foundations.
8. Add realtime/outbox.
9. Add storage/evidence.
10. Run full migration rehearsal before production cutover.

## Squash Strategy

(Adopted 2026-05-07 from matu-superapp ADR-0001. Folded as section here per ADR reconciliation A2 — no standalone ADR needed since this is core baseline policy.)

The first baseline migration must apply from an empty Supabase project but proven domain semantics must not be lost. Three options were considered:

- **Option A** — Replay every historical migration into the new repo. Imports history noise + accumulated mistakes; rejected.
- **Option B** — Write one deliberate baseline snapshot and future deltas. **Selected.**
- **Option C** — Rebuild schema domain by domain while re-specifying every critical RPC. Used as targeted review pass for high-risk domains (Auth, Finance, Inventory) within Option B framework.

The first baseline migration must:

- Apply from an empty database (`supabase db reset` or equivalent local reset succeeds).
- Include P0 tables, RLS policies, RPCs, indexes, grants, and seed data.
- Preserve named regression semantics in `tasks/regressions.md`.
- Generate database types through `pnpm db:types`.
- Have SQL tests for RLS/RPC critical paths before UI expansion.

Acceptance gates:

- Seed creates demo tenant, legal profile, branches/sites, roles, permissions, menu, inventory, and test users.
- SQL tests cover auth/RLS negative cases, payment slot reuse, refund preconditions, stock ledger writes, HĐĐT state transitions, and period close guard.
- Generated types include every table/RPC called by app code.
- Data classification template exists before cutover planning (per `03-DATA-MIGRATION-POLICY.md`).

Consequences:

- W1 should be planned as 2-3 weeks, not a one-week task.
- Every domain RPC must have a named owner and test expectation.
- Future migrations start after the accepted baseline; do not keep rewriting baseline once runtime work begins unless the owner explicitly reopens W1.
