# Roadmap — Cơm Tấm Má Tư

> Hệ thống Quản lý Vận hành Nhà hàng (Restaurant Operations Management System)
> Updated: 2026-04-24 | Structure: Module-based

## Product Identity

Cơm Tấm Má Tư là **ERP vận hành chuỗi nhà hàng** cho chuỗi cơm tấm.
Định hướng là gom foundation, executive reporting, và các workspace chuyên môn vào cùng một kiến trúc ERP theo chiều sâu F&B.
Không đi theo hướng CRM độc lập hay ERP đa ngành.

## Module Map

| #   | Module      | Scope                                                | Status  |
| --- | ----------- | ---------------------------------------------------- | ------- |
| M0  | Khung quản trị | ERP cockpit, foundation, executive reporting shell   | SHIPPED |
| M1  | Menu        | Categories, items, variants, modifiers, sides        | SHIPPED |
| M2  | POS         | Cart, table/zone, order submit, bill printing        | SHIPPED |
| M3  | KDS         | Realtime queue, bump/complete, station config        | SHIPPED |
| M4  | Payment     | Cash ✅, VietQR/Momo blocked on credentials          | PARTIAL |
| M5  | Stock       | Ingredients, recipes, procurement, GRN, CW+CK model  | SHIPPED |
| M6  | Finance     | Dashboard ✅, HĐĐT blocked on credentials, VAS stubs | PARTIAL |
| M7  | Nhân sự & tiền lương  | Attendance ✅, payroll calc incomplete               | PARTIAL |

**Feature specs (beyond module rows):**

- [M2-Ext: POS Order Lifecycle](m2-order-lifecycle.md) — thêm món sau submit, đồng bộ trạng thái KDS → dòng món, void/cancel/chuyển bàn, đặt lại (PLANNED)

## Pilot-Critical Backlog (blocked on external credentials)

Những việc cần làm trước khi test pilot với chi nhánh thật. Không phải features mới — là wire stubs đã có.

| #   | Task                                                          | Blocked on                       | Priority     |
| --- | ------------------------------------------------------------- | -------------------------------- | ------------ |
| P1  | Wire VietQR real bank API + polling UI trong POS              | Merchant credentials             | P0           |
| P2  | Wire Momo real API + atomic complete_payment RPC              | Merchant credentials + migration | P0           |
| P3  | Wire MISA HĐĐT real API call (M6)                             | MISA provider credentials        | P0 (pháp lý) |
| P4  | VietQR: Supabase realtime listener trong payment panel        | Depends on P1                    | P1           |
| P5  | Momo webhook: atomic `complete_payment_and_consume_stock` RPC | Migration + PR                   | P1           |

Post-pilot (defer):

| #   | Task                                    | Why defer                           |
| --- | --------------------------------------- | ----------------------------------- |
| D1  | M7 payroll BHXH/PIT calc wiring         | Use Excel for pilot (< 5 nhân viên) |
| D2  | M6 VAS journal entries                  | Export CSV → MISA AMIS for pilot    |
| D3  | Automated E2E tests (POS→payment→stock) | P2 before scaling to 3+ branches    |
| D4  | Staging environment                     | P2 before external users            |

Post-v1.0 (lên kế hoạch riêng):

- Local-First per Branch (mini PC + SQLite, offline-capable POS/KDS)
- QR Self-Order (khách tự order qua QR)
- Loyalty / Vouchers (tích điểm, khuyến mãi)
- CMS / CRM Foundation (nội dung marketing + hồ sơ khách + loyalty core)
- Advanced Analytics (phân tích nâng cao)

- [Sprint 8: CMS / CRM Foundation](sprint-8.md)

### Sprint 8: CMS / CRM Foundation

> Planned post-v1.0. Focus on customer retention and content operations without turning the product into a generic CRM/CMS platform.

**Scope:** customer profile registry, purchase history view, loyalty ledger, member tiers, vouchers, CMS content blocks, branch promos, media library, and publish workflow.

**Depends on:** M2 (POS/orders), M4 (payments/refunds), M6 (finance/revenue context for campaign analysis)

