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

**Decision:** Net-effect Inventory được hợp nhất tại D091. Canonical:
`docs/ref/inventory.md`.

## D002: Tenant-Branch 2-level thay vì Company-Brand-Branch 3-level (2026-04-01)

**Decision:** `Tenant (L0) → Branch (L1)`. Tenant = single row (id=1). Mọi scope qua `tenant_id` + `branch_id`. KHÔNG có tầng brand — không brand switcher, JWT không có brand claim; muốn mở lại tầng brand phải có quyết định mới.

## D005: User tự quản lý infrastructure (2026-04-01)

**Decision:** Code chỉ chứa placeholder env vars. AI agent KHÔNG tạo infrastructure resources (Supabase/Vercel/Upstash/GitHub). `.env.example` phải đầy đủ.

## D009: Path-based routing, không sub-domain (2026-04-04)

**Decision:** Path-based (`/` cho Owner, `/br/[branchId]/...` cho Branch runtime, cùng các module L0 top-level) — 1 domain, auth "just works", ACL tập trung ở `proxy.ts`. Sub-domain không nằm trong backlog; muốn tách phải có quyết định mới. Canonical: `docs/spec/architecture.md` § Routing.

## D010: RHF + zod + Má Tư DS Field cho mọi form (2026-04-17)

**Decision:** Form CRUD dùng `react-hook-form + zod 4 + @hookform/resolvers + Má Tư DS Field`; app-local helpers ở `apps/web/app/components/form/`. Ngoại lệ có chủ đích: import/export one-field upload và GRN mobile wizard có shape riêng, không dùng helper chung. Canonical: `docs/modules/ui.md` § Form wrapper layer.

## D011: Print-agent LAN-only transport (2026-05-07)

**Decision:** `apps/print-agent` chỉ hỗ trợ LAN printer transport. Không runtime flag chọn transport, không USB capability columns, không USB native binding. LAN-only enforced trong baseline: `printers` CHECK `printers_connection_type_lan_only` (`connection_type='lan'`), không cột `usb_*`, `printer_agents` không cột `transport`; `src/usb.ts` đã gỡ. Branch rollout = terminal-linked Android gateway + LAN printer.

## D012: Tier-2 trim + gộp role POS — định hướng vận hành tinh gọn (2026-06-10)

**Decision:**

1. LOẠI khỏi backlog (không đề xuất lại): Local-First/offline POS, VNPay (VietQR đủ), native POS Flutter/Capacitor (PWA chạy ổn — tái khẳng định bởi D062).
2. Role POS: sàn bán hàng dùng application role `cashier`; phục vụ là công việc trong ca, không phải role auth riêng.
3. Mọi tính năng mới qua **phễu vận hành tinh gọn**: giảm thao tác chủ + nhân viên hiện có; không thêm nghi thức quản trị không phục vụ vận hành thực tế.

## D014: Chương trình hợp nhất tầng molecule UI — W0–W6 (2026-06-11)

**Decision:** Hợp nhất molecule theo wave; mỗi molecule = contract trong `docs/spec/design-system.md` + ratchet trong `scripts/check-ui-contract.mjs` (allowlist baseline chỉ giảm). W5 chi tiết ở D019; W6 (decompose god-components) còn lại. Canonical: `docs/spec/design-system.md` § Component Authority.

## D015: Chuyển delivery cùng repo sang Greenfield stack (2026-06-12, sửa 2026-07-27)

**Decision:**

1. `comtammatu` là repo sản phẩm duy nhất. Không fork repo, không dựng
   app/package tree hoặc runtime sản phẩm song song.
2. mô hình pháp nhân cũ stack `matu-prod + app.comtammatu.com` tạm ngưng active delivery từ
   commit `baf3720f8`. Nó giữ historical/runtime evidence và temporary type
   source, nhưng không nhận writer, deploy hoặc relink mới nếu chưa có owner
   rollback decision.
3. Mọi delivery sau cutoff tiếp tục trong repo này và hướng tới
   `matu-greenfield-company + web.comtammatu.com`.
4. Không dual-write, không import Auth/dữ liệu vận hành/provider secrets từ mô hình pháp nhân cũ.
   Greenfield chỉ thành Production sau schema replay, negative tests,
   backup/restore, provider/print smoke và owner promotion gate.

**Canonical:** `docs/architecture/target-modules-tech-stack-project-structure.md`
§5.2 và ADR 0015. D084 sở hữu mô hình pháp lý sau cutoff.

## D016: POS trừ Kho chi nhánh theo outcome bán hàng — mặc định (2026-05-28, sửa 2026-07-11)

**Decision (net, sau D053/D064/D065/D078):** Mặc định chi nhánh đang hoạt động được bật `pos_stock_outcome_posting`: POS Sale Runtime ghi giảm tại Kho chi nhánh theo outcome thật, không phải ngay khi thanh toán đơn thuần. Mỗi chi nhánh mới cũng khởi tạo bật; Chủ quán vẫn có thể tắt riêng từng chi nhánh bằng một switch, khi đó không trừ kho và không rào tồn. Khi bật, một công tắc vẫn đồng thời áp rào cứng không âm; sale movement chỉ post sau điều kiện paid/completed + kitchen outcome theo D053/D065. Shortage lúc ghi sổ không được làm payment fail và không được ghi movement một phần.

**Boundary:** Báo cáo tiêu hao thủ công chỉ ghi phần dùng ngoài bán POS; không được nhập lại nguyên liệu đã có `source_type='pos_sale'` cho cùng bán hàng. `finalize_paid_order`, idempotency, refund boundary, và amount recompute giữ nguyên.

Đảo policy mặc định phải sửa quyết định này trước.

## D017: Owner là L0 Tenant Control; Branch Manager dùng L1 Branch Runtime (2026-06-13, sửa 2026-07-28)

**Decision (net sau D091):** Product framing = `bộ phần mềm quản lý vận hành và bán hàng`. Owner vào trực tiếp `/` với full L0. Module L0 ổn định: `/inventory`, `/orders`, `/hr`, `/finance`, `/menu`, `/branches`, `/settings`. **Kế toán** (`accountant`) được vào `/finance` và slice GRN/PO trên `/inventory` theo D091 — không mở stock/production/catalog/valuation, HR tenant hoặc gán quyền. **Kho Tổng / Bếp TT** dùng surface gắn site trung tâm (không giả QL CN). `branch_manager` vào `/br/{branchId}` và chỉ dùng workflow branch-native; **không** xem giá mua/PO chuỗi. Role/route là cổng bề mặt; action + row access tiếp tục qua permission keys, RPC/RLS và branch/site scope.

**Canonical:** `docs/spec/role-route-matrix.md`, D091. Không đặt workflow branch-scoped vào route L0.

## D018: Bỏ tenant-admin phụ — gộp vào `owner` (2026-06-13)

**Decision:** Không có tenant-admin phụ cạnh `owner`; Owner route family chỉ nhận `owner`. `STAFF_ROLES` canonical theo `packages/shared/src/auth/types.ts` (bảng generated trong `docs/spec/role-route-matrix.md`).

## D019: W5 — Cấu trúc hoá UI (shell · route home · nav · padding) (2026-06-13, sửa bởi D090)

**Decision (net, sau D050/ADR 0012, naming D090):** (1) 2 họ chrome product + station — **`control_surface`** = `AppShell` cho L0 tại `/` và các domain route family (code IDs lịch sử `Owner*`), **`branch_surface`** = Operator plane `/br/[branchId]/*` + **`station_chrome`** (POS/KDS/Runner); (2) một capability = một route home theo `role-route-matrix.md`; (3) padding một chủ = `AppPage`; (4) nav là data — mọi sidebar/bottom-nav project từ `nav-config.ts`, cấm `ShellNavGroup[]` literal trong shell. Canonical + gates: `docs/spec/design-system.md` § Structural Governance; glossary `control_surface`. Đảo điểm nào phải sửa quyết định này trước.

