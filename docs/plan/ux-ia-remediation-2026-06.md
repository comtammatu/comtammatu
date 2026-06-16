# Master plan — Remediation UX/IA/Data-display toàn app (2026-06)

> Nguồn: audit đa-tác-tử 16-agent (185 finding, verified vs CODE + PROD) + pass verify 5-agent
> (lật 2 hạng mục đáng sợ, khóa data-model). Phán quyết owner ghi ở `decisions.md` **D031**.
> Doc này là **kế hoạch thực thi** (track → PR → acceptance). `D031` là bản ghi quyết định; doc này không
> lặp lại lý lẽ, chỉ liệt kê việc làm + thứ tự + tiêu chí nghiệm thu.

## Cách đọc

- **Track** = nhóm PR cùng mục tiêu. Trong track, mỗi dòng là **1 PR** (giữ rule D019: 1 route-family / 1 primitive-wave / PR).
- **Tier**: T1 skip-review · T2 self-review · T3 four-perspective debate (auth/money/multi-row/migration) — theo `workflow.md`.
- **M?**: cần migration (file→PR→owner-apply→`pnpm db:types`; KHÔNG dev DB — D015).
- Mọi PR đóng phải qua `pnpm typecheck && pnpm lint && pnpm build` (+ test miền liên quan).
- **Off-limits:** file HR đang trong redesign D026/D027 cho tới khi nó settle; ₫-glyph app-wide là wave riêng (D029).

## Hiệu chỉnh từ verify (khác audit gốc)

| Hạng mục audit gốc | Trạng thái sau verify | Hệ quả plan |
| --- | --- | --- |
| HĐĐT `sellerName=''` lên hóa đơn pháp lý | **REFUTED** — không lên wire, Viettel tự điền | Rời Phase 0; hạ thành dọn literal + card định danh (T2) |
| POS/refund/KDS/checkout concurrency thiếu guard | **REFUTED** — đã khóa DB-layer, prod 0 trùng | Đóng track; chỉ còn 1 rough-edge low-prio |
| `createEmployee` rớt base_salary | **OVERSTATED** — server đã nhận đủ; chỉ client form thiếu | Payroll = sửa form, không sửa action create |
| customer_count "đã bỏ" | **SAI** — chỉ write-path chết; còn ~11 chỗ đọc + mirror in | Cleanup T2 thật + drop-column T3 |
| Payroll cần migration | **REFUTED** — mọi cột đã có prod | Bỏ slot migration payroll |
| Food-cost lệch nhẹ | **UPGRADED** — view 1-ngày margin ~100% (thổi phồng) | Ưu tiên cao Track C |

---

## TRACK A — Ship ngay: money-safety + bug prod thật (PR nhỏ, độc lập)

| PR | Vấn đề | Giải pháp | Files | Tier | M? |
| --- | --- | --- | --- | --- | --- |
| A1 | VietQR bật được với `account_name` rỗng (prod đang LIVE: `enable_vietqr='true'`, account_name='') → QR in tại POS không tên người nhận | Zod `superRefine` chặn enable khi thiếu `account_no` + (`bank_code` hoặc env) + `account_name`; mirror pattern MoMo disable-until-configured | `admin/settings/payments/actions.ts`, `payments-form.tsx` | T3 (money cfg) | — |
| A2 | Refund approve đảo ledger tiền thật 1 chạm, không confirm | Bọc `approveRefund` trong `confirm()` SSoT hiển thị `order_number` + `formatVND(amount)` + lý do | `refunds-client.tsx` (handleApprove), `finance/refund-actions.ts` | T3 | — |
| A3 | `printers` branch-settings rò đọc cross-tenant + thiếu gate quyền + back về `/pos` | Thêm `claims` + `canManageBranchFloorSettings` redirect + `.eq('tenant_id', claims.tenant_id)`; back→`/settings` | `br/[branchId]/settings/printers/page.tsx` | T3 (RLS-adjacent) | — |

**Acceptance A:** không thể bật VietQR khi thiếu tài khoản; refund hiện hộp xác nhận có số tiền; non-owner / cross-tenant không đọc được printers chi nhánh khác. (Double-glyph `45.000đ ₫` inventory: thuộc **₫ wave D029**, không mở lại ở đây.)