**Not included:** omnichannel inbox, marketing automation, arbitrary page builder, lead scoring, enterprise CRM workflows.

**Exit criteria:**

- [ ] CRM can attach a customer to a completed order
- [ ] Loyalty points are recorded in an append-only ledger
- [ ] Voucher issue/redeem flow works with audit trail
- [ ] CMS content can be drafted, previewed, published, and archived
- [ ] Branch-level marketing content can be targeted without cross-tenant leakage
- [ ] `/verify` + `/review` passes

## Sơ đồ phụ thuộc

```
M0 (Khung quản trị) ✅
M1 (Menu) ✅
  └── M2 (POS) ✅
      ├── M3 (KDS) ✅
      └── M4 (Payment) ⏳ Cash ✅, VietQR/Momo blocked
          ├── M5 (Stock) ✅
          ├── M6 (Finance) ⏳ Dashboard ✅, HĐĐT blocked
          └── M7 (Nhân sự & tiền lương) ⏳ Attendance ✅, payroll incomplete
```

## "Ready to Ship" — Định nghĩa chung

Mỗi module phải đạt đủ trước khi đánh dấu SHIPPED:

- [ ] Schema migrated & `pnpm db:types` đã chạy
- [ ] Server Actions có Zod validation
- [ ] UI pages hoạt động đầy đủ
- [ ] RLS policies tested
- [ ] `/verify` passes (`pnpm typecheck && pnpm lint && pnpm build`)
- [ ] `/review` passes
- [ ] Integration tested với modules đã ship

---

## M0: Khung quản trị ✅ SHIPPED

> Hoàn thành: 2026-04-03

**Scope:** ERP cockpit cấp HQ, sidebar navigation, foundation hệ thống, quản lý chi nhánh, quản lý nhân sự, executive reporting shell.

**Không bao gồm:** Thao tác nghiệp vụ chi tiết theo domain (đặt hàng, thanh toán, kho...). Các phần đó nằm ở workspace chuyên trách.

**Tables owned:** tenants, branches, profiles, system_settings

| Session | Task                   | Status |
| ------- | ---------------------- | ------ |
| S1      | Admin layout + sidebar | ✅     |
| S2      | Branch CRUD + settings | ✅     |
| S3      | Staff management       | ✅     |

---

## M1: Menu ✅ SHIPPED

> Hoàn thành: 2026-04-03

**Scope:** Quản lý thực đơn — danh mục, món ăn, biến thể (size/loại), modifier (thêm trứng...), sides (canh, nước...).

**Không bao gồm:** Giá theo chi nhánh, giá theo giờ, menu theo mùa.

**Tables owned:** menu_categories, menu_items, menu_item_variants, menu_item_modifiers, menu_item_available_sides

| Session | Task                          | Status |
| ------- | ----------------------------- | ------ |
| S4      | Menu CRUD + sides             | ✅     |
| S5      | Tables & zones (branch_zones) | ✅     |
| S6      | Polish + /review              | ✅     |

---

## Sprint Hotfix

> Sửa lỗi phân quyền phát hiện sau khi ship M0+M1.

| #   | Task                                                                                                   | Status |
| --- | ------------------------------------------------------------------------------------------------------ | ------ |
| H1  | Settings ACL: thêm branch_manager + area_manager                                                       | ✅     |
| H2  | Tables page: branch_manager chỉ thấy branch mình                                                       | ✅     |
| H3  | area_manager scope: tạo `areas` + `area_branches` mapping, area_manager chỉ thấy branches mình quản lý | ✅ Hoàn thành (qua Auth v2) |

### H3: area_manager branch scope ✅ SHIPPED-VIA-AUTH-V2

> **Hoàn thành khác cách scope ban đầu.** Auth v2 (2026-04-22/23) giải area scoping qua per-branch `staff_permissions` grants (backfilled từ `area_branches` mapping), không cần thêm RLS area-filtering riêng. Xem `docs/modules/auth.md` + `tasks/lessons.md` (memory).

**Actual implementation landed:**

