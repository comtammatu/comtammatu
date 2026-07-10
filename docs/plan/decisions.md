# Architecture Decisions

> Log quyết định kiến trúc với rationale. Số hiệu `D` là ID cố định (doc khác
> trỏ tới) — khoảng trống là quyết định đã xoá/bỏ qua, KHÔNG đánh số lại. Đây là
> production-track decision record, KHÔNG phải worklog triển khai hay backlog.
> Greenfield chỉ kế thừa quyết định nào được owner promote lại trong lượt chuẩn
> bị Greenfield.
>
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

**Decision:** Inventory dùng `branches` làm site table; `branches.branch_kind` active với `branch`, `central_supply`, `central_kitchen`. PO/GRN/stock levels/production orders/stock transfers ref `branch_id` trực tiếp. Branch kind quyết hành vi site: Kho CN và Bếp CN giữ branch stock, Kho Tổng giữ supply stock, Bếp TT giữ production stock. Chuyển `Kho CN → Bếp CN` là transfer cùng chi nhánh; chỉ phiếu xuất/tiêu hao/write-off sau đó mới giảm tồn chi nhánh.

**Transfer matrix** (trigger `enforce_stock_transfer_direction`): cho phép `central_supply → branch`, `central_kitchen → branch`, `branch → central_supply`, `branch → central_kitchen`, `central_supply ↔ central_kitchen`, `branch → branch`, và same-branch `Kho CN → Bếp CN` cho site `branch`; chặn thiếu ref, central direction lạ, và same-branch ngoài site `branch`.

Mở rộng bởi D068 (Kho CN nhận NCC trực tiếp + sản xuất tại chi nhánh). Canonical vận hành: `docs/ref/inventory.md`.

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

## D016: POS không trừ kho khi thanh toán — mặc định (2026-05-28)

**Decision (net, sau D053/D064/D065):** Mặc định thanh toán POS KHÔNG trừ kho; action-layer đã gỡ, webhook stock leg disabled; amount-recompute + `finalize_paid_order` giữ nguyên. Chi nhánh bật `pos_stock_outcome_posting` thì trừ kho theo outcome thật theo D053 + D065 (một công tắc, rào cứng, kho không âm). Shortage lúc ghi sổ: payment vẫn hoàn tất, không ghi movement (D065 §3).

**Đuôi còn lại:** remove `consume_stock_for_order` + RPC liên quan (owner-gated); REVOKE `transition_order_status` khỏi `authenticated` trước khi re-enable posting (D064 §8); số phận cột `payments.stock_consumed_status` còn mở. Đảo policy mặc định phải sửa quyết định này trước.

## D017: Admin là L0 Tenant Command; Branch Manager dùng L1 Branch Command (2026-06-13)

**Decision (net, sau D018/D050):** Product framing = `bộ phần mềm quản lý vận hành và bán hàng` cho HKD. `/admin/*` = L0 tenant command cho `owner`. `branch_manager` KHÔNG phải Admin user — home = `/br/{branchId}` (D050); điều hành + thiết lập chi nhánh trong Operator plane. Domain workspaces (`/inventory`, `/orders`, `/hr`, `/finance`, `/menu`) là workflow surface độc lập, không phải tab con của Admin. Role/route chỉ là gate bề mặt; action + row access qua permission keys, RPC/RLS, branch scope.

**Canonical:** `docs/spec/role-route-matrix.md`. Không thêm workflow branch-scoped mới vào `/admin/*`.

## D018: Bỏ tenant-admin phụ — gộp vào `owner` (2026-06-13)

**Decision:** Không có tenant-admin phụ cạnh `owner` — mọi fallback dạng đó retired, `owner` giữ quyền; `/admin/*` chỉ `owner`. `ACCESS_BUCKETS` canonical theo `packages/shared/src/auth/types.ts` (bảng generated trong `docs/spec/role-route-matrix.md`).

## D019: W5 — Cấu trúc hoá UI (shell · route home · nav · padding) (2026-06-13)

**Decision (net, sau D050):** (1) 2 họ chrome, không có họ thứ 3 — **Quản trị** = `AppShell` (admin + domain workspaces) và **Vận hành** = Operator plane `/br/[branchId]/*` + station chrome (POS/KDS/Runner); (2) một capability = một route home theo `role-route-matrix.md`; (3) padding một chủ = `AppPage`; (4) nav là data — mọi sidebar/bottom-nav project từ `nav-config.ts`, cấm `ShellNavGroup[]` literal trong shell. Canonical + gates: `docs/spec/design-system.md` § Structural Governance. Đảo điểm nào phải sửa quyết định này trước.

## D020: Enterprise Accounting / TT 200 / VAS is outside the HKD product (2026-06-13)

**Decision:** Enterprise accounting / TT 200 / VAS KHÔNG thuộc product contract. Finance authority = HKD operating finance. `accounting_periods` close/reopen là DB-only owner support, không app route nào expose. Tái lập enterprise-accounting → phải sửa quyết định này + ADR 0006 trước. Canonical: `docs/modules/finance.md` § Accounting Advanced Boundary; migration chain thuộc ADR 0006.

## D022: HĐĐT lập realtime tại payment; không nháp-local sau thanh toán (2026-06-14)

**Decision (owner — cổng pháp lý đóng):** Thời điểm lập HĐĐT = tại thời điểm thanh toán hoàn tất, realtime per-order qua `createInvoice`. KHÔNG triển khai `hddt_issuance_mode='deferred_batch'`, `createDraftTaxInvoice`, `issueDraftBatch`, cron phát hành lô. Gộp lô cuối ngày CHỈ là chuyển dữ liệu MTT lên CQT (bảng tổng hợp); `createBatchInvoice` giữ làm hạ tầng backfill/B2C, không dùng để defer. Sửa sai sau phát hành qua owner/accountant (D023, giới hạn D049). Canonical: `docs/ref/einvoice-tax.md` § 1.1. Đảo (defer việc lập) phải sửa quyết định này trước.