---

## TRACK B — confirm() wave cho hành động phá hủy/lifecycle (1 PR/surface-family)

Dùng `confirm()` SSoT (`@comtammatu/ui` confirm-dialog), KHÔNG tự chế dialog.

| PR | Hành động cần guard | Files |
| --- | --- | --- |
| B1 (admin) | revoke quyền · deactivate NV · suspend chi nhánh · xóa máy in | `permissions-client.tsx`, `staff-table.tsx`, `branch-table.tsx`, `admin/settings/printers/printers-client.tsx` |
| B2 (HR) — *chờ D026/D027 settle* | payroll Approve/Pay + recalc-khi-đã-calculated · duyệt nghỉ phép | `payroll-detail-client.tsx`, `leave-requests-table.tsx` |
| B3 (employee) | submitCheckout · clockOutManagerShift · approveCheckoutRequest | `clock-client.tsx`, `checkout-approvals-client.tsx` |
| B4 (KDS, low) | confirm batch "hoàn tất cả" (single-item bump giữ 1 chạm) | `kds/batch-actions.tsx` |

**Acceptance B:** mọi hành động trên hiện xác nhận trước khi ghi; nội dung confirm nêu rõ đối tượng + hệ quả.

---

## TRACK C — Số liệu sai/chết trên màn ra quyết định (data-display, ưu tiên owner #1)

| PR | Vấn đề | Giải pháp | Files | Tier | M? |
| --- | --- | --- | --- | --- | --- |
| C1 | **Food-cost grain**: `get_food_cost` gom `mv_food_cost` theo TUẦN trừ doanh thu NGÀY → view 1-ngày margin ~100% (thổi phồng) | MV grain-ngày `mv_food_cost_daily` (`date_trunc('day')`) + trỏ `get_food_cost`/`finance-cockpit` cho range <1 tuần; tạm thời render "—" + hint khi sub-week | migration + `finance-cockpit.ts`, `get_food_cost` RPC | T3 | ✓ |
| C2 | Admin dashboard: Gross Profit + "Chi phí" không khớp, thiếu Net Profit | Thêm KpiCard **Net Profit** (= grossProfit − operatingExpense, đã fetch) + đổi nhãn "Chi phí"→"Chi nguyên liệu" (đồng bộ semantics D028 cockpit) | `admin/dashboard/page.tsx`, `admin/.../actions.ts` | T2 | — |
| C3 | Inventory dashboard hardcode `priceReviewCount=0` → KPI "GRN cần kiểm tra giá" chết | Tính từ query variance GRN-vs-PO thật (reuse report-actions) hoặc gỡ KPI tới khi có nguồn | `inventory/dashboard-data.ts:264` | T2 | — |
| C4 | 2 trang Reports chỉ link/coming-soon | 1 hàng KpiCard thật (reuse fetcher) hoặc xóa catalog | `admin/reports/page.tsx`, `inventory/reports/page.tsx` | T2 | — |
| C5 | `/orders` "Tổng doanh thu" chỉ cộng 50 đơn hiển thị + gồm đơn chưa trả | Tính server-side trên full filtered set (head count + sum), loại đơn unpaid khỏi "doanh thu", reframe KpiCard + ghi chú "50 đơn mới nhất" | `orders/*` (server fetch + client) | T2 | — |

**Acceptance C:** lợi nhuận/biên trên `/finance` + `/admin/dashboard` khớp nhau và khớp `/finance/revenue` cho cùng kỳ; KPI giá-review lên số thật hoặc biến mất; "Tổng doanh thu" orders = tổng thật đã trả.

---

## TRACK D — Builds owner đã chốt (D031 a–e)

