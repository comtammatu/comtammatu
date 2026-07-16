# Architecture Decisions

> Log quyết định kiến trúc với rationale. Số hiệu `D` là ID cố định (doc khác
> trỏ tới) — khoảng trống là quyết định đã xoá/bỏ qua, KHÔNG đánh số lại. Đây là
> production-track decision record, KHÔNG phải worklog triển khai hay backlog.
> **Luật bảo trì (chống nhiễu):**
>
> 1. **Mỗi entry giữ NET-EFFECT đang hiệu lực.** Quyết định mới đảo/đè/sửa một
>    quyết định cũ thì PHẢI sửa entry cũ trong cùng PR (fold phần bị đè, ghi
>    `(sửa bởi D0xx)` tại chỗ) — không append entry mới rồi để hai bản mâu
>    thuẫn cùng tồn tại.
> 2. **Cấm status/worklog trong entry:** không PR number, không branch name,
>    không "Status (ngày)", không apply-instruction. Tiến độ sống ở
>    `tasks/todo.md`; lịch sử sống ở git.
> 3. Ruling đã được promote vào spec/ref/rule doc thì entry chỉ giữ net-effect
>    vài dòng + con trỏ canonical; KHÔNG chép lại nội dung dài.

## D000: Inventory branch and central site operating model (2026-06-19)

**Decision (net, sau D078):** Inventory dùng `branches` làm site table; `branches.branch_kind` enum giữ `branch`, `central_supply`, `central_kitchen` cho lịch sử. Site vận hành active chỉ `branch`. Mỗi chi nhánh giữ **một** location stock-bearing `warehouse` (Kho chi nhánh). `central_supply` / `central_kitchen` và `location_kind='kitchen'` (Bếp CN) đã nghỉ vận hành — không seed/active mới. PO/GRN/stock levels/production/stock transfers ref `branch_id` trực tiếp.

**Transfer matrix** (trigger `enforce_stock_transfer_direction`): giữ cho lịch sử + đợt chuyển tồn cũ; vận hành mới không mở same-branch Kho↔Bếp và không mở cross-branch từ operator (D073/D078). Chỉ phiếu xuất/tiêu hao/write-off giảm tồn chi nhánh.

Mở rộng bởi D068 (Kho CN nhận NCC trực tiếp + sản xuất tại chi nhánh); siết bởi D078 (một kho/chi nhánh). Canonical vận hành: `docs/ref/inventory.md`.

## D002: Tenant-Branch 2-level thay vì Company-Brand-Branch 3-level (2026-04-01)

**Decision:** `Tenant (L0) → Branch (L1)`. Tenant = single row (id=1). Mọi scope qua `tenant_id` + `branch_id`. KHÔNG có tầng brand — không brand switcher, JWT không có brand claim; muốn mở lại tầng brand phải có quyết định mới.

## D005: User tự quản lý infrastructure (2026-04-01)

**Decision:** Code chỉ chứa placeholder env vars. AI agent KHÔNG tạo infrastructure resources (Supabase/Vercel/Upstash/GitHub). `.env.example` phải đầy đủ.

## D009: Path-based routing, không sub-domain (2026-04-04)

**Decision:** Path-based (`/admin/*`, `/br/[branchId]/...`) — 1 domain, auth "just works", ACL tập trung ở `proxy.ts`. Sub-domain không nằm trong backlog; muốn tách phải có quyết định mới. Canonical: `docs/spec/architecture.md` § Routing.

## D010: RHF + zod + Má Tư DS Field cho mọi form (2026-04-17)

**Decision:** Form CRUD dùng `react-hook-form + zod 4 + @hookform/resolvers + Má Tư DS Field`; app-local helpers ở `apps/web/app/components/form/`. Ngoại lệ có chủ đích: import/export one-field upload và GRN mobile wizard có shape riêng, không dùng helper chung. Canonical: `docs/modules/ui.md` § Form wrapper layer.

## D011: Print-agent LAN-only transport (2026-05-07)

**Decision:** `apps/print-agent` chỉ hỗ trợ LAN printer transport. Không runtime flag chọn transport, không USB capability columns, không USB native binding. LAN-only enforced trong baseline: `printers` CHECK `printers_connection_type_lan_only` (`connection_type='lan'`), không cột `usb_*`, `printer_agents` không cột `transport`; `src/usb.ts` đã gỡ. Branch rollout = terminal-linked Android gateway + LAN printer.

## D012: Tier-2 trim + gộp role POS — định hướng phần mềm hỗ trợ Hộ Kinh Doanh (2026-06-10)

**Decision:**

1. LOẠI khỏi backlog (không đề xuất lại): Local-First/offline POS, VNPay (VietQR+MoMo đủ), native POS Flutter/Capacitor (PWA chạy ổn — tái khẳng định bởi D062).
2. Role POS: sàn bán hàng dùng access bucket `cashier`; phục vụ là công việc trong ca, không phải role auth riêng.
3. Mọi tính năng mới qua **phễu "phần mềm hỗ trợ HKD"**: giảm thao tác chủ + nhân viên hiện có; không thêm nghi thức quản trị (phân ca, duyệt nhiều tầng, kế toán doanh nghiệp) HKD không dùng.

## D014: Chương trình hợp nhất tầng molecule UI — W0–W6 (2026-06-11)

**Decision:** Hợp nhất molecule theo wave; mỗi molecule = contract trong `docs/spec/design-system.md` + ratchet trong `scripts/check-ui-contract.mjs` (allowlist baseline chỉ giảm). W5 chi tiết ở D019; W6 (decompose god-components) còn lại. Canonical: `docs/spec/design-system.md` § Component Authority.

## D015: Một Platform duy nhất — production in-place là system of record (2026-06-12)

**Decision:**

1. Một Platform duy nhất = hệ production hiện tại (repo này, DB `iexwsuaqqenyjiskawoj`). KHÔNG ETL/migrate dữ liệu vận hành sang DB khác.
2. `matu-platform` (DB `dyksphedgzqsqjqgxzog`) đóng băng vĩnh viễn: không deploy, không mở lại feature; archive read-only sau harvest; DB backup rồi pause/xóa theo owner.
3. **Harvest một chiều** ở mức spec + migration chọn lọc, viết lại theo convention `with-action.ts`/RPC hiện hành (bê nguyên khối = vi phạm). Danh mục duyệt: pgTAP + CI test-db; idempotency_keys + webhook claim-before-side-effect; inventory ledger-based; HĐĐT worker; PBAC anti-escalation; reports net-profit-daily.

**Consequences:** Chấm dứt re-litigate hướng platform. Mọi đề xuất rebuild/cutover phải sửa quyết định này trước, kèm số liệu thắng phương án absorb.

## D016: POS trừ Kho chi nhánh theo outcome bán hàng — mặc định (2026-05-28, sửa 2026-07-11)

**Decision (net, sau D053/D064/D065/D078):** Mặc định chi nhánh đang hoạt động được bật `pos_stock_outcome_posting`: POS Sale Runtime ghi giảm tại Kho chi nhánh theo outcome thật, không phải ngay khi thanh toán đơn thuần. Mỗi chi nhánh mới cũng khởi tạo bật; Chủ quán vẫn có thể tắt riêng từng chi nhánh bằng một switch, khi đó không trừ kho và không rào tồn. Khi bật, một công tắc vẫn đồng thời áp rào cứng không âm; sale movement chỉ post sau điều kiện paid/completed + kitchen outcome theo D053/D065. Shortage lúc ghi sổ không được làm payment fail và không được ghi movement một phần.

**Boundary:** Báo cáo tiêu hao thủ công chỉ ghi phần dùng ngoài bán POS; không được nhập lại nguyên liệu đã có `source_type='pos_sale'` cho cùng bán hàng. `finalize_paid_order`, idempotency, refund boundary, và amount recompute giữ nguyên.

Đảo policy mặc định phải sửa quyết định này trước.

## D017: Admin là L0 Tenant Command; Branch Manager dùng L1 Branch Command (2026-06-13)

**Decision (net, sau D018/D050/ADR 0012):** Product framing = `bộ phần mềm quản lý vận hành và bán hàng` cho HKD. Admin Dashboard là L0 tenant command chỉ dành cho `owner`, gồm `/admin` và các route family ổn định `/inventory`, `/orders`, `/hr`, `/finance`, `/menu`, `/branches`; chúng không cần chuyển thành tab con hay đổi URL. `branch_manager` KHÔNG phải Admin user — home = `/br/{branchId}` (D050); điều hành + thiết lập chi nhánh trong Branch plane. Role/route chỉ là gate bề mặt; action + row access qua permission keys, RPC/RLS, branch scope.