## D023: Sửa-sai POS realtime — correction ở owner/accountant (2026-06-14)

**Decision (net, sau D049):** Correction HĐĐT/thanh toán (hủy/thay thế, refund, sửa phương thức) KHÔNG nằm trên màn POS — chỉ ở Owner + Kế toán. Ngoại lệ HẸP duy nhất: full void-after-paid theo D049. Cashier-facing: thanh toán xác nhận **một chạm**, không dialog confirm phụ (khóa bằng `pos-payment-single-tap.test.ts`); phòng lỗi dựa vào correction sau phát hành. `correct_payment_method` RPC = pure record fix, HĐĐT đã phát hành không bị ảnh hưởng.

## D026: HRM redesign — trục Người · Ngày công · Lương (2026-06-15)

**Decision:**

1. `standard_days` = số công chuẩn CỐ ĐỊNH owner nhập theo tháng + clamp `working/standard ≤ 1`.
2. Việc trong ca: cấu hình theo vị trí — chi tiết thuộc D052 (đã thay mô hình template/override cũ).
3. Lương qua HĐLĐ active trong kỳ khi có, fallback `employees.base_salary` cho dữ liệu HKD cũ.
4. Ca làm: GIỮ (D027), đặt ở "Thiết lập".

**IA:** `/hr` = 3 trục **Người · Ngày công · Lương**; Ca + Việc trong ca → "Thiết lập"; `defaultTab` động (owner→Người, BM→Ngày công). D012 vẫn áp: KHÔNG rostering/auto-late/auto-absent/số dư phép/duyệt nhiều tầng. Canonical chi tiết payroll: `docs/ref/labor-contracts.md`, `docs/ref/payroll-pit.md`.

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
- (c) **Tách hóa đơn = N partial payment/đơn** (RPC `record_partial_payment` FOR UPDATE+SUM; DROP `idx_payments_order_active`; nới gate amount; order flip 'paid' khi SUM(completed) ≥ total; 'partial' derive-at-read) — **CHƯA build**. `customer_count` đã drop.
- (d) Danh tính HKD: SSoT = `tenants.legal_name`/`tax_code` (KHÔNG `system_settings`).
- (e) VAT derive theo bậc qua `resolve_gtgt_rate` + shared mirror, không hardcode; HĐ cũ 8% = sửa-tiến (đối soát hồi tố là việc kế toán). Canonical: `docs/ref/einvoice-tax.md` § 2.1.
- (f) Hạ ưu tiên: refund sum-guard (unreachable), `refundOrderPayment` 2-RPC non-atomic (rough-edge).

**Lưu ý prod còn hiệu lực:** destructive DB change cần expand-contract — zero-ref object bị xóa TRƯỚC khi owner apply. Đảo (a)–(f) phải sửa quyết định này trước.

## D032: Redesign UI = Hợp nhất (A) + Nâng cấp thị giác trong contract (B) (2026-06-16)

**Net:** A (hợp nhất theo D031/D026/D027 + contract design-system) đã thành contract sống. Typography đi theo D038 → D069; dark mode đã ship qua D069. **Còn mở (chưa quyết):** tách `info`-hue (hiện `--info` == `--foreground`); ⌘K command palette; `--radius` 0.625→0.75rem (taste). GIỮ: `primary` đỏ gạch + palette Concept 01.

## D033: `main` là trunk TS/Supabase hiện hành — bỏ Go-port (2026-06-16)

**Decision:** `main` là trunk hiện hành. Go-port không thuộc current architecture (tag `archive/go-port-2026-05`). **Rollback:** `git push --force origin archive/main-go-port:main`.

## D035: Gỡ hẳn bề mặt accounting/khóa-kỳ khỏi app (2026-06-19)

**Decision (owner):** Toàn bộ UI/route accounting đã gỡ. **Giữ lại (KHÔNG đụng):** permission `accounting:period_reopen` + RPC `close_period_soft/hard`, `reopen_period`, bảng `accounting_periods` (DB-layer thuộc owner qua migration). Dựng lại sau = tính năng "Khóa số liệu tháng" gọn dưới `/admin/settings`, không tái lập khung kế toán. Canonical: `docs/modules/finance.md`.

## D036: Agentic OS — xương sống Notification/Alert/Report + thang tự chủ (2026-06-19)

**Decision (net, kênh theo D046):** Xây "Agentic OS" **95% deterministic + 5% LLM mỏng-bounded** trên xương sống `notifications`. Hợp đồng SSoT (producer/dedup/threshold/routing/invariants) = `docs/agent/rules/notifications.md` — không chép lại ở đây.

Phần chỉ sống ở quyết định này:

- **Thang tự chủ R0→R3** (shadow → inform → recommend → auto-act-bounded). **Lằn ranh cứng: agent đụng tiền/thuế/lao động cap R1 (báo) mãi mãi.** Service Janitor là agent auto-act (R3) DUY NHẤT (idempotent/đảo-ngược). LLM không bao giờ cầm DB/RPC/số — chỉ narrate trên số SQL tính.
- **Tool của agent = RPC `SECURITY DEFINER` sẵn có** (allowlist + cap), không xây action API mới; cron mới chỉ làm phần trigger không làm được. Telegram topic map cấu hình ở `inventory_qc_settings.telegram_topic_map` (token + chat_id ở env).
- **Phasing S0→S7:** wedge S0 = Cash Sentinel + Till Anomaly shadow-only; báo cáo Đóng ngày/tuần/tháng là phần giá trị cao nhất. 3 cổng owner: DoR (T3) · apply migration · duyệt R0→R1. Tính lịch theo shadow-wall-clock + owner review, KHÔNG theo LLM-pace.
- Mặt tiền CHAT Telegram (tương tác đọc lệnh/ack) là hạng mục riêng CHƯA quyết — phần này chỉ là outbound alerting.

