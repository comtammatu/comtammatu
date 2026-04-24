# Current Tasks

> Active work items for the current session/phase.
> Updated: 2026-04-24

## Module Status

**Shipped** (M0–M7 all core features live; external integrations blocked on credentials):

- [x] M0: Admin Shell — layout, sidebar, branches, staff, settings
- [x] M1: Menu — categories, items, variants, modifiers, sides
- [x] M2: POS — cart, table/zone, order submit, bill printing, charge sides, per-item notes
- [x] M3: KDS — realtime queue, bump/complete, station config, keyboard shortcuts
- [x] M4: Payment — cash ✅ (VietQR/Momo wire blocked on merchant credentials)
- [x] M5: Stock — ingredients, recipes, stock levels, procurement, GRN, stocktake, transfers, central kitchen production hub, supplier returns/credit notes
- [x] M5-Ext: Central kitchen production live; HQ retired → multi-instance Kho Tổng (`central_warehouse`) + Bếp trung tâm (`central_kitchen`). See [D000](../docs/plan/decisions.md#d000)
- [x] M6: Finance — revenue dashboard, food cost, VAS chart + journals, BCTC (MISA HĐĐT wire blocked on credentials)
- [x] M7: Nhân sự — employees, shifts, attendance, employment contracts, payslip, employee portal (BHXH/PIT calc deferred to post-pilot)
- [x] Auth v2: Position ⟂ Permission model, 100% RLS cutover (verified 2026-04-23). `has_permission()` / `has_permission_any()` source of truth
- [x] Branch-scoped settings, VietQR per-tenant config, printer ACL hardening, print agent pilot

**Shadcn primitive migration — COMPLETE:**
- [x] M1 Empty consolidation
- [x] M2 Spinner rollout (37 files)
- [x] M3 Form migration (21/24 dialogs → RHF + zod + Field + FormDialog)
- [x] M4 Item primitive (7 batches — admin/hr/finance shells + mobile list rows)
- [x] M5 Input Group (5 batches — search boxes across inventory/PO/stock)
- [x] M6 KDS station filter Tabs → ToggleGroup
- [x] M7 Combobox (4 batches — supplier/ingredient/finished_good pickers)
- [x] M8 Sidebar `collapsible="icon"` + Breadcrumb (admin-shell, inventory-shell)
- [x] M9 Kbd + POS/KDS keyboard shortcuts

## Known Issues

- [ ] P3: Login rate limit fail-open khi Upstash unreachable — documented design decision, cần observability
- [ ] 10 SECURITY DEFINER RPCs còn gọi `auth_role()` (legacy compat) — không chặn ship, migrate dần qua batches α4b/α4c:
  ```
  admin_update_profile, bump_kds_ticket, can_access_branch,
  close_fiscal_period, create_supplier_payment, gl_reconciliation,
  post_payroll_journal, recall_kds_ticket, set_branch_kind,
  toggle_profile_active
  ```

## Pre-deploy Fixes (pending)

- [ ] Uptime monitor on `/api/health` (UptimeRobot — ops task, không phải code)
- [ ] Inventory: chạy manual smoke theo `docs/runbooks/inventory/pre-release-qa.md` trước pilot
- [ ] Momo webhook: atomic `complete_payment_and_consume_stock` RPC (migration needed when M4 wired)
- [ ] Ops reconciliation query (before Momo go-live) — payment/order desync surfacing in /admin/finance

## Pilot-Critical Backlog (blocked on external credentials)

- [ ] P0: Wire VietQR real bank API (merchant credentials)
- [ ] P0: Wire Momo real API (merchant credentials)
- [ ] P0: Wire MISA HĐĐT real API call (MISA provider credentials — pháp lý NĐ70/2025)
- [ ] P1: VietQR payment status — Supabase realtime listener trong POS payment panel
- [ ] P1: Momo webhook atomic RPC `complete_payment_and_consume_stock`

## Branch Kitchen Site Split (Phase 1)

> Decision 2026-04-23 — tách tồn Kho CN / Bếp CN qua `inventory_locations`, không dùng `branch_kind='branch_kitchen'`. See `docs/plan/inventory-location-ledger-phase2.md`.

- [x] Migration `20260417040000_inventory_locations_phase1.sql` APPLIED
- [x] Migration A `20260417050000_inventory_location_compat_columns.sql` APPLIED
- [ ] Phase 2 dual-write + cutover theo `docs/plan/inventory-location-ledger-phase2.md`
- [ ] Seed 1 `inventory_locations` kitchen/warehouse per branch (`is_default_consumption`)
- [ ] Rút gọn state machine Kho CN → Bếp CN: `draft → confirmed` (cùng roof, không in_transit)
- [ ] Cho phép transfer ngược Bếp CN → Kho CN (giới hạn 24h)
- [ ] `consume_stock_for_order` resolve kitchen location, fallback về warehouse + log warning
- [ ] Retire `stock_issue(issue_type='kitchen_use')` — freeze insert mới, read-only history

## Documentation Maintenance

- [ ] Khi Inventory behavior thay đổi: update `docs/ref/inventory.md` + `inventory-sop.md` + `docs/modules/web-app.md` + `docs/worklog/inventory/adoption-matrix.md` cùng PR
- [ ] Khi triển khai phase tách tồn thật → `docs/plan/inventory-location-ledger.md` (seed → compatibility → dual-write → cutover)

## Deferred to Post-Pilot

- [ ] Automated E2E tests — POS→payment→stock critical path (P2, trước khi scale 3+ chi nhánh)
- [ ] Staging environment — Vercel Preview hoặc branch deploy (P2, trước external users)
- [ ] M7 payroll BHXH/PIT calc wiring (dùng Excel cho pilot < 5 nhân viên)
- [ ] M6 VAS journal entries hoàn chỉnh (export CSV → MISA AMIS cho pilot)
- [ ] Refunds table + flow
- [ ] M5-Ext S8 — yield factor + AP aging + consumption variance (chưa cần ở 30-50 SKU)
- [ ] Finish migrating 10 RPCs khỏi `auth_role()` (batches α4b/α4c)

## Post-v1.0 (Tier 2)

- [ ] Local-First Branch (mini PC + SQLite, offline POS/KDS)
- [ ] QR Self-Order (khách scan QR tại bàn)
- [ ] Loyalty / Vouchers
- [ ] CMS / CRM Foundation — xem [Sprint 8](../docs/plan/sprint-8.md)
- [ ] Advanced Analytics
- [ ] VNPay integration
- [ ] Employee portal full features (hiện placeholder)