## D020: Enterprise Accounting / TT 200 / VAS is outside the product (2026-06-13)

**Decision:** Enterprise accounting / TT 200 / VAS KHÔNG thuộc product contract. Finance authority = operating finance. `accounting_periods` close/reopen là DB-only owner support, không app route nào expose. Tái lập enterprise-accounting → phải sửa quyết định này trước. Canonical: `docs/modules/finance.md` § Accounting Advanced Boundary.

## D022: HĐĐT lập realtime tại payment; không nháp-local sau thanh toán (2026-06-14)

**Decision (owner — cổng pháp lý đóng):** Thời điểm lập HĐĐT = tại thời điểm thanh toán hoàn tất, realtime per-order qua `createInvoice`. Không có chế độ trì hoãn phát hành sau thanh toán. Sửa sai sau phát hành qua owner/accountant (D023, giới hạn D049). Canonical: `docs/ref/einvoice-tax.md` § 3. Đảo thời điểm lập phải sửa quyết định này trước.

## D023: Sửa-sai POS realtime — correction ở owner/accountant (2026-06-14)

**Decision (net, sau D049):** Correction HĐĐT/thanh toán (hủy/thay thế, refund, sửa phương thức) KHÔNG nằm trên màn POS — chỉ ở Owner + Kế toán. Ngoại lệ HẸP duy nhất: full void-after-paid theo D049. Cashier-facing: thanh toán xác nhận **một chạm**, không dialog confirm phụ (khóa bằng `pos-payment-single-tap.test.ts`); phòng lỗi dựa vào correction sau phát hành. `correct_payment_method` RPC = pure record fix, HĐĐT đã phát hành không bị ảnh hưởng.

## D026: HRM redesign — trục Người · Ngày công · Lương (2026-06-15)

**Decision (amended — HR-1, 2026-07-16):**

1. `standard_days` = số công chuẩn owner chọn cho tháng đang xem (mặc định 26) + clamp `working/standard ≤ 1`. Đây là tham số preview, **không** là một kỳ lương cần tạo trước; giá trị được snapshot khi chốt bảng lương.
2. Việc trong ca: cấu hình theo vị trí — chi tiết thuộc D052 (đã thay mô hình template/override cũ).
3. Lương qua HĐLĐ active trong kỳ khi có, fallback `employees.base_salary` cho dữ liệu hiện có.
4. Ca làm: GIỮ (D027), đặt ở "Thiết lập".
5. Lương live chỉ đọc các nguồn vận hành hiện tại: ca đã checkout, đơn nghỉ đã duyệt, HĐLĐ/hồ sơ nhân viên và điều chỉnh lương có nguồn. `payroll_entries` chỉ là snapshot bất biến sau khi chốt, không là nguồn tính lại.
6. HR chỉ **chốt nghĩa vụ lương**. Thanh toán tiền mặt/chuyển khoản và bằng chứng đối soát thuộc Finance `expenses` (category `salary`); HR không được đánh dấu `paid`.

**IA:** Owner HR tách theo job: `/hr` = **Nhân viên**; `/hr/attendance` = **Ngày công & nghỉ phép**; `/hr/payroll` = **Lương**; `/hr/setup` = **Thiết lập**; `/hr/staff` = **Tài khoản & quyền**. Branch Manager đọc thông tin nhân sự/ngày công/trạng thái nghỉ của đúng chi nhánh tại `/br/[branchId]/team`, đồng thời duyệt kết ca và nghỉ phép cho nhân viên cấp dưới tại các route Branch-native; không tự duyệt, không duyệt Branch Manager khác, không sửa hồ sơ, không xem lương/HĐLĐ/BHXH. D012 vẫn áp: KHÔNG rostering/auto-late/auto-absent/số dư phép/duyệt nhiều tầng. Canonical chi tiết payroll: `docs/ref/labor-contracts.md`, `docs/ref/payroll-pit.md`.

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

- (a) Payroll có HĐLĐ/BHXH tối thiểu — canonical `docs/ref/labor-contracts.md` + `payroll-pit.md`.
- (b) **Runner = đồng hồ chờ:** chỉ hiện đơn ĐANG LÀM (`['pending','preparing']`, không lane `ready`), không mang nghĩa "Gọi số", có thang tuổi + overflow.
- (c) Tách hóa đơn không thuộc payment contract hiện hành; muốn mở phải có
  decision mới và atomic multi-payment RPC.
- (d) Danh tính pháp nhân: SSoT = `tenants.legal_name`/`tax_code` (KHÔNG `system_settings`).
- (e) VAT derive theo bậc qua `resolve_gtgt_rate` + shared mirror, không hardcode; HĐ cũ 8% = sửa-tiến (đối soát hồi tố là việc kế toán). Canonical: `docs/ref/einvoice-tax.md` § 2.1.
- (f) Hạ ưu tiên: refund sum-guard (unreachable), `refundOrderPayment` 2-RPC non-atomic (rough-edge).

**Lưu ý prod còn hiệu lực:** destructive DB change cần expand-contract — zero-ref object bị xóa TRƯỚC khi owner apply. Đảo (a)–(f) phải sửa quyết định này trước.

## D032: Redesign UI = Hợp nhất (A) + Nâng cấp thị giác trong contract (B) (2026-06-16)

**Net:** UI hợp nhất theo Custom Theme contract. Typography đi theo D038 →
D069; palette giữ `primary` đỏ gạch + Má Tư Design System. Các ý tưởng chưa quyết không
sống trong decision log.

## D033: `main` là trunk TS/Supabase hiện hành — bỏ Go-port (2026-06-16)

**Decision:** `main` là trunk hiện hành. Go-port không thuộc current architecture
(tag `archive/go-port-2026-05`). Mọi rollback trunk phải có incident plan mới,
dựa trên history hiện tại và được owner duyệt rõ.

## D035: Gỡ hẳn bề mặt accounting/khóa-kỳ khỏi app (2026-06-19)

**Decision (owner):** Toàn bộ UI/route accounting đã gỡ. **Giữ lại (KHÔNG đụng):** permission `accounting:period_reopen` + RPC `close_period_soft/hard`, `reopen_period`, bảng `accounting_periods` (DB-layer thuộc owner qua migration). Dựng lại sau = tính năng "Khóa số liệu tháng" gọn dưới `/settings`, không tái lập khung kế toán. Canonical: `docs/modules/finance.md`.

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

## D045: Shell điều hướng một sidebar (tier1 tab + tier2 sub-tab) (2026-06-22, sửa bởi D090)

**Decision (net, collapse-mode theo D063, cutover D090):** `control_surface` dùng MỘT sidebar trong một `SidebarProvider`/`SidebarInset`; `AppShell` nhận `tier1` (tab chính cross-module theo ACL) + `tier2` (deep nav mô-đun đang mở). Tab chính không trải phẳng page con; `/` là tổng quan quản trị và `/settings` sở hữu các trang thiết lập. Mobile/tablet portrait `<lg` (`useIsMobile(1024)`): bottom-nav = tier-2 + một tab "Mô-đun" mở drawer. Desktop `≥lg`: sidebar cố định, không bottom-nav. Nav-as-data + MODULE_ACL single-source giữ nguyên. Canonical: `docs/modules/ui.md` § control_surface Shell Structure; `docs/spec/design-system.md`. Đảo phải sửa bản ghi này trước.