**Canonical:** `docs/spec/role-route-matrix.md`. Không thêm workflow branch-scoped mới vào `/admin/*`.

## D018: Bỏ tenant-admin phụ — gộp vào `owner` (2026-06-13)

**Decision:** Không có tenant-admin phụ cạnh `owner` — mọi fallback dạng đó retired, `owner` giữ quyền; `/admin/*` chỉ `owner`. `ACCESS_BUCKETS` canonical theo `packages/shared/src/auth/types.ts` (bảng generated trong `docs/spec/role-route-matrix.md`).

## D019: W5 — Cấu trúc hoá UI (shell · route home · nav · padding) (2026-06-13)

**Decision (net, sau D050/ADR 0012):** (1) 2 họ chrome, không có họ thứ 3 — **Admin Dashboard** = `AppShell` cho Owner tại `/admin` và các domain route family, **Branch** = Operator plane `/br/[branchId]/*` + station chrome (POS/KDS/Runner); (2) một capability = một route home theo `role-route-matrix.md`; (3) padding một chủ = `AppPage`; (4) nav là data — mọi sidebar/bottom-nav project từ `nav-config.ts`, cấm `ShellNavGroup[]` literal trong shell. Canonical + gates: `docs/spec/design-system.md` § Structural Governance. Đảo điểm nào phải sửa quyết định này trước.

## D020: Enterprise Accounting / TT 200 / VAS is outside the HKD product (2026-06-13)

**Decision:** Enterprise accounting / TT 200 / VAS KHÔNG thuộc product contract. Finance authority = HKD operating finance. `accounting_periods` close/reopen là DB-only owner support, không app route nào expose. Tái lập enterprise-accounting → phải sửa quyết định này + ADR 0006 trước. Canonical: `docs/modules/finance.md` § Accounting Advanced Boundary; migration chain thuộc ADR 0006.

## D022: HĐĐT lập realtime tại payment; không nháp-local sau thanh toán (2026-06-14)

**Decision (owner — cổng pháp lý đóng):** Thời điểm lập HĐĐT = tại thời điểm thanh toán hoàn tất, realtime per-order qua `createInvoice`. KHÔNG triển khai `hddt_issuance_mode='deferred_batch'`, `createDraftTaxInvoice`, `issueDraftBatch`, cron phát hành lô. Gộp lô cuối ngày CHỈ là chuyển dữ liệu MTT lên CQT (bảng tổng hợp); `createBatchInvoice` giữ làm hạ tầng backfill/B2C, không dùng để defer. Sửa sai sau phát hành qua owner/accountant (D023, giới hạn D049). Canonical: `docs/ref/einvoice-tax.md` § 1.1. Đảo (defer việc lập) phải sửa quyết định này trước.

## D023: Sửa-sai POS realtime — correction ở owner/accountant (2026-06-14)

**Decision (net, sau D049):** Correction HĐĐT/thanh toán (hủy/thay thế, refund, sửa phương thức) KHÔNG nằm trên màn POS — chỉ ở Owner + Kế toán. Ngoại lệ HẸP duy nhất: full void-after-paid theo D049. Cashier-facing: thanh toán xác nhận **một chạm**, không dialog confirm phụ (khóa bằng `pos-payment-single-tap.test.ts`); phòng lỗi dựa vào correction sau phát hành. `correct_payment_method` RPC = pure record fix, HĐĐT đã phát hành không bị ảnh hưởng.

## D026: HRM redesign — trục Người · Ngày công · Lương (2026-06-15)

**Decision (amended — HR-1, 2026-07-16):**

1. `standard_days` = số công chuẩn owner chọn cho tháng đang xem (mặc định 26) + clamp `working/standard ≤ 1`. Đây là tham số preview, **không** là một kỳ lương cần tạo trước; giá trị được snapshot khi chốt bảng lương.
2. Việc trong ca: cấu hình theo vị trí — chi tiết thuộc D052 (đã thay mô hình template/override cũ).
3. Lương qua HĐLĐ active trong kỳ khi có, fallback `employees.base_salary` cho dữ liệu HKD cũ.
4. Ca làm: GIỮ (D027), đặt ở "Thiết lập".
5. Lương live chỉ đọc các nguồn vận hành hiện tại: ca đã checkout, đơn nghỉ đã duyệt, HĐLĐ/hồ sơ nhân viên và điều chỉnh lương có nguồn. `payroll_entries` chỉ là snapshot bất biến sau khi chốt, không là nguồn tính lại.
6. HR chỉ **chốt nghĩa vụ lương**. Thanh toán tiền mặt/chuyển khoản và bằng chứng đối soát thuộc Finance `expenses` (category `salary`); HR không được đánh dấu `paid`.

**IA:** Owner Admin Dashboard tách theo job, không nhồi ba workflow vào tab root: `/hr` = **Nhân viên**; `/hr/attendance` = **Ngày công & nghỉ phép** (oversight); `/hr/payroll` = **Lương** (live workspace); `/hr/setup` = **Thiết lập** (ca + việc trong ca); `/hr/staff` = **Tài khoản & quyền**. Branch Manager duyệt đơn tại `/br/[branchId]/shift/leave-approvals`, không thao tác từ HR Admin. D012 vẫn áp: KHÔNG rostering/auto-late/auto-absent/số dư phép/duyệt nhiều tầng. Canonical chi tiết payroll: `docs/ref/labor-contracts.md`, `docs/ref/payroll-pit.md`.

## D027: Chấm công theo CA (per-shift), không theo ngày (2026-06-15)

**Decision:**

1. **Đơn vị chấm công = CA.** Unique `(employee_id, date, shift_id, tenant_id)`; `shift_id` NOT NULL cho dòng mới; dòng cũ backfill theo `resolveDefaultShiftId` từ `check_in`.
2. **Ca = xương sống, Global.** 1 bộ ca chung mọi chi nhánh (`shifts.branch_id` NULL = global); công thức không hardcode số ca/ngày; auto-nhận ca theo giờ check-in.
3. **Ngày công:** mỗi ca đã kết = 0.5 công; `working_days = Σ 0.5`; không cap theo ngày, chỉ clamp tổng lương bằng `standard_days`.
4. **UX:** mỗi ca một lượt vào/ra riêng trong ngày; `today-work-state` chọn ca hiện tại theo giờ, vẫn hiện ca chưa kết.
5. **Việc trong ca theo từng ca** (snapshot riêng mỗi bản ghi ca).

Mở rộng (không đảo) D026.

## D028: Kiểm soát nguyên liệu = đếm thực tế + lát "tài chính trước" (2026-06-15)

**Decision (owner):**

1. **Nguyên liệu tiêu hao = ĐẾM THỰC TẾ** (tiêu hao = tồn đầu + nhập − tồn cuối) qua stocktake (mode `daily`) + stock_issues. Giữ D016 mặc định.
2. **Thứ tự: TÀI CHÍNH TRƯỚC** — sổ chi phí `expense` (`/finance/expenses` là entry canonical); **lợi nhuận ròng** = lãi gộp − chi vận hành − lương − thuế; **lợi nhuận thực tế** = tiền thực thu − thực chi; **tiền mặt hiện hữu** = quỹ đầu kỳ + thu − chi tiền mặt (opening balance owner nhập ở `system_settings`, không đoán từ lịch sử payment); lương tạm là 1 danh mục `expense` tới khi `payroll_entries` populate.

Công thức metric canonical: `docs/ref/operational-data-contract.md`. Mở rộng (không đảo) D015/D020.

## D029: Glyph tiền canonical = `đ` (U+0111); vnd-format gate là render-SSoT (2026-06-15)

**Decision:** Canonical money glyph = `đ` (U+0111); `₫` (U+20AB) không xuất hiện ở render path canonical nào — `₫` còn sót là drift cần dọn. `vnd-format-ssot` là render-governance gate, không phải mandate route mọi formatter qua `formatVND`; non-money formatter giữ typed theo domain. Đổi glyph app-wide phải update money render + print render + SQL/EMV mirror + receipt template trong một wave. Canonical gate semantics: `docs/spec/design-system.md`.

## D030: Gate-precision — allowlist = sàn false-positive, KHÔNG phải backlog về 0 (2026-06-15)

**Decision:** Canonical toàn bộ per-gate semantics: `docs/spec/design-system.md` § Ratchet allowlist semantics. Không đuổi reframe allowlist về 0; không hạ gate dưới actual count; UI debt mới fix ở primitive/pattern.

## D031: Đợt remediation UX/IA toàn app — 5 phán quyết owner (2026-06-16)

**Đính chính từ verify:** HĐĐT `sellerName` — app không gửi `sellerInfo`, Viettel tự điền từ MST đăng ký; concurrency/idempotency đã khóa ở tầng DB — cả hai KHÔNG phải bug.

