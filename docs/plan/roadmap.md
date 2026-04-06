# Roadmap — Cơm Tấm Má Tư

> Hệ thống Quản lý Vận hành Nhà hàng (Restaurant Operations Management System)
> Updated: 2026-04-06 | Structure: Module-based

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
| M4  | Payment     | Cash, VietQR, Momo, refunds, reconciliation          | NEXT    |
| M5  | Stock       | Ingredients, recipes, stock levels, procurement, GRN | —       |
| M6  | Finance     | HĐĐT, VAT, dashboard, reports, VAS accounting        | —       |
| M7  | HR/Payroll  | Employees, shifts, attendance, payroll, PIT          | —       |

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
      └── M4 (Payment) ← NEXT
          ├── M6-lite (HĐĐT only) = PILOT v1.0
          └── M5 (Stock) ← v1.1
              └── M6-full (Finance) ← v1.1
                  └── M7 (HR/Payroll) ← v1.2
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

| #   | Task                                              | Status |
| --- | ------------------------------------------------- | ------ |
| H1  | Settings ACL: thêm branch_manager + area_manager  | ✅     |
| H2  | Tables page: branch_manager chỉ thấy branch mình | ✅     |
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
| ------- | ---------------------- | ------------------------------------ |
| S1      | KDS station config     | kds_stations, kds_station_categories | ✅ |
| S2      | Realtime order queue   | kds_tickets                          | ✅ |
| S3      | Bump/complete + alerts | —                                    | ✅ |

**Ship criteria:**

- [x] Order từ POS xuất hiện realtime trên KDS
- [x] Chef bump từng món → cập nhật order status
- [x] Bump hết → order chuyển "ready"
- [x] Station categories filter đúng món
- [x] `/verify` + `/review` passes

---

## M4: Payment — Thanh toán

> Status: — | Depends: M2
> Ref: `docs/ref/third-party-integrations.md`

**Scope:** Các phương thức thanh toán: tiền mặt, VietQR (chuyển khoản), Momo. Xử lý hoàn tiền. Đối soát cuối ngày.

**Không bao gồm:** VNPay, HĐĐT (→ M6).

**Tables owned:** payments, payment_webhooks, refunds

| Session | Task                      | Tables           |
| ------- | ------------------------- | ---------------- |
| S1      | Payment schema            | payments         |
| S2      | VietQR integration        | —                |
| S3      | Momo integration          | payment_webhooks |
| S4      | Refunds                   | refunds          |
| S5      | End-of-day reconciliation | —                |

**Ship criteria:**

- [ ] Thanh toán tiền mặt + VietQR + Momo
- [ ] Hoàn tiền (partial + full)
- [ ] Đối soát cuối ngày chính xác
- [ ] `/cso` passes (sensitive: payments)
- [ ] `/verify` + `/review` passes

---

## M5: Stock — Kho & Mua hàng

> Status: — | Depends: M4
> Ref: `docs/ref/inventory.md`

**Scope:** Quản lý nguyên liệu, công thức (recipe), tồn kho, nhập kho (GRN), đặt hàng nhà cung cấp (PO), đối chiếu hóa đơn nhà cung cấp (3-way matching).

**Không bao gồm:** Quản lý kho thành phẩm, multi-warehouse.

**Tables owned:** ingredients, recipes, stock_levels, stock_movements, suppliers, purchase_orders, purchase_order_items, goods_received_notes, grn_items, supplier_invoices

| Session | Task                            | Tables                                           |
| ------- | ------------------------------- | ------------------------------------------------ |
| S1      | Ingredients + recipes           | ingredients, recipes                             |
| S2      | Stock levels + movements        | stock_levels, stock_movements                    |
| S3      | Suppliers + Purchase Orders     | suppliers, purchase_orders, purchase_order_items |
| S4      | GRN + auto stock update         | goods_received_notes, grn_items                  |
| S5      | Supplier invoices + 3-way match | supplier_invoices                                |

**Ship criteria:**

