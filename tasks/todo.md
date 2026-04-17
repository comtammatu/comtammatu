# Current Tasks

> Active work items for the current session/phase.
> Update during work, clear completed items regularly.

## Module Status (updated 2026-04-17 shadcn + form migration)

M0-M3, M5 SHIPPED. M5-Ext central kitchen production is live. M4/M6/M7 PARTIAL where blocked on credentials or incomplete accounting/payroll calc.

**Shadcn primitive rollout (2026-04-17):**
- M1 Empty consolidation ✅ — 4 custom wrappers use shadcn `Empty` internally; POS page 4 error/loading states extracted to `PosStatusShell`
- M2 Spinner rollout ✅ — 37 files, `Loader2 + animate-spin` → `<Spinner />`
- M3 Form migration ✅ — 21/24 dialogs migrated to RHF + zod + Field via new `apps/web/app/components/form/` helpers (TextField, NumberField, SelectField, TextareaField, FormDialog, valuesToFormData). Intentionally skipped: 2 import-export-menu + grn-create-client.tsx (wizard, out of scope)
- M4 Item primitive rollout ⏳ — target: admin-shell metric cards, mobile list rows
- M5 Input Group rollout ⏳ — target: search boxes with counter/filter addons (ingredient-table, POS menu, KDS filter, stock)
- M6 Button Group rollout ⏳ — target: order type toggle, save/cancel clusters, segmented actions
- M7 Combobox migration ⏳ — target: supplier/ingredient pickers when options >20
- M8 Sidebar polish ⏳ — target: `collapsible="icon"` default for ≥1280px + replace ad-hoc context trail with proper `Breadcrumb`
- M9 Kbd + shortcuts ⏳ — target: define POS/KDS keyboard shortcut map, add Kbd hints

## Documentation Status

- [x] Inventory docs now have canonical reference + SOP + role handoff + RBAC matrix + ERP gap matrix + pre-release QA runbook + adoption matrix
- [x] Inventory UX workflow review + UX contract added under `docs/worklog/inventory/`
- [x] Inventory module/runbook docs synced with current UI contract, workflow wiring, and canonical catalog routes (2026-04-16)
- [ ] When Inventory behavior changes materially, update `docs/ref/inventory.md`, `docs/ref/inventory-sop.md`, `docs/modules/web-app.md`, and `docs/worklog/inventory/adoption-matrix.md` together
- [ ] Khi cần tách tồn riêng `Kho chi nhánh` / `Bếp chi nhánh`, triển khai project location-ledger theo `docs/plan/inventory-branch-kitchen-model.md`
- [ ] Khi mở phase tách tồn thật, triển khai theo `docs/plan/inventory-location-ledger.md` với rollout `seed -> compatibility -> dual-write -> cutover`
- [x] Owner apply migration `20260417040000_inventory_locations_phase1.sql` — APPLIED, types regenerated (confirmed 2026-04-15)
- [x] Owner apply Migration A `20260417050000_inventory_location_compat_columns.sql` — APPLIED, compat columns in types (confirmed 2026-04-15)
- [ ] Khi Phase 1 đã apply xong, triển khai Phase 2 theo `docs/plan/inventory-location-ledger-phase2.md`
- [ ] Khi Phase 2 bắt đầu, đi theo app patch map ở `docs/plan/inventory-location-ledger-phase2-app-patch.md`

### Shipped & Working

- [x] M0: Admin Shell — layout, sidebar, branches, staff, settings
- [x] M1: Menu — categories, items, variants, modifiers, sides
- [x] M2: POS — cart, table/zone, order submit, bill printing
- [x] M3: KDS — realtime queue, bump/complete, station config
- [x] M4: Cash payment ✅ — VietQR/Momo blocked on merchant credentials
- [x] M5: Stock — ingredients, recipes, stock levels, procurement, GRN, stocktake, transfers, central kitchen production hub
- [x] Inventory UI contract shipped — task-queue-first dashboard, HQ-only procurement hub, branch `Cấp bếp` labeling, catalog dedupe, major workflow buttons wired (2026-04-16)
- [x] M6: Revenue dashboard ✅ — HĐĐT blocked on MISA credentials, VAS stubs
- [x] M7: Attendance GPS/QR ✅ — payroll calc incomplete

## Known Issues

- [x] P2: 16x `(supabase.rpc as CallableFunction)` type safety bypass — fixed `48ed4ac`
- [x] P3: Draft invoice number collision — fixed with `crypto.randomUUID()` (finance/actions.ts)
- [x] P3: PO/GRN/TRF/PXK `Date.now()` collision — fixed with `randomUUID().slice(0,8)` (2026-04-10)
- [x] `consume_stock_for_order` never called — wired after cash + VietQR confirm (2026-04-10)
- [ ] P3: Login rate limit fail-open khi Upstash unreachable — documented design decision, cần observability
- [x] Migration applied: `20260413000000_fix_void_cancel_branch_scope.sql` — applied + types regenerated
- [x] P2: 14x `as any` type safety bypasses removed — KDS/POS/inventory/finance (PR #15, 2026-04-15). 3 remaining blocked on RPC type gen

## Pre-deploy Fixes (pending)

- [x] Fix: Invoice empty `items[]` — use typed nested select, filter cancelled, validate non-empty (PR #15, 2026-04-15)
- [ ] Uptime monitor on `/api/health` (UptimeRobot — ops task, not code)
- [ ] Inventory: chạy manual smoke theo `docs/runbooks/inventory/pre-release-qa.md` sau đợt refactor UI/wiring 2026-04-16
- [ ] Inventory: thay các CTA `sắp mở` còn lại bằng workflow thật khi backend/report surface sẵn sàng
- [ ] Momo webhook: atomic `complete_payment_and_consume_stock` RPC (migration needed when M4 wired)
- [ ] Ops reconciliation: before Momo go-live, add admin query to find payment-order desync:
  ```sql
  SELECT p.id, p.order_id, p.amount, p.paid_at, o.payment_status
  FROM payments p JOIN orders o ON o.id = p.order_id
  WHERE p.status = 'completed' AND o.payment_status != 'paid';
  ```
  Surface this in /admin/finance or as a supabase query operators can run.

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
- [ ] CMS / CRM Foundation (customer registry, loyalty ledger, content publishing)
- [ ] Advanced Analytics
- [ ] VNPay integration
- [ ] Employee portal full features (currently placeholder)