### D1 — Payroll vào app *(đi sau/khớp D026/D027)*
| PR | Nội dung | Files | Tier |
| --- | --- | --- | --- |
| D1a | Form NV: profile-picker thay UUID thô (`fetchUnlinkedProfiles` mới) + base_salary/id_number/bank/dependents/contract_type; `updateEmployee` + Edit dialog (dual create/edit) | `employee-form-dialog.tsx`, `hr/actions.ts`, `employee-table.tsx` | T2 |
| D1b | **Surface hợp đồng lao động** (unblocker): `contract-actions.ts` (create/update/fetch) + `contract-dialog.tsx`, ghi `gross_salary`/`insurance_base_salary`/dates/contract_number/sequence; wire nút "Hợp đồng" hoặc tab | `hr/contract-actions.ts`*, `hr/contract-dialog.tsx`*, `hr-client.tsx` | **T3** |
| D1c | Overview tab thật: `fetchPayrollPeriod` + `payroll-overview.tsx` (KpiCards Tổng net/BHXH/TNCN/Số NV + approved_by/at, paid_at); StatusBadge domain `payroll-period` + labels | `payroll/[periodId]/page.tsx`, `status-badge.tsx`, `labels/vi.ts` | T2 |

Dùng `calculatePayrollEntry` (versioned legal tables, KHÔNG hardcode). **Debt riêng (T3, trước go-live):** `calculatePayroll` upsert non-transactional → RPC nguyên tử (`payroll-actions.ts:291`). **Acceptance D1:** tạo NV có lương qua picker → lập hợp đồng → "Tính lương" sinh entry thật → Overview hiện tổng + trạng thái.

### D2 — Runner = đồng hồ chờ (rename + age/overflow) [T2, không M]
- GIỮ `RUNNER_ACTIVE_STATUSES=['pending','preparing']`; **đổi tiêu đề khỏi "Gọi số"** → "Đơn đang làm"/"Bếp đang làm"; thêm age escalation (mirror KDS `getAgeStyle`) + xoay/nén overflow để không giấu đơn chờ lâu.
- Files: `runner/page.tsx`, `runner-board.tsx`, runner copy. Cập nhật `runner-copy.test.ts` (test đang assert label cũ).
- **Acceptance:** màn không còn nhãn pickup; đơn chờ >X phút đổi tông cảnh báo; mọi đơn đang-làm đều thấy được.

### D3 — Dọn `customer_count` (số khách)
| PR | Nội dung | Tier | M? |
| --- | --- | --- | --- |
| D3a | Gỡ ~11 chỗ đọc/hiển thị + mirror in 3 chiều: `order-reads.ts`×4, `bill-receipt-summary`, `bill-receipt-types`, `use-order-sync`, `order-history`, `pos-sessions`(page+client), `finance/revenue/[date]`, print-render `document-render`+`payloads` + SQL print-fn; copy `messages/pos`+`settings`; regen `pnpm lint:i18n:baseline` (count khớp) | T2 | — |
| D3b | `ALTER TABLE orders DROP COLUMN customer_count` + bỏ param `p_customer_count` ở `create_order`/`create_order_with_daily_limit_hold` (caller đã omit) | T3 | ✓ |

**KHÔNG đụng** `tables.capacity` (đã bỏ + test-guard). **Acceptance:** không còn dòng "Số khách" ở UI/receipt; build + i18n baseline pass; sau D3b types regen sạch.

### D4 — Tách hóa đơn (N partial payment) — migration TRƯỚC, UI SAU
| PR | Nội dung | Tier | M? |
| --- | --- | --- | --- |
| D4a | **1 migration nguyên tử**: DROP `idx_payments_order_active` + nới gate amount ở `create_payment`/`confirm_cash_payment`/`confirm_vietqr_payment` (0<amount<=remaining) + viết lại `complete_payment_and_consume_stock` (bỏ ABS>1) + RPC mới `record_partial_payment` (FOR UPDATE + SUM, lock thay index); order flip 'paid' khi SUM(completed)>=total; finalize/print chỉ ở tender cuối | **T3** | ✓ |
| D4b | UI POS "Thanh toán một phần": Tổng / Đã trả / Còn lại, clamp 0<amount<=remaining, reuse cash/QR/MoMo; `recordPartialPayment` action + zod; copy; receipt liệt kê từng tender | T3 | — |

**Owner-default đã ghi (D031c):** status 'partial' = derive-at-read; đơn trả-một-phần không split/merge; QR/MoMo khớp số tender. **Acceptance:** trả 2 lần (tiền mặt + QR) cho 1 đơn → đơn 'paid' khi đủ tổng, receipt in cả 2 tender, không tạo payment trùng.