## D046: Gỡ Web Push server-side, thay bằng popup foreground `Notification` API (2026-06-22)

**Decision:** "Thông báo trên thiết bị" = popup OS từ client qua `Notification` API khi PWA đang mở (Realtime INSERT → refetch → `showNotification`); KHÔNG có lớp Web Push server (VAPID/cron/ledger đã gỡ). Đánh đổi chấp nhận: không thông báo khi app đóng. Popup bắn cho MỌI severity nhìn thấy được (gồm `info` `pos.order_new`). In-app feed giữ nguyên. Canonical: `docs/spec/toast-notification-system.md`. Đảo phải sửa bản ghi này trước.

## D047: Registered Greenfield type source; Preview runtime disabled (2026-06-27, cập nhật 2026-07-27)

**Decision (net):** Greenfield `matu-greenfield-company` là type source duy nhất
và `pnpm db:types` phải nhận literal `SUPABASE_PROJECT_ID` của ref Greenfield.
mô hình pháp nhân cũ `matu-prod` không còn là type source. Vercel Preview bị tắt và không nhận
Supabase ENV. Preview Branch chỉ được owner vận hành on-demand; agent-side
mutation vẫn cần trusted registration. Per-PR auto-provision vẫn Parked đến khi
target, seed safety, teardown, spend, env binding và trusted registration được
chứng minh.
Canonical: `docs/agent/rules/database.md` +
`docs/runbooks/db/preview-branch-setup.md`.

## D048: Hợp nhất IA quản lý Người + Chi nhánh (2026-06-28)

**Decision:**

- **Người:** staff administration gộp vào `/hr/staff` (nhãn "Nhân sự"); **giữ `staff` ACL key tách biệt** (account/role/permission owner-only, lồng trong `/hr`).
- **Chi nhánh:** list → `/branches` (module key `branches`, owner-only); `menu-limits` → branch home, quyền siết owner/branch_manager — cashier/chef vẫn có đường riêng 86 món qua KDS `mark_kds_item_out_of_stock`.
- **Branch switcher** trong `AppShell`: hiện cho mọi role đa-chi-nhánh, ẩn khi ≤1 CN.
- Không chọn: `/people` mới; gộp 2 shell.

Canonical route/ACL: bảng generated trong `docs/spec/role-route-matrix.md`.

## D049: Cho phép huỷ toàn phần đơn đã thanh toán tại POS — giới hạn D023 (2026-06-28)

**Decision (owner — mở HẸP đúng nhánh full-void-after-paid; D023 giữ cho mọi correction khác):** huỷ toàn phần đơn đã thanh toán ngay tại POS = hoàn tiền + huỷ HĐĐT per_order + rời board, một transaction nguyên tử, manager-gated, bắt buộc lý do, audit đầy đủ.

1. **Cổng:** key `pos:void_paid_order` — chỉ `owner` + `branch_manager`; KHÔNG cấp `cashier`, KHÔNG tái dùng `pos:void_order`.
2. **Lý do:** trim 20–500 ký tự (khớp `cancelInvoiceSchema`).
3. **HĐĐT:** huỷ toàn phần = **HUỶ** (cancel), không phải điều chỉnh/thay thế. **Chặn cross-period:** proxy bảo thủ theo THÁNG dương lịch ICT (`issued_at < date_trunc('month', now())` → route kế toán). Kế toán xác nhận: Má Tư khai theo QUÝ, mốc-tháng bảo thủ hơn → GIỮ, không bao giờ lọt hoá đơn đã kê khai; hard-block theo period-close thật là việc defer riêng. Căn cứ huỷ: NĐ 254/2026 + TT 32/2025.
4. **Actor:** `branch_manager` ĐƯỢC huỷ HĐĐT issued dưới cổng này — RPC inline flip `tax_invoices.status='cancelled'` + ghi `tax_invoice_events`, KHÔNG gọi `transition_tax_invoice_state` (owner-only).
5. **Mặc định:** đơn `cancelled` rời board + rớt doanh thu; refund một chạm tại till; re-pay = đơn mới; full-void-only; reject `multiple_payments`.

**GIỮ ở Owner + Kế toán:** hoàn một phần/theo món và hóa đơn điều chỉnh/thay thế. Đảo phải sửa bản ghi này trước.

## D050: Operator Workspace — một plane vận hành mobile-first tại `/br/[branchId]/*` (2026-06-29)

**Decision (owner, net):**

1. **Hai mặt phẳng = 2 họ chrome D019/ADR 0012:** Branch plane (mobile/tablet, gốc `/br/[branchId]/*`) + Owner control (`AppShell` responsive chỉ dành cho Owner: `/` + domain route families + `/branches`).
2. **Mọi route operator-facing nằm dưới `/br/[branchId]/*`**. `branchId` trên URL là SSoT; staff pin thì Branch home tự điền.
3. Branch dashboard + control + setup (tables/pos/kds/printers) + `pos-sessions` thuộc Operator plane (amend D019 §1 + D017).
4. **Branch-context = 1 provider** `resolveBranchContext()` thay 3 cơ chế scope cũ; proxy + RLS + `MODULE_ACL` + `has_permission` giữ nguyên làm cổng gác — context chỉ là lớp đọc.
5. **Branch home = entry device-aware** (`resolvePostLoginRedirect`): canonical = bảng generated "Post-Login Home By Role" trong `docs/spec/role-route-matrix.md`.
6. **Phone bottom-nav operator = `Hôm nay · Ca · Lịch · Tôi`** (ratify D058 §2) + capability tiles từ `nav-config.ts`/`MODULE_ACL`, gate server-side.
7. Không viết lại POS/KDS/Runner — chỉ re-root lên branch context và Branch home.

Scope: Owner control People/Branch IA thuộc D048; "Việc trong ca" thuộc D052. Đảo điểm nào phải sửa bản ghi này + D019 trước.

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

**Decision:** Net-effect gộp vào D017 (Owner `/`, branch-pinned `/br/{branchId}`, fail closed khi lệch scope). Canonical: `docs/spec/role-route-matrix.md`.

## D056: Operator GRN-receive route + hướng consumption (2026-07-02)

**Decision:**

1. URL `receive` dưới `/br/[id]/stock` dành riêng cho **transfer-receipt**; goods-receipt (GRN) không chia sẻ prefix — operator GRN detail = route `stock/grn/[id]` wrap `GRNDetailPageContent` (embedded, branch-scoped), `afterCreateGrnHref` trỏ tới đó.
2. **Consumption ≠ Issues:** giữ hai khái niệm phân biệt theo
   `docs/ref/inventory.md`; tiêu hao không được gắn nhãn như xuất kho nội bộ.

## D058: Hai presentation plane, một contract (2026-07-03)

**Decision (net sau D059/D061/D076/D077):** Branch runtime là touch-first dưới
`/br/[branchId]/*`; Management workspaces giữ dense desktop-responsive
presentation. Hai plane dùng chung data loader/model/Server Action/RPC/permission
khi phù hợp nhưng không dùng Owner control chrome trong Branch. Mỗi role chỉ được quảng
bá một cửa cho cùng job; route ngoài matrix không có alias hoặc redirect.

Page archetype sống ở `docs/spec/page-archetypes.md`; component ownership/query
sống trong machine registry. Mọi surface đổi phải QA phone, tablet và desktop.

## D059: Branch-complete native workflow (2026-07-03)

**Decision:** Net-effect gộp vào D058 (Branch runtime đủ job tại chỗ; không Owner-control bridge; không chia sẻ Owner chrome).

## D060: Inventory workflow — WAC, không lot/FIFO/requisition (2026-07-03)

