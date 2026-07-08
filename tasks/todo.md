# Current Tasks

> Active work tracker for the in-place `comtammatu` production track.
> This file contains only active, blocked, or explicitly owner-gated work.
> Shipped history lives in git; durable failure rules live in
> `tasks/regressions.md`; decisions live in `docs/plan/decisions.md`.
>
> Reconciled-through `23500913b` (2026-07-08). Before acting, verify the live
> checkout with `git status` and re-check production state for any migration or
> runtime claim.

## Current Snapshot

- Production is running in-place on this repo.
- External payment/invoice surfaces in scope: VietQR, MoMo, Viettel S-invoice.
- GitHub Issues are disabled for `comtammatu/comtammatu`; active external work
  is tracked through PRs, this board, and source docs.
- Open PR `#275` was based on old `main` (`209b98d`) and is superseded by
  current `main` for buyer email/manual invoice/SePay-HĐĐT recovery paths. Do
  not revive it without re-diffing against current `origin/main`.

## Agent-Doable Now

### Operator Stock Native Surfaces

- [ ] **D067/D068 Wave 1 — close data-gated operator evidence gaps.** Local
  branch-3 smoke on 2026-07-07 covered desktop/tablet/mobile rendering for
  production hub/detail, receive empty list, stocktake detail/result, PO empty
  list, GRN list/detail, and GRN supplier entry; direct
  `stock/receive/2198` renders the non-receivable guard. Current production
  rows for branch 3 have no receivable transfer, no PO, and only cancelled
  stocktake with `inv_stocktake_redesigned` off. Remaining runtime evidence
  needs branch-scoped data or gate changes only: a receivable transfer for
  `stock/receive/[id]`, a branch-3 PO for PO detail, and an enabled in-progress
  stocktake session for `stocktake/[id]/count`. Keep shared data/actions, no
  Office wrapper embed, and no new schema/grant unless a route proves it truly
  needs one.
- [ ] **Wave 2 — trim remaining operator stock screens.** Kill filler blocks,
  desktop tables/tabs, duplicate meters, and non-job copy across the 13 trim
  screens named in `docs/plan/kho-tong-hub-native-2026-07-04.md`.
- [ ] **Wave 3 — copy/label pass.** Canonicalize overloaded inventory words
  (`phiếu`, `lệnh`, `kiểm kê`, TP/NL, CTA verbs) in shared messages and refresh
  i18n baseline.
- [ ] **Wave 4 — `stock/catalog`.** Add the central supply catalog surface only
  after the job-critical flows are stable.

### Realtime And Freshness

- [ ] **Production apply/status audit for realtime migrations on `main`.**
  Re-check the production migration ledger before claiming bus/cron/menu sync is
  live; production migrations remain owner-applied only.
- [ ] **Runtime smoke for branch ops bus.** Verify real auth/socket refresh on
  operator stock pages after the owner-applied bus is live. Include transfer,
  GRN, PO, production, count-slip, stocktake, waste, and supplier-return events.
- [ ] **Approval queues not yet covered by branch ops bus.** Decide and wire
  `attendance_records` / leave-request freshness only if operators still see
  stale screens after the stock bus is proven.

### POS/KDS/Inventory Truth

- [ ] **POS/KDS final-outcome inventory truth.** Run the full functional
  POS/KDS outcome browser smoke on a CSP-compatible local or preview env, then
  re-check production apply and `db:types` needs before enabling any flag. The
  `entry_unit_id` writer fixes (`20260708120000`–`122500`) and refund restore
  (`20260708123500`) have landed as migration files but are not yet
  owner-applied; re-verify the production migration ledger before claiming any
  runtime state.
- [x] **Side-item recipe consumption — IMPLEMENTED behind `pos_stock_outcome_posting`.**
  `post_pos_sale_consumption_if_ready` and `enforce_branch_stock_availability`
  already explode `order_items.sides[]` via UNION ALL into the consumption/gate
  CTEs (`20260706085000_pos_stock_outcome_to_kitchen.sql:122-127, 208-216`). The
  legacy `consume_stock_for_order` referenced in older notes is browser-revoked,
  has no TS caller, and is superseded — do not rebuild it; the remaining work is
  enabling the flag with runtime evidence (see item above).
- [x] **Refund restore when stock deduction is enabled.** Built as
  movement-based `post_pos_sale_refund_restore` (`20260708123500`): mirrors
  `sale_consumption` rows into inverse `refund_restore` /
  `sale_consumption_restore` rows, idempotent via a dedicated partial unique
  index, wired into `refund_paid_order` and `reverse_payment_and_post`. Implicit
  gate: no consumption rows → no-op. Goes live only when
  `pos_stock_outcome_posting` is enabled (currently OFF on all branches).