### D5 — Định danh HKD vào UI + bỏ field chết [T2] · VAT [accountant-gated]
| PR | Nội dung | Tier | M? |
| --- | --- | --- | --- |
| D5a | Card "Định danh hộ kinh doanh" (owner-only) đọc/sửa `tenants.legal_name`/`tax_code`/địa chỉ; print-render + hiển thị người bán đọc từ `tenants` thay literal `''`; bỏ 3 field chết (`service_charge`/`store_phone`/`store_email`) khỏi `settings-form`+`GENERAL_SYSTEM_SETTING_KEYS` | T2 | — |
| D5b | **BLOCKED on accountant:** đổi `SYSTEM_SETTING_DEFAULTS.vat_rate` khỏi `8` → 3.00/2.40/0 (chờ kế toán xác nhận ngưỡng 1 tỷ) + guard chặn set 8 | T3 | — |

**KHÔNG** đụng payload Viettel / `SELLER_*` env. **Acceptance D5a:** sửa tên hộ/MST ở settings → hiện đúng trên chứng từ in; General chỉ còn control sống. **D5b mở** cho tới khi có con số kế toán.

---

## TRACK E — Tái cấu trúc IA / direct-route (1 PR/nav-surface)

| PR | Nội dung |
| --- | --- |
| E1 | Wire orphan vào nav: `finance/summary`+`finance/invoices`→`resolveFinanceNav` (group "Hóa đơn"); `supplier-invoices`+`waste/approvals`→`resolveInventoryNav`; `settings/qc`→settings-section-nav; `staff/audit`← action "Nhật ký quyền hạn" trên `/admin/staff` |
| E2 | Landing `/employee`: thay `MANAGER_LINKS` thủ công bằng launcher ACL-driven (`resolveWorkspaceItems(role)`) → branch_manager có Branch Command, warehouse/production có Inventory |
| E3 | Gộp home trùng: settings hub "Khu vực"+"Bàn"→1 tile "Bàn & khu vực"; `/inventory/expiry` là home đơn, `settings/expiry`→trang ngưỡng thật hoặc xóa |
| E4 | Dọn 3 stub `notFound()` (`stocktake/conflicts`, `stocktake/[id]/escalate`, `waste/auto`) — build hoặc xóa sạch + gỡ `revalidatePath` chết (`stocktake-actions.ts:681`); sửa redirect xấu (KDS banner→`/br/[id]/settings/kds`; fallback non-owner→`/access-denied`) |
| E5 | Nav active-state: route 4 surface (workspace/employee bottom-nav, 2 settings-nav) qua `isNavItemActive` SSoT; inventory section-switcher→Tabs SSoT + gate QC tab |

Đăng ký route mới vào `role-route-matrix.md`. **Acceptance E:** mọi capability có ≥1 inbound nav theo vai trò; 0 stub 404; active-state nhất quán.

---

## TRACK F — Nhất quán hiển thị (waves, tôn trọng HR active-zone + ₫ wave D029)

| PR | Nội dung |
| --- | --- |
| F1 | **StatusBadge registry expansion**: thêm domain còn thiếu (kds-ticket, order-item, stocktake-session, po, transfer, supplier-invoice, attendance, leave, payroll-period, active-state) vào `status-badge.tsx` + labels |
| F2 | Migrate inventory → shared StatusBadge; **xóa** `inventory/_components/status-badge.tsx` + `_lib/ui.ts STATUS_BADGE_VARIANTS` |
| F3 | DataTable wave còn lại (D030 đã làm supplier-invoices/issues/receiving): `menu/item-table`, `menu/category-table`, `admin/settings/branches branch-table`, `admin/settings/{pos terminals, kds stations}` — gộp StatusBadge swap cùng PR. *(hr/employee-table chờ D026/D027.)* |
| F4 | KpiCard còn lại (D030 đã làm finance/orders/refunds/revenue): inventory dashboard hand-rolled tiles, `inventory-value:151`, `dashboard:634` — bỏ mobile size-fork |

**Acceptance F:** cùng trạng thái nghiệp vụ = cùng màu/label mọi module; bảng mobile/desktop cùng field; metric cùng kiểu chữ.

---