**Decision:** Net-effect được hợp nhất tại D091. Canonical:
`docs/ref/inventory.md`.

## D061: Management Inventory oversight (2026-07-03)

**Decision:** Net-effect gộp vào D058 (Management = oversight dense; Branch =
thao tác tại chỗ). Topology Inventory theo D091.

## D062: Native-quality PWA là hướng giao (mở rộng D012, KHÔNG rewrite native) (2026-07-03)

**Decision (owner):** Mục tiêu = trải nghiệm native bằng PWA chất lượng native; D012 (loại native-framework) VẪN đứng. Chương trình additive: **PWA-1** Operator Landing cài được như app (manifest riêng `/br/[branchId]`, mirror pattern station, tái dùng `pwa-runtime`/`pwa-toolbar`); **PWA-2** offline shell tối thiểu cho Landing; **PWA-3** native-feel (standalone chrome, safe-area, press feedback — trong Motion Contract § G, không animation library mới); **PWA-4** perf nối vào lane hiện có. Không route/ACL/schema change; không framework/dep PWA thứ hai; push notification tùy chọn. Đảo (mở lại native rewrite, bỏ installable Landing) phải sửa bản ghi này trước.

## D063: Desktop mode cho Management chrome (2026-07-03)

**Decision:** Net-effect gộp vào D058 (Management dense desktop-responsive trên cùng `SidebarProvider`/design-system density; không rail thứ hai).

## D064: POS capacity and manual quota (2026-07-04)

**Decision (net sau D065/D091):** Missing recipe hoặc unit conversion không tạo
stock capacity giả; món đó nằm ngoài stock gate và fail-loud ở màn quản lý. Manual
daily limit là owner/manager input riêng, không seed từ tồn. Refund/void chỉ trả
quota khi line chưa first-ready. Stock availability/posting dùng một flag D065
và warehouse duy nhất của site.

## D065: "Trừ tồn khi bán" = một công tắc trọn gói — bật là rào cứng, kho không âm (2026-07-04)

**Decision (owner — đảo mô hình 2-flag/advisory của D064 gốc có chủ đích):**

1. **MỘT công tắc owner-facing "Trừ tồn khi bán"** = `pos_stock_outcome_posting`. BẬT = trừ kho theo định mức khi bán + CHẶN CỨNG khi hết tồn (bán đúng số lượng tồn, kho không bao giờ âm, hết = khóa món đến khi nhập thêm — GRN vào là tự mở vì capacity tính live). TẮT = không trừ, không rào, bán vô hạn. Không có chế độ trừ-mà-không-chặn; flag `pos_stock_availability_gate` đã xóa; `gate_eff` trong reader RPC := chính flag posting.
2. **Enforcement = DB hard gate:** trigger AFTER INSERT trên `order_items`, pool KHO CHI NHÁNH (warehouse — không phải bếp như trigger đã gỡ ở D064 §7), chỉ chạy khi flag bật, scoped vào nguyên liệu của đơn, cùng công thức demand với availability (mains + sides, `inv_to_base_for_tenant`), serialize `FOR UPDATE` trên `stock_levels`, skip-hatch GUC `comtammatu.skip_quota_enforcement`, lỗi P0001 `insufficient_stock_ingredient:<id>` (POS map sẵn copy VN, non-retryable).
3. **Kho không âm tuyệt đối:** giữ constraint. Shortage lúc ghi sổ thanh toán (race hiếm lọt gate): payment VẪN hoàn tất, KHÔNG ghi movement (không partial-post), RAISE WARNING — lệch bắt bằng kiểm kê (doctrine đếm D027/D028).
4. **Món không định mức / thiếu quy đổi:** giữ D064 §2 — ngoài vòng kiểm soát kho, bán tự do.

Trigger inert khi flag OFF. Đảo phải sửa bản ghi này trước.

## D066: Central-site context — superseded (2026-07-04)

**Decision:** Net-effect Inventory được hợp nhất tại D091. Role/route hiện hành
sống ở `docs/spec/role-route-matrix.md`.

## D067: Branch Inventory native presentation (2026-07-04)

**Decision:** Net-effect gộp vào D058 (Branch stock touch-native; chia sẻ
loader/model/action, không Owner chrome). GRN hiện hành theo D091.

## D068: Kho CN tự nhận NCC (GRN) + sản xuất tại chi nhánh — branch_manager, own-branch (2026-07-05)

**Decision:** Net-effect Inventory được hợp nhất tại D091. Quyền hiện hành sống
ở `docs/spec/role-route-matrix.md` và runtime ACL/RLS/RPC.

## D069: Be Vietnam Pro heading + Shift-aware night mode (2026-07-07)

**Decision (owner, đảo phần heading của D038):** Heading/display = Be Vietnam Pro (subset `vietnamese`+`latin`); body + data giữ Geist + Geist Mono. Night mode = warm-dark "gạo cháy", auto 18:00–06:00 local + cookie override `matu-theme`, map vào class `.dark`, KHÔNG dùng `prefers-color-scheme`; scope toàn app; receipts/ESC-POS pipeline theme-independent; toggle duy nhất `ThemeToggle`. Canonical: `docs/spec/design-system.md` § Typography Contract + Theme runtime; palette values sống ở `packages/ui/src/styles/globals.css`.

## D070: SectionLabel primitive + ratchet EASY WIN + HR density-first (2026-07-08)

**Decision (owner):** (1) `SectionLabel` primitive 2 density variant (`default`/`dense`), render `<div>` (eyebrow là typographic role, không phải semantic heading); (2) `/hr` density-first (bỏ KPI mosaic, EmployeeTable làm focal point, readiness = count strip); (3) ratchet easy-win đã reconcile. Canonical: `tasks/regressions.md` [SECTION-LABEL-SSOT] + `docs/agent/rules/ui.md` § Typography Rules. Còn ngoài scope: SectionLabel group b (9 complex sites) / group c (12 Label/Badge); logo night variant.

## D071: DS contrast wave + 4 hạng mục adapter + Motion Step 0-A (2026-07-10)

**Decision (owner):** (1) `--{status}` là MỰC (AA 4.5:1 trên nền + tint của chính nó, cả 2 theme), `--{status}-foreground` chỉ là chữ trên nền đặc; light `--warning` rời brand gold (`#f2a100`→`#8e5400`), light `--success` đậm hơn (`#446935`); vàng gạo vẫn là accent ở `--ring`/`--chart-2`; night CTA lật foreground về nền tối. (2) 4 hạng mục adapter: `ItemTitle` giữ default dense + role contract `size="heading"`; field-trigger grammar hợp nhất qua `packages/ui/src/lib/field-trigger.ts` (Select/Combobox/TagInput/multi-select); POS/KDS touch target lên rung `icon-touch`/`touch`; `DataTable` tự own client-side paging, 6 growth list bật `pageSize={50}` — sort/sticky header chờ UI Advisor Gate. (3) Motion Step 0 = phương án A (ADR 0010): one-shot content enter `duration-150` + `motion-safe:` cho realtime INSERT thật (cart line mới, KDS ticket mới); `duration-300` vẫn khóa overlay-only. Enforce: gate `status-foreground-on-tint` + `status-focus-ring-contrast` (baseline 0) + `design-token-contrast-static.test.ts`. Canonical: `docs/spec/design-system.md` § Token Contract + §G.

## D072: Hợp thức hóa brand expression đang sống + mở compact-empty symbol (2026-07-10)