**Phán quyết (net):**

- (a) Payroll HKD có HĐLĐ/BHXH tối thiểu — canonical `docs/ref/labor-contracts.md` + `payroll-pit.md`.
- (b) **Runner = đồng hồ chờ:** chỉ hiện đơn ĐANG LÀM (`['pending','preparing']`, không lane `ready`), không mang nghĩa "Gọi số", có thang tuổi + overflow.
- (c) Tách hóa đơn không thuộc payment contract hiện hành; muốn mở phải có
  decision mới và atomic multi-payment RPC.
- (d) Danh tính HKD: SSoT = `tenants.legal_name`/`tax_code` (KHÔNG `system_settings`).
- (e) VAT derive theo bậc qua `resolve_gtgt_rate` + shared mirror, không hardcode; HĐ cũ 8% = sửa-tiến (đối soát hồi tố là việc kế toán). Canonical: `docs/ref/einvoice-tax.md` § 2.1.
- (f) Hạ ưu tiên: refund sum-guard (unreachable), `refundOrderPayment` 2-RPC non-atomic (rough-edge).

**Lưu ý prod còn hiệu lực:** destructive DB change cần expand-contract — zero-ref object bị xóa TRƯỚC khi owner apply. Đảo (a)–(f) phải sửa quyết định này trước.

## D032: Redesign UI = Hợp nhất (A) + Nâng cấp thị giác trong contract (B) (2026-06-16)

**Net:** UI hợp nhất theo Custom Theme contract. Typography đi theo D038 →
D069; palette giữ `primary` đỏ gạch + Concept 01. Các ý tưởng chưa quyết không
sống trong decision log.

## D033: `main` là trunk TS/Supabase hiện hành — bỏ Go-port (2026-06-16)

**Decision:** `main` là trunk hiện hành. Go-port không thuộc current architecture
(tag `archive/go-port-2026-05`). Mọi rollback trunk phải có incident plan mới,
dựa trên history hiện tại và được owner duyệt rõ.

## D035: Gỡ hẳn bề mặt accounting/khóa-kỳ khỏi app (2026-06-19)

**Decision (owner):** Toàn bộ UI/route accounting đã gỡ. **Giữ lại (KHÔNG đụng):** permission `accounting:period_reopen` + RPC `close_period_soft/hard`, `reopen_period`, bảng `accounting_periods` (DB-layer thuộc owner qua migration). Dựng lại sau = tính năng "Khóa số liệu tháng" gọn dưới `/admin/settings`, không tái lập khung kế toán. Canonical: `docs/modules/finance.md`.

## D036: Agentic OS — xương sống Notification/Alert/Report + thang tự chủ (2026-06-19)

**Decision (net, kênh theo D046):** Xây "Agentic OS" **95% deterministic + 5% LLM mỏng-bounded** trên xương sống `notifications`. Hợp đồng SSoT (producer/dedup/routing/invariants) = `docs/spec/toast-notification-system.md` — không chép lại ở đây.

Phần chỉ sống ở quyết định này:

- **Thang tự chủ R0→R3** (shadow → inform → recommend → auto-act-bounded). **Lằn ranh cứng: agent đụng tiền/thuế/lao động cap R1 (báo) mãi mãi.** Service Janitor là agent auto-act (R3) DUY NHẤT (idempotent/đảo-ngược). LLM không bao giờ cầm DB/RPC/số — chỉ narrate trên số SQL tính.
- **Tool của agent = RPC `SECURITY DEFINER` sẵn có** (allowlist + cap), không xây
  action API mới; cron mới chỉ làm phần trigger không làm được. Telegram outbound
  routing/topic map chưa có runtime owner nên giữ Parked; external delivery hiện
  chỉ theo outbox contract đã cấu hình.
- Nâng autonomy phải qua ba cổng riêng: T3 DoR, production apply delegation và
  owner duyệt cấp R0→R1; không suy từ thời gian chạy hoặc LLM confidence.
- Mặt tiền CHAT Telegram và Telegram outbound routing đều là option Parked; muốn
  mở lại phải có config owner, secret boundary và dedup/retry contract riêng.

## D038: Chuyển typography sang Geist (2026-06-20)

**Decision (net, sau D069):** Body + data face = **Geist** + **Geist Mono** (package `geist`, self-hosted, đủ glyph tiếng Việt); heading/display = Be Vietnam Pro theo D069. Cấm tái nhập Inter/Montserrat/JetBrains. Print pipeline không đụng. Canonical: `docs/spec/design-system.md` § Typography Contract.

## D039: HĐĐT realtime instant-issue khi provider trả mã CQT đồng bộ (2026-06-20)

**Decision (T3):** Trong `createInvoice`: có CẢ `invoiceNo` LẪN `codeOfTax` non-empty → `issued`; `invoiceNo` không `codeOfTax` → `submitted`; không `invoiceNo` → `signing`. Mẫu `1/...` không đổi hành vi. `createTaxInvoice` capture `codeOfTax` → `tax_invoices.cqt_code`. Trade đã chốt: realtime direct-INSERT không ghi `tax_invoice_events`; audit qua `audit_logs` + `provider_data.codeOfTax` + `cqt_code` (invariant: einvoice-tax.md § 3.3).

## D040: Tắt `taxPercentage` giả cho mẫu `2/...` (S-invoice) (2026-06-20)

**Decision (owner):** Mẫu `2/...` KHÔNG gửi `taxPercentage`/`taxAmount`, `taxBreakdowns: []`, giá GROSS; mẫu `1/...` giữ rate thật; nghĩa vụ % khai ở tờ khai trên tổng doanh thu. Canonical (full restatement + verify): `docs/ref/einvoice-tax.md` § 3.2.

## D041: Payroll "tính lương" atomic — 1 RPC `upsert_payroll_calculation` (2026-06-20)

**Decision (T3):** Gộp upsert `payroll_entries` + flip `payroll_periods.status='calculated'` + clean-recompute delete vào 1 RPC SECURITY DEFINER; TS giữ toàn quyền tính PIT/BH (`calculatePayrollEntry` + `legal-versions.ts`), RPC chỉ persist nguyên tử. Contract RPC: clean-recompute bằng `NOT EXISTS` cùng transaction; KHÔNG EXCEPTION block; gate in-body (`auth_tenant_id()` ép tenant + `payroll_period_id` trên MỌI row — không tin jsonb client, `has_permission_any('finance:payroll_calculate')`, period `FOR UPDATE`, `status IN (draft,calculated)`, reject entries rỗng); `employee_count` = ROW_COUNT; GRANT EXECUTE chỉ `authenticated`. Guard: `PAYROLL-CALCULATE-MUST-BE-ATOMIC-RPC` (tasks/regressions.md).

## D042: Xóa sổ hết hạn đi qua waste pipeline + waste pipeline thực sự trừ kho (2026-06-21)

**Decision (owner):** Xóa sổ hàng hết hạn KHÔNG dùng `adjustStock` thô — đi qua waste pipeline (`create_expiry_writeoff`): tier, cổng ảnh, duyệt tier-2, trừ kho theo WAC, lưu lô vào `source_ref` (`kind=expiry`, `grn_item_id`). Cả ba đường waste (`create_waste_entry`, `approve_waste`, expiry) post movement giảm kho qua helper `_post_writeoff_movements` (mirror `confirm_stock_issue`). Security: helper REVOKE khỏi `authenticated`/`anon`; `confirm_stock_issue` chặn confirm writeoff đang `pending` (bypass duyệt tier-2).

## D043: `create_payment` authz nội hàm gate `pos:use`; hoãn siết completion (2026-06-21)

**Decision (owner):** `create_payment` (SECURITY DEFINER, GRANT authenticated)
verify nội hàm: tenant, actor và `has_permission(branch, 'pos:use')`. Completion
permission vẫn theo RPC cụ thể; mọi thay đổi phải sửa action + UI + RPC contract
cùng một slice.

## D044: Má Tư Design System là UI contract duy nhất (2026-06-21)

**Decision:** Authority = `docs/spec/design-system.md`; runtime tokens `packages/ui/src/styles/globals.css`; primitives `packages/ui/src/components/*`; app adapters `apps/web/app/components/surface.tsx`. Tooling/skill ngoài phải map về các file trên — không tạo authority song song.

## D045: Shell điều hướng một sidebar (tier1 tab + tier2 sub-tab) (2026-06-22)

