# Current Tasks

> Active work items for the current session/phase.
> Update during work, clear completed items regularly.

## Module Status (updated 2026-04-10 CEO review)

M0-M3, M5 SHIPPED. M4/M6/M7 PARTIAL (stubs — blocked on credentials or incomplete calc).

### Shipped & Working

- [x] M0: Admin Shell — layout, sidebar, branches, staff, settings
- [x] M1: Menu — categories, items, variants, modifiers, sides
- [x] M2: POS — cart, table/zone, order submit, bill printing
- [x] M3: KDS — realtime queue, bump/complete, station config
- [x] M4: Cash payment ✅ — VietQR/Momo blocked on merchant credentials
- [x] M5: Stock — ingredients, recipes, stock levels, procurement, GRN
- [x] M6: Revenue dashboard ✅ — HĐĐT blocked on MISA credentials, VAS stubs
- [x] M7: Attendance GPS/QR ✅ — payroll calc incomplete

## Known Issues

- [x] P2: 16x `(supabase.rpc as CallableFunction)` type safety bypass — fixed `48ed4ac`
- [x] P3: Draft invoice number collision — fixed with `crypto.randomUUID()` (finance/actions.ts)
- [x] P3: PO/GRN/TRF/PXK `Date.now()` collision — fixed with `randomUUID().slice(0,8)` (2026-04-10)
- [x] `consume_stock_for_order` never called — wired after cash + VietQR confirm (2026-04-10)
- [ ] P3: Login rate limit fail-open khi Upstash unreachable — documented design decision, cần observability
- [x] Migration applied: `20260413000000_fix_void_cancel_branch_scope.sql` — applied + types regenerated

## Pre-deploy Fixes (pending)

- [ ] Fix: Invoice empty `items[]` — populate line items from order_items (finance/actions.ts:131)
- [ ] Uptime monitor on `/api/health` (UptimeRobot — ops task, not code)
- [ ] Momo webhook: atomic `complete_payment_and_consume_stock` RPC (migration needed when M4 wired)

## Pilot-Critical Backlog (blocked on external credentials)

- [ ] P0: Wire VietQR real bank API (blocked on merchant credentials)
- [ ] P0: Wire Momo real API (blocked on merchant credentials)
- [ ] P0: Wire MISA HĐĐT real API call (blocked on MISA provider credentials) — pháp lý NĐ70/2025
- [ ] P1: VietQR payment status — Supabase realtime listener trong POS payment panel
- [ ] P1: Momo webhook atomic RPC `complete_payment_and_consume_stock` (service-role safe)

## Deferred to Post-Pilot

- [ ] Automated E2E tests — POS→payment→stock critical path (P2, before scaling to 3+ branches)
- [ ] Staging environment — Vercel Preview or branch deploy (P2, before external users)
- [ ] area_manager branch scope (H3) — not needed for single-tenant pilot
- [ ] M7 payroll BHXH/PIT calc wiring (use Excel for pilot)
- [ ] M6 VAS journal entries (export CSV → MISA AMIS for pilot)
- [ ] Refunds table + flow

## Post-v1.0 (Tier 2)

- [ ] Local-First Branch (mini PC + SQLite, offline POS/KDS)
- [ ] QR Self-Order (khách scan QR tại bàn)
- [ ] Loyalty / Vouchers (tích điểm, khuyến mãi)
- [ ] Advanced Analytics
- [ ] VNPay integration
- [ ] Employee portal full features (currently placeholder)