## TRACK G — Over-fetch / phân trang (1 PR/page)

| PR | Vấn đề | Giải pháp |
| --- | --- | --- |
| G1 | `/finance/invoices` fetch toàn bộ 3.185 `tax_invoices` (tăng +1/đơn mãi) vào 1 client DataTable | Phân trang server (`.order`+`.range`) + filter status/ngày (default 30 ngày/attention) + KpiCard count |
| G2 | `/finance/revenue` re-fetch lại 3.185 invoice chỉ để đếm | Dùng `dashboardSummary.invoice_attention_count`, bỏ `fetchTaxInvoices` |
| G3 | `pos-sessions` cap 50 không filter ngày | Thêm date-range searchParam + count badge |
| G4 | `stock` re-derive WAC client + scan `stock_levels` lần 2 | Lấy totals từ MV `getInventoryDashboard` như landing |

**Acceptance G:** không màn nào fetch unbounded; danh sách có filter + count.

---

## TRACK H — Surface nhỏ + low-prio (gom PR theo cụm)

- H1: `/notifications` page client riêng (filter unread/all + "Tải thêm" qua `hasMore`/before cursor; bỏ `h-90` cố định) — không còn cap 20 ẩn.
- H2: MoMo return đọc `resultCode` → branch success/pending/failure (+ copy); bỏ "đã xử lý" cho giao dịch fail.
- H3: `ORDER_TYPE_LABELS_VI` cho order detail (bỏ enum thô "Dine_in").
- H4: Permissions screen — ẩn nhóm "Đã hết hạn (N)" khỏi đếm + "Dọn quyền hết hạn"; nhóm chip theo module + filter text; marker `source_template`.
- H5: Branch settings — prop `scopedBranchId/hideBranchPicker` cho client dùng chung (bỏ Select 1-lựa-chọn) + `br/[branchId]/settings/layout.tsx` (bỏ header tự chế = chrome thứ 3) + StatusBadge thay Badge ad-hoc.
- H6: Inventory Settings — layout owns AppPage+header, sub-page chỉ render Card (bỏ 2-3 H1 chồng); thống nhất gate quyền; `/settings/expiry`→trang ngưỡng thật (gộp E3).
- H7 (low/defensive): `reverse_payment_and_post` sum-guard (T3, unreachable hiện tại); `refundOrderPayment` 2-RPC atomicity (gộp RPC hoặc UI resume orphan).

---

## Thứ tự & song song hóa

1. **Ngay, song song:** Track A (3 PR độc lập) ‖ khởi động migration **C1 food-cost** + **D4a split-bill** (lead dài: file→PR→owner-apply) ‖ mở debate T3 **D1b contract surface**.
2. **Sóng 1 (sau A):** Track B confirm() · Track C2–C5 số liệu · Track E IA (mechanical, độc lập).
3. **Sóng 2:** D3 customer_count cleanup → D3b drop-column (sau khi code sạch) · D5a identity · D2 runner.
4. **Sóng 3:** D4b UI tách hóa đơn (sau khi D4a applied + `db:types`) · D1a→D1c payroll (sau/khớp D026/D027).
5. **Sóng 4:** Track F nhất quán (F1 registry trước F2/F3) · Track G phân trang · Track H gom.

## Cổng chờ (block scope, không block bắt đầu)

- **VAT (D5b):** owner xác nhận doanh thu cả năm > 1 tỷ (2 tháng gần nhất ~400tr/tháng) → chịu GTGT → ăn uống **2,4%** (giảm tạm đến 31/12/2026, về 3% sau). Còn lại = code change trong D5 (đổi `SYSTEM_SETTING_DEFAULTS.vat_rate` khỏi 8 + guard chặn 8); set live qua `/admin/settings/general`.
- **Payroll chủ HKD:** hồ sơ owner có lập HĐ + payroll entry? (tax-vn: BHXH chủ hộ doc-only).
- **Viettel `sellerInfo`:** chỉ mở T3 provider-body nếu HDSD Viettel xác nhận chấp nhận override (mặc định: KHÔNG làm).
- **Tách hóa đơn:** xác nhận quy tắc split/merge/refund cho đơn trả-một-phần trước khi mở rộng split-by-item.