## D038: Chuyển typography sang Geist (2026-06-20)

**Decision (net, sau D069):** Body + data face = **Geist** + **Geist Mono** (package `geist`, self-hosted, đủ glyph tiếng Việt); heading/display = Be Vietnam Pro theo D069. Cấm tái nhập Inter/Montserrat/JetBrains. Print pipeline không đụng. Canonical: `docs/spec/design-system.md` § Typography Contract.

## D039: HĐĐT realtime instant-issue khi provider trả mã CQT đồng bộ (2026-06-20)

**Decision (T3):** Trong `createInvoice`: có CẢ `invoiceNo` LẪN `codeOfTax` non-empty → `issued`; `invoiceNo` không `codeOfTax` → `submitted`; không `invoiceNo` → `signing`. Mẫu `1/...` không đổi hành vi. `createTaxInvoice` capture `codeOfTax` → `tax_invoices.cqt_code`. Trade đã chốt: realtime direct-INSERT không ghi `tax_invoice_events`; audit qua `audit_logs` + `provider_data.codeOfTax` + `cqt_code` (invariant: einvoice-tax.md § 3.3).

**Mở (chờ owner):** (a) event-row cho realtime issue; (b) instant-issue rút mẫu-2 khỏi pool reconcile; (c) mẫu-1 có codeOfTax đồng bộ; (d) smoke Viettel sandbox.

## D040: Tắt `taxPercentage` giả cho mẫu `2/...` (S-invoice) (2026-06-20)

**Decision (owner):** Mẫu `2/...` KHÔNG gửi `taxPercentage`/`taxAmount`, `taxBreakdowns: []`, giá GROSS; mẫu `1/...` giữ rate thật; nghĩa vụ % khai ở tờ khai trên tổng doanh thu. Canonical (full restatement + verify): `docs/ref/einvoice-tax.md` § 3.2.

## D041: Payroll "tính lương" atomic — 1 RPC `upsert_payroll_calculation` (2026-06-20)

**Decision (T3):** Gộp upsert `payroll_entries` + flip `payroll_periods.status='calculated'` + clean-recompute delete vào 1 RPC SECURITY DEFINER; TS giữ toàn quyền tính PIT/BH (`calculatePayrollEntry` + `legal-versions.ts`), RPC chỉ persist nguyên tử. Contract RPC: clean-recompute bằng `NOT EXISTS` cùng transaction; KHÔNG EXCEPTION block; gate in-body (`auth_tenant_id()` ép tenant + `payroll_period_id` trên MỌI row — không tin jsonb client, `has_permission_any('finance:payroll_calculate')`, period `FOR UPDATE`, `status IN (draft,calculated)`, reject entries rỗng); `employee_count` = ROW_COUNT; GRANT EXECUTE chỉ `authenticated`. Guard: `PAYROLL-CALCULATE-MUST-BE-ATOMIC-RPC` (tasks/regressions.md).

**Defer (owner quyết sau):** snapshot `legalVersionEffectiveFrom` (recompute kỳ `calculated` dưới legal-version mới hiện ghi đè im lặng); guard entry-completeness lúc approve; chính sách NV 0 công. TOCTOU đọc-trước-lock chấp nhận ở quy mô single-tenant.

## D042: Xóa sổ hết hạn đi qua waste pipeline + waste pipeline thực sự trừ kho (2026-06-21)

**Decision (owner):** Xóa sổ hàng hết hạn KHÔNG dùng `adjustStock` thô — đi qua waste pipeline (`create_expiry_writeoff`): tier, cổng ảnh, duyệt tier-2, trừ kho theo WAC, lưu lô vào `source_ref` (`kind=expiry`, `grn_item_id`). Cả ba đường waste (`create_waste_entry`, `approve_waste`, expiry) post movement giảm kho qua helper `_post_writeoff_movements` (mirror `confirm_stock_issue`). Security: helper REVOKE khỏi `authenticated`/`anon`; `confirm_stock_issue` chặn confirm writeoff đang `pending` (bypass duyệt tier-2).

## D043: `create_payment` authz nội hàm gate `pos:use`; hoãn siết completion (2026-06-21)

**Decision (owner):** `create_payment` (SECURITY DEFINER, GRANT authenticated) verify nội hàm: `p_tenant_id = auth_tenant_id()`, `p_created_by = auth.uid()`, `has_permission(branch, 'pos:use')` — khớp gate caller duy nhất. **Defer có chủ đích:** hoàn tất thanh toán hiện chỉ cần `pos:use` qua `createPayment` trong khi `confirm_cash_payment` đòi `pos:confirm_payment` — bất nhất này GIỮ NGUYÊN; siết completion về `pos:confirm_payment` là PR riêng (đổi cả action + UI bill tiền mặt).

## D044: Má Tư Design System là UI contract duy nhất (2026-06-21)

**Decision:** Authority = `docs/spec/design-system.md`; runtime tokens `packages/ui/src/styles/globals.css`; primitives `packages/ui/src/components/*`; app adapters `apps/web/app/components/surface.tsx`. Tooling/skill ngoài phải map về các file trên — không tạo authority song song.

## D045: Shell điều hướng một sidebar (tier1 tab + tier2 sub-tab) (2026-06-22)

**Decision (net, collapse-mode theo D063):** Chrome Management dùng MỘT sidebar trong một `SidebarProvider`/`SidebarInset`; `AppShell` nhận `tier1` (tab chính cross-module theo ACL) + `tier2` (deep nav mô-đun đang mở). Tab chính không trải phẳng page con; Admin gom về tab "Quản trị". Mobile `<md`: bottom-nav = tier-2 + một tab "Mô-đun" mở drawer. Nav-as-data + MODULE_ACL single-source giữ nguyên. Canonical: `docs/modules/ui.md` § Management Shell Structure. Đảo phải sửa bản ghi này trước.