**Decision (net, collapse-mode theo D063):** Chrome Management dùng MỘT sidebar trong một `SidebarProvider`/`SidebarInset`; `AppShell` nhận `tier1` (tab chính cross-module theo ACL) + `tier2` (deep nav mô-đun đang mở). Tab chính không trải phẳng page con; Admin gom về tab "Quản trị". Mobile `<md`: bottom-nav = tier-2 + một tab "Mô-đun" mở drawer. Nav-as-data + MODULE_ACL single-source giữ nguyên. Canonical: `docs/modules/ui.md` § Management Shell Structure. Đảo phải sửa bản ghi này trước.

## D046: Gỡ Web Push server-side, thay bằng popup foreground `Notification` API (2026-06-22)

**Decision:** "Thông báo trên thiết bị" = popup OS từ client qua `Notification` API khi PWA đang mở (Realtime INSERT → refetch → `showNotification`); KHÔNG có lớp Web Push server (VAPID/cron/ledger đã gỡ). Đánh đổi chấp nhận: không thông báo khi app đóng. Popup bắn cho MỌI severity nhìn thấy được (gồm `info` `pos.order_new`). In-app feed giữ nguyên. Canonical: `docs/spec/toast-notification-system.md`. Đảo phải sửa bản ghi này trước.

## D047: Non-prod runtime = Supabase preview-branch + Vercel Preview mỗi PR (2026-06-27)

**Decision (net):** Non-prod database runtime dùng Supabase Preview Branch;
Vercel Preview có thể nối vào đúng branch ref khi cần runtime smoke. Agent được
create/use/delete Preview Branch theo database rules; quyền production không mở
rộng. Per-PR auto-provision vẫn Parked đến khi seed safety, teardown, spend và
env binding được chứng minh. Canonical: `docs/agent/rules/database.md` +
`docs/runbooks/db/preview-branch-setup.md`.

## D048: Hợp nhất IA quản lý Người + Chi nhánh (2026-06-28)

**Decision:**

- **Người:** staff administration gộp vào `/hr/staff` (nhãn "Nhân sự"); **giữ `staff` ACL key tách biệt** (account/role/permission owner-only, lồng trong `/hr`).
- **Chi nhánh:** list → `/branches` (module key `branches`, owner-only); `menu-limits` → branch hub, quyền siết owner/branch_manager — cashier/chef vẫn có đường riêng 86 món qua KDS `mark_kds_item_out_of_stock`.
- **Branch switcher** trong `AppShell`: hiện cho mọi role đa-chi-nhánh, ẩn khi ≤1 CN.
- Không chọn: `/admin/people` mới; gộp 2 shell.

Canonical route/ACL: bảng generated trong `docs/spec/role-route-matrix.md`.

## D049: Cho phép huỷ toàn phần đơn đã thanh toán tại POS — giới hạn D023 (2026-06-28)

**Decision (owner — mở HẸP đúng nhánh full-void-after-paid; D023 giữ cho mọi correction khác):** huỷ toàn phần đơn đã thanh toán ngay tại POS = hoàn tiền + huỷ HĐĐT per_order + rời board, một transaction nguyên tử, manager-gated, bắt buộc lý do, audit đầy đủ.

1. **Cổng:** key `pos:void_paid_order` — chỉ `owner` + `branch_manager`; KHÔNG cấp `cashier`, KHÔNG tái dùng `pos:void_order`.
2. **Lý do:** trim 20–500 ký tự (khớp `cancelInvoiceSchema`).
3. **HĐĐT:** huỷ toàn phần = **HUỶ** (cancel), không phải điều chỉnh/thay thế. **Chặn cross-period:** proxy bảo thủ theo THÁNG dương lịch ICT (`issued_at < date_trunc('month', now())` → route kế toán). Kế toán xác nhận: Má Tư khai theo QUÝ, mốc-tháng bảo thủ hơn → GIỮ, không bao giờ lọt hoá đơn đã kê khai; hard-block theo period-close thật là việc defer riêng. Căn cứ huỷ: NĐ 254/2026 + TT 32/2025.
4. **Actor:** `branch_manager` ĐƯỢC huỷ HĐĐT issued dưới cổng này — RPC inline flip `tax_invoices.status='cancelled'` + ghi `tax_invoice_events`, KHÔNG gọi `transition_tax_invoice_state` (owner-only).
5. **Mặc định:** đơn `cancelled` rời board + rớt doanh thu; refund một chạm tại till; re-pay = đơn mới; full-void-only; reject `multiple_payments`.

**GIỮ ở Owner + Kế toán:** hoàn một phần/theo món, hoá đơn điều chỉnh/thay thế, sửa-sai daily_summary B2C — RPC chặn đơn đã gộp daily_summary (`order_in_daily_summary`). Đảo phải sửa bản ghi này trước.

## D050: Operator Workspace — một plane vận hành mobile-first tại `/br/[branchId]/*` (2026-06-29)

**Decision (owner, net):**

1. **Hai mặt phẳng = 2 họ chrome D019/ADR 0012:** Branch plane (mobile/tablet, gốc `/br/[branchId]/*`) + Admin Dashboard (`AppShell` responsive chỉ dành cho Owner: `/admin` + domain route families + `/branches`).
2. **Mọi route operator-facing dồn về `/br/[branchId]/*`** (đã move: `/employee/*` → `/br/[id]/shift/*`; sàn Kho → `/br/[id]/stock/*`). branchId trên URL = SSoT; staff pin thì Branch Hub tự điền.
3. Branch dashboard + control + setup (tables/pos/kds/printers) + `pos-sessions` thuộc Operator plane (amend D019 §1 + D017).
4. **Branch-context = 1 provider** `resolveBranchContext()` thay 3 cơ chế scope cũ; proxy + RLS + `MODULE_ACL` + `has_permission` giữ nguyên làm cổng gác — context chỉ là lớp đọc.
5. **Branch Hub = entry device-aware** (`resolvePostLoginRedirect`): canonical = bảng generated "Post-Login Home By Role" trong `docs/spec/role-route-matrix.md`.
6. **Phone bottom-nav operator = `Hôm nay · Ca · Lịch · Tôi`** (ratify D058 §2) + capability tiles từ `nav-config.ts`/`MODULE_ACL`, gate server-side.
7. Không viết lại POS/KDS/Runner — chỉ re-root lên context + Hub.

Scope: Admin Dashboard People/Branch IA thuộc D048; "Việc trong ca" thuộc D052. Đảo điểm nào phải sửa bản ghi này + D019 trước.

## D052: "Việc trong ca" — gom & cấu hình theo vị trí (2026-06-29)

**Decision:**

1. **Một khái niệm "Việc trong ca"** (bỏ "Checklist"/"Mẫu checklist"). Mỗi việc có LOẠI: `Việc thường` / `Tiêu hao` / `Kiểm kê` — tái dùng engine Tiêu hao & Kiểm kê sẵn có.
2. **Cấu hình trực tiếp theo vị trí** — bỏ "Mẫu" rời + bước gán; 6 surface config → 2 (Ca làm + Vị trí→Việc trong ca).
3. **Lưới = vị trí × ca mở/đóng** qua cờ tường minh `shifts.is_opening/is_closing` (không MIN/MAX `start_time`); positions tenant-level dùng chung.
4. **Kiểm kê:** giao đếm GIỮ ở Inventory (đếm mù RLS); trạng thái đọc từ phiếu đếm hôm nay `submitted`/`approved`.
5. **Bỏ override theo từng nhân viên.**
6. **Giai đoạn còn 2:** `Đầu ca` / `Cuối ca`; bỏ scope `weekly`.

Đảo phải sửa bản ghi này trước.

## D053: POS/KDS inventory truth by final order outcome (2026-06-30)

**Decision (net, flag theo D065):**

1. **Rollout:** trừ-kho-khi-bán gate bằng MỘT branch flag `pos_stock_outcome_posting` (D065), default ON cho mọi chi nhánh vận hành; rollback = Chủ quán tắt flag theo chi nhánh.
2. **D016:** flag bật là policy mặc định; chi nhánh được Chủ quán tắt giữ trạng thái không trừ kho và không rào tồn.
3. **UI ownership:** quản lý sell state ở branch manager surface (`Tồn | Sẵn bán | Còn`); POS/KDS chỉ thấy trạng thái bán được/khóa món.
4. **Pending demand:** POS create/append chỉ tạo demand/reservation qua `branch_menu_item_daily_holds` — không reservation table thứ hai.
5. **Payment-before-ready (Option B):** stock outcome chỉ post khi đủ cả hai: order paid/completed VÀ stock-tracked KDS ticket đã từng ready.
6. **Ready boundary:** `kds_tickets.first_ready_at` bất biến, set lần đầu khi ticket `ready`; recall không reset.
7. **Outcome mapping:** paid/completed + first-ready → `consumption`/`sale_consumption`; cancel trước first-ready → no movement; cancel sau first-ready → waste `cancelled_after_kds_ready` (chỉ line đã ready/served; line pending chỉ release demand).
8. **Idempotency:** partial unique index trên `stock_movements` grain `(tenant_id, order_id, movement_subtype, ingredient_id, location_id)`.
9. **Stock owner = Kho CN/default issue location;** KDS/Bếp không là stock owner.
10. **Multi-unit:** mọi movement convert về base unit qua tenant-aware helper trước khi ghi ledger.

