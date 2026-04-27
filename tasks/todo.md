# Current Tasks

> Active work only. Shipped history → `docs/plan/roadmap.md`. Updated: 2026-04-26.

## Module status (snapshot)

M0–M7 + Auth v2 + POS PWA + Realtime hardening + Shadcn primitive migration M1–M9 — **all SHIPPED**. External integrations (VietQR/Momo/MISA HĐĐT real APIs) blocked on credentials. Detail trong `docs/plan/roadmap.md`.

## Known issues

- [ ] P3: Login rate limit fail-open khi Upstash unreachable — documented design decision, cần observability
- [ ] 10 SECURITY DEFINER RPCs còn gọi `auth_role()` (legacy compat, không chặn ship — migrate dần qua batches α4b/α4c): `admin_update_profile`, `bump_kds_ticket`, `can_access_branch`, `close_fiscal_period`, `create_supplier_payment`, `gl_reconciliation`, `post_payroll_journal`, `recall_kds_ticket`, `set_branch_kind`, `toggle_profile_active`

## Pre-deploy fixes

- [ ] **Employee page WIP** (cần local DB): `pnpm db:types` regen → fix sai cast `as Type[]` trong `app/employee/{attendance,payslip,schedule}/page.tsx` (supabase-js trả FK relation thành array, không object)
- [ ] Inventory smoke pre-pilot theo `docs/runbooks/inventory/pre-release-qa.md`
- [ ] Uptime monitor on `/api/health` (UptimeRobot — ops, không phải code)
- [ ] Ops reconciliation query trước Momo go-live — payment/order desync surfacing trong /admin/finance
- [ ] Momo webhook atomic `complete_payment_and_consume_stock` RPC (khi M4 wired)

## Pilot-critical (blocked on external credentials)

- [ ] P0: Wire VietQR real bank API (merchant credentials)
- [ ] P0: Wire Momo real API (merchant credentials)
- [ ] P0: Wire MISA HĐĐT real API call (MISA credentials — pháp lý NĐ70/2025)
- [ ] P1: Momo webhook atomic RPC

## Branch Kitchen site split (Phase 2)

> Decision 2026-04-23 — tách tồn Kho CN / Bếp CN qua `inventory_locations`. See `docs/plan/inventory-location-ledger-phase2.md`.

- [x] Migration `20260417040000_inventory_locations_phase1.sql` + compat columns APPLIED
- [ ] Phase 2 dual-write + cutover
- [ ] Seed 1 `inventory_locations` kitchen/warehouse per branch (`is_default_consumption`)
- [ ] Rút gọn state machine Kho CN → Bếp CN: `draft → confirmed` (cùng roof, không in_transit)
- [ ] Implement intra-branch transfer một bước cho `Kho CN -> Bếp CN` (`Cấp bếp`) bằng RPC atomic riêng
- [ ] `consume_stock_for_order` phải resolve `default_consumption`; nếu thiếu thì fail hard/setup gate, không fallback silent
- [x] Retire `stock_issue(issue_type='kitchen_use')` — runtime CHECK đã chặn; docs active phải trỏ sang intra-branch transfer

## Doc maintenance reminders

- Khi Inventory behavior thay đổi → update `docs/ref/inventory.md` + `inventory-sop.md` + `docs/modules/web-app.md` + `docs/worklog/inventory/adoption-matrix.md` cùng PR
- Khi triển khai phase tách tồn thật → update `docs/plan/inventory-location-ledger.md`

## Deferred to post-pilot

- [ ] Automated E2E POS→payment→stock (P2, trước scale 3+ chi nhánh)
- [ ] Staging env / Vercel Preview (P2, trước external users)
- [ ] M7 BHXH/PIT calc wiring (Excel cho pilot <5 nhân viên)
- [ ] M6 VAS journal entries hoàn chỉnh (CSV → MISA AMIS cho pilot)
- [ ] Refunds table + flow
- [ ] M5-Ext S8 — yield factor + AP aging + consumption variance (chưa cần ở 30-50 SKU)
- [ ] Finish 10 RPCs khỏi `auth_role()` (batches α4b/α4c)

## Post-v1.0 (Tier 2)

- [ ] Local-First Branch (mini PC + SQLite, offline POS/KDS)
- [ ] QR Self-Order tại bàn
- [ ] Loyalty / Vouchers
- [ ] CMS / CRM Foundation — `docs/archive/plan/sprint-8.md`
- [ ] Advanced Analytics
- [ ] VNPay integration
- [ ] Employee portal full features
- [ ] **Native POS migration (PWA → Flutter Android)** — đánh giá khi pilot phát sinh: BT/USB printer fail >5%, cash drawer auto-pop, e-wallet native SDK > deeplink, scale ≥20 chi nhánh. Stepping stone: Capacitor wrap (~1-2 tuần) trước Flutter rewrite (3-6 tháng + 2× maintenance)