## D046: Gỡ Web Push server-side, thay bằng popup foreground `Notification` API (2026-06-22)

**Decision:** "Thông báo trên thiết bị" = popup OS từ client qua `Notification` API khi PWA đang mở (Realtime INSERT → refetch → `showNotification`); KHÔNG có lớp Web Push server (VAPID/cron/ledger đã gỡ). Đánh đổi chấp nhận: không thông báo khi app đóng. Popup bắn cho MỌI severity nhìn thấy được (gồm `info` `pos.order_new`). In-app feed giữ nguyên. Canonical: `docs/agent/rules/notifications.md`. Đảo phải sửa bản ghi này trước.

## D047: Non-prod runtime = Supabase preview-branch + Vercel Preview mỗi PR (2026-06-27)

**Decision:** Môi trường non-prod = Supabase Branching (ephemeral mỗi PR, chạy `supabase/migrations/*` + `seed.sql`) + Vercel Preview. Prerequisite đã thi công: managed-surfaces fold vào migration chain (idempotent) — single source = fold migration, xem `docs/spec/database-schema.md`. Provisioning thuộc owner (D005). Canonical vận hành: `docs/agent/rules/database.md` § Preview Branches + `docs/runbooks/db/preview-branch-setup.md`.

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

1. **Hai mặt phẳng = 2 họ chrome D019:** Operator plane (mobile/tablet, gốc `/br/[branchId]/*`) + Office plane (`AppShell` desktop: `/admin` + domain workspaces + `/branches`).
2. **Mọi route operator-facing dồn về `/br/[branchId]/*`** (đã move: `/employee/*` → `/br/[id]/shift/*`; sàn Kho → `/br/[id]/stock/*`). branchId trên URL = SSoT; staff pin thì Branch Hub tự điền.
3. Branch dashboard + control + setup (tables/pos/kds/printers) + `pos-sessions` thuộc Operator plane (amend D019 §1 + D017).
4. **Branch-context = 1 provider** `resolveBranchContext()` thay 3 cơ chế scope cũ; proxy + RLS + `MODULE_ACL` + `has_permission` giữ nguyên làm cổng gác — context chỉ là lớp đọc.
5. **Branch Hub = entry device-aware** (`resolvePostLoginRedirect`): canonical = bảng generated "Post-Login Home By Role" trong `docs/spec/role-route-matrix.md`.
6. **Phone bottom-nav operator = `Hôm nay · Ca · Lịch · Tôi`** (ratify D058 §2) + capability tiles từ `nav-config.ts`/`MODULE_ACL`, gate server-side.
7. Không viết lại POS/KDS/Runner — chỉ re-root lên context + Hub.

Scope: Office-side People/Branch IA thuộc D048; "Việc trong ca" thuộc D052. Đảo điểm nào phải sửa bản ghi này + D019 trước.

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

1. **Rollout:** trừ-kho-khi-bán gate bằng MỘT branch flag `pos_stock_outcome_posting` (D065), default OFF; rollback = tắt flag theo chi nhánh.
2. **D016 supersede có điều kiện:** chi nhánh chưa bật flag giữ nguyên D016.
3. **UI ownership:** quản lý sell state ở branch manager surface (`Tồn | Sẵn bán | Còn`); POS/KDS chỉ thấy trạng thái bán được/khóa món.
4. **Pending demand:** POS create/append chỉ tạo demand/reservation qua `branch_menu_item_daily_holds` — không reservation table thứ hai.
5. **Payment-before-ready (Option B):** stock outcome chỉ post khi đủ cả hai: order paid/completed VÀ stock-tracked KDS ticket đã từng ready.
6. **Ready boundary:** `kds_tickets.first_ready_at` bất biến, set lần đầu khi ticket `ready`; recall không reset.
7. **Outcome mapping:** paid/completed + first-ready → `consumption`/`sale_consumption`; cancel trước first-ready → no movement; cancel sau first-ready → waste `cancelled_after_kds_ready` (chỉ line đã ready/served; line pending chỉ release demand).
8. **Idempotency:** partial unique index trên `stock_movements` grain `(tenant_id, order_id, movement_subtype, ingredient_id, location_id)`.
9. **Stock owner = Kho CN/default issue location;** KDS/Bếp không là stock owner.
10. **Multi-unit:** mọi movement convert về base unit qua tenant-aware helper trước khi ghi ledger.

Đảo điểm 1–10 phải sửa D053 trước.

## D055: Operator plane cho warehouse/production qua central site (2026-07-02)

**Decision (owner, net — §1 đã thi công soft-routing; số hiệu § giữ vì code auth cite trực tiếp):**

1. **§1:** `warehouse_manager` + `production_manager` home = central site của mình (`/br/{central-site-id}` theo `branches.branch_kind`, D000) — operator hub là home thống nhất cho mọi role gắn site. Thi công soft-routing: claims giữ tenant-level (`branch_id` null); proxy gate `/br/{id}` theo branch-kind khớp domain role (site active); station POS/KDS/Runner vẫn khóa kind `branch`; `returnTo` deep-link giữ qua `homeBranchId` server-computed; DB auth/profile twins normalize 2 role này về `branch_id = null` (migration trong chain).
2. §2 (thi công là workstream riêng) — đã hoàn thành trong §1 + D066/D067.
3. §3 (`/employee` làm home cho `office`) — **hết hiệu lực:** `/employee` đã retired; `office` home = `/finance` (D058 §3).

Canonical: bảng generated "Post-Login Home By Role" trong `docs/spec/role-route-matrix.md`. Mở rộng D050, không đảo.

## D056: Operator GRN-receive route + hướng consumption (2026-07-02)

**Decision:**