- [x] Migration `20260406220000_area_manager_scoping.sql`: bảng `areas` (id, tenant_id, name) + `area_branches` (area_id, branch_id) + `profiles.area_id` FK
- [x] JWT claim `area_id` + helper `auth_area_id()` (`20260408170000_area_manager_jwt_fix.sql`)
- [x] Auth v2 cutover: area_manager scope enforce qua per-branch grants trong `staff_permissions`, không cần RLS area-filtering table-by-table
- [x] `admin_update_profile()` + các RPC staff-management tôn trọng area boundary
- [x] `/verify` + `/review` passes

**Known defer** (không phải chặn pilot):

- [ ] Admin UI quản lý `areas` (owner/super_manager) — chưa có surface; thêm khi mở rộng > 3 chi nhánh

---

## M2: POS — POS

> Status: DONE | Depends: M0, M1 | Hoàn thành: 2026-04-06
> North Star: "Order → gửi bếp — dưới 30 giây"
> **M2-Ext (planned):** [POS Order Lifecycle](m2-order-lifecycle.md) — lifecycle sau khi đã gửi đơn (thêm món, hủy, chuyển bàn…)

**Scope:** Giao diện bán hàng tại quầy. Nhân viên chọn món, chọn bàn, gửi order. In bill. Thanh toán tiền mặt cơ bản.

**Không bao gồm:** Thanh toán điện tử (M4), self-order (Post-v1.0).

**Tables owned:** orders, order_items, order_status_history, pos_terminals, pos_sessions

**Routes:** `/br/[branchId]/pos`

| Session | Task                           | Tables                                    | Status |
| ------- | ------------------------------ | ----------------------------------------- | ------ |
| S1      | Order schema + state machine   | orders, order_items, order_status_history | ✅     |
| S2      | POS terminal + sessions        | pos_terminals, pos_sessions               | ✅     |
| S3      | Menu browse + cart UI          | —                                         | ✅     |
| S4      | Table selection + order submit | —                                         | ✅     |
| S5      | Bill printing + cash register  | printer_configs                           | ✅     |

**Ship criteria:**

- [x] Tạo order với món + biến thể + modifier
- [x] Chọn bàn/mang về
- [x] Gửi order → order xuất hiện ở KDS
- [x] In bill
- [x] Thanh toán tiền mặt
- [x] `/verify` + `/review` passes

---

## M3: KDS — KDS

> Status: SHIPPED | Depends: M2 | Hoàn thành: 2026-04-06
> North Star: "Bếp thấy order realtime, bump xong → waiter biết ngay"

**Scope:** Màn hình bếp hiển thị order realtime. Chef bump từng món khi xong. Waiter thấy trạng thái.

**Không bao gồm:** Recipe instructions, food prep planning.

**Tables owned:** kds_stations, kds_station_categories, kds_tickets

**Routes:** `/br/[branchId]/kds`

| Session | Task                   | Tables                               |
| ------- | ---------------------- | ------------------------------------ | --- |
| S1      | KDS station config     | kds_stations, kds_station_categories | ✅  |
| S2      | Realtime order queue   | kds_tickets                          | ✅  |
| S3      | Bump/complete + alerts | —                                    | ✅  |

**Ship criteria:**

- [x] Order từ POS xuất hiện realtime trên KDS
- [x] Chef bump từng món → cập nhật order status
- [x] Bump hết → order chuyển "ready"
- [x] Station categories filter đúng món
- [x] `/verify` + `/review` passes

---

## M4: Payment — Thanh toán

> Status: PARTIAL | Depends: M2 | Cash shipped: 2026-04-06
> VietQR/Momo blocked on merchant credentials
> Ref: `docs/ref/third-party-integrations.md`

**Scope:** Các phương thức thanh toán: tiền mặt, VietQR (chuyển khoản), Momo. Xử lý hoàn tiền. Đối soát cuối ngày.

**Không bao gồm:** VNPay, HĐĐT (→ M6).

**Tables owned:** payments, payment_webhooks, refunds