### Verification Infrastructure

- [ ] **Re-add E2E specs carefully.** `payment-vietqr` and
  `edit-pending-pricing` pass locally but still need CI multi-spec timeout root
  cause fixed before widening the gate. Prefer split jobs or explicit element
  waits over `networkidle`.
- [ ] **KDS queue spec semantics.** Reconcile `kds-queue.spec.ts` ordering/current
  card assertions against the intended KDS behavior before editing selectors.
- [ ] **Inventory E2E fixtures.** Seed the missing `warehouse_manager` profile and
  ingredient row for inventory UI specs before adding them to the smoke gate.
- [ ] **Route/runtime QA sweeps.** Continue `/br/[branchId]/*` role sweeps for
  cashier, chef, warehouse, and production roles when Docker/local runtime is
  available.

### UI And Code Health

- [ ] **UI ratchet real-debt bridge.** Burn down real component-system debt by
  route family (Inventory, Finance, HR, POS/KDS/Runner, Branch/Employee shells).
  Do not chase audit totals to zero; keep workflow-valid exceptions.
- [ ] **Server-side DB error logging.** Add server-only `error.code`/`details`
  logging by shell where actions currently collapse Supabase failures into silent
  generic messages. Never leak raw DB errors to clients.
- [ ] **WS-3 client splits.** Split `pos-desktop-shell` and `order-detail-sheet`
  only with running-app verification; goal is clearer concerns, not line-count
  reduction.

## Owner / Ops

- [ ] **Production migration ledger audit.** Before any apply batch, compare
  top-level repo migrations against the production ledger and list exact missing
  files. Never direct-apply production from an agent.
- [ ] **Finance metric definitions.** Decide `doanh thu` (HĐĐT issued vs money
  collected) and what `lãi gộp` subtracts before dashboard polish.
- [ ] **HRM payroll closeout.** Payroll calc is in-app; decide the remaining
  rollout: CSV/Excel/accountant export, pre-approval review, H1-2026 withholding
  policy, PIT on payslip, and IA under Người / Ngày công / Lương.
- [ ] **Supplier fallback.** Pick one GRN supplier path for "Khác": real supplier,
  `Mua ngoài` + note, or generic supplier.
- [ ] **Ownership transfer.** Decide `transfer_ownership(p_new_user_id)` semantics
  (instant vs 2-phase), representative sync, audit shape, and permission gate.
- [ ] **Print-agent rollout.** Deploy print-agent v1.0.0 to all branches and smoke
  with real printers (`PRINTER_HOST=<ip> pnpm test:print`).
- [ ] **Uptime monitor.** Configure UptimeRobot for `/api/health`.
- [ ] **Supabase/GitHub ops.** Verify GitHub Actions billing, Supabase preview
  deploy settings, `track_functions`, and any owner-only toggles before treating
  telemetry-dependent cleanup as actionable.

## Blocked On Runtime Or Telemetry

- [ ] **Real POS→payment→KDS/print→HĐĐT smoke.** POS→payment→KDS is covered by
  CI smoke; print-agent and HĐĐT still need live provider credentials and real
  printer/device evidence.
- [ ] **Unused indexes.** Wait for at least one representative business cycle,
  including month-end, before dropping indexes from `pg_stat_user_indexes`.
- [ ] **Dead RPC drop wave 2.** Enable function tracking and collect real traffic
  before dropping any Tier B/C/D candidates. Use ≤10 RPCs per T3 migration wave.

## Deferred Post-Pilot

- [ ] **Partial payment / split invoice (`record_partial_payment`).**
- [ ] **Completion-auth tightening (`pos:confirm_payment` instead of `pos:use`).**
- [ ] **HĐĐT post-pilot archive/replace/provider-config hardening.**
- [ ] **Refund partial-refund T3.**
- [ ] **`has_permission()` dual-source flip.** Tripwire only after a second
  silent-demotion incident.
- [ ] **Login rate-limit `security_events` table.**
- [ ] **Insurance/gross salary audit.** Run before first live payroll close,
  after HĐLĐ rows carry production salary/BH data.
- [ ] **Inventory unbuilt scaffolds.** Stocktake conflict dashboard, escalation
  flow, and auto-waste listing should be rebuilt only from a fresh approved
  requirement.

## Post-v1.0

- [ ] QR Self-Order at table.
- [ ] Loyalty / vouchers.
- [ ] Advanced analytics.
- [ ] Employee portal full features.
