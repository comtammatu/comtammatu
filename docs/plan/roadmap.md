# Roadmap — Cơm Tấm Má Tư

> Hệ thống Quản lý Vận hành Nhà hàng (Restaurant Operations Management System)
> Updated: 2026-04-10 | Structure: Module-based

## Product Identity

Cơm Tấm Má Tư là **phần mềm quản lý vận hành nhà hàng** cho chuỗi cơm tấm.
Không phải CRM, không phải ERP tổng hợp. Mỗi module giải quyết một bài toán cụ thể trong vận hành nhà hàng.

## Module Map

| #   | Module      | Scope                                                | Status  |
| --- | ----------- | ---------------------------------------------------- | ------- |
| M0  | Admin Shell | Layout, sidebar, branches, staff, settings           | SHIPPED |
| M1  | Menu        | Categories, items, variants, modifiers, sides        | SHIPPED |
| M2  | POS         | Cart, table/zone, order submit, bill printing        | SHIPPED |
| M3  | KDS         | Realtime queue, bump/complete, station config        | SHIPPED |
| M4  | Payment     | Cash, VietQR, Momo, refunds, reconciliation          | SHIPPED |
| M5  | Stock       | Ingredients, recipes, stock levels, procurement, GRN | SHIPPED |
| M6  | Finance     | HĐĐT, VAT, dashboard, reports, VAS accounting        | DONE    |
| M7  | HR/Payroll  | Employees, shifts, attendance, payroll, PIT          | DONE    |

**Feature specs (beyond module rows):**

- [M2-Ext: POS Order Lifecycle](m2-order-lifecycle.md) — thêm món sau submit, đồng bộ trạng thái KDS → dòng món, void/cancel/chuyển bàn, đặt lại (PLANNED)

Post-v1.0 (lên kế hoạch riêng):

- Local-First per Branch (mini PC + SQLite, offline-capable POS/KDS)
- QR Self-Order (khách tự order qua QR)
- Loyalty / Vouchers (tích điểm, khuyến mãi)
- Advanced Analytics (phân tích nâng cao)

## Dependency Graph