- [ ] CRUD nguyên liệu + công thức
- [ ] Tồn kho tự động cập nhật khi GRN
- [ ] PO → GRN → Supplier Invoice flow hoàn chỉnh
- [ ] 3-way matching hoạt động
- [ ] `/verify` + `/review` passes

---

## M6: Finance — Tài chính & HĐĐT

> Status: — | Depends: M4, M5
> Ref: `docs/ref/einvoice-tax.md`

**Scope:** Hóa đơn điện tử (HĐĐT), VAT, dashboard doanh thu, báo cáo tài chính theo chuẩn VAS, hệ thống tài khoản kế toán.

**Không bao gồm:** Phân tích nâng cao (Post-v1.0).

**Tables owned:** tax_invoices, chart_of_accounts, journal_entries, mv_daily_revenue, mv_top_items, mv_food_cost

| Session | Task                        | Tables                             |
| ------- | --------------------------- | ---------------------------------- |
| S1      | HĐĐT schema + Edge Function | tax_invoices                       |
| S2      | HĐĐT UI + provider config   | —                                  |
| S3      | Revenue dashboard           | mv_daily_revenue, mv_top_items     |
| S4      | Food cost analysis          | mv_food_cost                       |
| S5      | Chart of accounts (VAS)     | chart_of_accounts, journal_entries |
| S6      | Financial statements        | —                                  |
| S7      | MV refresh + audit logging  | audit_logs                         |

**Ship criteria:**

- [ ] HĐĐT xuất/hủy hoạt động với provider
- [ ] Dashboard doanh thu chính xác
- [ ] Food cost report đúng
- [ ] BCTC theo chuẩn VAS
- [ ] `/cso` passes (sensitive: finance)
- [ ] `/verify` + `/review` passes

---

## M7: HR/Payroll — Nhân sự & Lương

> Status: — | Depends: M6
> Ref: `docs/ref/labor-contracts.md`, `docs/ref/payroll-pit.md`

**Scope:** Hồ sơ nhân viên (mở rộng từ profiles), ca làm, chấm công, tính lương, thuế TNCN, BHXH.

**Không bao gồm:** Tuyển dụng, đánh giá hiệu suất.

**Tables owned:** employees, shifts, attendance_records, payroll_periods, payroll_entries

| Session | Task                  | Tables                           |
| ------- | --------------------- | -------------------------------- |
| S1      | Employee records      | employees                        |
| S2      | Shifts + attendance   | shifts, attendance_records       |
| S3      | Payroll calculation   | —                                |
| S4      | Payroll processing    | payroll_periods, payroll_entries |
| S5      | Payroll reports + PIT | —                                |

**Ship criteria:**

- [ ] Quản lý hồ sơ nhân viên đầy đủ
- [ ] Lập ca, chấm công
- [ ] Tính lương + BHXH + thuế TNCN chính xác
- [ ] Bảng lương hàng tháng
- [ ] `/cso` passes (sensitive: payroll)
- [ ] `/verify` + `/review` passes

---

## Milestone: v1.0.0 PILOT LAUNCH

> Sau khi M0–M6 stable (M7 có thể ship song song hoặc sau pilot)

**Pilot checklist:**

- [ ] M0–M4 SHIPPED (vận hành cơ bản)
- [ ] M5 SHIPPED (quản lý kho)
- [ ] M6 SHIPPED (HĐĐT — bắt buộc pháp lý)
- [ ] `/qa` — full QA test
- [ ] `/cso` — sprint-level security review
- [ ] `/retro` — retrospective
- [ ] `/ship` — merge → push → PR → deploy
- [ ] Live verification tại 1 chi nhánh

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

| Version | Date       | What                                     |
| ------- | ---------- | ---------------------------------------- |
| v0.1.0  | 2026-04-01 | Foundation (auth, proxy, RLS, monorepo)  |
| v0.1.1  | 2026-04-02 | Security hardening (RLS, DML lockdown)   |
| M0+M1   | 2026-04-03 | Admin Shell + Menu shipped (ex Sprint 1) |
| M2      | 2026-04-06 | POS shipped — order, cart, bill, cash     |