**Decision (owner, phương án a — hợp thức hóa thay vì gỡ):** (1) Pattern caro placements = danh sách ĐÓNG: Runner footer strip, login full-surface wash, Management sidebar header wash; full-surface wash chỉ hợp lệ dạng trang trí `aria-hidden`/`pointer-events-none`, opacity ≤10 — gate `brand-pattern-placement` allowlist đích danh. (2) Mascot động = full-screen waiting/idle only (Runner idle board, `PageSpinner fullScreen`, login brand panel), không bao giờ trên control tương tác hay chrome trong trang — gate `mascot-animation-placement`. (3) Compact-empty mở cho `BrandSymbol`: `symbol` hợp lệ trên `AppEmptyState compact` khi empty là trạng thái chính của trang/section (queue trống, catalog trống); inline/row-level giữ text-only. (4) Xóa `transition-transform duration-200` chết trên card lockup login. Canonical: `docs/spec/design-system.md` § brand-patterns + § utilities + §G.

## D073: Ngừng site Bếp Trung Tâm — một kind vận hành duy nhất `branch`, stock cutover dồn về Branch home (2026-07-10)

**Decision:** Net-effect Inventory được hợp nhất tại D091. Không dùng entry này
làm authority cho topology, procurement hoặc QC hiện hành.

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

## D076: Application roles đang hoạt động (2026-07-10, sửa 2026-07-28)

**Decision (net):** `STAFF_ROLES` canonical gồm
`owner | accountant | central_supply_ops | central_kitchen_lead | branch_manager | cashier | chef | branch_staff`.
Position HR không tự tạo application role; chỉ mapping canonical trong TypeScript
và SQL mới phát sinh quyền route. Giá trị ngoài tập này fail closed, không
auto-remap. Ba role L0/site mới là **adapter tạm** trên JWT-role hôm nay; đích
Authority là ADR 0015. Canonical: `packages/shared/src/auth/types.ts` và
bảng generated trong `docs/spec/role-route-matrix.md`.

## D077: Owner `/`, Branch `/br/[branchId]` (2026-07-10, thay thế 2026-07-18)

**Decision:** Net-effect gộp vào D017 (routing) + D026 (Branch Manager HR boundary). Canonical runtime: `login-destination.ts`, `scope.ts`, `route-resolution.ts`, `route-map.ts`, `nav-resolution.ts`, `proxy.ts`.

## D078: Tắt Bếp chi nhánh — một kho duy nhất mỗi chi nhánh (2026-07-10)

**Decision:** Net-effect Inventory được hợp nhất tại D091. Không dùng entry này
làm authority cho topology hiện hành.

## D079: Mở TTS cho bốn cảnh báo POS quan trọng, không đọc mọi ping (2026-07-11)

**Context:** KDS đã chạy TTS theo D074. POS có bốn event cần thu ngân chú ý
ngay: khách tự gọi, gọi thanh toán, in lỗi và bếp báo hết món.

**Decision (owner):**

1. POS dùng cùng `OperationalAudioMode` và `playOperationalAlert` với KDS;
   mode lưu duy nhất ở `pos:audio-mode:{branchId}`.
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

## D082: Mở lại lộ trình AP và vận hành trung tâm (2026-07-27)

**Decision:** Net-effect Inventory được hợp nhất tại D091. Lộ trình AP và vận
hành trung tâm nằm tại `docs/plan/adr/0017-ap-central-operations.md`.

## D083: PO một cấp + VAT món + Finance HĐ GTGT/NCC (2026-07-27, sửa bởi D091)

**Decision (owner, net sau D091):** Trên Greenfield target: (1) Menu lưu `vat_rate` theo từng món với tập giá trị
`0 | 5 | 8 | 10`; `base_price` là giá bán đã gồm VAT nên POS không cộng VAT
thêm khi thanh toán. HĐĐT snapshot thuế suất từng dòng; template và phương pháp
tính thuế phải khớp cấu hình doanh nghiệp/provider đã đăng ký. (2) PO một cấp
`draft → sent → partially_received | received`; không entity PR riêng, không duyệt
nhiều cấp. Actor tạo/duyệt PO = Owner hoặc **Kế toán**; **một người được vừa tạo
vừa duyệt**. (3) Finance gom hóa đơn đầu vào, đối soát GRN và thanh toán NCC.
Topology, QC và trình tự GRN/PO hiện hành theo D091.

## D084: Mô hình pháp lý công ty cổ phần sau cutoff (2026-07-27)

**Decision (owner):** Delivery sau `baf3720f8` trong repo `comtammatu` được mô
hình hóa cho Công ty Cổ Phần Chén Sứ. Historical mô hình pháp nhân cũ records trên `matu-prod`
giữ nguyên legal context tại thời điểm phát sinh; không được diễn giải hồi tố
theo mô hình công ty.

**Consequences:** Không suy phương pháp/thuế suất GTGT từ doanh thu năm; thuế
suất được snapshot theo dòng bán và cấu hình đã đăng ký. Finance hiện là bề mặt
vận hành, không tự trở thành sổ kế toán hoặc báo cáo tài chính. Canonical:
`docs/plan/adr/0016-joint-stock-company-operating-model.md`,
`docs/ref/legal-framework-2026.md` và `docs/ref/einvoice-tax.md`.

## D085: Operating expense multi-rate VAT + optional HĐ GTGT attachment (2026-07-27)

**Decision (owner):** `/finance/expenses` stores immutable multi-rate
`vat_breakdown` (0/5/8/10) like supplier invoices; `amount` remains gross
(= subtotal + VAT) for KPI/cash. Optional PDF/image attachment URL is evidence
only. Both are `input_vat_recorded`, never deductible status or `vat_payable`.

**Consequences:** Update create/transfer RPCs and list UI; do not merge with
`supplier_invoices`; do not mutate VAT after insert.

## D086: UI Block stays recipe metadata — promote reusable chrome via Adapter (2026-07-27)

**Decision (owner):** Không mở tầng UI Block importable (`apps/web/.../blocks/`,
component `*Block`). `UI_BLOCK_REGISTRY` giữ recipe + exemplar. Composition lặp
(≥2 consumer) promote thành **Adapter** đã đăng ký (`InventoryListFrame`,
`DocumentFormFrame`, `SettingsPageFrame`, `BranchOperator*`, …) rồi cập nhật
trường `use` của block recipe. Shadcn Blocks chỉ đối chiếu anatomy, không phải
runtime authority.

**Canonical:** `docs/spec/design-system.md` § Artifact Ladder, `docs/modules/ui.md`
§ UI Block Selection, `scripts/ui-component-registry.mjs`.

## D087: Mã chứng từ Inventory tuần tự PREFIX-DDMMYYYY-#### (2026-07-29)

**Decision:** Phiếu kho mới (GRN, điều chuyển, xuất kho, hao hụt, lệnh SX, kiểm
kê, phiếu đếm, yêu cầu hàng) nhận mã tuần tự
`{PREFIX}-{DDMMYYYY}-{####}` qua `next_inventory_doc_number` (ngày VN). PO dùng
`next_po_display_id` và cùng format. Sequence vẫn theo tenant, loại phiếu và năm;
không reset theo ngày. Không rewrite mã lịch sử; tiêu hao HRM giữ
`THB-{report_id}`.

**Canonical:** `docs/ref/inventory.md` § Mã chứng từ kho.

## D088: Phân vai vận hành B đầy đủ — Kế toán · Kho Tổng · Bếp TT + luồng GRN draft→PO (2026-07-28)

**Decision:** Role net-effect sống ở D076 và
`docs/spec/role-route-matrix.md`; Inventory net-effect được hợp nhất tại D091.

## D089: Purchase-price authority at PO + GRN confirm gate reaffirmation (2026-07-28)

**Decision:** Net-effect Inventory được hợp nhất tại D091.

