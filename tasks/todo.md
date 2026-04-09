# Current Tasks

> Active work items for the current session/phase.
> Update during work, clear completed items regularly.

## All Modules SHIPPED (M0-M7) ✅

All 8 modules shipped and QA verified on 2026-04-07.

### Completed

- [x] M0: Admin Shell — layout, sidebar, branches, staff, settings
- [x] M1: Menu — categories, items, variants, modifiers, sides
- [x] M2: POS — cart, table/zone, order submit, bill printing
- [x] M3: KDS — realtime queue, bump/complete, station config
- [x] M4: Payment — cash, VietQR, Momo, refunds, reconciliation
- [x] M5: Stock — ingredients, recipes, stock levels, procurement
- [x] M6: Finance — HĐĐT, VAT, dashboard, VAS accounting
- [x] M7: HR/Payroll — employees, shifts, attendance, payroll

## Known Issues (from 2026-04-08 security review)

- [x] P2: 16x `(supabase.rpc as CallableFunction)` type safety bypass — fixed `48ed4ac`
- [ ] P3: Draft invoice number collision — `DRAFT-${branch_id}-${Date.now()}` không unique nếu concurrent
- [ ] P3: Login rate limit fail-open khi Upstash unreachable — documented design decision, cần observability
- [x] Migration applied: `20260413000000_fix_void_cancel_branch_scope.sql` — applied + types regenerated

## Pre-deploy Fixes (from 2026-04-09 CEO review)

- [ ] Fix P3: Draft invoice collision — replace `DRAFT-${Date.now()}` with `crypto.randomUUID()`
- [ ] Fix: Invoice empty `items[]` — populate line items from order_items (finance/actions.ts:131)
- [ ] Uptime monitor on `/api/health` (UptimeRobot or similar)

## Deferred (from 2026-04-09 CEO review)

- [ ] Automated tests for critical POS→KDS→Payment flow (P2, before scaling)
- [ ] Staging environment — Vercel Preview or branch deploy (P2)
- [ ] Correct roadmap — M4/M6/M7 status should be PARTIAL not SHIPPED (P3)
- [ ] area_manager branch scope (H3) — not needed for single-tenant test server
- [ ] Wire real MISA HĐĐT integration (blocked on credentials)
- [ ] Wire VietQR + MoMo payments (blocked on merchant credentials)
- [ ] Refunds table + flow
- [ ] Payroll calculation (payroll_periods, payroll_entries tables)
- [ ] VAS accounting (chart_of_accounts, journal_entries tables)

## Post-v1.0 (Tier 2)

- [ ] Local-First Branch (mini PC + SQLite, offline POS/KDS)
- [ ] QR Self-Order (khách scan QR tại bàn)
- [ ] Loyalty / Vouchers (tích điểm, khuyến mãi)
- [ ] Advanced Analytics
- [ ] VNPay integration
- [ ] Employee portal full features (currently placeholder)