Đảo điểm 1–10 phải sửa D053 trước.

## D055: Operator plane qua active branch context (2026-07-02)

**Decision (net sau D073/D076/D077/D078):** Soft-routing central-site roles và
`/employee` home đã hết hiệu lực. Active access buckets vào Branch Hub theo
`docs/spec/role-route-matrix.md`; central kinds chỉ còn dữ liệu lịch sử.
## D056: Operator GRN-receive route + hướng consumption (2026-07-02)

**Decision:**

1. URL `receive` dưới `/br/[id]/stock` dành riêng cho **transfer-receipt**; goods-receipt (GRN) không chia sẻ prefix — operator GRN detail = route `stock/grn/[id]` wrap `GRNDetailPageContent` (embedded, branch-scoped), `afterCreateGrnHref` trỏ tới đó.
2. **Consumption ≠ Issues:** giữ hai khái niệm phân biệt theo
   `docs/ref/inventory.md`; tiêu hao không được gắn nhãn như xuất kho nội bộ.

## D058: Hai presentation plane, một contract (2026-07-03)

**Decision (net sau D059/D061/D076/D077):** Branch runtime là touch-first dưới
`/br/[branchId]/*`; Management workspaces giữ dense desktop-responsive
presentation. Hai plane dùng chung data loader/model/Server Action/RPC/permission
khi phù hợp nhưng không dùng Admin Dashboard chrome trong Branch. Mỗi role chỉ được quảng
bá một cửa cho cùng job; compatibility route phải redirect.

Page archetype sống ở `docs/spec/page-archetypes.md`; component ownership/query
sống trong machine registry. Mọi surface đổi phải QA phone, tablet và desktop.
## D059: Branch-complete native workflow (2026-07-03)

**Decision (net, sau ADR 0012):** Mỗi active branch-pinned role phải làm được job được cấp
quyền trong Branch runtime mà không đi qua Admin Dashboard bridge. Branch Hub là home;
Admin Dashboard chỉ còn một shortcut có kiểm quyền cho Owner.
Branch presenter touch-native có thể chia sẻ loader/model/action với Management,
nhưng không chia sẻ chrome hoặc desktop-first presenter.
## D060: Inventory workflow — WAC, không lot/FIFO/requisition (2026-07-03)

**Decision (net sau D073/D078):** Inventory dùng WAC theo stock-bearing
warehouse của branch. Không mở FIFO/FEFO, lot/expiry ledger, multi-bin WMS,
requisition/PO workflow hoặc formal multi-level approval. GRN là supplier-first;
stocktake và ledger/RPC hiện hành là correctness boundary. Canonical:
`docs/ref/inventory.md`.
## D061: Management Inventory oversight (2026-07-03)

**Decision (net sau D078):** Management workspace có thể đọc tồn, kiểm kê và
lịch sử transfer để oversight; Branch runtime sở hữu thao tác tại chỗ. Không dùng
oversight entry để tái mở same-branch Kho↔Bếp hoặc cross-branch transfer mới.
## D062: Native-quality PWA là hướng giao (mở rộng D012, KHÔNG rewrite native) (2026-07-03)

**Decision (owner):** Mục tiêu = trải nghiệm native bằng PWA chất lượng native; D012 (loại native-framework) VẪN đứng. Chương trình additive: **PWA-1** Operator Hub cài được như app (manifest riêng `/br/[branchId]`, mirror pattern station, tái dùng `pwa-runtime`/`pwa-toolbar`); **PWA-2** offline shell tối thiểu cho Hub; **PWA-3** native-feel (standalone chrome, safe-area, press feedback — trong Motion Contract § G, không animation library mới); **PWA-4** perf nối vào lane hiện có. Không route/ACL/schema change; không framework/dep PWA thứ hai; push notification tùy chọn. Đảo (mở lại native rewrite, bỏ installable Hub) phải sửa bản ghi này trước.

## D063: Desktop mode cho Management chrome (2026-07-03)

**Decision (net):** Management dùng cùng `SidebarProvider` với icon-collapse,
không dựng rail thứ hai. Module phẳng không bọc group một-item trùng tên. Width,
density và master-detail phải theo design system/page archetype, không giữ backlog
triển khai trong decision log.
## D064: POS capacity and manual quota (2026-07-04)

**Decision (net sau D065/D078):** Missing recipe hoặc unit conversion không tạo
stock capacity giả; món đó nằm ngoài stock gate và fail-loud ở màn quản lý. Manual
daily limit là owner/manager input riêng, không seed từ tồn. Refund/void chỉ trả
quota khi line chưa first-ready. Stock availability/posting dùng một flag D065
và một Kho CN; kitchen-stock trigger đã nghỉ.
## D065: "Trừ tồn khi bán" = một công tắc trọn gói — bật là rào cứng, kho không âm (2026-07-04)

**Decision (owner — đảo mô hình 2-flag/advisory của D064 gốc có chủ đích):**

1. **MỘT công tắc owner-facing "Trừ tồn khi bán"** = `pos_stock_outcome_posting`. BẬT = trừ kho theo định mức khi bán + CHẶN CỨNG khi hết tồn (bán đúng số lượng tồn, kho không bao giờ âm, hết = khóa món đến khi nhập thêm — GRN vào là tự mở vì capacity tính live). TẮT = không trừ, không rào, bán vô hạn. Không có chế độ trừ-mà-không-chặn; flag `pos_stock_availability_gate` đã xóa; `gate_eff` trong reader RPC := chính flag posting.
2. **Enforcement = DB hard gate:** trigger AFTER INSERT trên `order_items`, pool KHO CHI NHÁNH (warehouse — không phải bếp như trigger đã gỡ ở D064 §7), chỉ chạy khi flag bật, scoped vào nguyên liệu của đơn, cùng công thức demand với availability (mains + sides, `inv_to_base_for_tenant`), serialize `FOR UPDATE` trên `stock_levels`, skip-hatch GUC `comtammatu.skip_quota_enforcement`, lỗi P0001 `insufficient_stock_ingredient:<id>` (POS map sẵn copy VN, non-retryable).
3. **Kho không âm tuyệt đối:** giữ constraint. Shortage lúc ghi sổ thanh toán (race hiếm lọt gate): payment VẪN hoàn tất, KHÔNG ghi movement (không partial-post), RAISE WARNING — lệch bắt bằng kiểm kê (doctrine đếm D027/D028).
4. **Món không định mức / thiếu quy đổi:** giữ D064 §2 — ngoài vòng kiểm soát kho, bán tự do.

Trigger inert khi flag OFF. Đảo phải sửa bản ghi này trước.

## D066: Central-site context — superseded (2026-07-04)

**Decision (net sau D073/D076/D077/D078):** Central-site operator context, tiles,
roles và Office card đã hết hiệu lực. `branch_kind` central values chỉ giữ cho
lịch sử; POS/KDS/Runner và Branch Hub chỉ operate active `branch` kind.
## D067: Branch Inventory native presentation (2026-07-04)

**Decision (net sau D073/D078):** Central-supply hub đã nghỉ. Durable rule còn
lại: Branch stock routes dùng touch-native presenter và chia sẻ loader/model/action
với Management khi phù hợp; không nhúng desktop presenter hoặc tạo shell mới.
GRN bắt đầu từ NCC, không từ PO.
## D068: Kho CN tự nhận NCC (GRN) + sản xuất tại chi nhánh — branch_manager, own-branch (2026-07-05)

**Decision (owner):** (1) Kho CN (`branch`) tự nhận hàng NCC trực tiếp — không bắt buộc qua Kho Tổng; (2) chi nhánh chạy được workflow sản xuất hiện hành; (3) actor = `branch_manager`, quyền tạo/xác nhận chỉ own-branch qua permission + RLS; (4) `branch_manager` được tạo NCC nhanh qua `procurement:supplier_manage`; (5) **(net cuối theo D073 §4) PO và Trả hàng NCC nghỉ cả hai plane**. Hàng lỗi xử qua Báo hao hụt. Canonical: `docs/ref/inventory.md`; runtime authority: `module-acl.ts`, `inventory-roles.ts`, permission keys và RLS/RPC.

## D069: Be Vietnam Pro heading + Shift-aware night mode (2026-07-07)