## D090: control_surface naming + L0 bottom-nav cutover `<lg` (2026-07-28)

**Decision:** Plane L0 AppShell canonical = `control_surface` / UI `Quản trị`.
Không dùng `Ops surface` hoặc `Vận hành` làm nhãn plane. `station_chrome` thay
prose mới cho Operations chrome (POS/KDS/Runner). Role `owner` và
`operational_role` (D076) tách khỏi tên plane. Chrome L0 = `ControlSurfaceShell`
(Wave2). Nav SSOT = `CONTROL_SURFACE_NAV_*` + `apps/web/app/lib/control-surface-nav.ts`
(renamed from `OWNER_NAV_*` / `owner-nav.ts`). DOM `data-owner-shell-scroll` /
`RouteSurface: "owner"` giữ làm alias kỹ thuật. Bottom-nav `control_surface`
cắt tại `<lg` / `useIsMobile(1024)` (đồng bộ code + design-system; sửa D045 từ
`<md`).

**Canonical:** `docs/ref/glossary.md` § control_surface; `docs/spec/design-system.md`
§ Chrome Archetypes; D019/D045 (đã fold).

## D091: Inventory one-warehouse, physical QC, retrospective procurement (2026-07-28)

**Decision (owner):**

1. Mỗi site active (`branch`, `central_supply`, `central_kitchen`) có đúng một
   active `warehouse`. GRN và mọi luồng Branch mặc định — POS, consumption,
   stocktake, transfer và production tại Branch — dùng warehouse này. Current
   schema/runtime không có stock location `kitchen`; `production_storage` chỉ
   dùng tường minh cho production trung tâm. Warehouse là default receive,
   issue và consumption của site.
2. QC nhận hàng chỉ lưu số lượng thực nhận và số lượng từ chối. Số lượng đạt
   được suy ra; dòng có số lượng từ chối bắt buộc lý do + ảnh. Không lưu
   `quality_status`, lot/HSD/nhiệt độ, tolerance, price variance, baseline,
   hard-block, express hoặc auto-approval.
3. Luồng mua duy nhất trên UI là **GRN draft (đa NCC theo dòng) → tách PO theo
   NCC → duyệt từng PO → confirm GRN khi mọi PO nguồn đã duyệt** (D092). Giá
   thương mại thuộc PO; duyệt PO sync snapshot `grn_items.unit_cost` theo NCC
   dòng. Không có CTA tạo PO trực tiếp hoặc tạo GRN từ PO; RPC phục hồi PO→GRN
   chỉ dành cho `service_role`.
4. PO một cấp; trạng thái nhận được suy ra từ số lượng, không có quyết định
   thủ công `accept_and_close`. Đối soát giá HĐ NCC thuộc Finance.

**Supersedes:** D000, D060, D066, D068, D073, D078, phần Inventory của D082 và
D088, cùng toàn bộ D089. D076 tiếp tục sở hữu roster role; D083 tiếp tục sở hữu
VAT món và PO một cấp. D092 mở rộng hợp đồng đa NCC trên GRN.

**Canonical:** `docs/ref/inventory.md`, `docs/ref/inventory-sop.md`,
`docs/spec/role-route-matrix.md`.

## D092: Multi-supplier GRN + split PO by supplier (2026-07-29)

**Decision (owner):**

1. Kho tạo GRN draft **không chọn NCC trước** — vào thẳng form nguyên liệu.
2. `grn_items.supplier_id` bắt buộc; một GRN có thể chứa dòng thuộc nhiều NCC.
   Header `goods_received_notes.supplier_id` nullable. Gán NCC: auto khi
   `supplier_items` đúng 1 mapping active hoặc có mapping `is_preferred`; picker
   trên sheet dòng khi >1 và chưa có ưu tiên.
3. Kế toán/Owner tạo PO từ GRN → RPC `create_purchase_orders_from_grn` tách
   **một draft PO mỗi NCC**, gắn `purchase_orders.source_grn_id`.
4. Confirm GRN fail-closed trừ khi **mọi** PO `source_grn_id` (hoặc legacy
   `po_id`) ở `sent` \| `partially_received`. Duyệt PO chỉ sync giá các dòng
   GRN cùng `supplier_id`.
5. `supplier_invoice` vẫn 1 HĐ ↔ 1 GRN/PO theo từng NCC (không gộp đa NCC
   trong lát này).

**Canonical:** `docs/ref/inventory.md` §5, `docs/ref/inventory-sop.md` §2,
`supabase/migrations/20260729010000_multi_supplier_grn_split_po.sql`,
`supabase/migrations/20260729140200_fix_supplier_invoice_multi_supplier_matching.sql`,
`supabase/migrations/20260729140400_supplier_item_preferred.sql`.

## D094: Preferred supplier mapping (2026-07-29)

**Decision (owner):** Khi nguyên liệu có nhiều `supplier_items` active, tối đa
một mapping `is_preferred`. GRN draft auto-chọn NCC ưu tiên; picker vẫn cho
đổi. Mapping duy nhất được backfill/ghi `is_preferred` để catalog thống nhất.

**Canonical:** `docs/ref/inventory.md` §5,
`supabase/migrations/20260729140400_supplier_item_preferred.sql`.

## D095: Product Dual Thesis frame + Má Tư DS mirror (2026-07-29)

**Decision (owner):** North star = Dual Thesis (Quản lý hệ thống + Vận hành bán
hàng). Một Má Tư Design System (cùng token, khác density/chrome). Retire
“Concept 01” naming. `.stitch/DESIGN.md` là mirror Stitch/agent (không SSOT
thứ hai); root `DESIGN.md` vẫn cấm. Adapter: `App*` = Hệ thống,
`BranchOperator*` = Vận hành. Không gộp URL `/inventory` + `/br/.../stock`.
Break naming/placement chỉ với evidence + checkpoint đã khóa trong plan Dual
Thesis. Stitch skills allowlist ngoài `.agents/skills`; deny
`shadcn-ui` / `stitch-loop` / `taste-design` làm authority.

**Canonical:** `docs/spec/architecture.md` § Product Dual Thesis;
`docs/spec/design-system.md`; `.stitch/DESIGN.md`; D044, D090. Wave2: layouts
import `ControlSurfaceShell` trực tiếp — không còn alias
`OwnerModuleShell` / `InventoryShell` / `FinanceShell`.

## D093: Central-only GRN + branch stock request (2026-07-29)

**Decision (owner):**

1. **GRN** chỉ tại site `central_supply` và `central_kitchen`. Chi nhánh không
   tạo/confirm GRN và không có UI GRN.
2. Chi nhánh bổ sung hàng bằng **Yêu cầu hàng** (`stock_requests`): một phiếu
   mỗi lần xin; mỗi dòng copy `ingredients.default_fulfill_site_kind`
   (`central_supply` | `central_kitchen`); CN không đổi nguồn; thiếu mapping →
   fail closed.
3. Kho Tổng / Bếp TT chỉ thấy dòng thuộc nguồn mình; fulfill tạo
   `stock_transfers` (DC) từ kho nguồn → CN; CN nhận DC.
4. Chi nhánh **không production**. Giữ tồn, tiêu hao, kiểm kê, hao hụt, giao đếm.
5. Nav/tile fail-closed theo role. `central_supply_ops` /
   `central_kitchen_lead` được `inventory:transfer_create` +
   `inventory:request_fulfill`. `branch_manager` mất `procurement:grn_*` và
   `inventory:production_*`; nhận `inventory:request_*` (create/submit/cancel).
6. Supersede D091 trong phạm vi: branch GRN, “không mở PR”, và branch
   production. Topology one-warehouse/site và GRN→PO tại trung tâm giữ nguyên.
   D092 (multi-supplier GRN) vẫn áp dụng trên GRN trung tâm.

