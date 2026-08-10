# ADR 0023 — Shift leader delegation and void approval queue

**Status:** Accepted — shipped (Owner 2026-08-08). Schema, RPC, notifications,
and UI landed with the branch-ops implementation PR.

**Decision owner:** Owner

**Review tier:** T3 — money correction path, multi-step approval, notifications

**Supersedes informal plan labels:** “ADR 5.1” in
`docs/ref/branch-operations.md` (ops naming; no prior ADR file).

## Context

Branch ops need a rotating per-shift lead who can approve full void requests
when the Branch Manager is off the floor — without a static PIN, new staff
role, or parallel notification channel. D012 prefers lean ops and avoids
generic multi-tier approval; a void-leader queue is an explicit bounded
exception (D049 void path; notifications per D046 /
`docs/spec/toast-notification-system.md`).

## Decision

1. **Shift leader is an assignment flag, not a person or JWT role.**
   - `is_shift_leader boolean NOT NULL DEFAULT false` on
     `public.shift_assignments`.
   - At most one leader per branch shift day:
     `UNIQUE (branch_id, shift_id, work_date) WHERE is_shift_leader`.
   - Calendar day column is **`work_date`** (never `shift_date`).
   - Leader rows require `shift_id IS NOT NULL`.
   - Branch Manager (or Owner-approved roster writer under ADR 0019) sets the
     flag when scheduling.

2. **Void delegation is a new approval workflow, not a permission rename.**
   - State machine for full void-after-paid:
     `requested → pending → approved | rejected`.
   - Requestor creates; shift leader approves/rejects on an authenticated PWA
     session; approval invokes the existing atomic void path; rejection leaves
     the paid order unchanged.
   - **Refund and non-void financial correction remain Owner/Accountant**
     (D023 / D049). No refund, discount, or GL tools for shift leader.
   - Early checkout approval stays Branch Manager (D027) unless a future ADR
     expands scope.

3. **Authentication: session only — no static PIN** (no shared PIN, plaintext
   passcode column, or device-local override as authority).

4. **Notifications: reuse the toast/notification contract** (durable
   `public.notifications` + Realtime/foreground popup per
   `docs/spec/toast-notification-system.md` / D046). Deep-link the leader to
   approve/reject. No closed-app Web Push or Telegram-only void path.

5. **D012 posture:** controlled exception for void-leader only — other domains
   do not inherit a generic approval framework.

6. **Position taxonomy (same program):** seed HR position code **`waiter`** →
   auth role `branch_staff` in `POSITION_CODE_TO_STAFF_ROLE` and SQL twin. Do
   not seed/alias `server`.

Rejected: profile “always leader” as sole SSOT; static PIN; “just grant
`orders:void` to `branch_staff`”; bundling refund/discount/early-checkout.

## Consequences

- Agents cite **ADR 0023**, not “ADR 5.1”.
- Authority: D012, D023, D027, D046, D049, D076;
  `docs/spec/toast-notification-system.md`; ADR 0019;
  `docs/ref/branch-operations.md` (this ADR wins on conflict).

## Verification

- Partial unique index enforces one leader per branch/shift/`work_date`.
- Approval invokes atomic void; rejection leaves paid order unchanged.
- Shift leader cannot refund or perform non-void financial correction.
- Void attention uses canonical notifications, not a parallel push channel.