| Session | Task                      | Tables           | Status |
| ------- | ------------------------- | ---------------- | ------ |
| S1      | Payment schema            | payments         | ✅     |
| S2      | VietQR integration        | —                | ✅     |
| S3      | Momo integration          | payment_webhooks | ✅     |
| S4      | Refunds                   | refunds          | ✅     |
| S5      | End-of-day reconciliation | —                | ✅     |

**Ship criteria:**

- [x] Thanh toán tiền mặt
- [ ] VietQR real bank API (blocked on merchant credentials)
- [ ] Momo real API + webhook (blocked on merchant credentials)
- [x] Hoàn tiền (partial + full)
- [x] Đối soát cuối ngày chính xác
- [x] `/cso` passes (sensitive: payments)
- [x] `/verify` + `/review` passes

---

## M5: Stock — Kho & Mua hàng

> Status: SHIPPED | Depends: M4 | Hoàn thành: 2026-04-06
> Ref: `docs/ref/inventory.md`

**Scope:** Quản lý nguyên liệu, công thức (recipe), tồn kho, nhập kho (GRN), đặt hàng nhà cung cấp (PO), đối chiếu hóa đơn nhà cung cấp (3-way matching), stocktake, stock transfers, và production hub cho bếp trung tâm.

**M5-Ext đang vận hành:** `branch_kind` (`headquarters` / `branch` / `central_kitchen`), `item_kind` (`raw_material` / `finished_good`), `production_recipes`, `production_orders`, và luồng pilot `HQ -> Bếp trung tâm -> Chi nhánh`.

**Không bao gồm:** generalized multi-warehouse, nhiều bếp trung tâm, hoặc mạng kho đa tầng tổng quát.

**Tables owned:** ingredients, recipes, stock_levels, stock_movements, suppliers, purchase_orders, purchase_order_items, goods_received_notes, grn_items, supplier_invoices, stock_transfers, stock_transfer_items, stocktake_sessions, stocktake_lines, production_recipes, production_orders, production_order_items

| Session | Task                            | Tables                                           | Status |
| ------- | ------------------------------- | ------------------------------------------------ | ------ |
| S1      | Ingredients + recipes           | ingredients, recipes                             | ✅     |
| S2      | Stock levels + movements        | stock_levels, stock_movements                    | ✅     |
| S3      | Suppliers + Purchase Orders     | suppliers, purchase_orders, purchase_order_items | ✅     |
| S4      | GRN + auto stock update         | goods_received_notes, grn_items                  | ✅     |
| S5      | Supplier invoices + 3-way match | supplier_invoices                                | ✅     |
| S6      | Transfers + stocktake           | stock_transfers, stock_transfer_items, stocktake_sessions, stocktake_lines | ✅ |
| S7      | Inventory reports + AP tracking | stock_movements, supplier_invoices               | ✅     |
| S8      | Central kitchen production hub  | production_recipes, production_orders, production_order_items | ✅ |

**Ship criteria:**

- [x] CRUD nguyên liệu + công thức
- [x] Tồn kho tự động cập nhật khi GRN
- [x] PO → GRN → Supplier Invoice flow hoàn chỉnh
- [x] 3-way matching hoạt động
- [x] HQ -> Bếp trung tâm -> Chi nhánh chạy thật bằng transfer + production order
- [x] Finished goods + central kitchen production đang hoạt động trong pilot
- [x] `/verify` + `/review` passes

---

## M6: Finance — Tài chính & HĐĐT

> Status: PARTIAL | Depends: M4, M5
> Dashboard ✅, HĐĐT blocked on MISA credentials, VAS journal stubs only
> Ref: `docs/ref/einvoice-tax.md`
> North Star: "Sổ sách đúng chuẩn VAS, HĐĐT tự động, kế toán không cần Excel."

**Scope:** Hóa đơn điện tử (HĐĐT), VAT, dashboard doanh thu, báo cáo tài chính theo chuẩn VAS, hệ thống tài khoản kế toán.

**Không bao gồm:** Phân tích nâng cao (Post-v1.0).

**Tables owned:** tax_invoices, chart_of_accounts, journal_entries, journal_entry_lines, audit_logs, mv_daily_revenue, mv_top_items, mv_food_cost