**Canonical:** `docs/ref/inventory-role-ops.md`, `docs/ref/inventory.md` §11,
`docs/ref/inventory-sop.md`, `docs/spec/role-route-matrix.md`,
`supabase/migrations/20260729140000_d093_central_grn_branch_stock_request.sql`.

## D096: Yêu cầu mua → PO theo NCC → GRN theo lần giao → công nợ (2026-07-29)

**Decision (owner):**

1. Má Tư là bên mua; NCC là bên bán. `Yêu cầu hàng` tiếp tục là luồng cấp hàng
   nội bộ. `Yêu cầu mua` là nhu cầu mua ngoài do kho trung tâm lập.
2. Một yêu cầu mua tạo nhiều PO; mỗi PO thuộc đúng một yêu cầu mua và một NCC.
   PO `sent | partially_received` tạo thủ công một GRN nháp cho lần giao thực
   tế. Mỗi GRN thuộc đúng một PO; một PO có nhiều GRN đã chốt nhưng tối đa một
   GRN nháp đang hoạt động.
3. GRN nháp dùng nhãn UI **Chờ nhập hàng**. Dòng GRN giữ định danh dòng PO.
   `po_applied_quantity` chỉ hoàn thành phần còn lại của PO; phần nhận hợp lệ
   vượt đơn là `excess_quantity`, nhập tồn với giá `0`. Hàng tặng biết trước là
   dòng PO riêng có đơn giá `0`; không có entity khuyến mãi.
4. Hóa đơn NCC là chứng từ riêng và có thể phân bổ cho nhiều GRN/PO cùng NCC.
   Thanh toán và phiếu giảm công nợ phân bổ nhiều-nhiều với hóa đơn; phần thanh
   toán chưa phân bổ là ứng trước. Trả hàng không tự giảm công nợ.
5. Dữ liệu xác nhận cũ giữ nguyên. GRN nháp đa PO cũ chỉ hoàn tất hoặc hủy theo
   chế độ tương thích; không tự tách bằng suy đoán.

**Supersedes:** D091 §3-4, D092 và D094 trong phạm vi trình tự mua/nhập mới.
D091 topology một warehouse/site, D093 central-only GRN và `stock_requests`
nội bộ tiếp tục áp dụng.

**Canonical:** `docs/ref/inventory.md`, `docs/ref/inventory-role-ops.md`,
`docs/ref/glossary.md`, `docs/ref/screen-context-map.md`.

## D097: PO phát hành tự tạo hàng đợi Chờ nhập hàng (2026-07-30)

**Decision (owner):**

1. Khi PO chuyển sang `sent`, hệ thống tạo ngay một GRN nháp **Chờ nhập hàng**
   trong cùng giao dịch. Người dùng không phải quay lại PO để chọn
   **Tạo phiếu nhập**.
2. Khi xác nhận một GRN nhưng PO còn thiếu, hệ thống tạo GRN nháp kế tiếp cho
   lần giao sau. PO đã nhận đủ không tạo thêm; hủy/đóng PO tiếp tục hủy nháp
   đang hoạt động. Mỗi PO vẫn tối đa một GRN nháp.
3. Danh sách phiếu nhập dùng một bộ lọc **Trạng thái** thay cho tab trạng thái
   và chỉ giữ thông tin vận hành chính. Giá trị nhập và hóa đơn thuộc chi tiết
   GRN/Finance.

**Supersedes:** D096 §2 trong phạm vi thao tác tạo GRN nháp thủ công. Mô hình
một PO có nhiều GRN theo lần giao và tối đa một nháp tiếp tục giữ nguyên.

**Canonical:** `docs/ref/inventory.md`,
`supabase/migrations/20260730100000_auto_grn_draft_queue.sql`,
`apps/web/app/(protected)/inventory/grn/grn-list-client.tsx`.

## D098: PO-first và giá mua chỉ từ Hóa đơn NCC (2026-07-30)

**Decision (owner):**

1. Luồng mua ngoài bắt đầu tại PO do Kho lập; không tạo YCM hoặc thực thể cha
   thay thế. Hệ thống lấy NCC ưu tiên của nguyên liệu, chặn nguyên tử nếu thiếu
   cấu hình và tách một PO cho mỗi NCC.
2. Một lần gửi dùng chung `purchase_group_key` và mã nhóm. Mọi PO đều có hậu
   tố hai chữ số `-01`, `-02`, …; hậu tố đã cấp không tái sử dụng.
3. PO đi qua `draft → pending_approval → approved`; Kế toán có thể trả chính
   PO đó về `changes_requested` hoặc từ chối thành `cancelled`, đều kèm lý do.
   Duyệt tạo đúng một GRN nháp trong cùng giao dịch.
4. PO và GRN không có giá do Kho nhập. GRN dùng giá vận hành nội bộ theo thứ
   tự: giá Hóa đơn NCC đã xác nhận gần nhất của NCC–nguyên liệu, WAC, giá tham
   chiếu, rồi `cost_pending`.
5. Kế toán nhập đơn giá, chiết khấu và VAT theo từng dòng Hóa đơn NCC, phân bổ
   tới dòng GRN đã xác nhận cùng NCC. Hóa đơn nháp được sửa; hóa đơn đã xác
   nhận là bất biến. Không có thao tác sửa giá ngoài chứng từ hóa đơn.
6. Owner giữ quyền thanh toán và phân bổ ứng trước. Không hồi tố stock
   movement/WAC và không tự ghi chênh lệch vào chi phí.

**Supersedes:** D096, D097 và các quyết định YCM/direct-send trước đó trong
phạm vi mua ngoài. D093 và luồng Yêu cầu hàng/Transfer nội bộ không đổi.

**Canonical:** `supabase/migrations/20260730140000_po_first_purchase_workflow.sql`,
`supabase/migrations/20260730150000_supplier_invoice_line_pricing.sql`,
`apps/web/app/(protected)/inventory/purchase-orders`,
`apps/web/app/(protected)/finance/supplier-invoices`.

## D099: Nhu cầu mua và phân bổ NCC trước PO (2026-07-30)

**Decision (owner):**

1. Tái sử dụng `purchase_requests` làm **Nhu cầu mua** trước PO. Kho chỉ nhập
   nguyên liệu, số lượng, đơn vị và ngày cần; không chọn hoặc nhận payload NCC,
   giá mua hay WAC.
2. Một nguyên liệu có thể có nhiều NCC. NCC ưu tiên chỉ xếp trước để tham khảo;
   Kế toán phải tự phân bổ và tổng phân bổ phải đúng bằng phần nhu cầu còn lại.
   Kho vẫn gửi được nguyên liệu chưa có NCC, nhưng Kế toán không thể duyệt.
3. `review_purchase_demand(..., approve, ...)` khóa nhu cầu và allocations,
   tạo một PO `approved` cho mỗi NCC cùng mã nhóm/hậu tố không tái sử dụng, đồng
   thời tạo đúng một GRN nháp/PO. Không có bước duyệt PO thứ hai.
4. Hủy PO trước GRN xác nhận trả phần lượng đó về chính nhu cầu, chuyển nhu cầu
   sang `partially_ordered` hoặc `pending_allocation` và dùng hậu tố mới khi
   phân bổ lại.
5. Canonical UI là `/inventory/purchase-orders` với hai tab `needs|orders`.
   `demandId`, `poId`, `grnId`, `invoiceId` là URL state của overlay; các route
   cũ chỉ redirect.

