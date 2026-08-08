# ADR 0023 — Shift leader delegation and void approval queue

**Status:** Accepted — shipped (Owner 2026-08-08). Schema, RPC, notifications,
and UI landed with the branch-ops implementation PR.

**Decision owner:** Owner

**Review tier:** T3 — money correction path, multi-step approval, notifications

**Supersedes informal plan labels:** “ADR 5.1” in
`docs/ref/branch-operations.md` (ops naming; no prior ADR file).

## Context

Branch operations need a rotating per-shift lead who can approve full void
requests while the Branch Manager is not on the floor. The product must not
invent a static PIN, a new staff role, or a parallel notification channel.

Today:

- Void goes through the existing atomic void RPC / `orders:void` permission
  path (D049). There is **no** request → approve queue.
- `shift_assignments` has `work_date` (not `shift_date`) and has **no**
  `is_shift_leader` column.
- Durable attention uses `docs/spec/toast-notification-system.md` and D046
  (foreground popup only while the PWA is open; no closed-app Web Push server).

D012 prefers lean operations and historically avoids multi-tier approval
workflows. A void-leader queue is an explicit, bounded exception and must be
documented here rather than smuggled in as a boolean flag.

## Decision

1. **Shift leader is an assignment flag, not a person or JWT role.**
   - Add `is_shift_leader boolean NOT NULL DEFAULT false` on
     `public.shift_assignments`.
   - Enforce at most one leader per branch shift day with a partial unique
     index: `UNIQUE (branch_id, shift_id, work_date) WHERE is_shift_leader`.
   - Column name for the calendar day is **`work_date`**. Do not introduce
     `shift_date`.
   - Assignments marked leader require `shift_id IS NOT NULL`.
   - Branch Manager (or an Owner-approved roster writer under ADR 0019) sets
     the flag when scheduling; P3 roster UI may expose a star control only
     after this schema lands.

2. **Void delegation is a new approval workflow, not a permission rename.**
   - Introduce an explicit state machine for full void-after-paid requests:
     `requested → pending → approved | rejected` (names may match the
     implementation table; semantics are fixed).
   - Cashier (or other authorized requestor) creates a request; the shift
     leader approves or rejects on an authenticated PWA session.
   - Approval then invokes the existing atomic void path. Rejection leaves the
     paid order unchanged.
   - **Refund and non-void financial correction remain Owner/Accountant**
     (D023 / D049). Shift leader must not gain refund, discount, or GL tools.
   - Early checkout approval stays Branch Manager (D027) unless a future ADR
     expands scope.

3. **Authentication: session only — no static PIN.**
   - Leader acts on their own logged-in PWA session. No shared PIN, no
     plaintext passcode column, no device-local override code as authority.

4. **Notifications: reuse the toast/notification contract.**
   - Durable row in `public.notifications` + Realtime refetch / foreground
     popup per `docs/spec/toast-notification-system.md` and D046.
   - Do **not** invent a separate “Push Realtime” product channel, closed-app
     Web Push server, or Telegram-only void path.
   - Deep-link the leader into the approve/reject surface.

5. **D012 posture for this workflow.**
   - This ADR records a **controlled exception** to “no multi-tier approval”
     for void-leader only. Other domains do not inherit a generic approval
     framework from this decision.

6. **Position taxonomy for Phục vụ (related, same program).**
   - Seed HR position code **`waiter`** mapped to auth role `branch_staff` in
     `POSITION_CODE_TO_STAFF_ROLE` and the SQL twin in the same PR.
   - Do **not** seed or alias `server` as a position code.
   - Seeded in Production; cite this ADR, not informal “already in schema”
     without the migration.

## Rejected options

- Employee-profile “always leader” flag as the sole source of truth.
- Static PIN / shared device code as void authority.
- Treating void-leader as “just grant `orders:void` to `branch_staff`”.
- Closed-app Web Push or a bespoke push product for void alerts.
- Refund / discount / early-checkout delegation bundled into this ADR.

## Consequences

- Implementation needs migration + RLS/RPC + UI + notification producer, plus
  static/e2e coverage on the void queue.
- Roster “assign leader” UI (plan P3b) is blocked on this ADR’s schema.
- Agents must cite **ADR 0023**, not “ADR 5.1”.

## Authority

- `docs/plan/decisions.md` — D012, D023, D027, D046, D049, D076
- `docs/spec/toast-notification-system.md`
- `docs/plan/adr/0019-hrm-roster-contract-options.md`
- `docs/ref/branch-operations.md` (ops intent; this ADR wins on
  conflict)