1. URL `receive` dưới `/br/[id]/stock` dành riêng cho **transfer-receipt**; goods-receipt (GRN) không chia sẻ prefix — operator GRN detail = route `stock/grn/[id]` wrap `GRNDetailPageContent` (embedded, branch-scoped), `afterCreateGrnHref` trỏ tới đó.
2. **Consumption ≠ Issues:** giữ 2 khái niệm phân biệt theo contract P0 `docs/runbooks/inventory/route-cta-matrix.md` (Tiêu hao ≠ Xuất kho nội bộ, cấm dùng nhãn lẫn nhau). Chốt: biến consumption thành variant thật, KHÔNG gộp — thực thi ở đợt sau.

## D058: IA thống nhất "Hai plane — Một chrome — Một cửa mỗi việc" + chuẩn lắp ráp trang (2026-07-03)

**Decision (owner, net sau D059/D061):**

1. **Hướng IA khóa:** 2 route plane (Office + Branch Operator theo D019/D050/D055) + station chrome; hợp nhất chrome primitives (1 `AppHeader`, 1 `AppBottomNav`, 1 `PwaToolbar`); **mỗi việc đúng 1 cửa được quảng bá per role** (cửa thua = redirect). Từ chối: single responsive shell; operator-first pseudo-site.
2. Bottom-nav operator chính thức `Hôm nay · Ca · Lịch · Tôi` (amend D050 §6).
3. **Role `office`:** read `/finance`; home = `/finance`.
4. **Nhà báo cáo = `/finance`.** Stock-movement về 1 cửa; operator giữ tối đa 1 wrapper read-only branch-scoped.
5. **Approvals canonical = bản `/br/*`** (checkout: `/br/[id]/shift/checkout-approvals`, waste: `/br/[id]/stock/waste-approvals`); cửa office là oversight cross-branch có nhãn; route re-key về `employee_checkout_approvals` (vá lỗ cashier/chef qua route gate).
6. **Bridge "Văn phòng" trên operator hub:** chuyển tiếp shrink-to-zero theo D059 §2.
7. **Floor-slice:** `/br/[id]/stock/purchase-orders` + `/stock/reports` gate theo `inventory_procurement`/site-kind; tile hub sinh từ `branch_kind × role`, không role-only.
8. **Page Archetype Standard:** taxonomy 12 archetype (EMBED-WRAPPER hạng nhất); luật shell chung = export `*PageContent({searchParams?, routeBranchId?, basePath?, embedded?})`. Canonical: `docs/spec/page-archetypes.md` + gate trong `scripts/check-ui-contract.mjs` (baseline chỉ giảm).
9. **Component Registry:** `docs/modules/ui.md`; rule tra cứu trước khi build trang: `docs/agent/rules/ui.md` (codegraph / `pnpm audit:ui-components`, cấm grep-mò/clone).
10. **Claude Design project** = mirror MỘT CHIỀU repo→design, không bao giờ là authority.
11. **Perf lane:** code-split POS client tree, `radix-ui` vào `optimizePackageImports`, song song hóa + stream KDS/runner fetch, mở rộng `use cache` cho read tenant-stable, chặn unbounded fetch.
12. Chất lượng: mọi surface đổi QA đủ 3 viewport (phone ~375, tablet 768/1024, desktop).

Đảo điểm nào phải sửa bản ghi này trước.

## D059: Branch-complete — role tại chi nhánh đủ tính năng native trong Hub (2026-07-03)

**Decision (owner):**

1. **Nguyên tắc khóa:** role đóng ở branch/site (`branch_manager`, `cashier`, `chef`, `warehouse_manager`, `production_manager`) có ĐẦY ĐỦ job thuộc scope dưới dạng surface native mobile-first trong operator plane. Cơ chế chuẩn: tách `*PageContent` + EMBED-WRAPPER (`docs/spec/page-archetypes.md`).
2. **Bridge "Văn phòng" = CHUYỂN TIẾP shrink-to-zero:** native surface land tới đâu gỡ tile bridge tới đó; không gỡ trước khi native equivalent land (cấm dead-end). Trạng thái đích: hub branch roles không còn link sang office plane.
3. **`/br` = CONTEXT PICKER** (chi nhánh | site trung tâm | văn phòng): card "Văn phòng" owner-only → office landing.
4. **Lộ trình extraction (tuần tự):** GRN create → count-assignments → supplier-returns → HR approvals seam (chỉ lát duyệt nghỉ/sửa chấm công — KHÔNG wrap cả `hr-client.tsx`) → production surface. Job tenant-scope thuần (catalog món, roster/payroll, procurement văn phòng, finance, tenant settings) KHÔNG lên hub.
5. **Office plane giữ cho desk personas** (owner tại bàn, office/kế toán); fix presentation nội-chrome Management không thuộc lệnh bác "single responsive shell" của D058 §1.
6. **Mobile-first từ Branch, desktop = densify.** PO creation + analytics nặng giữ desktop-first kèm tóm tắt phone.

Siết D058 §6; mở rộng D050 §5. Đảo phải sửa bản ghi này trước.

## D060: Inventory workflow — giữ WAC, không FIFO/Lô/requisition formal (2026-07-03)

**Decisions (owner — verify vs PROD, không từ docs cũ):**

1. **Costing: GIỮ WAC.** Không FIFO/lô-lớp-cost; `lot_id` vestigial giữ nguyên, không dùng.
2. **SKU: XONG** (114/114 nguyên liệu có SKU cấu trúc; verdict "PARTIAL" của audit là stale — không mở dự án SKU).
3. **KHÔNG xây sổ lô/batch-expiry;** bỏ cảnh báo hạn dùng naive. Nếu sau này cần theo dõi hàng tươi → bản ghi lô-hạn-dùng NHẸ đối soát tồn thật, cần D0xx mới.
4. **GIỮ transfer-request** (branch xin hàng); KHÔNG requisition→duyệt→PO formal; thay bằng reorder-suggestion → 1-chạm tạo PO nháp.
5. **Ledger-correctness migrations HOÃN có điều kiện:** land NGAY TRƯỚC đợt nhập đầu kỳ của owner (đóng-băng-base-qty+cost lúc confirm + RPC `verify_inventory_ledger()`), không land rời rạc — khi owner báo bắt đầu nhập đầu kỳ, mở slice owner-gated.