| Session | Task                                    | Tables                               | Status |
| ------- | --------------------------------------- | ------------------------------------ | ------ |
| S1      | HĐĐT schema                             | tax_invoices                         | ✅     |
| S2      | HĐĐT UI + MISA provider                 | —                                    | ✅     |
| S3      | Revenue dashboard                       | mv_daily_revenue, mv_top_items       | ✅     |
| S4      | Food cost MV + Audit logs               | mv_food_cost, audit_logs             | ✅     |
| S5      | Chart of accounts (VAS)                 | chart_of_accounts                    | ✅     |
| S6      | Journal entries                         | journal_entries, journal_entry_lines | ✅     |
| S7      | Financial statements (BCTC)             | —                                    | ✅     |
| S8      | MV refresh + auto-journal + integration | —                                    | ✅     |

**Ship criteria:**

- [ ] HĐĐT xuất/hủy hoạt động với MISA real API (blocked on credentials)
- [x] Dashboard doanh thu chính xác
- [x] Food cost report đúng
- [x] Hệ thống tài khoản VAS
- [x] Bút toán kế toán (journal entries)
- [x] BCTC theo chuẩn VAS (CĐKT, KQKD, VAT summary)
- [x] Reports hub links
- [ ] `/cso` passes (sensitive: finance)
- [x] `/verify` + `/review` passes

---

## M7: Nhân sự & tiền lương — Nhân sự & Lương

> Status: PARTIAL | Depends: M6
> Attendance ✅, payroll calc incomplete (BHXH/PIT deferred to post-pilot)
> Ref: `docs/ref/labor-contracts.md`, `docs/ref/payroll-pit.md`
> North Star: "Tính lương chính xác, BHXH đúng luật, nhân viên tự xem payslip."

**Scope:** Hồ sơ nhân viên (mở rộng từ profiles), hợp đồng lao động, ca làm, chấm công, tính lương, thuế TNCN, BHXH.

**Không bao gồm:** Tuyển dụng, đánh giá hiệu suất.

**Tables owned:** employees, shifts, shift_assignments, attendance_records, employment_contracts, payroll_periods, payroll_entries

| Session | Task                              | Tables                                        | Status |
| ------- | --------------------------------- | --------------------------------------------- | ------ |
| S1      | Employee records                  | employees                                     | ✅     |
| S2      | Shifts + attendance tables        | shifts, shift_assignments, attendance_records | ✅     |
| S3      | Employment contracts              | employment_contracts                          | ✅     |
| S4      | Attendance management UI          | —                                             | ✅     |
| S5      | Payroll schema + PIT calc logic   | payroll_periods, payroll_entries              | ✅     |
| S6      | Payroll processing UI             | —                                             | ✅     |
| S7      | Payroll reports + employee portal | —                                             | ✅     |

**Ship criteria:**

- [x] Quản lý hồ sơ nhân viên đầy đủ
- [x] Lập ca, chấm công (tables)
- [x] Hợp đồng lao động + auto-sync insurance_base
- [x] UI chấm công (summary + detail view, status edit)
- [ ] Tính lương + BHXH + thuế TNCN chính xác (deferred — use Excel for pilot)
- [x] Bảng lương hàng tháng (approval flow)
- [x] Employee portal (payslip + attendance)
- [x] Payroll reports (annual PIT summary, insurance)
- [ ] `/cso` passes (sensitive: payroll)
- [x] `/verify` + `/review` passes

---

## Milestone: v1.0.0 PILOT LAUNCH

> Sau khi M0–M6 stable (M7 có thể ship song song hoặc sau pilot)

**Pilot checklist:**

- [x] M0–M4 SHIPPED (vận hành cơ bản)
- [x] M5 SHIPPED (quản lý kho)
- [ ] M6 COMPLETE (HĐĐT + VAS accounting — bắt buộc pháp lý)
- [ ] M7 COMPLETE (Nhân sự & tiền lương — BHXH + PIT)
- [ ] `/qa` — full QA test
- [ ] `/cso` — sprint-level security review
- [ ] `/retro` — retrospective
- [ ] `/ship` — merge → push → PR → deploy
- [ ] Live verification tại 1 chi nhánh