**Decision (owner, đảo phần heading của D038):** Heading/display = Be Vietnam Pro (subset `vietnamese`+`latin`); body + data giữ Geist + Geist Mono. Night mode = warm-dark "gạo cháy", auto 18:00–06:00 local + cookie override `matu-theme`, map vào class `.dark`, KHÔNG dùng `prefers-color-scheme`; scope toàn app; receipts/ESC-POS pipeline theme-independent; toggle duy nhất `ThemeToggle`. Canonical: `docs/spec/design-system.md` § Typography Contract + Theme runtime; palette values sống ở `packages/ui/src/styles/globals.css`.

## D070: SectionLabel primitive + ratchet EASY WIN + HR density-first (2026-07-08)

**Decision (owner):** (1) `SectionLabel` primitive 2 density variant (`default`/`dense`), render `<div>` (eyebrow là typographic role, không phải semantic heading); (2) `/hr` density-first (bỏ KPI mosaic, EmployeeTable làm focal point, readiness = count strip); (3) ratchet easy-win đã reconcile. Canonical: `tasks/regressions.md` [SECTION-LABEL-SSOT] + `docs/agent/rules/ui.md` § Typography Rules. Còn ngoài scope: SectionLabel group b (9 complex sites) / group c (12 Label/Badge); logo night variant.

## D071: DS contrast wave + 4 hạng mục adapter + Motion Step 0-A (2026-07-10)

**Decision (owner):** (1) `--{status}` là MỰC (AA 4.5:1 trên nền + tint của chính nó, cả 2 theme), `--{status}-foreground` chỉ là chữ trên nền đặc; light `--warning` rời brand gold (`#f2a100`→`#8e5400`), light `--success` đậm hơn (`#446935`); vàng gạo vẫn là accent ở `--ring`/`--chart-2`; night CTA lật foreground về nền tối. (2) 4 hạng mục adapter: `ItemTitle` giữ default dense + role contract `size="heading"`; field-trigger grammar hợp nhất qua `packages/ui/src/lib/field-trigger.ts` (Select/Combobox/TagInput/multi-select); POS/KDS touch target lên rung `icon-touch`/`touch`; `DataTable` tự own client-side paging, 6 growth list bật `pageSize={50}` — sort/sticky header chờ UI Advisor Gate. (3) Motion Step 0 = phương án A (ADR 0010): one-shot content enter `duration-150` + `motion-safe:` cho realtime INSERT thật (cart line mới, KDS ticket mới); `duration-300` vẫn khóa overlay-only. Enforce: gate `status-foreground-on-tint` + `status-focus-ring-contrast` (baseline 0) + `design-token-contrast-static.test.ts`. Canonical: `docs/spec/design-system.md` § Token Contract + §G.

## D072: Hợp thức hóa brand expression đang sống + mở compact-empty symbol (2026-07-10)

**Decision (owner, phương án a — hợp thức hóa thay vì gỡ):** (1) Pattern caro placements = danh sách ĐÓNG: Runner footer strip, login full-surface wash, Management sidebar header wash; full-surface wash chỉ hợp lệ dạng trang trí `aria-hidden`/`pointer-events-none`, opacity ≤10 — gate `brand-pattern-placement` allowlist đích danh. (2) Mascot động = full-screen waiting/idle only (Runner idle board, `PageSpinner fullScreen`, login brand panel), không bao giờ trên control tương tác hay chrome trong trang — gate `mascot-animation-placement`. (3) Compact-empty mở cho `BrandSymbol`: `symbol` hợp lệ trên `AppEmptyState compact` khi empty là trạng thái chính của trang/section (queue trống, catalog trống); inline/row-level giữ text-only. (4) Xóa `transition-transform duration-200` chết trên card lockup login. Canonical: `docs/spec/design-system.md` § brand-patterns + § utilities + §G.

## D073: Ngừng site Bếp Trung Tâm — một kind vận hành duy nhất `branch`, stock cutover dồn về Branch Hub (2026-07-10)

**Context:** Kho Tổng (site 15) đã đổi kind về `branch` và tắt trước đó; Bếp TT (site 16) là site trung tâm cuối cùng (1 location, 29 dòng tồn, 3 lệnh nấu 2026-07-10). D068 đã cho chi nhánh tự nhận NCC + chạy lệnh sản xuất.

**Decision (owner 2026-07-10):**

1. **Site 16 tắt hẳn:** chuyển toàn bộ tồn về Phước Hải (site 3) qua luồng transfer sẵn có (`central_kitchen → branch` hợp lệ theo transfer matrix D000) rồi `is_active = false`. Nhân sự bucket `production_manager` — **sửa bởi D076:** không sắp xếp lại role, tài khoản bị xoá cùng lượt retire bucket (không auto-remap). DB enum `branch_kind` GIỮ nguyên (lịch sử data); chỉ vận hành và UI hết fork.
2. **Một kind vận hành duy nhất `branch`.** Mọi nâng cấp stock đã chuẩn bị cho đợt Bếp (mockup GRN 3 bước · Ghi mẻ một màn · Tồn 44px, đã owner-duyệt) áp cho `/br/[branchId]/(operator)/stock/*` kind `branch`. Plan sống ở `tasks/todo.md` § Branch Stock Cutover.
3. **Công thức = Admin Dashboard-only:** operator dùng công thức để prefill định mức khi ghi mẻ, không sửa; tile `production/recipes` rời operator, quản trị công thức về Admin Dashboard `/inventory` (Owner).
4. **Chỉ "Danh mục" mở cho chi nhánh; PO và Trả hàng NCC NGHỈ HẲN cả hai plane** (owner siết lại cùng ngày): GRN đã NCC-first (`po_id` nullable) nên không cần PO; hàng lỗi xử qua Báo hao hụt (ảnh + lý do) thay Trả NCC. Bảng + lịch sử DB giữ nguyên; gỡ tile/route/action khỏi Branch lẫn Admin Dashboard. Catalog mở cho `branch` KHÔNG cần grant mới — categories/units/ingredients gate bằng RLS/module, suppliers dùng `supplier_manage` đã cấp ở D068 §4.
5. **Mô hình tồn kho tối giản — (sửa bởi D078) 1 chi nhánh · 1 location (Kho):** bỏ lô/HSD (cột + plumbing RPC, slice riêng trong tracker). Kho↔Bếp và `commit_intra_branch_transfer` nghỉ hẳn; vòng Yêu cầu → Gửi → Nhận / transfer cross-branch operator cũng nghỉ sau khi chuyển tồn site 16 → 3 xong.
6. **Sau khi site 16 tắt, gỡ fork central khỏi operator UI** — `CENTRAL_HOME_TILE_SUFFIXES`, CTA home central, các nhánh `isCentralKitchen`/`isCentralSupply` trong loader hub, entries `kinds` central trong nav-config, archetype exceptions #19–#23, mục central trong `docs/ref/screen-context-map.md` §2.5 — xóa sạch, không tombstone.

**Consequences:** D066 §3/§4/§7a hết hiệu lực; D067 §2 hết "đợt Bếp"; D068 §5 net cuối = PO nghỉ hẳn (không mở cho branch). D000 transfer matrix giữ cho lịch sử. §5 net cuối = D078. Đảo mục 1–6 phải sửa bản ghi này trước.

## D074: Voice alert KDS chạy bằng TTS trình duyệt, không clip thu sẵn (2026-07-10)

**Context:** ADR 0008 (2026-07-09) chốt clip MP3/WAV thu sẵn làm voice engine và cấm `speechSynthesis`. Tới 2026-07-10 chưa ai thu clip nào, `apps/web/public/audio/` trống, nên KDS vẫn chỉ có beep — lớp voice chưa từng ship.

**Decision (owner 2026-07-10):**

1. **Voice engine = `window.speechSynthesis`** (`lang = "vi-VN"`). Không asset, không dependency; slot số bàn là nội suy chuỗi. Máy có danh sách voice đã nạp mà không có voice `vi-*` → bỏ voice, beep vẫn chạy theo mode. Cloud/realtime TTS vẫn nghỉ.
2. **Scope đợt này = KDS Phase 1** (3 kind `kds.new` / `kds.append` / `kds.add_on`). POS Phase 3 giữ nguyên trạng thái đặt chỗ.
3. **Chrome KDS = một nút xoay vòng** `off → beep → beep+voice → off`. Mode `voice`-only vẫn hợp lệ khi đọc pref, chỉ là chrome chưa mở. Preview khi đổi mode chính là user gesture mở khoá audio + speech.
4. **Clip thu sẵn (giọng Má Tư) tụt xuống Phase 4** — thay engine mà không đổi `kind`/template.