**Rejected (over-engineering cho scale này):** FIFO, sổ lô đầy đủ + FEFO, requisition formal, multi-bin WMS, per-location reorder-override. Canonical vận hành: `docs/ref/inventory.md`. Đảo phải sửa bản ghi này trước.

## D061: Office Inventory sidebar hiện lại tồn/kiểm kê/điều chuyển làm oversight (2026-07-03)

**Decision (owner, amend D058 §4):** `/inventory/stock`, `/inventory/stocktake`, `/inventory/transfers` quay lại office sidebar làm **oversight entries** — cùng năng lực, hai plane, hai công việc khác nhau (office = xem/điều phối liên chi nhánh; branch = thao tác tại chỗ) → không vi phạm "một cửa mỗi việc". Thuần nav-membership (`inventory-nav.ts`), không đổi route/ACL; test `inventory-nav-resolver.test.ts` assert có mặt, trích D061. Không đổi D059.

## D062: Native-quality PWA là hướng giao (mở rộng D012, KHÔNG rewrite native) (2026-07-03)

**Decision (owner):** Mục tiêu = trải nghiệm native bằng PWA chất lượng native; D012 (loại native-framework) VẪN đứng. Chương trình additive: **PWA-1** Operator Hub cài được như app (manifest riêng `/br/[branchId]`, mirror pattern station, tái dùng `pwa-runtime`/`pwa-toolbar`); **PWA-2** offline shell tối thiểu cho Hub; **PWA-3** native-feel (standalone chrome, safe-area, press feedback — trong Motion Contract § G, không animation library mới); **PWA-4** perf nối vào lane hiện có. Không route/ACL/schema change; không framework/dep PWA thứ hai; push notification tùy chọn. Đảo (mở lại native rewrite, bỏ installable Hub) phải sửa bản ghi này trước.

## D063: Desktop mode cho office chrome (icon-rail + width tier + master-detail) (2026-07-03)

**Decision (owner — sửa tại chỗ, tuân D019/D045):**

1. **Icon-rail:** `Sidebar` `collapsible="icon"` (cùng primitive, cùng provider — không phải rail thứ hai) + `SidebarRail` + `SidebarTrigger` hiện mọi breakpoint; brand/back-link collapse-safe; hành vi `<md` (drawer) không đổi.
2. **Nav phẳng:** module phẳng (menu/orders/branches) không bọc group 1-item trùng tên — `resolveOfficeDeepNav` trả `[]`; tab chính là cửa duy nhất.
3. **Đợt sau (PR pages riêng):** width tier (cap 1600px bảng dữ liệu, full-width tile board) + Orders master-detail inline ở `xl:`.

Đảo (bỏ icon-rail, quay lại offcanvas-only, gộp lại group 1-item) phải sửa bản ghi này trước.

## D064: Capacity NULL = vô hạn; giới hạn tay thuần tay; quota theo first-ready (2026-07-04)

**Context:** Pilot Phước Hải khóa toàn menu vì một cờ vừa trừ kho vừa chặn bán + capacity NULL map → 0. Số hiệu § giữ nguyên vì migration/test/code cite trực tiếp:

1. §1 hai-flag (`pos_stock_availability_gate` tách khỏi posting) — **bị D065 §1 thay:** một công tắc trọn gói, flag gate đã xóa.
2. **Capacity NULL = vô hạn, không bao giờ 0**, mọi tầng (display + gating): không định mức HOẶC thiếu quy đổi đơn vị → món bán tự do, chỉ "Tắt món"/"Ngưng bán" chặn được. Fail-open khi bán, fail-loud trên trang quản lý (badge "Chưa có định mức"/"Thiếu quy đổi").
3. **Giới hạn bán tay thuần tay:** không seed/clamp từ Tồn; trống = không giới hạn; "Bỏ giới hạn" = null-out `limit_quantity` + `is_disabled=false` nhưng GIỮ row (bảo toàn `sold_today` — xóa row là mất bộ đếm, đặt lại giới hạn giữa ngày sẽ bán lố); "Tắt món" đặt được cho mọi món active. Invariant limit-ratchet: số so với lũy kế Đã bán cố định lúc đặt; số tụt theo bán (Tồn-live) chỉ so với demand còn lại (pending + holds), không trừ thêm Đã bán.
4. §4 stock gate advisory — **bị D065 §2 thay:** enforcement = DB hard gate.
5. **Refund/void sau thanh toán:** line đã first-ready → KHÔNG trả suất (`sold_today` giữ, đúng phần bếp đã làm); chưa first-ready → trả suất (mở rộng D053 §7 sang quota).
6. **POS thẻ món hiển thị "Còn N phần"** khi hữu hạn + badge lý do khi = 0 (Tắt / Hết suất / Hết nguyên liệu).
7. **Trigger bếp `pos_ingredient_stock_block` GỠ HẲN** (đo kho bếp trong khi mọi tầng khác đo kho chi nhánh, chặn oan, chưa từng bật): DROP `trg_enforce_ingredient_stock` + `enforce_branch_ingredient_stock` + `get_branch_menu_ingredient_caps_for_pos` + row flag.
8. **Khóa Path 2 trước khi re-enable posting:** REVOKE `transition_order_status` khỏi `authenticated`; idempotency `post_pos_sale_consumption_if_ready` match sale-shaped rows (subtype NULL hoặc `sale_consumption`, không phải mọi `consumption`). Clause shortage-post-âm cũ **bị D065 §3 thay** (không ghi movement, không âm). Số phận `payments.stock_consumed_status` còn mở.

Đảo điểm nào phải sửa bản ghi này trước.

## D065: "Trừ tồn khi bán" = một công tắc trọn gói — bật là rào cứng, kho không âm (2026-07-04)

