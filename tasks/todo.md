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

- [ ] P1: area_manager chưa có branch scope trong finance/HR/inventory (TODO H3 — cần area-branch mapping)
- [ ] P2: 16x `(supabase.rpc as CallableFunction)` type safety bypass — cần `pnpm db:types` sau khi apply migrations
- [ ] P3: Draft invoice number collision — `DRAFT-${branch_id}-${Date.now()}` không unique nếu concurrent
- [ ] P3: Login rate limit fail-open khi Upstash unreachable — documented design decision, cần observability
- [ ] Migration pending: `20260413000000_fix_void_cancel_branch_scope.sql` — owner apply sau merge

## Post-v1.0 (Tier 2)

- [ ] Local-First Branch (mini PC + SQLite, offline POS/KDS)
- [ ] QR Self-Order (khách scan QR tại bàn)
- [ ] Loyalty / Vouchers (tích điểm, khuyến mãi)
- [ ] Advanced Analytics
- [ ] VNPay integration
- [ ] Employee portal full features (currently placeholder)