**Consequences:** ADR 0008 §3 và §"Alternatives Rejected" B đảo chiều (clip pack thành phương án bị loại cho MVP); non-goals của `docs/spec/operational-audio-alerts.md` đổi theo. Canonical: `docs/plan/adr/0008-operational-audio-alerts.md` + `docs/spec/operational-audio-alerts.md`; runtime `apps/web/lib/operational-audio.ts`.

## D075: Rebuild Self-Order — order POS là sự thật duy nhất, xoá lớp session song song (2026-07-10)

**Context:** Self-Order QR (`/q/[token]`) dựng một vòng đời riêng (`self_order_sessions` × `self_order_batches` × `self_order_session_devices` × `self_order_payment_requests` × access flags = 4×5×6×5×4 trạng thái) song song với vòng đời order/bàn của POS. Hệ quả owner chỉ ra 2026-07-10: (a) staff phải duyệt TỪNG lượt món; (b) ràng buộc thiết bị + mã ghép quá phiền cho bàn nhiều người; (c) bàn kẹt phiên `active` khi khách bỏ đi hoặc thu tiền qua đường khác; (d) POS và self-order không chung khái niệm "bàn đang có khách"; (e) `revoked` chỉ hồi được bằng cách xoay token = in lại QR dán bàn, bất khả thi.

**Decision (owner 2026-07-10):**

1. **Order của POS là sự thật duy nhất.** Một seating = một `orders` mở trên bàn (`payment_status <> 'paid'` và `status not in (completed, cancelled)`). Xoá `self_order_sessions`, `self_order_batches`, `self_order_session_devices`, `tables.self_order_capability_version`, `tables.realtime_topic_token`, toàn bộ RPC `self_order_*_v2`. Còn đúng 1 bảng mới `self_order_requests` với 1 enum 3 giá trị `pending | accepted | rejected`, unique partial index 1 hàng đợi/bàn.
2. **Gate 1 lần mỗi seating, không phải mỗi lượt.** Bàn chưa có order mở → lượt đầu vào hàng đợi `pending`, staff duyệt → `create_order` → `route_order_to_kds` chạy sẵn. Bàn đã có order mở (POS tạo hay QR tạo đều được) → khách gửi món là `append_order_items` thẳng xuống bếp, không ai duyệt. Bàn có ≥2 bill mở → rơi về `pending`, staff chọn bill đích lúc duyệt; hệ thống KHÔNG đoán bill.
3. **Bỏ sạch ràng buộc thiết bị.** Xoá cookie `device_token`, mã ghép, xin join, thu hồi thiết bị, nhánh 428-retry ở client. Đánh đổi được owner chấp nhận có ý thức: ai có ảnh chụp QR bàn đều đọc được bill và thêm món khi bàn đang mở. Duyệt lượt đầu chặn người lạ MỞ bàn, không chặn người lạ THÊM món vào bàn đang mở. Phòng ăn là biên tin cậy; món lạ ra bàn thì nhân viên thấy. Rate limit (`self_order_rate_buckets`) giữ nguyên.
4. **Luồng thanh toán giữ nguyên ở cấp sản phẩm** (owner không đánh dấu sai): đúng 1 intent sống trên mỗi order, khách không tự huỷ, staff huỷ. `self_order_payment_requests` bỏ phụ thuộc session và bind trực tiếp bằng `order_id`; bàn có nhiều bill thì khách không được xem/khởi tạo thanh toán cho tới khi staff chọn bill. Nút huỷ dời từ `SelfOrderApprovalSheet` (bị xoá) vào sheet bill của bàn ở table map — nếu không dời, khách kẹt vĩnh viễn sau VietQR hết hạn.
5. **IA khách: menu là trang duy nhất.** Bỏ `Tabs`, bỏ `StatusPill`, bỏ tên chi nhánh khỏi header. Header chỉ đặt `Cơm Tấm Má Tư` và số bàn. Món chính dùng ảnh như chất liệu menu, còn tên/giá luôn nằm dưới ảnh; món phụ/nước giữ hàng gọn. Sticky cart chỉ mở giỏ để khách rà soát, còn `Gửi món` chỉ ở trong sheet. `Hoá đơn` là nút + `Badge` cố định ở góc phải dưới, luôn hiện và mở `Drawer`, **không tự bật** (quy tắc auto-switch-to-Bill của spec cũ chết theo Tabs). Drawer mặc định chỉ hiện món đã gọi và CTA `Thanh toán`; CTA chuyển cùng Drawer sang Payment, có nút trở lại Hoá đơn. Bàn chưa có món hoặc có nhiều bill chỉ xem trạng thái trống an toàn; thanh toán vẫn khoá. Trạng thái chờ/từ chối dùng `Dialog`; lỗi làm mới và phản hồi không chặn dùng toast. Header không mang thông báo workflow.
6. **Mascot mở cho G0.** `BrandMascot animated={false}` hợp lệ trên màn "bàn không khả dụng" — đảo dòng `BrandMascot = Forbidden` của spec cũ. Không asset mới, không keyframe mới (mascot chỉ có 1 ảnh `cotlet.png`, mood là CSS).
7. **Nổi bật món chính bằng `menu_categories.type`** (`main_dish` → thẻ lớn có ảnh; `side_dish | drink | dessert` → hàng gọn). Không thêm cột `is_featured` trên `menu_items`.
8. **Bỏ realtime, dùng polling thích ứng:** 3s khi `Chờ xác nhận` / `Đang thanh toán`, 15s lúc khác, refetch khi tab focus + bfcache. Xoá topic token, trigger broadcast, policy realtime.
9. **Chuông báo request mới = `playAppSignal` device-local** trên máy POS đang mở. Không ghi `public.notifications`, không Telegram — đúng ADR 0008 (self-order approval đã được đặt chỗ là POS phase).
10. **Sau khi trả tiền, order biến khỏi snapshot.** Màn "Đã thanh toán" chỉ sống trong phiên trình duyệt hiện tại; reload → menu sạch. Khách bàn sau không bao giờ thấy bill cũ.

**Consequences:** Bàn kẹt và `revoked ⇒ in lại QR` biến mất vì không còn session để kẹt và không còn `revoked`; `trg_order_release_table` có sẵn lo phần trả bàn. `self_order_batches` chết vì lịch sử lượt đã nằm sẵn ở `kitchen_send_batches`. Còn 6 RPC. Chưa có màn admin bật/tắt `self_order_enabled` hay in QR bàn — lỗ hổng đã biết, ngoài scope đợt này. Canonical: `docs/spec/self-order-guest-ui.md`. `docs/spec/self-order-motion-design.md` phải rà lại vì nó tham chiếu Tabs + cart cũ.

## D076: Retire bucket `office`, `warehouse_manager`, `production_manager` — 5 bucket còn lại, xoá tài khoản không remap (2026-07-10)

**Context:** Site trung tâm (Kho Tổng, Bếp Trung Tâm) đã tắt hẳn theo D073; `warehouse_manager`/`production_manager` không còn site để soft-route vào (D055 §1 chết theo). `office` chỉ còn nghĩa "đọc `/finance`" mà owner tự làm qua bucket `owner`; giữ 3 bucket rỗng-chức-năng này chỉ tổ tốn nhánh code/test.

**Decision (owner 2026-07-10):**

1. **`ACCESS_BUCKETS` còn đúng 5:** `owner | branch_manager | cashier | chef | branch_staff`. Xoá `office`, `warehouse_manager`, `production_manager` khỏi type, `MODULE_ACL`, mọi SQL twin (`private.staff_role_from_position_code`, `public.auth_role_to_position`, `public.position_id_from_access_bucket`, `public.admin_update_profile`).
2. **Xoá tài khoản, KHÔNG auto-remap.** Mọi `auth.users`/`profiles` đang gắn bucket retired bị hard-delete (cascade); FK non-cascade (GRN/PO/stock/payments/...) reassign về owner trước khi xoá để không vỡ ràng buộc — không giữ lại tài khoản dưới bucket khác. Hệ quả chấp nhận: lịch sử `attendance_records`/`leave_requests`/payroll của các tài khoản này cascade-xoá theo `employees`.
3. **HR position code giữ, chỉ soft-retire:** `office, accountant, marketing, technician, design_construction, warehouse_manager, central_supply_manager, production_manager, central_kitchen_manager, head_chef` → `positions.is_active = false`, không hard-delete (giữ lịch sử chấm công/lương cũ resolvable). `role_templates` của các code này bị xoá.
4. **`branch_kind` enum GIỮ nguyên** (`central_supply`, `central_kitchen` vẫn tồn tại trên enum cho dữ liệu lịch sử) — chỉ 2 role bucket từng soft-route vào đó bị retire, không phải khái niệm site.
5. **Central-site soft-routing xoá sạch khỏi app layer:** `centralSiteBranchKindForRole`, `resolveCentralSiteHomeBranchId`, `homeBranchId` trên `BranchHubContext`/`resolvePostLoginRedirect` — proxy + scope engine chỉ còn so khớp `claims.branch_id === routeBranchId` (owner vẫn cross-branch không đổi).
6. **Office ACL của `branch_manager` giữ nguyên như trước** — quyết định này không đụng tới quyền branch_manager đã có trên inventory/hr/menu/orders.