## Gì KHÔNG làm (đã giải/đóng)

- HĐĐT sellerName, POS/refund/KDS/checkout concurrency → đã verify an toàn, đóng.
- ₫-glyph app-wide → wave riêng D029. Allowlist ratchet `reframe` → không đuổi về 0 (D030).
- `tables.capacity` → đã bỏ, test-guard.

## Tiến độ thực thi (cập nhật 2026-06-16)

Branch `codex/continue-ts` (chưa push):

| Track | Commit | Trạng thái |
| --- | --- | --- |
| A — money-safety | `50af5c6b` | ✅ gated, committed |
| D3 — bỏ customer_count | `c191cce4` (+ migration `20260616100000`) | ✅ code gated + **migration ĐÃ APPLY prod 2026-06-16** (owner-delegated, 6-chunk, verify: column gone · mv_daily_revenue 86 rows · signatures mới đúng · advisors 0 finding mới · db:types regen 0 diff) |
| docs — D031 + plan | `edb55b79` | ✅ |
| B — confirm() wave | `94a6bc5d` | ✅ gated (B2 HR hoãn) |
| C — số liệu sai | `b4bf47d3` | ✅ gated: C2 net-profit · C3 priceReview thật · C5 orders revenue full-set/loại unpaid · **C1-2a interim** (gross/net/biên = "—" khi thiếu giá vốn, hết margin ~100% ảo) |
| E wave 1 — IA nav | đang chạy | E1 wire orphan nav + E5 active-state SSoT |
| E wave 2 — IA behavior/deletions | đang chạy | ✅ gated (typecheck app + lint clean, scoped): E2 landing launcher ACL-driven (thay `MANAGER_LINKS` thủ công bằng `EmployeeActionSection` "Khu vực làm việc" dựng từ `resolveQuickLaunchGroups` cho MỌI vai trò non-admin — branch_manager→Branch Command, warehouse/production→Inventory, cashier→Orders+POS, waiter→POS, chef→KDS; xóa `manager-tools-sheet.tsx`) · E3 gộp tile "Khu vực"+"Bàn"→"Bàn & khu vực" · E4 xóa 3 stub `notFound()` + gỡ `revalidatePath` chết + KDS banner→`/br/[id]/settings/kds` + fallback non-owner→`/access-denied`. E3-expiry single-home HOÃN sang H6 (inventory-settings pass) |

**Hoãn có chủ đích:**
- **C1-2b** (daily-grain `mv_food_cost_daily` migration): no-op tới khi inventory có recipe/GRN (giá vốn=0 dù grain nào); khi làm phải mirror `mv_daily_revenue` (paid_at + VN-local + payment join), KHÔNG chỉ week→day; rebase `refresh_finance_views()` lúc apply. C1-2a đã chặn số ảo nên không gấp.
- **E3 expiry single-home:** `/inventory/expiry` là home đơn, `settings/expiry`→trang ngưỡng thật hoặc xóa — gộp vào inventory-settings pass **H6** (không làm ở E wave 2).
- **B2 HR (payroll/leave confirm) · D1 payroll · F3 hr DataTable:** chờ HRM redesign D026/D027 settle (off-limits).

**VAT (D031e) — XONG, KHÔNG còn set tay:** rate giờ **tự suy theo bậc** (`resolve_gtgt_rate`, mirror `packages/shared/src/tax`). Prod hiện = **2,4%** (Má Tư annualized ≥1 tỷ, group2, giảm tạm) — tự về 0 nếu <1 tỷ, sang 17% TNCN nếu >3 tỷ, 2,4%→3% sau 31/12/2026. `vat_rate` setting đã gỡ. Emit mẫu 2 (gross) không đổi; HĐ cũ 8% sửa-tiến.

**Owner action tồn:** **push + promote 1 production deploy** khi tiện (Vercel deploy đang ngủ; local-dev đã chạy code mới nên không gấp). Migration đã apply hết qua delegation: `20260616100000` (D3 drop customer_count) · `20260616110000` (identity RPC) · `20260616130000` (derive-VAT). Follow-up nhỏ: gộp revoke anon-execute cho `resolve_gtgt_rate`/`update_tenant_identity` vào sweep `20260616120000`.
