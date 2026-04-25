# Current Tasks

> Active work items for the current session/phase.
> Updated: 2026-04-25

## Module Status

**Shipped** (M0–M7 all core features live; external integrations blocked on credentials):

- [x] M0: Admin Shell — layout, sidebar, branches, staff, settings
- [x] M1: Menu — categories, items, variants, modifiers, sides
- [x] M2: POS — cart, table/zone, order submit, bill printing, charge sides, per-item notes
- [x] M2-Ext PR3: Multi-order per dine-in table (Gộp bàn Option A); `transfer_order_table` accepts target ∈ (available, occupied) — migration `20260429100000`. Cancel/void reason ≥5 chars
- [x] M3: KDS — realtime queue, bump/complete, station config, keyboard shortcuts
- [x] M4: Payment — cash ✅ (VietQR/Momo wire blocked on merchant credentials)
- [x] M5: Stock — ingredients, recipes, stock levels, procurement, GRN, stocktake, transfers, central kitchen production hub, supplier returns/credit notes
- [x] M5-Ext: Central kitchen production live; HQ retired → multi-instance Kho Tổng (`central_warehouse`) + Bếp trung tâm (`central_kitchen`). See [D000](../docs/plan/decisions.md#d000)
- [x] M6: Finance — revenue dashboard, food cost, VAS chart + journals, BCTC (MISA HĐĐT wire blocked on credentials)
- [x] M7: Nhân sự — employees, shifts, attendance, employment contracts, payslip, employee portal (BHXH/PIT calc deferred to post-pilot)
- [x] Auth v2: Position ⟂ Permission model, 100% RLS cutover (verified 2026-04-23). `has_permission()` / `has_permission_any()` source of truth
- [x] Branch-scoped settings, VietQR per-tenant config, printer ACL hardening, print agent pilot
- [x] **PWA cho POS** (shipped 2026-04-25, commits `aabf7b1` + `73930c5` + `8af3f57`):
  - Per-branch installable manifest (`/br/[branchId]/pos/manifest.webmanifest` Route Handler, `id`/`scope`/`start_url` branch-scoped)
  - Serwist service worker active (`public/sw.js` 51 KB, build switched to `next build --webpack` — turbopack incompat documented in commit `73930c5`)
  - Explicit allowlist `runtimeCaching`: NetworkOnly mutations / RSC / Next-Action / Supabase REST/Auth/host; CacheFirst hashed Next static; SWR images/icons/fonts; NetworkFirst HTML 3s
  - PWA Provider + toolbar (`useIsOnline`, `useInstallPrompt`) — offline banner + "Cài đặt POS" button (auto-hide khi online + chưa có install prompt)
  - BillReceipt `canConfirmPaid` gated by `isOnline`; non-cash select khi offline → toast block (defense for HDDT-PAYMENT-FIRST-FAILSOFT-ORPHAN)
- [x] **Realtime hardening** (shipped 2026-04-25, commit `8af3f57`): `useRealtimeChannel` helper awaits `auth.getSession()` + `realtime.setAuth()` trước `.subscribe()`; 6 callsites migrated (notifications, KDS, POS order sync, order detail, printer status, bill receipt). Fixes silent broadcast drop từ `claims_role='anon'` race

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

## Next Local-DB Session Queue

> Cần local env + DB connection để chạy. Schedule khi ngồi máy có kết nối Supabase dev.

- [ ] **Employee page WIP fix** (item ở "Pre-deploy Fixes" bên dưới): cast `as Type[]` sai trong `app/employee/{attendance,payslip,schedule}/page.tsx`. Cần `pnpm db:types` regen trước, rồi fix type signature hoặc map/normalize FK relations. Scope nhỏ, ~30-60 phút.
- [ ] **POS perf Tier 2 RLS migration** (item ở "Pre-deploy Fixes" bên dưới): init-plan fix + dual-permissive consolidation 7 tables + index `order_items.variant_id`. Cần DB cho EXPLAIN before/after + advisor diff + persona test matrix. Risk medium, tách PR riêng. ~1-2 ngày.

## Pre-deploy Fixes (pending)

- [ ] Uptime monitor on `/api/health` (UptimeRobot — ops task, không phải code)
- [ ] Inventory: chạy manual smoke theo `docs/runbooks/inventory/pre-release-qa.md` trước pilot
- [ ] Momo webhook: atomic `complete_payment_and_consume_stock` RPC (migration needed when M4 wired)
- [ ] Ops reconciliation query (before Momo go-live) — payment/order desync surfacing in /admin/finance
- [ ] **POS perf Tier 2 — RLS migration** (filed 2026-04-25 sau Tier 1). Single migration file, scope đóng:
  - Rewrite `staff_permissions_select_self`: `auth.uid()` → `(select auth.uid())` (init-plan fix per advisor `0003_auth_rls_initplan`)
  - Hợp nhất dual-permissive SELECT trên 7 table: `staff_permissions`, `tables`, `branches`, `pos_terminals`, `menu_item_variants`, `menu_item_modifiers`, `menu_item_available_sides` (giữ regression rule [2026-04-22] **RLS-PERMISSIVE-POLICIES-OR** — không widen access)
  - `CREATE INDEX CONCURRENTLY ON order_items (variant_id)` (FK unindexed)
  - **Required artifacts trước merge**: persona test matrix (owner/cashier/waiter/disabled) cho 7 table, EXPLAIN before/after cho `staff_permissions` policy, `.insert().select()` audit cho 7 table, advisor diff (8 lints clear), down-migration trong `supabase/migrations/_rollback/`
  - Risk: medium. Tách PR riêng khỏi Tier 1, không bundle.
- [ ] **`pnpm db:types` regen** — finance/tax-invoice RPC types previously missing; verify still missing or regenerated cleanly. Latest typecheck (2026-04-25, commit `8af3f57`) passed silent — possibly resolved out-of-band. Re-check before next finance change.
- [ ] **Pre-existing employee page WIP** (sau khi `pnpm db:types`): `app/employee/{attendance,payslip,schedule}/page.tsx` cast `as <Type>[]` đang sai — supabase-js trả foreign-key relation thành array, không object. Fix bằng cách đổi type signature hoặc map/normalize trước cast.

## Pilot-Critical Backlog (blocked on external credentials)

- [ ] P0: Wire VietQR real bank API (merchant credentials)
- [ ] P0: Wire Momo real API (merchant credentials)
- [ ] P0: Wire MISA HĐĐT real API call (MISA provider credentials — pháp lý NĐ70/2025)
- [x] P1: VietQR payment status — Supabase realtime listener (BillReceipt subscribes to `orders` + `payments` postgres_changes via `useRealtimeChannel`, shipped commit `8af3f57`)
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
- [ ] **Native POS migration (PWA → Flutter Android)** — đánh giá khi pilot phát sinh:
  - Bluetooth/USB thermal printer fail rate >5% (Web Bluetooth/WebUSB không reliable; Xprinter/Bixolon dominate VN F&B)
  - Cash drawer auto-pop cần direct hardware control
  - MoMo/ZaloPay/VNPay native SDK UX > deeplink
  - Scale ≥20 chi nhánh với hardware đa dạng
  - **Stepping stone**: Capacitor wrap (~1-2 tuần, giữ Next.js codebase) trước khi cân nhắc full Flutter rewrite (3-6 tháng + 2× maintenance). Capacitor đủ cho 95% native peripheral cases.
  - Backend Supabase dùng chung qua `supabase_flutter` SDK — không cần API rewrite