```
M0 (Admin Shell) ✅
M1 (Menu) ✅
  └── M2 (POS) ✅
      ├── M3 (KDS) ✅
      └── M4 (Payment) ✅
          ├── M5 (Stock) ✅
          ├── M6 (Finance) ✅
          └── M7 (HR/Payroll) ✅
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

## M0: Admin Shell ✅ SHIPPED

> Shipped: 2026-04-03

**Scope:** Layout admin, sidebar navigation, quản lý chi nhánh, quản lý nhân sự, cài đặt hệ thống.

**Không bao gồm:** Business logic (đặt hàng, thanh toán, kho...).

**Tables owned:** tenants, branches, profiles, system_settings

| Session | Task                   | Status |
| ------- | ---------------------- | ------ |
| S1      | Admin layout + sidebar | ✅     |
| S2      | Branch CRUD + settings | ✅     |
| S3      | Staff management       | ✅     |

---

## M1: Menu ✅ SHIPPED

> Shipped: 2026-04-03

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
| H3  | area_manager scope: tạo `areas` + `area_branches` mapping, area_manager chỉ thấy branches mình quản lý | TODO   |

### H3: area_manager branch scope

Hiện tại `area_manager` có `branch_id: null` trong JWT → thấy toàn bộ tenant (spec ghi "tenant-wide temporary").

**Cần implement:**

- [ ] Migration: tạo bảng `areas` (id, tenant_id, name) + `area_branches` (area_id, branch_id)
- [ ] Migration: thêm `area_id` FK vào `profiles` cho area_manager
- [ ] RLS policies cho `areas` + `area_branches`
- [ ] Server-side: query branches qua `area_branches` mapping khi role = area_manager
- [ ] Update `admin_update_profile()` RPC: area_manager chỉ quản lý staff trong branches thuộc area mình
- [ ] UI: quản lý areas (owner/super_manager only)
- [ ] `/verify` + `/review` passes

---

## M2: POS — Point of Sale

> Status: DONE | Depends: M0, M1 | Shipped: 2026-04-06
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

## M3: KDS — Kitchen Display System

> Status: SHIPPED | Depends: M2 | Shipped: 2026-04-06
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

> Status: SHIPPED | Depends: M2 | Shipped: 2026-04-06
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

- [x] Thanh toán tiền mặt + VietQR + Momo
- [x] Hoàn tiền (partial + full)
- [x] Đối soát cuối ngày chính xác
- [x] `/cso` passes (sensitive: payments)
- [x] `/verify` + `/review` passes

---

## M5: Stock — Kho & Mua hàng

> Status: SHIPPED | Depends: M4 | Shipped: 2026-04-06
> Ref: `docs/ref/inventory.md`

**Scope:** Quản lý nguyên liệu, công thức (recipe), tồn kho, nhập kho (GRN), đặt hàng nhà cung cấp (PO), đối chiếu hóa đơn nhà cung cấp (3-way matching).

**Không bao gồm:** Quản lý kho thành phẩm, multi-warehouse.

**Tables owned:** ingredients, recipes, stock_levels, stock_movements, suppliers, purchase_orders, purchase_order_items, goods_received_notes, grn_items, supplier_invoices

| Session | Task                            | Tables                                           | Status |
| ------- | ------------------------------- | ------------------------------------------------ | ------ |
| S1      | Ingredients + recipes           | ingredients, recipes                             | ✅     |
| S2      | Stock levels + movements        | stock_levels, stock_movements                    | ✅     |
| S3      | Suppliers + Purchase Orders     | suppliers, purchase_orders, purchase_order_items | ✅     |
| S4      | GRN + auto stock update         | goods_received_notes, grn_items                  | ✅     |
| S5      | Supplier invoices + 3-way match | supplier_invoices                                | ✅     |

**Ship criteria:**

- [x] CRUD nguyên liệu + công thức
- [x] Tồn kho tự động cập nhật khi GRN
- [x] PO → GRN → Supplier Invoice flow hoàn chỉnh
- [x] 3-way matching hoạt động
- [x] `/verify` + `/review` passes

---

## M6: Finance — Tài chính & HĐĐT

> Status: DONE | Depends: M4, M5
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

- [x] HĐĐT xuất/hủy hoạt động với provider
- [x] Dashboard doanh thu chính xác
- [x] Food cost report đúng
- [x] Hệ thống tài khoản VAS
- [x] Bút toán kế toán (journal entries)
- [x] BCTC theo chuẩn VAS (CĐKT, KQKD, VAT summary)
- [x] Reports hub links
- [ ] `/cso` passes (sensitive: finance)
- [x] `/verify` + `/review` passes

---

## M7: HR/Payroll — Nhân sự & Lương

> Status: DONE | Depends: M6
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
- [x] Tính lương + BHXH + thuế TNCN chính xác
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
- [ ] M7 COMPLETE (HR/Payroll — BHXH + PIT)
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
| S8      | §8/§9 completion: yield + AP + reports page + RPC fix | —      | TODO                                      |

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

**Ship criteria (S8 — §8/§9 completion):** TODO

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

## Version History

| Version | Date       | What                                                             |
| ------- | ---------- | ---------------------------------------------------------------- |
| v0.1.0  | 2026-04-01 | Foundation (auth, proxy, RLS, monorepo)                          |
| v0.1.1  | 2026-04-02 | Security hardening (RLS, DML lockdown)                           |
| M0+M1   | 2026-04-03 | Admin Shell + Menu shipped (ex Sprint 1)                         |
| M2      | 2026-04-06 | POS shipped — order, cart, bill, cash                            |
| M3      | 2026-04-06 | KDS shipped — station config, realtime, bump/complete            |
| M4      | 2026-04-06 | Payment — cash, VietQR, Momo, refunds                            |
| M5      | 2026-04-06 | Stock — ingredients, recipes, stock levels                       |
| M6      | 2026-04-06 | Finance — HĐĐT, revenue dashboard, VAS                           |
| M7      | 2026-04-06 | HR/Payroll — employees, shifts, attendance, payroll              |
| v1.0.0  | 2026-04-07 | All modules shipped, QA verified, deployed to Vercel             |
| UX-A    | 2026-04-09 | Inventory UX redesign Session A — PO + GRN + Invoice             |
| UX-B    | 2026-04-09 | Inventory UX redesign Session B — Transfers + Stocktake + Issues |
| UX-C    | 2026-04-10 | Inventory UX redesign Session C — Catalog + Support pages        |