**Decision (owner — đảo mô hình 2-flag/advisory của D064 gốc có chủ đích):**

1. **MỘT công tắc owner-facing "Trừ tồn khi bán"** = `pos_stock_outcome_posting`. BẬT = trừ kho theo định mức khi bán + CHẶN CỨNG khi hết tồn (bán đúng số lượng tồn, kho không bao giờ âm, hết = khóa món đến khi nhập thêm — GRN vào là tự mở vì capacity tính live). TẮT = không trừ, không rào, bán vô hạn. Không có chế độ trừ-mà-không-chặn; flag `pos_stock_availability_gate` đã xóa; `gate_eff` trong reader RPC := chính flag posting.
2. **Enforcement = DB hard gate:** trigger AFTER INSERT trên `order_items`, pool KHO CHI NHÁNH (warehouse — không phải bếp như trigger đã gỡ ở D064 §7), chỉ chạy khi flag bật, scoped vào nguyên liệu của đơn, cùng công thức demand với availability (mains + sides, `inv_to_base_for_tenant`), serialize `FOR UPDATE` trên `stock_levels`, skip-hatch GUC `comtammatu.skip_quota_enforcement`, lỗi P0001 `insufficient_stock_ingredient:<id>` (POS map sẵn copy VN, non-retryable).
3. **Kho không âm tuyệt đối:** giữ constraint. Shortage lúc ghi sổ thanh toán (race hiếm lọt gate): payment VẪN hoàn tất, KHÔNG ghi movement (không partial-post), RAISE WARNING — lệch bắt bằng kiểm kê (doctrine đếm D027/D028).
4. **Món không định mức / thiếu quy đổi:** giữ D064 §2 — ngoài vòng kiểm soát kho, bán tự do.

Trigger inert khi flag OFF. Đảo phải sửa bản ghi này trước.

## D066: Kho Tổng / Bếp Trung Tâm là context độc lập ở `/br` + bộ tính năng riêng từng site (2026-07-04)

**Decision (owner, net — ruột trang theo D067). Số hiệu § giữ nguyên vì docs/migration cite trực tiếp:**

1. **Picker `/br`:** hiện đủ mọi site active theo thứ tự Chi nhánh → Bếp Trung Tâm → Kho Tổng, card cuối Văn Phòng (owner-only); tên = `branches.name`, icon theo kind; site inactive tự biến mất.
2. **Owner operate được mọi kind active** (proxy non-station cho owner `requiredBranchKind = null`, chỉ còn điều kiện site active). **POS/KDS/Runner giữ khóa kind `branch` cho MỌI role, kể cả owner.** Soft-routing D055 không đổi.
3. **Tile whitelist theo kind — field `kinds` trong `nav-config.ts`** (mở rộng D058 §7): `central_supply` 9 tile (gồm Danh mục theo D067); `central_kitchen` 8 tile, Sản xuất đứng đầu, không Trả NCC; loại noise khỏi site trung tâm (Tiêu hao, Xuất kho, Hạn dùng, Báo cáo, Phân công đếm, nhóm Bán hàng); tile transfer đổi nhãn theo POV (chi nhánh "Yêu cầu hàng", site trung tâm "Chuyển hàng"); chi nhánh giữ nguyên bộ tile.
4. **Home site trung tâm không hub-bloat:** KPI doanh thu + "Điều hành chi nhánh" + queue expiry + Today-spine chỉ ở kind `branch`; queue duyệt (kiểm kê/hao hụt) giữ vì là job thật của site.
5. §5 (nâng cấp render `embedded` tại chỗ) — **bị D067 §1 đè:** fork component mobile-native.
6. §6 (không extraction mới, NumberPadSheet lát sau) — **bị D067 đè cùng hướng §5.**
7. **Ba mục chốt:** (a) CẤP cho bucket `production_manager` (head_chef, central_kitchen_manager) các key còn thiếu: GRN confirm, kiểm kê, writeoff, quản lý công thức (recipe); (b) BỎ nhóm "Văn phòng" (office_bridge) ở home site trung tâm (tile `kinds: ["branch"]`); (c) grid tồn kho cho plane office — còn mở. Kèm chỉ đạo copy: nhãn user-facing "BOM" → "Công thức".

Đảo điểm 1–7 phải sửa bản ghi này trước.

## D067: Hub Kho Tổng — ruột trang native mobile (đè D066 phần render-embedded), Kho trước Bếp sau (2026-07-04)

**Decision (owner):**

1. **Fork presentation thành component mobile-native** cho các route `(operator)/stock/*` — không "nâng cấp embedded tại chỗ". Server action + data loader GIỮ chung (một nguồn); chỉ tách lớp hiển thị (mobile-native operator ↔ dense-table office oversight D061). KHÔNG shell mới / chrome family mới (D019/D045/D058/D063 giữ nguyên); vẫn plane Operator, vẫn `/br/[branchId]/(operator)/*`.
2. **Phạm vi: Kho Tổng (`central_supply`) TRỌN VẸN trước; Bếp TT đợt sau cùng khuôn** (perms Bếp khác — production_manager không có `inventory:write`/`units_master`/`supplier_manage`; bộ danh mục chốt ở đợt Bếp).
3. **Home Kho "Hôm nay":** CTA chính "Nhận hàng" + lưới tile curated; feed "Cần xử lý" = Phiếu nhập dở · Đơn chờ nhận (PO) · Duyệt kiểm kê · Duyệt hao hụt — KHÔNG Tồn thấp, KHÔNG Sắp hết hạn (D060 §3).
4. **GRN:** NCC-first, PO không bắt buộc (DB/RPC đã đúng: `po_id` NULLABLE), banner "không cần PO", nhập từng dòng cho ngón tay + chụp ảnh phiếu; **tạo NCC nhanh inline** qua `createSupplier` sẵn có (name unique/tenant) — KHÔNG đụng schema (`goods_received_notes.supplier_id` NOT NULL giữ).
5. **Tile "Danh mục"** cho `central_supply` (bộ tile 8→9): Nhóm NL · Nguyên liệu · Đơn vị · Ngưỡng tồn · NCC, tái dùng action sẵn có (không action/perm mới); xóa nguyên liệu = soft-archive (`toggleIngredientActive`); categories/units/suppliers xóa thật.
6. **Bottom-nav Kho curated:** `Hôm nay · Nhận · Tồn · Kiểm · Thêm` (thay 2-item Home/Management cho site trung tâm).