**Supersedes:** D098 mục 1–3. D098 mục 4–6 về GRN, Hóa đơn NCC, giá và thanh
toán tiếp tục giữ nguyên. D093 và Yêu cầu hàng/Transfer nội bộ không đổi.

**Canonical:** `supabase/migrations/20260730190000_purchase_demand_supplier_allocation.sql`,
`apps/web/app/(protected)/inventory/purchase-orders`,
`apps/web/app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx`.

---

<!-- DRAFT — chưa duyệt owner. Đảo D012 rostering clause + contract/probation semantics.
     Nguồn: docs/plan/hrm-f1-f15-plan.md Bước 0. Trạng thái: NHÁP chờ owner phê chuẩn. -->

## D100: Rostering overlay + semantics HĐLĐ/probation (NHÁP 2026-07-30)

**Trạng thái:** NHÁP — chờ owner phê chuẩn. Đảo một clause của D012 và amend
D026/D027; yêu cầu T3 full-debate theo `docs/agent/rules/workflow.md`. Không
code P5 (rostering) đến khi duyệt.

**Decision (owner — chờ phê chuẩn):**

1. **Rostering = optional overlay.** Bổ sung bảng `shift_assignments` để
   owner/quản lý gán ca trước theo tuần; clock-in ưu tiên ca đã gán. Khi chưa
   gán, **giữ default-shift resolver hiện tại** (auto-derive theo wall-clock).
   Mandatory-reject clock-in ngoài ca là **policy switch riêng, sau operational
   proof**, không nằm trong increment này. Bảng lấy domain term `shift_assignments`
   (từng tồn tại rồi xóa theo `20260611103000`).
2. **Đảo clause rostering của D012.** D012 mục "KHÔNG rostering" được bãi bỏ.
   **GIỮ** các clause còn lại của D012: KHÔNG auto-late, KHÔNG auto-absent,
   KHÔNG leave-balance enforcement, KHÔNG multi-tier approval.
3. **Amend D026 IA + D027** chỗ restates no-rostering (`decisions.md:119,
   125-129`): rostering optional overlay giờ được phép; D027 (đơn vị chấm công
   = CA, 0.5 công/ca đã kết) không đổi.
4. **Semantics HĐLĐ:**
   - Lịch sử hợp đồng = **append-only** (revision tạo row mới + mark row cũ
     `expired`), không ghi đè. History bắt đầu từ migration D100 — KHÔNG
     synthesize các bản ghi đã bị `upsertActiveContract` ghi đè trong quá khứ;
     mỗi row hiện tại là baseline bất biến đầu tiên.
   - **Tách compensation amendment khỏi contract sequence**: thay lương KHÔNG
     tạo hợp đồng mới, KHÔNG tăng `contract_sequence`. Chỉ re-sign/gia hạn/
     từ loại = revision.
   - "Hợp đồng xác định thời hạn lần 3" = **2 HĐXĐT liên tiếp ngay trước**
     (không tính probation/amendment), không phải `contract_sequence = 3`.
     Cảnh báo là soft (không hard-block).
   - Natural-expiry: hợp đồng chạm `end_date` không touched → `status='expired'`.
5. **Semantics probation (theo `docs/ref/labor-contracts.md:28-33`):**
   - 85% lương chính thức là **mức tối thiểu**, không phải universal.
   - BHXH chỉ KHÔNG đóng khi thử việc là **hợp đồng thử việc RIÊNG**. Thử việc
     là clause trong HĐLĐ → **vẫn đóng BHXH**.
   - HR chọn `probation_arrangement` (none / separate_contract /
     probation_clause) + `probation_end_date` + `probation_salary` tường minh;
     không suy luận từ application role.
6. **Quy tắc chọn contract khi revision giữa tháng (Payroll V1):** Payroll đánh
   giá base compensation theo **contract active tại period end date / snapshot
   date** — không prorate giữa các contract trong cùng kỳ (vd thử việc kết thúc
   15/06, HĐ mới từ 16/06 → kỳ 06 dùng HĐ tại 2026-06-30). Prorate giữa tháng
   là Payroll V2, decision riêng.
7. **F15 đóng = D027 accepted:** timestamps chỉ sản xuất giờ hiển thị; pay =
   0.5 công/ca đã kết có credit (sau fix F8 `counts_for_workday`). KHÔNG hourly
   payroll.
8. **F13 deferral (owner-approve tường minh):** phase tối thiểu chỉ thêm DOB,
   bank_name, offboarding, employee detail page. Các trường HĐLĐ bắt buộc theo
   luật (địa chỉ thường trú, giới tính, ID issue date/place, residence —
   `labor-contracts.md:37-49`) **hoãn sang phase compliance sau** (P9), với
   owner-approve rõ ràng. Emergency contact giữ optional.

**Supersedes:** D012 mục rostering; D026 IA mục "KHÔNG rostering"; D027 mục
restates no-rostering. Giữ nguyên các clause khác của D012/D026/D027.

**Regression guards cập nhật:** `tasks/regressions.md` — guard D012-rostering
chuyển sang "rostering overlay optional"; giữ các guard payroll
(`PAYROLL-CALCULATE-MUST-BE-ATOMIC-RPC`, `PAYROLL-PRORATION-CAP-AT-STANDARD`,
`PAYROLL-2026-FIVE-BRACKET-AND-BHXH-CAP-STEP`, `ATTENDANCE-INSERT-SERVICE-ROLE-ONLY`).

**Canonical (khi duyệt):** `docs/plan/hrm-f1-f15-plan.md` (kế hoạch triển khai),
`docs/ref/labor-contracts.md`, `docs/ref/payroll-pit.md`.

## D101: Quyết toán giá Hóa đơn NCC vào tồn kho và giá vốn (2026-07-30)

**Decision (owner — T3 money/inventory):**

1. Tiếp tục dùng moving WAC; không chuyển sang FIFO/FEFO. `stock_movements`
   giữ vai trò ledger số lượng append-only. Valuation subledger append-only là
   nguồn giá trị và lineage qua GRN, transfer, production, consumption, waste,
   stocktake và supplier return.
2. Giá mua thực tế là giá trị trước VAT sau chiết khấu dòng và chiết khấu chứng
   từ. Xác nhận Hóa đơn NCC quyết toán chênh lệch giá trong cùng transaction,
   không tăng số lượng lần hai và không sửa cost snapshot lịch sử.
3. Chênh lệch thuộc tồn còn lại được vốn hóa; phần đã chuyển hoặc sản xuất đi
   theo value-flow lineage; phần đã tiêu thụ, hao hụt, thiếu transfer hoặc trả
   NCC đi vào đúng variance bucket. Tổng phân bổ phải bằng đúng invoice delta.
4. Kỳ chưa đóng nhận adjustment theo ngày nghiệp vụ. Kỳ soft/hard closed không
   bị tự động mở lại; late invoice ghi adjustment vào kỳ xác nhận hiện tại.
5. Cutover tạo opening origin từ số lượng và WAC hiện tại. Dữ liệu trước cutoff
   không đủ lineage đi vào `legacy_purchase_price_variance`; hệ thống không đoán
   hoặc tuyên bố truy vết GRN lịch sử.
6. Hóa đơn post-cutoff chỉ được confirmed khi valuation settlement hoàn tất.
   Service invoice không tham gia inventory valuation. Payment chỉ giảm cash/AP,
   không tạo expense hoặc inventory value lần hai.

**Supersedes:** D098 mục 6. D098 mục 4–5 và D099 tiếp tục có hiệu lực.

**Canonical:** `docs/ref/inventory.md`,
`docs/plan/adr/0017-ap-central-operations.md`,
`supabase/migrations/20260730210000_inventory_valuation_subledger.sql`.