---

## M5-Ext: Stock Enhancement — Kho Hàng Nâng Cao

> Status: APPROVED | Depends: M5 (SHIPPED)
> Plan: `docs/plan/m5-stock-enhancement.md`
> North Star: "Không bao giờ hết sườn, không bao giờ mua đắt."

**Context:** 30-50 SKU, 1 người đặt hàng qua Zalo, chưa bao giờ kiểm kê, food cost ước tính sơ bộ.

### Phase 0: "Tin Được Con Số" (4 sessions)

| Session | Task                                        | Tables                              | Status |
| ------- | ------------------------------------------- | ----------------------------------- | ------ |
| S1      | Stocktake migration + RPC + Server Actions  | stocktake_sessions, stocktake_lines | DONE   |
| S2      | Stocktake UI + Reorder alerts               | —                                   | DONE   |
| S3      | Expiry alerts + GRN temperature + write-off | —                                   | DONE   |
| S4      | Polish + integration test + verify          | —                                   | DONE   |

### Phase 1: "Mua Hàng Thông Minh" (3+1 sessions)

| Session | Task                                                  | Tables | Status                                    |
| ------- | ----------------------------------------------------- | ------ | ----------------------------------------- |
| S5      | Auto-suggest PO quantities                            | —      | DONE (yield chưa có)                      |
| S6      | Price intelligence (alerts + history)                 | —      | DONE (AP tracking chưa có)                |
| S7      | Reports + in-transit                                  | —      | DONE (AP aging + consumption var chưa có) |
| S8      | §8/§9 completion: yield + AP + reports page + RPC fix | —      | DEFERRED post-pilot                       |

### Phase 2: Scale When Needed (HOLD)

**Price Management (Tier 1 — cần để COGS đúng):**

- `vendor_price_list` với `valid_from/to` — lịch sử giá hợp đồng theo NCC/SKU, hỗ trợ ngoại tệ (trigger: owner bắt đầu đàm phán giá định kỳ với NCC)
- Price Variance detection tại PO — so sánh giá PO vs giá HĐ, tolerance theo nhóm hàng, approval workflow (trigger: cùng lúc với `vendor_price_list`)
- 3-Way Matching giá tại Invoice — Invoice Price vs PO Price, exception flow khi vượt tolerance (trigger: kế toán phát hiện NCC bill sai giá)

**Price Management (Tier 2 — cho báo cáo):**

- Recipe COGS auto-recalculate khi WA thay đổi + Recipe Cost History (trigger: GĐ muốn theo dõi FC% theo thời gian)
- FC% Impact Alert khi giá nguyên liệu làm FC% thay đổi > 2% (trigger: cùng với recipe recalc)

**Các tính năng khác:**

- Batch/Lot tracking (trigger: sự cố ATTP)
- Purchase Request workflow (trigger: >8 chi nhánh)
- Supplier scoring (trigger: owner request)
- Debit/Credit Note (trigger: NCC trả hàng thường xuyên)
- Multi-level BOM (trigger: menu có bán thành phẩm)

**Ship criteria (Phase 0):** ✅ ALL DONE

- [x] Stocktake flow end-to-end (create → count → complete → adjustments)
- [x] Reorder alerts dashboard (stock < reorder_point)
- [x] Expiry alerts (D-7 yellow, D-3 red)
- [x] `/verify` + `/review` passes

**Ship criteria (Phase 1 — S5-S7):** ✅ Core DONE

- [x] Auto-suggest PO quantities (avg daily consumption × lead time)
- [x] Price deviation alerts (>5% from avg of last 3 POs)
- [x] Stock movement report (period-based, by ingredient + by branch)
- [x] In-transit visibility on stock dashboard
- [x] Transfer note print template (@media print)
- [x] `/verify` passes

**Ship criteria (S8 — §8/§9 completion):** DEFERRED post-pilot

> **Why deferred:** Pilot chạy với 30-50 SKU, 1 bếp trung tâm. Yield factor và AP tracking chưa cần thiết ở quy mô này — pilot dùng manual tracking + Excel. Khi scale > 3 chi nhánh hoặc owner yêu cầu food cost % chính xác, bật S8.