Canonical presentation rule: `docs/modules/ui.md` § Branch Operator Hub. Đảo điểm 1–6 phải sửa bản ghi này trước.

## D068: Kho CN tự nhận NCC (GRN) + sản xuất tại chi nhánh — branch_manager, own-branch (2026-07-05)

**Decision (owner):** (1) Kho CN (`branch`) tự nhận hàng NCC trực tiếp — không bắt buộc qua Kho Tổng; luồng điều chuyển (Yêu cầu hàng → Nhận) GIỮ, đây là ADD; (2) chi nhánh chạy được lệnh sản xuất; (3) actor = `branch_manager`, quyền TẠO + XÁC NHẬN (post tồn / trừ NL), chỉ own-branch (enforce app-layer + RLS `has_permission(branch_id,…)`); (4) `branch_manager` được tạo NCC nhanh — grant `procurement:supplier_manage` (danh mục NCC tenant dùng chung); (5) **PO vẫn ĐÓNG với chi nhánh** — `PROCUREMENT_PO_ROLES` giữ PO cho owner/warehouse/production (giữ D066 §3 / D058 §7, tile "Đơn đặt hàng" central-only). Grant per-branch, không tenant-wide. Mở rộng D000. Canonical đầy đủ (grant list, RLS, helper): `docs/ref/inventory-rbac-matrix.md`. Đảo mục 1–5 phải sửa bản ghi này trước.

## D069: Be Vietnam Pro heading + Shift-aware night mode (2026-07-07)

**Decision (owner, đảo phần heading của D038):** Heading/display = Be Vietnam Pro (subset `vietnamese`+`latin`); body + data giữ Geist + Geist Mono. Night mode = warm-dark "gạo cháy", auto 18:00–06:00 local + cookie override `matu-theme`, map vào class `.dark`, KHÔNG dùng `prefers-color-scheme`; scope toàn app; receipts/ESC-POS pipeline theme-independent; toggle duy nhất `ThemeToggle`. Canonical: `docs/spec/design-system.md` § Typography Contract + Theme runtime; palette values sống ở `packages/ui/src/styles/globals.css`.

## D070: SectionLabel primitive + ratchet EASY WIN + HR density-first (2026-07-08)

**Decision (owner):** (1) `SectionLabel` primitive 2 density variant (`default`/`dense`), render `<div>` (eyebrow là typographic role, không phải semantic heading); (2) `/hr` density-first (bỏ KPI mosaic, EmployeeTable làm focal point, readiness = count strip); (3) ratchet easy-win đã reconcile. Canonical: `tasks/regressions.md` [SECTION-LABEL-SSOT] + `docs/agent/rules/ui.md` § Typography Rules. Còn ngoài scope: SectionLabel group b (9 complex sites) / group c (12 Label/Badge); logo night variant.

## D071: DS contrast wave + 4 hạng mục adapter + Motion Step 0-A (2026-07-10)

**Decision (owner):** (1) `--{status}` là MỰC (AA 4.5:1 trên nền + tint của chính nó, cả 2 theme), `--{status}-foreground` chỉ là chữ trên nền đặc; light `--warning` rời brand gold (`#f2a100`→`#8e5400`), light `--success` đậm hơn (`#446935`); vàng gạo vẫn là accent ở `--ring`/`--chart-2`; night CTA lật foreground về nền tối. (2) 4 hạng mục adapter: `ItemTitle` giữ default dense + role contract `size="heading"`; field-trigger grammar hợp nhất qua `packages/ui/src/lib/field-trigger.ts` (Select/Combobox/TagInput/multi-select); POS/KDS touch target lên rung `icon-touch`/`touch`; `DataTable` tự own client-side paging, 6 growth list bật `pageSize={50}` — sort/sticky header chờ UI Advisor Gate. (3) Motion Step 0 = phương án A (ADR 0010): one-shot content enter `duration-150` + `motion-safe:` cho realtime INSERT thật (cart line mới, KDS ticket mới); `duration-300` vẫn khóa overlay-only. Enforce: gate `status-foreground-on-tint` + `status-focus-ring-contrast` (baseline 0) + `design-token-contrast-static.test.ts`. Canonical: `docs/spec/design-system.md` § Token Contract + §G.

## D072: Hợp thức hóa brand expression đang sống + mở compact-empty symbol (2026-07-10)

**Decision (owner, phương án a — hợp thức hóa thay vì gỡ):** (1) Pattern caro placements = danh sách ĐÓNG: Runner footer strip, login full-surface wash, Management sidebar header wash; full-surface wash chỉ hợp lệ dạng trang trí `aria-hidden`/`pointer-events-none`, opacity ≤10 — gate `brand-pattern-placement` allowlist đích danh. (2) Mascot động = full-screen waiting/idle only (Runner idle board, `PageSpinner fullScreen`, login brand panel), không bao giờ trên control tương tác hay chrome trong trang — gate `mascot-animation-placement`. (3) Compact-empty mở cho `BrandSymbol`: `symbol` hợp lệ trên `AppEmptyState compact` khi empty là trạng thái chính của trang/section (queue trống, catalog trống); inline/row-level giữ text-only. (4) Xóa `transition-transform duration-200` chết trên card lockup login. Canonical: `docs/spec/design-system.md` § brand-patterns + § utilities + §G.