**Consequences:** D055 §1 hết hiệu lực (sửa tại chỗ). D073 §1 "owner sắp xếp lại role production_manager" sửa thành xoá tài khoản. Canonical: `packages/shared/src/auth/types.ts` (`ACCESS_BUCKETS`), bảng generated trong `docs/spec/role-route-matrix.md`.

## D077: Branch Hub là cửa vào mặc định — chỉ `branch` được vận hành (2026-07-10)

**Context:** Sau D073/D076, app chỉ còn một kind vận hành là `branch`, nhưng
owner desktop vẫn vào `/finance`, picker vẫn quảng bá mọi site active, và
Branch Hub chưa có cửa rõ ràng tới cấu hình chi nhánh cùng các workspace riêng
của Owner. Production có thể còn row site trung tâm chưa deactive đồng bộ; row
đó không được quay lại thành một nơi vận hành chỉ vì `is_active = true`.

**Decision (owner 2026-07-10):**

1. **Branch Hub là home mặc định của mọi access bucket.** Owner không còn mặc
   định vào Finance; khi chưa có `branch_id`, fallback là `/`, nơi resolver mở
   thẳng branch vận hành duy nhất.
2. **Operator scope chỉ nhận `branch_kind = branch`.** Owner vẫn có quyền đọc
   lịch sử tenant-wide ở các workspace quản trị, nhưng `/br/[branchId]` không
   mở central-kind site. Route branch ngoài allowed set phải fail closed, không
   âm thầm render branch mặc định dưới URL sai.
3. **Một branch thì tự mở; nhiều branch mới hiện picker.** Header Branch chỉ
   hiện nút đổi branch khi resolver trả `canSwitchBranch = true`; không hardcode
   id Phước Hải.
4. **Branch Hub có hai nhóm quản trị có kiểm quyền:** Owner/Branch Manager mở
   Menu + Cài đặt chi nhánh; chỉ Owner mở Finance + HR + Payroll + Thiết lập hệ
   thống. Đây là shortcut quản trị, không cho phép operator workflow import hay
   render Office chrome.
5. **Workspace Owner giữ nguyên route kỹ thuật trong lát này.** Không move
   `/finance`, `/hr`, `/menu`, `/admin/settings`; việc bỏ Office shell là lát
   riêng sau khi Hub entry ổn định.

**Consequences:** D050 §1 và D058 §1/§5 hết hiệu lực ở phần home mặc định của
Owner; hai-plane presentation vẫn tồn tại tạm thời nhưng Branch Hub là cửa vào
duy nhất được quảng bá. Canonical runtime: `branch-hub.ts`,
`branch-context.ts`, `nav-resolution.ts`, và Branch Hub page.

## D078: Tắt Bếp chi nhánh — một kho duy nhất mỗi chi nhánh (2026-07-10)

**Context:** D073 §5 còn khóa mô hình `1 chi nhánh · 2 location (Kho, Bếp)` và
slice S11 (`commit_intra_branch_transfer` Kho↔Bếp). Owner 2026-07-10 chốt tắt
hẳn Bếp CN: kho hàng chỉ còn một kho.

**Decision (owner):**

1. **Một location stock-bearing / chi nhánh:** `location_kind = 'warehouse'`
   (Kho chi nhánh). `location_kind = 'kitchen'` (Bếp CN) nghỉ vận hành —
   deactivate, không seed mới, không cộng vào tồn vận hành.
2. **Mọi luồng tồn dùng kho duy nhất:** GRN nhận, kiểm kê/giao đếm, xuất/
   tiêu hao, sản xuất, POS stock gate/posting, menu-limits capacity — đều
   trỏ warehouse / `is_default_*` trên warehouse.
3. **Điều chuyển Kho↔Bếp nghỉ hẳn:** gỡ UI `Chuyển Bếp` /
   `quickInternalTransfer` / same-branch kitchen target; RPC
   `commit_intra_branch_transfer` retire (raise). Tile operator "Điều chuyển"
   và vòng cross-branch nhận/gửi cũng nghỉ theo D073 S11 (một kho + một
   chi nhánh vận hành không còn cặp nguồn-đích).
4. **KDS/POS "bếp" giữ nguyên** — `kitchen_send_batches`, `/kds`,
   `pos:send_kitchen` là workflow nấu món, không phải stock location.
5. **Enum/history giữ:** `location_kind` và `branch_kind` enum không DROP;
   row kitchen inactive + ledger lịch sử giữ để audit.

**Consequences:** D073 §5 và D000 phần Kho+Bếp sửa tại chỗ. S11 trong
`tasks/todo.md` đảo thành retire (không mở rộng Kho↔Bếp). Canonical:
`docs/ref/inventory.md`, migration single-warehouse, app defaults warehouse-only.

## D079: Mở TTS cho bốn cảnh báo POS quan trọng, không đọc mọi ping (2026-07-11)

**Context:** KDS đã chạy TTS theo D074, trong khi POS vẫn chỉ đọc pref boolean
`pos:sound:{branchId}` và gọi beep trực tiếp. POS đã có bốn event cần thu ngân
chú ý ngay: khách tự gọi, gọi thanh toán, in lỗi và bếp báo hết món.

**Decision (owner):**

1. POS dùng cùng `OperationalAudioMode` và `playOperationalAlert` với KDS;
   mode lưu ở `pos:audio-mode:{branchId}`, đọc tương thích pref boolean cũ.
2. Chỉ bốn kind `pos.self_order`, `pos.payment_received`, `pos.print_failed`,
   `pos.out_of_stock` được nói. Thanh toán chỉ đọc sau khi order chuyển sang
   `paid` và có số bàn thật, theo đúng mẫu “Bàn {số} đã thanh toán”; yêu cầu
   thanh toán chỉ phát chuông. Các ping thường khác vẫn beep-only khi mode có
   beep; không voice-spam quầy thu ngân.
3. Chrome POS giữ một control sẵn có và xoay `off → beep → beep+voice → off`;
   preview là user gesture mở khóa Web Audio + `speechSynthesis`.
4. Không thêm dependency, asset, DB, notification hay server-synced pref.

**Consequences:** D074 §2 chỉ còn mô tả scope lúc ship KDS Phase 1; POS Phase 3
được hoàn tất theo cùng ADR 0008 và runtime `apps/web/lib/operational-audio.ts`.

## D080: KDS voice có khoảng nghỉ 15 giây, không xếp hàng đọc bù (2026-07-11)

**Context:** KDS đã gom alert trong cùng một sync tick, nhưng realtime có thể
đến thành nhiều nhịp liên tiếp. Nếu mỗi nhịp đều đọc số bàn, bếp bị cắt câu và
rối trong giờ cao điểm.

**Decision (owner):**

1. Beep vẫn phát ngay theo tone và debounce hiện có; queue/toast không đổi.
2. TTS KDS phát tối đa một câu mỗi 15 giây. Event trong khoảng nghỉ không xếp
   hàng đọc bù; nhân viên nhìn queue để xử lý đầy đủ.
3. Preview do người dùng bấm đổi mode được miễn khoảng nghỉ và không làm chậm
   alert thật kế tiếp.
4. Chưa thêm câu tổng hợp hoặc scheduler. Chỉ mở khi thử tại bếp chứng minh
   cooldown làm mất tín hiệu quan trọng.

**Consequences:** Voice là lớp định hướng thưa, beep là tín hiệu chú ý tức thời,
còn KDS board vẫn là nguồn sự thật vận hành.

## D081: Chuông kết thúc trước khi TTS bắt đầu (2026-07-11)

**Context:** Ở mode `beep+voice`, Web Audio và `speechSynthesis` cùng bắt đầu nên
chuông gần mức tối đa che phần đầu câu đọc, khiến voice nghe nhỏ trên POS/KDS.

**Decision (owner):** Phát hết chuông, nghỉ 120 ms rồi mới đọc; đặt TTS ở
`volume = 1`. Một alert mới thay thế câu đang chờ để không tạo hàng đọc cũ.
Mode `voice`-only vẫn đọc ngay.

**Consequences:** Câu đọc rõ hơn mà không tăng gain giả hoặc đọc lặp. Âm lượng
thực tế tối đa vẫn phụ thuộc media volume và loa của thiết bị.