- [ ] Recipe yield_factor + consume_stock_for_order RPC fix (§9)
- [ ] Supplier payment_terms + invoice due_date/payment_status (§8)
- [ ] AP Aging report (§8)
- [ ] Consumption variance report (§9)
- [ ] Reports page + sub-nav "Báo cáo" link
- [ ] `/verify` passes

---

## Post-v1.0 (Tier 2 — lên kế hoạch riêng)

| Feature            | Mô tả                                                          |
| ------------------ | -------------------------------------------------------------- |
| Local-First Branch | Mini PC + SQLite per branch, offline POS/KDS, sync mỗi 1-5 min |
| QR Self-Order      | Khách scan QR tại bàn, tự chọn món, tự thanh toán              |
| Loyalty / Vouchers | Tích điểm, voucher, khuyến mãi                                 |
| Advanced Analytics | Phân tích xu hướng, dự đoán nhu cầu                            |
| VNPay              | Thêm cổng thanh toán VNPay                                     |
| Multi-warehouse    | Quản lý nhiều kho                                              |
| Sub-domain routing | pos.comtammatu.com, kds.comtammatu.com (khi tách deploy)       |

---

## Post-v1.0 Structural Milestones

| Milestone     | Date       | Summary                                                                                                                                     |
| ------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Inventory UX  | 2026-04-09 | Task-queue-first inventory dashboard, HQ-only procurement hub, branch "Cấp bếp" labeling, shared data-table + touch-first mobile components |
| Shadcn M1-M9  | 2026-04-17→24 | Empty/Spinner/Form(RHF+zod+Field)/Item/InputGroup/ToggleGroup/Combobox/Sidebar+Breadcrumb/Kbd shortcuts — full primitive rollout          |
| Auth v2 α1-α5 | 2026-04-22→23 | Position ⟂ Permission model; 100% RLS cutover; GRN confirm atomic with PO update; 10 legacy-RPCs remain on `auth_role()`                   |
| Inventory CW  | 2026-04-24 | Retire HQ, adopt multi-instance Kho Tổng (`central_warehouse`) + existing Bếp trung tâm (`central_kitchen`); transfer direction triggers   |
| POS/KDS polish| 2026-04-18→24 | Charge sides + per-item notes, print agent pilot, branch-scoped settings, VietQR per-tenant config, printer ACL hardening                  |

## Version History

| Version | Date       | What                                                             |
| ------- | ---------- | ---------------------------------------------------------------- |
| v0.1.0  | 2026-04-01 | Foundation (auth, proxy, RLS, monorepo)                          |
| v0.1.1  | 2026-04-02 | Security hardening (RLS, DML lockdown)                           |
| M0+M1   | 2026-04-03 | Khung quản trị + Menu shipped (ex Sprint 1)                         |
| M2      | 2026-04-06 | POS shipped — order, cart, bill, cash                            |
| M3      | 2026-04-06 | KDS shipped — station config, realtime, bump/complete            |
| M4      | 2026-04-06 | Payment — cash, refunds (VietQR/Momo blocked on credentials)     |
| M5      | 2026-04-06 | Stock — ingredients, recipes, stock levels                       |
| M6      | 2026-04-06 | Finance — revenue dashboard, VAS, BCTC                           |
| M7      | 2026-04-06 | Nhân sự & tiền lương — employees, shifts, attendance, payroll    |
| v1.0.0  | 2026-04-07 | All modules shipped, QA verified, deployed to Vercel             |
| UX-A    | 2026-04-09 | Inventory UX redesign Session A — PO + GRN + Invoice             |
| UX-B    | 2026-04-09 | Inventory UX redesign Session B — Transfers + Stocktake + Issues |
| UX-C    | 2026-04-10 | Inventory UX redesign Session C — Catalog + Support pages        |
| Auth v2 | 2026-04-22 | Position↔Permission model + Server Action migration              |
| CW/CK   | 2026-04-24 | Retire HQ, multi-instance Kho Tổng + Bếp Trung Tâm (D000)        |
