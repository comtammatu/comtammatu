# Architecture Decisions

> Log mỗi quyết định kiến trúc quan trọng với rationale. Số hiệu `D` là ID cố
> định (doc khác trỏ tới) — khoảng trống là quyết định đã xoá/bỏ qua, KHÔNG đánh
> số lại. Đây là bản ghi quyết định + rationale, KHÔNG phải worklog triển khai
> (worklog ở `tasks/`, `docs/worklog/`, git history).

## D000: Inventory branch and central site operating model (2026-06-19)

**Decision:** Inventory dùng `branches` làm site table; `branches.branch_kind` active với `branch`, `central_supply`, `central_kitchen`.

**Transfer matrix** (trigger `enforce_stock_transfer_direction`): cho phép `central_supply → branch`, `central_kitchen → branch`, `branch → central_supply`, `branch → central_kitchen`, `central_supply ↔ central_kitchen`, `branch → branch`; chặn thiếu ref, central direction lạ, và same-branch.

**Contract:** PO/GRN/stock levels/production orders/stock transfers ref `branch_id` trực tiếp. Branch kind quyết hành vi site: Kho CN giữ branch stock, Kho Tổng giữ supply stock, Bếp TT giữ production stock, Bếp CN consumption ghi như approved consumption movement (không transfer).

## D002: Tenant-Branch 2-level thay vì Company-Brand-Branch 3-level (2026-04-01)

**Decision:** `Tenant (L0) → Branch (L1)`. Tenant = single row (id=1). Mọi scope qua `tenant_id` + `branch_id`. KHÔNG có tầng brand (chỉ 1 brand Cơm Tấm Má Tư) — không brand switcher; JWT mang 2 scope claim (`tenant_id` + `branch_id`), không có brand scope claim.

## D005: User tự quản lý infrastructure (2026-04-01)

**Decision:** Code chỉ chứa placeholder env vars. AI agent KHÔNG tạo infrastructure resources (Supabase/Vercel/Upstash/GitHub). `.env.example` phải đầy đủ.

## D006: supabase-js only, no Prisma (2026-04-01)

**Decision:** Supabase-js (PostgREST) cho tất cả queries. Không Prisma (break Edge Runtime, overhead lớn cho 1 SELECT). Migration qua Supabase CLI; type qua `supabase gen types`. (Mirror ở AGENTS Critical Constraints.)

## D008: Cloud-first, local-first Phase 2 (2026-04-04)

**Decision:** Runtime cloud-first + PWA cache cho offline cơ bản. Local-first (mini PC + SQLite + sync) KHÔNG nằm trong product scope (internet hiếm mất, ~50 req/s cloud đủ, effort ~3x). Muốn mở lại offline POS phải sửa D012 trước, kèm số liệu vận hành chứng minh nhu cầu thật.

## D009: Path-based routing, không sub-domain (2026-04-04)

**Decision:** Path-based (`/admin/*`, `/br/[branchId]/pos`, `/br/[branchId]/kds`) — 1 domain, auth "just works", ACL tập trung ở `proxy.ts`. Sub-domain không nằm trong backlog (kéo theo cross-origin cookie/CORS/wildcard cert/DNS/deploy surface) → muốn tách phải có quyết định mới.

## D010: RHF + zod + Má Tư DS Field cho mọi form (2026-04-17)

**Decision:** Form CRUD dùng `react-hook-form + zod 4 + @hookform/resolvers + Má Tư DS Field`. App-local helpers ở `apps/web/app/components/form/` (`TextField`/`NumberField`/`SelectField`/`TextareaField`/`FormDialog`/`valuesToFormData`) — bind RHF + field components project-specific (FormattedNumberInput VND), không ở `packages/ui`.

**Status:** Baseline cho dialog CRUD mới + form đã migrate. Import/export one-field upload và GRN mobile wizard có shape riêng, không dùng helper chung.

## D011: Print-agent LAN-only transport (2026-05-07)

**Decision:** `apps/print-agent` chỉ hỗ trợ LAN printer transport. Không runtime flag chọn transport, không USB capability columns, không USB native binding. LAN-only enforced trong baseline: `printers` CHECK `printers_connection_type_lan_only` (`connection_type='lan'`), không cột `usb_*`, `printer_agents` không cột `transport`; `src/usb.ts` đã gỡ (lịch sử ở `supabase/migrations/_archive/`). Branch rollout = terminal-linked Android gateway + LAN printer.

## D012: Tier-2 trim + gộp role POS — định hướng phần mềm hỗ trợ Hộ Kinh Doanh (2026-06-10)

**Context:** Đây là phần mềm HỖ TRỢ vận hành HKD, không phải nền tảng F&B đa năng. Prod xác nhận: cashier kiêm phục vụ là luồng thật, `shift_assignments` = 0 dòng (chia ca chưa bao giờ là workflow thật).

**Decision:**

1. LOẠI khỏi backlog (không đề xuất lại): Local-First/offline POS (D008), VNPay (VietQR+MoMo đủ), native POS Flutter/Capacitor (PWA chạy ổn).
2. Role POS: D051 supersedes phần này; sàn bán hàng dùng access bucket `cashier`, phục vụ là công việc trong ca chứ không phải role auth riêng.
3. Mọi tính năng mới qua **phễu "phần mềm hỗ trợ HKD"**: giảm thao tác chủ + nhân viên hiện có; không thêm nghi thức quản trị (phân ca, duyệt nhiều tầng, kế toán doanh nghiệp) HKD không dùng.

## D014: Chương trình hợp nhất tầng molecule UI — W0–W6 (2026-06-11)

**Decision:** 6 wave: W0 khung loading/error/404 → W1 StatusBadge SSOT → W2 formatVND + KpiCard → W3 Empty/Confirm → W4 ListSurface (DataTable) → W5 IA (xem D019) → W6 decompose god-components. Mỗi molecule hợp nhất kèm: mục contract trong `docs/spec/design-system.md` + check ratchet `scripts/check-ui-contract.mjs` với allowlist = baseline, chỉ được giảm.

**Status:** W0–W4 đã ship. W5 chi tiết ở D019; W6 còn lại. Giữ có chủ đích: `pos/_lib/order-status-display.ts` (6→5 nhãn thu ngân), inventory dictionary, employee wrapper layer.

## D015: Một Platform duy nhất — production in-place là system of record (2026-06-12)

**Decision:**

1. Một Platform duy nhất = hệ production hiện tại (repo này, DB `iexwsuaqqenyjiskawoj`). KHÔNG ETL/migrate dữ liệu vận hành sang DB khác.
2. `matu-platform` (DB `dyksphedgzqsqjqgxzog`) đóng băng vĩnh viễn: không deploy, không mở lại feature; archive read-only sau harvest; DB backup rồi pause/xóa theo owner.
3. **Harvest một chiều** ở mức spec + migration chọn lọc, viết lại theo convention `with-action.ts`/RPC hiện hành (bê nguyên khối = vi phạm). Danh mục duyệt: pgTAP + CI test-db; idempotency_keys + webhook claim-before-side-effect; inventory ledger-based; HĐĐT worker (queue/retry/awaiting_lookup, vault, token cache, mock-block prod); PBAC anti-escalation; reports net-profit-daily.

**Consequences:** Chấm dứt re-litigate hướng platform. Mọi đề xuất rebuild/cutover phải sửa quyết định này trước, kèm số liệu thắng phương án absorb.

## D016: POS không trừ kho khi thanh toán (2026-05-28; ghi nhận hồi cứu 2026-06-13)

**Decision:** Thanh toán POS KHÔNG trừ kho (kho prod 0 dòng → trừ kho chỉ sinh số sai). Action-layer đã gỡ; webhook stock leg disable qua `20260611001000_disable_payment_stock_leg.sql` (applied prod). Amount-recompute + `finalize_paid_order` GIỮ NGUYÊN — chỉ tắt nhánh stock consumption.

**Consequences:** Smoke chain = POS → payment → KDS/print → HĐĐT. Đuôi: remove `consume_stock_for_order` + RPC liên quan (owner-gated, `tasks/todo.md`). Đảo policy (kho seed + owner duyệt) phải sửa quyết định này trước; khi re-enable, caller `complete_payment_and_consume_stock` check `stock_consumed_status != ok` → webhook 500 + notification `high`. D053 supersedes this only for branches that explicitly enable `pos_stock_outcome_posting`.

## D017: Admin là L0 Tenant Command; Branch Manager dùng L1 Branch Command (2026-06-13)

**Decision:**

1. Product framing = `bộ phần mềm quản lý vận hành và bán hàng` cho HKD (dùng `ERP` khi so phạm vi, không đổi entrypoint thành ERP đa ngành).
2. `/admin/*` = L0 tenant command + tenant setup cho `owner`: dashboard chuỗi, báo cáo, chi nhánh, nhân sự, quyền, thiết lập tenant. (Bề mặt accounting đã gỡ — xem D035.)
3. `branch_manager` KHÔNG phải Admin user. Home BM = `/employee`; điều hành + thiết lập chi nhánh ở `/br/[branchId]/dashboard` + `/br/[branchId]/settings/*`.
4. Domain workspaces (`/inventory`, `/orders`, `/hr`, `/finance`, `/menu`) là workflow surface độc lập, không phải tab con của Admin.
5. Role/route chỉ là gate bề mặt; action + row-level access vẫn qua permission keys, RPC/RLS, branch scope.

**Canonical:** `docs/spec/role-route-matrix.md`. Không thêm workflow branch-scoped mới vào `/admin/*`.

## D018: Bỏ tenant-admin phụ — gộp vào `owner` (2026-06-13)

**Decision (supersedes phần tenant-admin phụ của D017):** `ACCESS_BUCKETS` canonical gồm **7** bucket: `owner`, `branch_manager`, `warehouse_manager`, `production_manager`, `cashier`, `chef`, `office`. `/admin/*` chỉ `owner`. Mọi tenant-admin fallback cạnh `owner` thuộc diện retired; `owner` giữ quyền. Cấu hình sàn/bếp gộp vào `owner` + `branch_manager`.

**Canonical:** `docs/spec/role-route-matrix.md`.

## D019: W5 — Cấu trúc hoá UI (shell · route home · nav · padding) (2026-06-13)

**Decision** (chi tiết hoá D014 W5; gốc tái-drift = tầng cấu trúc chỉ là luật chữ, 0 check):

1. **2 họ chrome** (không có họ thứ 3): **Quản trị** = `AppShell` chung (admin + domain workspaces + branch command/setup `/br/[branchId]/*`), một sidebar nhiều nhóm theo role/scope; **Vận hành** = chrome full-screen (POS, KDS, Runner) + `/employee`, dùng chung token/typography/status primitives.
2. **Một capability = một route home** theo `role-route-matrix.md`. Branch-floor settings (tables/pos/kds/printers/pos-sessions) nhà canonical `/br/[branchId]/settings/*`; Tenant Admin Settings giữ `general`/`branches`/`payments`/tenant printer.
3. **Padding một chủ = `AppPage`**; `AppShell` main bỏ outer padding; trang lá không tự đặt `p-*` gốc.
4. **Nav là data**: mọi sidebar/bottom-nav project từ `nav-config.ts` qua resolver chung; cấm `ShellNavGroup[]` literal trong shell.
5. Hợp đồng chi tiết: `docs/spec/design-system.md` § Structural Governance; mỗi luật kèm ratchet baseline-đóng-băng-chỉ-giảm.

**Consequences:** Đảo bất kỳ điểm nào (shell thứ 3, đổi padding owner, đổi route home) phải sửa quyết định này trước.

## D020: Enterprise Accounting / TT 200 / VAS is outside the HKD product (2026-06-13)

**Decision:**

1. Enterprise accounting / TT 200 / VAS KHÔNG thuộc product contract hiện tại.
2. Finance authority = HKD operating finance: `/finance`, revenue, food-cost signal, operating expenses, cash summary, HĐĐT register, B2C summary, supplier-invoice/AP handoff, accountant export.
3. `accounting_periods` period close/reopen còn là DB-only owner support; không app route nào expose.
4. Tái lập enterprise-accounting reports / master-data / double-entry → phải sửa quyết định này + ADR 0006 trước.

**Migration order:** ADR 0006 owns the executed migration chain — không lặp lại ở đây.

## D021: Chiết khấu theo món ngay trong luồng thêm/gọi-thêm (POS) (2026-06-13)

**Decision (T3):** Thêm chiết khấu per-item (KHÔNG promotion engine). In-RPC: nhồi `discount_type/value/note` vào item JSON của `create_order`/`append_order_items`; trigger `pos_normalize_order_item_discount` tự tính, RPC không tự tính tiền. KHÔNG đổi cột/signature (`p_items` jsonb) → generated types không đổi. UI: customizer mode `new`/`append`/`edit`; `edit-sent` giữ luồng hậu kỳ. Ghi chú ≥3 ký tự bắt buộc khi có chiết khấu (constraint `order_items_discount_metadata_paired`); dòng có chiết khấu nhận cart-key riêng.

**Status:** Migration owner-applied (D015); owner smoke trên POS thật (free 100%, vnd clamp, append, idempotent, void, in bill). GAP đã biết ngoài phạm vi: split PARTIAL chưa copy discount; bill nhiệt gộp discount ở khối tổng. Đảo (quay lại chỉ-hậu-kỳ / lên promotion engine) phải sửa quyết định này trước.

## D022: HĐĐT lập realtime tại payment; không nháp-local sau thanh toán (2026-06-14)

**Decision (owner — cổng pháp lý đóng):** Thời điểm lập HĐĐT = **tại thời điểm thanh toán hoàn tất** (einvoice-tax.md §1.1), realtime per-order qua `createInvoice`.

1. KHÔNG triển khai `hddt_issuance_mode='deferred_batch'`, `createDraftTaxInvoice`, `issueDraftBatch`, cron phát hành lô — không defer việc lập/giao HĐ cho khách.
2. Gộp lô cuối ngày CHỈ áp dụng cho chuyển dữ liệu HĐĐT MTT lên CQT (bảng tổng hợp), không cấp số/giao HĐ muộn. Provider `createBatchInvoice` giữ làm hạ tầng backfill/B2C, không dùng để defer.
3. Sửa sai sau phát hành đi qua owner/accountant (hủy/thay thế/điều chỉnh theo TT 32/2025). Cashier chỉ được guardrail TRƯỚC payment — chi tiết D023.

**Consequences:** Đảo (defer việc lập) phải sửa quyết định này trước.

## D023: Sửa-sai POS realtime — guardrail TRƯỚC thanh toán + correction ở owner/accountant (2026-06-14)

**Decision (owner):**

1. KHÔNG đưa hủy/thay thế HĐĐT ra màn POS (quá nhiều thao tác thu ngân). Correction (hủy/thay thế, refund, sửa phương thức) chỉ ở Owner (`finance/invoice-list.tsx`, owner-gated) + Kế toán (sau).
2. Cashier-facing: thanh toán xác nhận **một chạm** từ "Đã thanh toán", KHÔNG có dialog confirm phụ (chốt bằng `pos-payment-single-tap.test.ts`, PR #73 / `ac899cff`). Phòng lỗi dựa vào correction owner/accountant SAU phát hành — không phải gate trước-thanh-toán của thu ngân (đảo so với hướng guardrail-confirm trong dự thảo ban đầu của bản ghi này).

**Đã có:** `refundOrderPayment` (owner); `correct_payment_method` RPC + action (pure record fix — HĐĐT đã phát hành không bị ảnh hưởng). Migration `20260615120000` applied prod.

**Status:** Owner cần **smoke-test live** đường refund + sửa-phương-thức (prod SELECT-only — không tự xác minh số liệu được).

## D025: Không cài `revfactory/harness` — lấy ý tưởng, cải tổ rule governance (2026-06-15)

**Decision:** KHÔNG cài harness làm tool/runtime — pattern lõi bắt buộc `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (Codex không set được → vỡ "neither runtime privileged"); ghi authority vào `.claude/agents`+`.claude/skills` (Codex không đọc) → governance-capture. Lấy ý tưởng (design-time) vào shared docs: QA cross-boundary taxonomy + incremental coherence (`workflow.md`); re-runnable-skill descriptions, generalize-don't-overfit, per-call-model (`skills.md`).

**Invariant (load-bearing):** KHÔNG rule/workflow nào được PHỤ THUỘC Agent Teams — Codex không có tương đương → orchestration phải runtime-neutral với fallback single-agent/written-transcript. Agent Teams = capability tùy chọn cho Claude (`.claude/settings.json` env), KHÔNG phải policy.

## D026: HRM redesign — trục Người · Ngày công · Lương (2026-06-15)

**Decision:**

1. **Ngày công chuẩn:** `standard_days` = số công chuẩn CỐ ĐỊNH owner nhập theo tháng + clamp `working/standard ≤ 1`. Trích helper shared.
2. **Checklist:** GIỮ. Gán theo `positions.code` (mặc định) + override theo người (`employees.default_checklist_template_id`).
3. **Lương qua HĐLĐ khi có, fallback hồ sơ NV:** UI nhập `base_salary` + `dependents_count` + mức lương đóng BH. `calculatePayroll` ưu tiên `employment_contracts` active trong kỳ; nếu chưa có HĐ thì fallback `employees.base_salary` cho dữ liệu HKD cũ.
4. **Ca làm:** GIỮ (xem D027 — đảo §4 cũ "ca ít giá trị"), đặt ở "Thiết lập".

**IA:** gom 5 tab `/hr` → 3 trục **Người · Ngày công · Lương**; Ca + checklist → "Thiết lập". `defaultTab` động (owner→Người, BM→Ngày công).

**Consequences:** Scope = truthful daily attendance, checklist-by-position, employee CRUD, leave notifications, payroll via HĐLĐ/fallback hồ sơ. D012 vẫn áp: KHÔNG rostering/auto-late/auto-absent/số dư phép/duyệt nhiều tầng.

**Status (2026-06-26):** IA 3-trục + payroll `standard_days` owner nhập + phép năm + HĐLĐ/BHXH đang được rebuild ở branch `codex/hrm-payroll-annual-leave`. Không apply production DB; owner apply migration thủ công.

## D027: Chấm công theo CA (per-shift), không theo ngày (2026-06-15)

**Context:** Toàn bộ NV Má Tư làm 2 ca/ngày (sáng 06–13, chiều 16–21). Mô hình cũ ràng 1 bản ghi/người/ngày → không ghi nổi 2 ca; adoption thấp.

**Decision:**

1. **Đơn vị chấm công = CA.** Unique đổi `(employee_id, date, tenant_id)` → `(employee_id, date, shift_id, tenant_id)`; `shift_id` NOT NULL cho dòng mới. Migration backfill `shift_id` dòng cũ (theo `resolveDefaultShiftId` từ `check_in`) trước khi đổi constraint.
2. **Ca = xương sống, Global.** 1 bộ ca chung 4 chi nhánh; `shifts.branch_id` NULL = global; seed 2 ca; auto-nhận ca theo giờ check-in.
3. **Ngày công:** đủ 2 ca = 1 công; 1 ca = 0.5. `working_days = Σ_ngày( min(ca_có_mặt, 2) × 0.5 )`; clamp ≤ standard.
4. **UX:** 4 mốc/ngày (vào sáng → ra trưa → vào chiều → ra tối); `today-work-state` thành máy trạng thái 2-ca.
5. **Checklist theo từng ca** (snapshot riêng mỗi bản ghi ca).

**Consequences:** Thứ tự HRM: Thiết lập Ca → chấm công per-shift → ngày công → lương. T3 schema migration file→PR→owner (D015). Mở rộng (không đảo) D026.

## D028: Kiểm soát nguyên liệu = đếm thực tế + lát "tài chính trước" (2026-06-15)

**Decision (owner):**

1. **Nguyên liệu tiêu hao = ĐẾM THỰC TẾ** (tiêu hao = tồn đầu + nhập − tồn cuối), dùng module stocktake (mode `daily`) + stock_issues. **GIỮ D016** — KHÔNG bật `consume_stock_for_order`/recipe auto-deduct. Kích hoạt = bài toán seed dữ liệu.
2. **Thứ tự: TÀI CHÍNH TRƯỚC.** (a) Bảng `expense` (sổ chi phí đơn, ngoài NCC) → `fetchOperatingExpenseTotal` đọc bảng này; (b) **Lợi nhuận ròng** = lãi gộp − chi vận hành − lương − thuế; (c) **Lợi nhuận thực tế** = tiền thực thu − thực chi; (d) **Tiền mặt hiện hữu** = quỹ đầu kỳ + thu − chi tiền mặt. Tạm: giá vốn nhập tay tới khi module kho chạy; lương tạm là 1 danh mục `expense` tới khi D026 populate `payroll_entries`.

**Status:** Cockpit owns operating expenses / net profit / actual cash profit / current cash. `/finance/expenses` = entry surface canonical. Cash balance dùng opening balance owner nhập ở `system_settings` (KHÔNG đoán từ lịch sử payment). Migration `20260615140000_add_expenses_table.sql` — kiểm ledger/schema môi trường trước khi tin live data. Mở rộng (không đảo) D015/D020; giữ D016.

**Open:** định nghĩa canonical `doanh thu` / khoản-trừ `lãi gộp` chưa chốt — cockpit tạm dùng `netRevenueBeforeVat − ingredientCost` (track `tasks/todo.md`).

## D029: Glyph tiền canonical = `đ` (U+0111); vnd-format gate là render-SSoT (2026-06-15)

**Decision:**

1. Canonical money glyph = `đ` (U+0111) — `formatVND` (`packages/shared/src/format/currency.ts`) + print-render (`packages/print-render/src/format.ts`, `document-render.ts`) đều phát `đ`; khớp single-style khóa `45.000đ` ở `docs/spec/design-system.md`. `₫` (U+20AB) KHÔNG xuất hiện ở render path canonical nào; mọi `₫` còn lại (inventory + finance message catalogs) là drift cần dọn về `đ` ("₫ wave").
2. `vnd-format-ssot` là render-governance gate, KHÔNG phải mandate route mọi `vi-VN` formatter qua `formatVND`. Chỉ duplicate money-format helper là debt; non-money formatter (count/quantity/date/ratio) giữ typed theo domain — đừng đuổi allowlist về 0.
3. Đổi glyph app-wide phải update money render + print render + SQL/EMV mirror + receipt template trong một money-render wave.

## D030: Gate-precision — allowlist = sàn false-positive, KHÔNG phải backlog về 0 (2026-06-15)

**Decision:** `docs/spec/design-system.md` là canonical cho per-gate semantics (healthy/reframe/mixed gate + active-zone allowlist). Allowlist count tự nó không phải backlog.

**Consequences:** Không đuổi reframe allowlist về 0; được reconcile entry cũ khi actual count rớt dưới floor; không hạ gate dưới actual count / không reinterpret gate mà không update spec; UI debt mới fix ở primitive/pattern, không thêm route-local visual language.

## D031: Đợt remediation UX/IA toàn app — 5 phán quyết owner (2026-06-16)

**Đính chính từ verify (KHÔNG phải bug, không sửa):** (1) HĐĐT `sellerName` — app không gửi `sellerInfo`, Viettel tự điền người bán từ MST đăng ký (`supplierTaxCode`=`COMPANY_TAX_CODE`); `request.sellerName/sellerTaxCode/sellerAddress` là input chết. (2) Concurrency/idempotency đã khóa ở tầng DB (`FOR UPDATE` + precondition + partial unique index) — đóng.

**Phán quyết owner:**

(a) **Payroll vào app theo mô hình HKD có HĐLĐ/BHXH tối thiểu** — đọc HĐLĐ active trong kỳ khi có (`gross_salary`, `insurance_base_salary`), fallback `employees.base_salary`/`employees.insurance_base_salary` cho dữ liệu cũ; ngày công + phép năm + `dependents_count` + PIT/BH legal-version. Form NV thu `base_salary`/mức lương đóng BH/ID/bank/`dependents_count`/thông tin HĐ tối thiểu (owner-only PII). Đi sau/khớp D026/D027.
(b) **Runner = đồng hồ chờ**, chỉ hiện đơn ĐANG LÀM (`['pending','preparing']`, không lane `ready`); đổi tên khỏi "Gọi số"; thêm thang tuổi + overflow.
(c) **Bỏ `customer_count`** (đã drop, `20260616100000`) + **tách hóa đơn** = N partial payment/đơn: 1 migration T3 nguyên tử (DROP `idx_payments_order_active` + nới gate amount ở `create_payment`/`confirm_*` + RPC `record_partial_payment` FOR UPDATE+SUM). Order flip 'paid' khi SUM(completed)>=total; status 'partial' derive-at-read.
(d) **Danh tính HKD vào UI** — SSoT = `tenants.legal_name`/`tax_code` (KHÔNG `system_settings`); card owner-only. Bỏ 3 field chết General (`service_charge`/`store_phone`/`store_email`). ĐÓNG: card đã ship; print-render seller-name BỎ theo owner (Viettel tự điền từ MST — xem đính chính 1).
(e) **VAT derive theo bậc, KHÔNG hardcode** — sai lầm gốc = `vat_rate` fix cứng (8.00). Resolver versioned suy ra rate theo `bậc doanh thu × ngày hiệu lực × ngành` (≤1 tỷ miễn; >1–3 tỷ GTGT 3% gốc/2,4% tạm đến 31/12/2026; >3 tỷ TNCN 17%). `resolve_gtgt_rate` + shared mirror đã land; 3.111 HĐ cũ ở 8% = sửa-tiến (đối soát hồi tố là việc kế toán, không tự ghi đè HĐ đã phát hành).
(f) **Hạ ưu tiên:** refund `reverse_payment_and_post` sum-guard (unreachable); `refundOrderPayment` 2 RPC non-atomic (rough-edge). KDS/checkout concurrency = đóng.

**Plan thực thi:** `docs/plan/ux-ia-remediation-2026-06.md`. T3 (payroll RPC, split-bill, food-cost MV) chạy four-perspective debate + migration file→PR→owner (D015). Đảo bất kỳ (a)–(f) → sửa quyết định này trước. **Lưu ý prod:** destructive DB change (drop column) cần expand-contract — deploy đang phục vụ traffic phải zero-ref object bị xoá TRƯỚC khi owner apply.

**Status (2026-06-20):** (a) payroll, (d) định danh HKD, (e) VAT-derive-theo-bậc, (b) runner lanes/age — ĐÃ SHIP (còn dư nhãn "Gọi số" ở PWA tab title + nav label). (c) drop `customer_count` ĐÃ SHIP; **tách hóa đơn / `record_partial_payment` CHƯA build** (track `tasks/todo.md`).

## D032: Redesign UI = Hợp nhất (A) + Nâng cấp thị giác trong contract (B) (2026-06-16)

**Decision (owner):** chọn **A + B**, tránh C (rebrand). Dự án KHÔNG thiếu DS (Concept 01 đã khóa) — "redesign" = hợp nhất + nâng cấp có kiểm soát.

- **A (nền, bắt buộc) = thực thi D031** (track nav/IA, status/DataTable, pagination, surface) + HRM (D026/D027). 1 trạng thái = 1 màu/nhãn, DataTable phủ mọi bảng, enforce `AppPage` padding, gộp module-shell về 1 `AppShell` (W5).
- **B (lớp khác biệt, chỉ làm SAU khi A đủ phủ + update spec TRƯỚC khi apply token):** (1) tách `info`-hue (hiện `--info` == `--foreground`); (2) bật lại dark mode (token `.dark` đủ, đang bị `forcedTheme="light"`) **[OPEN]** phạm vi; (3) chiều sâu dashboard + `chart-1..5`; (4) ⌘K command palette; (5) **[OPEN — taste]** `--radius` 0.625→0.75rem.
- **GIỮ:** `primary` đỏ gạch + palette Concept 01; Rhythm/Radius/Motion contract. _(Typography Inter/Montserrat/JetBrains → ĐẢO bởi D038: chuyển Geist.)_

**Quan hệ:** A = D031 (+ D026/D027); kế thừa D019, D029/D030. Mỗi PR = 1 route family / 1 primitive rollout.

## D033: `main` là trunk TS/Supabase hiện hành; `codex/continue-ts` đã hợp nhất vào main rồi nghỉ hưu — bỏ Go-port (2026-06-16)

**Decision:** `main` là trunk hiện hành cho TS/Supabase product. Go-port không thuộc current architecture (tag `archive/go-port-2026-05`). Active docs/plans/runbooks/branch refs coi `main` là source branch.

**Rollback:** `git push --force origin archive/main-go-port:main`.

## D035: Gỡ hẳn bề mặt accounting/khóa-kỳ khỏi app (2026-06-19)

**Context:** `/admin/accounting` (soft-close ngày 5 / hard-close ngày 15) là nghi thức kế toán doanh nghiệp HKD không dùng (thuế khoán, không sổ sách formal); đã bị ẩn khỏi nav và là entry trùng. Owner chốt "Xoá hẳn" thay vì giữ ẩn (đảo chiều quyết định ẩn-nav accounting trước đây).

**Decision (owner):** Gỡ toàn bộ lớp UI/route accounting:

- Xoá route `/admin/accounting/*` + redirect `/admin/finance/[[...slug]]` (redirect `/admin/finance → /finance` giữ ở middleware).
- Xoá chain period-close UI (`period-close-card.tsx` barrel + inventory + actions `closePeriodSoft/Hard/reopenPeriod`).
- Gỡ ModuleKey `accounting` khỏi `module-acl.ts`/`labels/vi.ts`/`route-map.ts`/`route-resolution.ts`/`shell-primitives.ts`; gỡ copy `finance.periodsAdmin`.

**Giữ lại (KHÔNG đụng):** permission `accounting:period_reopen` + RPC DB `close_period_soft/hard`, `reopen_period`, bảng `accounting_periods` (DB-layer thuộc owner qua migration). Dựng lại sau = tính năng "Khóa số liệu tháng" gọn dưới `/admin/settings`, không tái lập khung kế toán.

## D036: Agentic OS — xương sống Notification/Alert/Report + thang tự chủ (2026-06-19)

**Decision:** Xây một "Agentic OS" cho Má Tư theo hướng **95% deterministic + 5% LLM mỏng-bounded**, trên xương sống `notifications` sẵn có. Hợp đồng SSoT = `docs/agent/rules/notifications.md`; tầm nhìn + lộ trình + sprint + agent-team = `docs/plan/agentic-os-blueprint.md`. Bắt đầu bằng **wedge S0**: Cash Sentinel + Till Anomaly chạy **shadow-only** (chỉ ghi `agent_decisions`), 0 blast radius.

**Context:** Phễu "phần mềm hỗ trợ HKD" (D012) + "tài chính trước, tiền mặt hiện hữu" (D028). Rò rỉ ở quầy (lệch quỹ, void/discount, giá NCC trườn, food-cost drift) là tổn thất sống còn mà mắt người không thấy theo mẫu. Owner muốn "agent trông quán" để chuyển từ _canh chừng lo âu_ sang _mỗi ngày báo đúng + cờ cái sai kèm đề xuất_.

**Quyết định owner đã chốt (verify vs CODE + PROD, không từ docs cũ):**

- **Ngưỡng:** lệch quỹ `max(20.000đ, 0.1%×expected_cash)`; void `>10%`/ca; discount `>5%`/ca và `>20%`/đơn; ca mở `>16h`; payment treo `>2h`. (Lệch quỹ #1 ĐÃ có trigger `trg_notify_pos_shift_variance` — chỉ **retune hằng số**, không xây mới.)
- **Routing 2 kênh tách bạch:** Web Push = theo `target_roles` (critical → owner; warning → owner + branch_manager, **digest cuối ngày**, không push giữa ca). **branch_manager chỉ ở Web Push.** Telegram Supergroup = **theo thành viên group** (owner + người được đặc cách mời), **tách khỏi role app**; cả critical lẫn warning vào topic; dispatcher role-agnostic.
- **Quiet hours:** warning → digest; critical → push ngay.
- **Telegram:** Bot API 10.1, forum supergroup + topics (`message_thread_id`, `can_manage_topics`), native fetch, 20 msg/min cho CẢ group → digest là van rate. Cây topic: 🔴 Khẩn · 💵 Tiền-Quỹ · 🍳 Bếp-Void · 📦 Kho-Tồn · 🛒 Mua hàng-Nhập · 🧾 Hóa đơn-Thuế · 👥 Nhân sự · 📊 Báo cáo ngày · 📈 Báo cáo tuần-tháng. Token + chat_id ở env; topic map ở `inventory_qc_settings.telegram_topic_map`.
- **Thang tự chủ R0→R3** (shadow → inform → recommend → auto-act-bounded). **Lằn ranh cứng: agent đụng tiền/thuế/lao động cap R1 (báo) mãi mãi** — không auto-act. Service Janitor là agent auto-act (R3) DUY NHẤT (idempotent/đảo-ngược). LLM không bao giờ cầm DB/RPC/số; chỉ narrate trên số do SQL tính; digest là thứ làm CUỐI.
- **Báo cáo ngày/tuần/tháng** là phần giá trị cao nhất (xác nhận tích cực, không chỉ cảnh báo); "Đóng ngày" 02:05 ICT là flagship.

**Why (kiến trúc + ràng buộc):**

- Producer → `notifications` (dedup_key) → Dispatchers (Web Push role-based **[live]** + Telegram topic-based **[designed]**, mỗi cái claim-RPC + ledger riêng) → Channels → Audiences. **Telegram phải SOI Web Push, KHÔNG dùng `notification_outbox`** (user-gated + read→loop→update đua double-send).
- **Tool của agent = 214 RPC `SECURITY DEFINER` sẵn có** (allowlist + cap), không xây action API mới. Precedent role-hardening: migration `20260619062853`.
- Cron mới CHỈ làm phần trigger không làm được (aggregate + staleness); test khẳng định 0 trùng kind của trigger (#1, #6).
- Migration: file → PR → owner (no dev DB; `guard-prod-db.mjs`). Agent ghi file trong git worktree riêng (kỷ luật shared-tree). Single tenant (`tenant_id=1`).
- Đội thực thi = mô hình `docs/agent/rules/team.md` chĩa vào backlog (KHÔNG org mới): Orchestrator + Contract/Migration/Detector/Dispatcher/Briefer + Verify + Codex stage-6. 1 sprint = 1 workflow run. 3 cổng owner: DoR (T3) · apply migration · duyệt R0→R1.
- **Timeline thật:** code ~2–3 tuần; DONE ~tuần 10–13 (≈70% là shadow-soak + owner review serial). Tính lịch theo shadow-wall-clock + owner review, KHÔNG theo LLM-pace.

**Quan hệ với D024:** D024 (trợ lý Telegram = **mặt tiền CHAT** tương tác, DRAFT) khác phần này (**Telegram OUTBOUND alerting** — dispatcher đẩy notification vào topic). Bổ trợ, không trùng: alerting outbound ship trước; chat-front-end (đọc lệnh, ack/snooze) là việc sau, off-scope S0–S7.

**Consequences / phasing:** S0 spine+shadow (wedge) → S1 Web Push live + severity gate + retune trigger → S2 Telegram dark → S3 Telegram live + rate-valve + void-after-pay → S4 Đóng ngày → S5 mua hàng/kho/tài chính → S6 POS tail+HR+tuần → S7+ migration batch + LLM digest. Critical path S0→S2→S3→S4; S1 ∥ S2. Tài liệu này (D036) + `notifications.md` + `agentic-os-blueprint.md` là of-record; mọi producer/agent code theo đó.

**Cập nhật 2026-06-22 (D046):** Kênh **Web Push server-side** (cron `notifications-push` + VAPID + claim-RPC + ledger) ĐÃ GỠ, thay bằng **popup foreground qua `Notification` API** khi PWA mở (client-side, không ledger, không giao khi app đóng). "S1 Web Push live" không còn áp dụng; Telegram vẫn là dispatcher server thực thụ đầu tiên. In-app feed + spine `notifications` giữ nguyên. Xem D046.

## D037: Import `m-tu-design-system` bundle — touch tier cho form control (2026-06-20)

**Context:** Bundle derive ra từ chính repo này (~85% circular: token/brand/logo/mascot md5-identical; palette lệch ΔE<0.018; template tả màn đã ship). Không màn mới, không token mới.

**Decisions (owner):**

1. **Touch tier form control (gated):** thêm value `touch` vào `size` cva của `Select`(trigger)/`Switch`/`Checkbox`/`RadioGroupItem` (`min-h-12` trigger, box 20px + hit-area ≥44px), theo precedent §"Button is the single source of truth for button height". Consumer opt-in qua `size="touch"`. Default render KHÔNG đổi.
2. **bo-slide deck → standalone** (không vào route surface; không dựng report-export capability).
3. **Glossary casing → `vi.ts` authoritative** (TitleCase "Bếp Trung Tâm" là SSoT; bundle mirror, không fork sentence-case).
4. **Font Geist** _(ĐẢO bởi D038 cùng ngày — owner chốt dùng Geist; xem D038)_.

**Out of scope:** net-new prop khác bundle quảng cáo (`Button rice`, `Avatar` fill/status, `Progress` size/label, `Textarea showCount`) — chưa duyệt, đụng contract khóa.

## D038: Chuyển typography sang Geist theo Má Tư Design System (2026-06-20)

**Decision (owner — đảo D032, supersede D037 §4):** App-UI typography chuyển sang **Geist** (body + heading, single-family) + **Geist Mono** (tiền/mã/ngày giờ/số đơn). Bỏ Inter/Montserrat/JetBrains khỏi runtime UI. Print pipeline (`packages/print-render`, RobotoMono bitmap nhiệt) KHÔNG đụng (pipeline riêng, pixel-locked).

**Cơ chế:** `next/font/google` Geist KHÔNG có subset `vietnamese` → dùng **`geist` package** (Vercel official, next/font/local, full glyph tiếng Việt, self-hosted). `globals.css` bind `--font-sans`/`--font-heading` → `--font-geist-sans`, `--font-mono` → `--font-geist-mono`. App code không đổi. Spec forbid-list lật: cấm tái nhập Inter/Montserrat/JetBrains/Be Vietnam Pro.

## D039: HĐĐT realtime instant-issue khi provider trả mã CQT đồng bộ (2026-06-20)

**Decision (T3):** Trong `createInvoice`, khi có CẢ `invoiceNo` LẪN `codeOfTax` non-empty (trimmed) → trả `issued` (mirror `createBatchInvoice` + `getStatus`). `codeOfTax` rỗng nhưng có `invoiceNo` → `submitted`; không `invoiceNo` → `signing`. HĐ GTGT mẫu `1/...` (mã async) không đổi hành vi. `createTaxInvoice` capture `codeOfTax` → ghi `tax_invoices.cqt_code` (cột trước đây chết). KHÔNG migration (state machine đã cho `signing/submitted → issued`).

**Trade đã chốt:** realtime direct-INSERT KHÔNG ghi `tax_invoice_events` (như hành vi cũ); issuance audit qua `audit_logs` + `provider_data.codeOfTax` + `cqt_code`. Invariant doc: einvoice-tax.md §3.3.

**Open (chờ owner):** (a) có ghi 1 row `tax_invoice_events` cho realtime issue không (hiện audit_logs-only); (b) instant-issue rút mẫu-2 khỏi pool reconcile → `codeOfTax` là nguồn issuance duy nhất; (c) mẫu-1 có codeOfTax đồng bộ (hiếm) cũng instant-issue; (d) owner smoke Viettel sandbox.

## D040: Tắt `taxPercentage` giả cho mẫu `2/...` (S-invoice) (2026-06-20)

**Decision (owner — "phải chuẩn, không để giá trị giả"):** mẫu `2/...` (HĐ bán hàng MTT, direct method) KHÔNG gửi `taxPercentage`/`taxAmount` trên `itemInfo`, `taxBreakdowns: []`. Trước đây hardcode `taxPercentage: -2` (sentinel "không chịu thuế"). Mẫu `1/...` (HĐ GTGT) giữ rate thật.

**Why (verify vs runtime, không chỉ docs):** test sandbox Viettel + XML iPOS prod thật của Má Tư cho thấy template "Hóa đơn bán hàng" **STRIP toàn bộ `taxPercentage` khỏi XML gửi CQT** — `omit`/`-2`/`0` render byte-identical (không `<TSuat>`, không `<TgTThue>`, total = giá GROSS). Phải gửi giá GROSS + `taxAmount=0` (gửi giá NET làm lệch tổng vì template strip dòng thuế bắc cầu). XML mới ký server-side Viettel-CA, cấu trúc giống hệt iPOS thật.

**Nghĩa vụ %** (nếu doanh thu >1 tỷ → GTGT 2,4%/3%) khai ở **tờ khai trên tổng doanh thu**, KHÔNG trên hóa đơn.

**Status:** RESOLVED — verify trên account no-validation `0100109106-509` (caveat: validator prod trên template ĐÃ ĐĂNG KÝ của Má Tư có thể khác) → owner **smoke hóa đơn thật đầu tiên** sau deploy.

## D041: Payroll "tính lương" atomic — gộp upsert entries + flip status vào 1 RPC (2026-06-20)

**Decision (T3, owner duyệt qua finish-contract harness):** `calculatePayroll`
(`apps/web/app/(protected)/hr/payroll-actions.ts`) trước ghi 2 bước rời (upsert
`payroll_entries` → update riêng `payroll_periods.status='calculated'`); bước 2
fail → status lệch entries đã ghi (nhánh partial-success cũ). Gộp cả 2 +
clean-recompute delete vào 1 RPC `public.upsert_payroll_calculation(p_period_id
bigint, p_entries jsonb)` SECURITY DEFINER. TS giữ toàn quyền tính
PIT/BHXH/proration (`calculatePayrollEntry` + `legal-versions.ts`); RPC chỉ
persist nguyên tử, không đụng giá trị tiền.

**Chốt:**

1. **Clean-recompute IN scope:** RPC xóa entry của NV không còn eligible bằng
   `NOT EXISTS` (không `NOT IN`) trong cùng transaction → re-run không để ghost row.
2. **No EXCEPTION block** trong RPC: một exception bị bắt sẽ commit ghi dở → tái
   tạo đúng divergence cần giết.
3. **Gate in-body:** `auth_tenant_id()` ép tenant + `payroll_period_id` trên mọi
   row (không tin jsonb client), `has_permission_any('finance:payroll_calculate')`,
   period `FOR UPDATE`, chỉ cho `status IN (draft,calculated)`, reject `p_entries`
   rỗng. `GRANT EXECUTE` chỉ `authenticated`.
4. **employee_count = GET DIAGNOSTICS ROW_COUNT** (không `jsonb_array_length`).
5. **Typing gap:** tên RPC chưa có trong `database.types.ts` tới khi owner apply →
   cast rpc surface 1 lần có chú thích (owner chọn typed-wrapper). `pnpm db:types`
   chạy SAU khi owner apply.
6. **Guard:** `PAYROLL-CALCULATE-MUST-BE-ATOMIC-RPC` trong
   `scripts/check-regression-guards.mjs` (present `.rpc("upsert_payroll_calculation"`,
   absent `.update({ status: "calculated"` — siết theo `calculated` để không đụng
   approve/pay cùng file).

**Defer (owner quyết sau, KHÔNG làm ở PR này):** (a) persist
`legalVersionEffectiveFrom` thành cột snapshot — recompute kỳ `calculated` dưới
legal-version mới hiện ghi đè im lặng, không audit trail; (b) guard
entry-completeness lúc approve; (c) chính sách loại NV 0 công (hiện vẫn ghi
net=0). TOCTOU còn lại: employees/attendance đọc ở TS TRƯỚC khi RPC lock period —
chấp nhận ở quy mô single-tenant manual-trigger.

**Apply:** file → PR → owner apply tay vào prod ref `iexwsuaqqenyjiskawoj`
(re-confirm `payroll_periods`/`payroll_entries` còn 0 row trước khi apply). Agent
KHÔNG apply prod.

## D042: Xóa sổ hết hạn đi qua waste pipeline + waste pipeline thực sự trừ kho (2026-06-21)

**Decision (owner):** Nút "xóa sổ" hàng hết hạn KHÔNG dùng `adjustStock` thô nữa mà
đi qua waste pipeline (`create_expiry_writeoff`): tính tier, cổng ảnh (chụp ảnh
trong dialog, reuse `photo-upload-input.tsx`), duyệt tier-2, trừ kho theo WAC, lưu
lô vào `source_ref` (`kind=expiry`, `grn_item_id`) để cảnh báo tự clear. Đồng thời
sửa nguyên pipeline waste: `create_waste_entry` (tier0) + `approve_waste` (approved)
trước đây flip `stock_issues.status='confirmed'` mà KHÔNG post `stock_movements` →
waste không bao giờ trừ kho. Helper `_post_writeoff_movements` (mirror
`confirm_stock_issue`) post movement giảm kho cho cả ba đường.

**Security (cùng PR):** helper REVOKE khỏi `authenticated`/`anon` (default-privilege
sống sót qua `REVOKE FROM PUBLIC`); `confirm_stock_issue` chặn confirm writeoff
đang `pending` (cửa song song bypass duyệt tier-2). PR #84 merged.

**Bài học vận hành:** Supabase preview branch replay FAIL giữa chừng (~migration
`20260425130000`) → branch KHÔNG phải bản sao prod trung thực; chỉ subsystem đủ mới
mới test được sau patch bring-to-current nhỏ (vd thêm cột `stock_movements.movement_subtype`).
Branch-test xác minh logic trừ kho/WAC/guard thật trước khi apply prod.

## D043: create_payment authz nội hàm gate `pos:use`; hoãn siết completion = `pos:confirm_payment` (2026-06-21)

**Decision (owner):** `create_payment` (RPC SECURITY DEFINER, GRANT authenticated)
thêm authz nội hàm: verify `p_tenant_id = auth_tenant_id()`, `p_created_by =
auth.uid()`, và require `has_permission(branch, 'pos:use')` — KHỚP gate của caller
DUY NHẤT (action `createPayment` chạy `posUseAuth`, xử lý cả tiền mặt). Đóng lỗ "any
authenticated user spoof tham số tạo/chốt thanh toán" (audit PR2). PR #85 merged.

**Defer (owner quyết 2026-06-21):** _Hoàn tất_ thanh toán (đánh dấu đơn `paid`) hiện
chỉ cần `pos:use` qua `createPayment` — trong khi `confirm_cash_payment` lại đòi
`pos:confirm_payment`. Bất nhất này (service staff chỉ có `pos:use` vẫn chốt được đơn) GIỮ
NGUYÊN; siết completion về `pos:confirm_payment` là PR riêng (phải đổi cả action
`createPayment` + route UI bill tiền mặt qua đường confirm). Codex flag P1 nhưng đây
là hành vi sẵn có, không phải regression do PR2.

## D044: Má Tư Design System là UI contract duy nhất (2026-06-21)

**Decision:** UI design-system authority nằm ở `docs/spec/design-system.md`.
Runtime tokens trong `packages/ui/src/styles/globals.css`, primitive code trong
`packages/ui/src/components/*`, và app adapters trong
`apps/web/app/components/surface.tsx` chỉ implement và kiểm chứng contract này.
Tooling/skill bên ngoài phải map context về các file trên; không tạo thêm root
context file hoặc preset config để làm authority song song.

## D045 — Shell điều hướng một sidebar (tab + sub-tab) — 2026-06-22

Quyết định: Chrome Management (AppShell duy nhất) dùng một sidebar trong cùng
một `SidebarProvider`/`SidebarInset`. `AppShell` nhận
`tier1: ShellNavItem[]` + `tier2: ShellNavGroup[]` thay cho `navGroups[]`:
`tier1` là tab chính cross-module, `tier2` là sub-tab/deep nav của mô-đun đang
mở và render lồng dưới tab chính đang active.

Tab chính không trải phẳng mọi page con. Admin gom về một tab "Quản trị";
branch management gom về một tab "Quản lý chi nhánh"; domain workspace như
Kho/Tài chính/Nhân sự/Thực đơn/Đơn hàng giữ vai trò tab chính theo quyền ACL.
Branch tab nhận home branchId nên nhóm branch-management không nhấp nháy giữa
các mô-đun. Vẫn là chrome family #1: một shell, một sidebar, một header.

Hệ quả:

- Sửa tại chỗ apps/web/app/components/app-shell.tsx; KHÔNG thêm \*-shell.tsx,
  KHÔNG thêm SidebarProvider/main → baseline shell-registry giữ nguyên.
- 4 wrapper (office-module/finance/inventory/branch-management) đổi sang truyền
  tier1+tier2; finance giữ realtime channel ở mức shell, inventory giữ nav
  branch-reactive ở tier-2. RSC vẫn chỉ truyền `module` id serializable.
- Mobile `<md`: bottom-nav = tier-2 (deep nav mô-đun), chỉ một tab "Mô-đun" mở
  drawer sidebar đầy đủ; selectBottomNavItems chỉ flatten trong tier-2. Tablet
  `md` trở lên ẩn bottom-nav vì sidebar cố định đã hiện.
- nav-as-data + MODULE_ACL single-source giữ nguyên (không có literal inline,
  mọi href vẫn resolve về MODULE_ACL). Thêm test resolver tier-1/ACL trước khi
  refactor (trước đây không có lưới regression).
- §A/§B của design-system.md giữ nguyên "một sidebar"; sub-nav mô-đun không được
  lan thành chrome/sidebar riêng theo route.

Đảo quyết định này phải sửa bản ghi này trước.

## D046: Gỡ Web Push server-side, thay bằng popup foreground `Notification` API (2026-06-22)

**Decision:** Bỏ toàn bộ lớp Web Push server (VAPID + cron `notifications-push` + RPC `claim_notification_push_delivery` + bảng `notification_push_subscriptions`/`notification_push_deliveries`). "Thông báo trên thiết bị" nay là **popup OS bắn từ client qua `Notification` API** khi PWA đang mở: Realtime INSERT trên `notifications` → refetch RLS-scoped → `registration.showNotification` cho hàng mới chưa đọc, gắn ở `PwaRuntimeProvider` (phủ nhân viên + POS). In-app feed (`notifications` + `notification_reads` + list/count RPC) GIỮ NGUYÊN. Sửa D036 (kênh Web Push [live]).

**Context:** Web Push để "Chưa cấu hình" (thiếu cặp khoá VAPID); owner không muốn vận hành khoá + cron. Máy POS/KDS mở cả ngày nên popup foreground đủ cho nhu cầu thật (báo đơn/việc khẩn lúc đang dùng). Đánh đổi đã chấp nhận: **KHÔNG có thông báo khi app đóng**.

**Consequences:**

- Xoá: `lib/notifications/web-push.ts` + `push-targeting.ts`, route cron `notifications-push`, 4 Server Action push, handler `push` trong `sw.ts` (giữ `notificationclick`), env `WEB_PUSH_*` (turbo/vercel/.env.example), dep `web-push`. Migration `20260622130000_drop_notification_web_push.sql` theo lệ file→PR→owner apply; `database.types.ts` regen SAU khi apply prod.
- Thêm: `_hooks/use-foreground-notifications.ts`, `_components/notification-popup-control.tsx`, `lib/notifications/popup-preference.ts` (mute qua `device-prefs`, không đụng `localStorage` trực tiếp → qua `check-client-storage` allowlist).
- **Severity (owner chốt 2026-06-22):** popup bắn cho **mọi** severity nhìn thấy được (gồm `info` `pos.order_new` — báo đơn mới cho bếp/POS). Khác chính sách push-server cũ (critical-only) vì popup foreground chỉ kêu khi app đang mở nên ít phiền hơn. Code đã đúng — không filter severity.

Đảo quyết định này phải sửa bản ghi này trước.

## D047: Non-prod runtime = Supabase preview-branch + Vercel Preview mỗi PR (2026-06-27)

**Decision:** Mở môi trường non-prod bằng **Supabase Branching** (preview branch ephemeral mỗi PR) + **Vercel Preview**, thay vì dựng 1 dev project cố định hay local-only. Mỗi PR → Supabase tạo branch DB tạm (chạy `supabase/migrations/*` + `seed.sql` một lần khi tạo), Vercel Preview tự nhận env của branch qua tích hợp Supabase↔Vercel.

**Rationale:** sát PR, ephemeral (không drift dữ liệu), tận dụng nền #109 (baseline replay sạch, CI-gated) + #110. Mở khoá cụm "No Non-Prod Runtime": design-system tails (W5 + 7 POS/KDS), HRM runtime verify, α4c RLS regression.

**Prerequisite kiến trúc (BLOCKER):** Branching CHỈ chạy migrations + seed (không chạy file ngoài). Phải **fold managed-surfaces vào migration chain** dạng idempotent (`CREATE EXTENSION/POLICY IF NOT EXISTS`, `DO $$…$$` guard) để branch tự đủ extensions / storage policies / realtime publication / cron. Đây là **đảo ngược có chủ đích** việc trước đây tách managed-surfaces khỏi baseline (lý do tách: dump public bỏ rơi managed-surface — nay yêu cầu idempotent + 1 chain để branch self-contained).

**Consolidation ĐÃ XONG:** managed-surfaces folded vào chain qua `supabase/migrations/20260627140000_fold_managed_surfaces.sql` (single source of truth). Hai file standalone cũ (`managed-surfaces.install.sql` + `managed-surfaces.advisor-hardening.sql`) đã được xoá; mọi tham chiếu trỏ về fold migration.

**Provisioning thuộc owner (D005, agent không tạo infra):** nâng Supabase Pro, bật Branching + cài Supabase GitHub App, cài tích hợp Supabase↔Vercel. Chi phí ~$0.01344/branch/giờ (Micro) + disk/egress; Compute Credits & Spend Cap KHÔNG cover branching.

**Không chọn:** dev project cố định (drift, refresh thủ công); local-only (không URL chia sẻ để owner click trên điện thoại).

**Ngoài phạm vi env này:** telemetry items (unused indexes ~231, dead-RPC wave 2) KHÔNG cần preview-branch — chỉ cần bật `track_functions`/`pg_stat` trên prod 1 chu kỳ (gồm cuối tháng).

Runbook: `docs/runbooks/db/preview-branch-setup.md`.

## D048: Hợp nhất IA quản lý Người + Chi nhánh (Task 3) (2026-06-28)

**Decision:** Gộp IA theo `docs/plan/task3-mgmt-ia-consolidation.md`, chia 5 lát (S0 additive → S4):

- **Người:** gộp `/admin/staff/*` vào `/hr` (đổi nhãn "Nhân sự"), giữ URL cũ qua redirect (`resolveLegacyRouteRedirectPath`). **Giữ `staff` ACL key tách biệt** (account/role/permission owner-only, lồng trong `/hr` = owner+branch_manager) — ranh giới quyền là rule thật.
- **Chi nhánh:** list `/admin/settings/(tenant)/branches` → `/branches` (module key mới `branches`, owner-only); `menu-limits` → `/br/[branchId]/settings/menu-limits` trong hub, **siết quyền về owner/branch_manager** (cashier/chef KHÔNG còn vào trang quản lý giới hạn — vẫn 86 món qua KDS `mark_kds_item_out_of_stock`, đường riêng không đổi).
- **Branch switcher** mới trong `AppShell`: hiện cho mọi role đa-chi-nhánh, **ẩn khi ≤1 CN**.
- **Search**: list Người + Chi nhánh (reuse `InputGroup`+`matchesSearch`).
- **Chrome:** KHÔNG gộp 2 shell (đã cùng `AppShell`; gộp phức tạp hơn) — chỉ tách brand/breadcrumb dùng chung.

**Consistency mỗi lát đụng route:** `module-acl.ts` + `route-resolution.ts` (resolveModuleFromPath + prefix + legacy redirect) + `route-map.ts` (ROUTE_FAMILY_CONTRACTS first-match → thứ tự) + nav (`nav-config.ts`/`office-nav.ts`) + gate `protected-route-module-coverage.test.ts`.

**Không chọn:** `/admin/people` mới; gộp 2 shell về 1.

## D049: Cho phép huỷ toàn phần đơn đã thanh toán tại POS — giới hạn D023 (2026-06-28)

**Decision (owner — đảo D023 ở phạm vi HẸP):** Cho phép **huỷ toàn phần một đơn đã
thanh toán ngay tại màn POS** (void-after-paid): hoàn tiền + huỷ HĐĐT per_order +
đưa đơn khỏi board, trong **một transaction nguyên tử**, **manager-gated**, **bắt
buộc lý do**, **audit đầy đủ**. Đây là giới hạn có chủ đích của **D023** (`docs/plan/decisions.md` —
"KHÔNG đưa hủy/thay thế HĐĐT ra màn POS; correction chỉ ở Owner + Kế toán"): D023
GIỮ NGUYÊN cho mọi correction khác; chỉ mở đúng nhánh full-void-after-paid này.

**Chốt:**

1. **Cổng (Q1):** key mới `pos:void_paid_order` — chỉ `owner` + `branch_manager`.
   KHÔNG cấp cho `cashier`, KHÔNG tái dùng `pos:void_order`. `permissions.ts` thêm
   `POS_VOID_PAID_ORDER` + bump `PERMISSION_KEY_COUNT` (+1 → 91 sau khi hợp nhất với key mới của main).
2. **Lý do (Q2):** trim length ≥ 20 và ≤ 500 ký tự (khớp `cancelInvoiceSchema`).
3. **HĐĐT (Q3):** huỷ toàn phần một HĐĐT issued = **HUỶ** (cancel), không phải điều
   chỉnh/thay thế. **CHẶN cross-period:** HĐĐT issued ở **kỳ thuế đã kê khai trước**
   KHÔNG được huỷ tại POS — route sang kế toán. RPC dùng proxy bảo thủ theo tháng
   (`issued_at < date_trunc('month', now())` → `cross_period_invoice`); **kế toán
   phải xác nhận đúng mốc kê khai**, hard-block period-close thật là việc defer
   riêng.

   **[Kế toán xác nhận 2026-06-29]** Má Tư khai HĐĐT **theo QUÝ**; chốt **GIỮ proxy
   theo tháng dương lịch (ICT)**. Mốc-tháng bảo thủ hơn mức quý yêu cầu (chặn cả
   hoá đơn cùng-quý-tháng-trước dù quý chưa kê khai xong) — chấp nhận được vì
   **không bao giờ để lọt** hoá đơn đã kê khai (hoá đơn trong-tháng-hiện-tại luôn
   thuộc quý chưa kê khai), phần "chặn dư" chỉ thêm việc route sang kế toán, không
   sai thuế. → **KHÔNG đổi code**, mốc cross-period hiện tại đúng. Căn cứ huỷ HĐĐT
   issued: biên bản huỷ theo NĐ 123/2020 (sửa NĐ 70/2025) + TT 32/2025.

4. **HĐĐT actor (Q4):** `branch_manager` ĐƯỢC huỷ HĐĐT issued dưới cổng
   `pos:void_paid_order` — RPC **inline flip** `tax_invoices.status='cancelled'` +
   ghi `tax_invoice_events`, KHÔNG gọi `transition_tax_invoice_state` (vốn đòi
   owner-only `settings:tenant`).
5. **Mặc định đã chốt:** (Q5) huỷ đơn (`status='cancelled'`) để rời board + rớt khỏi
   doanh thu; (Q6) refund một chạm tại till (`status='approved'`, manager vừa xin
   vừa duyệt); (Q7) re-pay = đơn mới; (Q8) full-void-only v1; (Q9) reject
   `multiple_payments` (đơn Má Tư không có split completed).

**GIỮ ở Owner + Kế toán (KHÔNG mở ra POS):** hoàn **một phần** / theo món, **hoá đơn
điều chỉnh / thay thế**, và sửa-sai **hoá đơn tổng hợp ngày (daily_summary B2C)** —
RPC POS **chặn** đơn đã gộp vào daily_summary (`order_in_daily_summary`).

**Apply:** migration `supabase/migrations/20260628120000_pos_refund_void_after_paid.sql`
(file → PR → owner apply tay vào prod) → `pnpm db:types` → backfill
`apply_template_to_user` cho manager đang tồn tại (append key vào role_templates
KHÔNG tự cấp cho user đã có). Agent KHÔNG apply prod. Phase 2 (Server Action + UI +
test) chỉ build sau khi types regen.

Đảo quyết định này phải sửa bản ghi này trước.

## D050: Operator Workspace — hợp nhất Cổng nhân viên + Branch Management thành 1 plane mobile-first (2026-06-29)

**Context:** Họ chrome "Vận hành" (D019.1) chưa chín: `/employee/*` + POS/KDS/Runner không chia khung; branch command/setup lại render trong họ "Quản trị" (`AppShell` desktop); 3 cơ chế branch-scope rời nhau (`claims.branch_id` / `?branchId=` / segment `[branchId]`); route operator rải `/employee` + `/inventory` + `/br/[branchId]`. Thiết kế đích: `docs/plan/operator-workspace-blueprint-2026-06-29.md`; plan sub-project #1: `docs/plan/operator-foundation-impl-plan-2026-06-29.md`.

**Decision (owner):**

1. **Hai mặt phẳng = 2 họ chrome D019, không thêm họ thứ 3.** Operator plane = họ "Vận hành" làm chín (mobile/tablet, gốc `/br/[branchId]/*`); Office plane = họ "Quản trị" (`AppShell` desktop: `/admin` owner-only + domain workspaces độc lập + `/branches`).
2. **Dồn route operator-facing về `/br/[branchId]/*`** (D009). Move thật: `/employee/*` → `/br/[id]/shift/*`; slice sàn Kho → `/br/[id]/stock/*`. branchId trên URL = SSoT; staff pin thì Branch Hub tự điền (không picker). Giữ URL cũ sống qua redirect (`resolveLegacyRouteRedirectPath`).
3. **Amendment D019.1 + D017.3:** branch dashboard + control + **setup** (tables/pos/kds/printers/pos-sessions) chuyển TỪ họ "Quản trị" SANG Operator plane (full mobile — owner chốt "chuyển hết"). Office plane còn `/admin` + domain workspaces + `/branches` list.
4. **Branch-context = 1 provider** `resolveBranchContext()` (cache, tổng quát hóa `resolveInventoryBranchScope`) thay 3 cơ chế. Proxy + RLS + `MODULE_ACL` + `has_permission` GIỮ NGUYÊN làm cổng gác; context chỉ là lớp đọc.
5. **Branch Hub = entry device-aware** (nâng cấp `resolvePostLoginRedirect`): station PWA → vào thẳng station; desktop + owner/office → Office; còn lại → Operator (picker nếu >1 CN). Owner landing theo thiết bị (desktop→Office, phone→Operator Overview). Không phá route-home matrix.
6. **Phone nav = 4 anchor cố định** (`Trang chủ · Ca · Thông báo · Hồ sơ`) + smart card theo `today-work-state`; bỏ hack `MAX_VISIBLE_ITEMS=5`. Việc theo-CN qua **capability tiles** = mở rộng `nav-config.ts`/`MODULE_ACL` (D019.4), gate server-side; route-home canonical vẫn `role-route-matrix.md` (D019.2).
7. **Không viết lại POS/KDS/Runner** — chỉ re-root lên context + Hub (giữ orchestrator `pos-desktop-inner.tsx`). Kho/Menu tách: việc sàn → Operator, back-office → Office; catalog món = tenant/Office, giới hạn ngày = per-branch/Operator.

**Scope boundaries:**

- Office-side People/Branch IA do `docs/plan/task3-mgmt-ia-consolidation.md` + **D048** sở hữu — blueprint này KHÔNG redesign phần đó; menu-limits/branch-switcher khớp D048.
- My-shift migration (sub-project #3) xếp SAU khi HR redesign (D026/D027, branch `codex/hrm-payroll-annual-leave`) settle; KHÔNG động file HR bây giờ.
- Cấu hình "Việc trong ca" do **D052** sở hữu; tile "Việc cần làm" chỉ tiêu thụ output, không thiết kế lại config.

**Lộ trình:** 7 sub-project trong blueprint §11; `#1` (foundation: branch-context + capability registry + Branch Hub) làm trước, additive (ship được mà chưa gỡ UI cũ). Mỗi lát đụng route đồng bộ 5 chỗ (`module-acl.ts`, `route-resolution.ts`, `route-map.ts`, nav config, `protected-route-module-coverage.test.ts`).

**Consequences:** Mở rộng/sửa D019 (§1) + D017 (§3). Đảo bất kỳ điểm nào (gộp lại các chrome, trả branch command/setup về desktop, đổi entry/route-home, đổi nav model) phải sửa bản ghi này + D019 trước.

**Status 2026-07-01:** `docs/plan/branch-operator-hub-full-cutover-2026-07-01.md`
là staging spec, chưa amend D050. Cho tới khi có D0xx/amend mới, D050 vẫn là
authority cho phone bottom-nav (`Trang chủ · Ca · Thông báo · Hồ sơ`). Không
land cutover dùng nav khác khi chưa cập nhật decision trước.

## D051: Không còn `waiter` active role; Cashier kiêm phục vụ (2026-06-29)

**Decision (owner — supersedes D012.2 và phần access-bucket của D018):**
Má Tư không vận hành role Phục vụ tách riêng nữa. Nhân sự sàn bán hàng dùng
chức vụ `cashier` / `cashier_server` với label vận hành **Thu ngân (kiêm phục
vụ)** và access bucket `cashier`.

**Access buckets active:** `owner`, `branch_manager`, `warehouse_manager`,
`production_manager`, `cashier`, `chef`, `office`. `waiter` chỉ là legacy input
để migration/backfill map sang `cashier`; không xuất hiện trong UI, route ACL,
template mới, seed mới, hoặc test matrix active.

**Central sites:** Kho Tổng là `branches.branch_kind='central_supply'`, vận hành
qua bucket `warehouse_manager`. Bếp Trung Tâm là
`branches.branch_kind='central_kitchen'`, vận hành qua bucket
`production_manager`. HR form chọn `position_code`; access bucket được derive từ
mapper TS/SQL, không chọn trực tiếp bucket thay cho chức danh.

Đảo quyết định này phải sửa bản ghi này trước và đi qua T3 vì chạm Auth/RLS/ACL.

## D052: "Việc trong ca" — gom & cấu hình theo vị trí (2026-06-29)

**Decision:** Thiết kế lại flow cấu hình shift-tasks ("Checklist") cho gọn & bài bản.
Chi tiết design: `docs/plan/viec-trong-ca-redesign-2026-06-29.md`. Các chốt nền:

1. **Một khái niệm "Việc trong ca"** (bỏ tên "Checklist"/"Mẫu checklist"/"Việc"). Mỗi
   việc có LOẠI rõ: `Việc thường` / `Tiêu hao` / `Kiểm kê`. Tái dùng engine Tiêu hao &
   Kiểm kê sẵn có — KHÔNG xây lại lõi inventory.
2. **Cấu hình trực tiếp theo vị trí** — bỏ "Mẫu" rời + bước "gán mẫu". 6 surface config
   → còn 2 (Ca làm + Vị trí→Việc trong ca).
3. **Lưới = vị trí × ca mở/đóng**, dùng **cờ ca tường minh** (`shifts.is_opening/is_closing`,
   thay MIN/MAX `start_time`). 2 chi nhánh dùng chung 1 danh sách (positions tenant-level).
4. **Kiểm kê**: giao đếm GIỮ ở Inventory (người × kho × nguyên liệu, đếm mù RLS); trong
   danh sách nhân viên, trạng thái Kiểm kê đọc từ phiếu đếm hôm nay đã `submitted` hoặc
   `approved`.
5. **Bỏ override checklist theo từng nhân viên** (cấu hình thuần theo vị trí — hết trạng
   thái nhiễu "Checklist riêng").
6. **Giai đoạn còn 2**: `Đầu ca` / `Cuối ca` (bỏ `Trong ca`). Bỏ scope `weekly` (dead).

Đảo quyết định này phải sửa bản ghi này + design doc trước.

## D053: POS/KDS inventory truth by final order outcome (2026-06-30)

**Decision:** Owner chốt triển khai lại trừ kho theo outcome thật, không theo thao tác POS/KDS trung gian. Chi tiết execution plan: `docs/plan/pos-kds-inventory-truth-plan-2026-06-30.md`.

1. **Rollout flag:** stock-outcome posting dùng branch flag `pos_stock_outcome_posting`, default OFF. Rollback đầu tiên là disable flag theo chi nhánh.
2. **D016 supersede có điều kiện:** D016 vẫn giữ cho mọi chi nhánh chưa bật flag hoặc chưa đủ recipe/unit/location contract. Khi flag bật và guard pass, paid/completed order được phép post stock outcome.
3. **UI ownership:** POS/KDS không còn giao diện quản lý giới hạn món. Owner/branch_manager quản lý sell state ở branch manager surface với `Tồn | Sẵn bán | Còn`; cashier/chef chỉ thấy trạng thái bán được/khóa món cần cho thao tác.
4. **Pending demand:** POS create/append chỉ tạo demand/reservation, chưa trừ kho. Reuse `branch_menu_item_daily_holds`; không tạo reservation table thứ hai.
5. **Payment-before-ready:** Chọn Option B. Thanh toán có thể xảy ra trước KDS ready để không phá flow hiện tại; stock outcome chỉ post khi đủ cả hai điều kiện: order paid/completed và stock-tracked KDS ticket đã từng ready. Nếu paid trước ready, outcome nằm chờ đến khi ready.
6. **Ready boundary:** `ready` nghĩa là KDS ticket từng đạt `ready`, không phải status hiện tại. Implementation thêm `kds_tickets.first_ready_at` bất biến, set lần đầu khi ticket chuyển `ready`; recall không reset. `bumped_at` không đủ vì hiện có đường set về `NULL`.
7. **Outcome mapping:** paid/completed + first-ready → `stock_movements.type = 'consumption'`, `movement_subtype = 'sale_consumption'`. Cancel before first-ready → no movement. Cancel after first-ready → waste `movement_subtype = 'cancelled_after_kds_ready'`, chỉ cho line/ticket đã ready/served; line pending chỉ release demand.
8. **Idempotency:** Không thêm bảng outcome riêng ở first slice. Dùng partial unique index trên `stock_movements` grain `(tenant_id, order_id, movement_subtype, ingredient_id, location_id)` cho `sale_consumption` và `cancelled_after_kds_ready`.
9. **Stock location:** Kho CN/default issue location là nơi giữ stock branch. KDS/Bếp không là stock owner; KDS chỉ xác nhận trạng thái làm món.
10. **Multi-unit:** Mọi stock movement mới phải convert về base unit bằng tenant-aware conversion helper trước khi ghi ledger.

**Execution mode:** subagent-driven, sequential T3 lanes with review barriers: G1 access/UI ownership → G2 availability/holds → G3 order outcome ledger → G4 multi-unit guardrail → G5 count-regression guard → G6 QA/rollout. Đảo bất kỳ điểm 1-10 phải sửa D053 trước.

## D054: Agent workflow reset — one voice, thin adapters, transient worklogs (2026-07-01)

**Decision:** Khung agent/workflow của repo phải gọn lại theo nguyên tắc một sự
thật một chủ sở hữu. `AGENTS.md` là entrypoint; `docs/agent/rules/*` là luật
nền; `tasks/todo.md` là bảng công việc hiện tại duy nhất; `docs/plan/decisions.md`
là nơi chốt quyết định; `docs/worklog/*` chỉ là staging tạm.

1. **Rule loading theo blast radius.** Agent luôn đọc `engineering.md`; đọc
   rule theo bề mặt đang chạm. `team.md` và `orchestration.md` chỉ dùng cho T3,
   cross-runtime review, subagent/multi-agent, hoặc context-budget thật; không
   bắt agent đọc chúng cho task đơn giản.
2. **IDE adapter được phép sống ở root.** `.claude/`, `.codex/`, `.cursor/`,
   và `.agents/` là runtime adapters/tool wiring. Chúng được phép chứa hooks,
   permissions, launchers, local prompts, và handoff helpers, nhưng không được
   nhân bản rule hoặc trở thành source of truth thứ hai.
3. **Guard logic sống một nơi.** Runtime adapters chỉ wire
   `scripts/guard-prod-db.mjs`; IDE mới có write-capable DB/tool action phải
   đăng ký adapter trong `scripts/check-guard-sync.mjs` trước khi dùng. Nếu chưa
   đăng ký, prod-affecting tools phải read-only.
4. **Worklog có hạn sử dụng.** T2/T3 có thể dùng `docs/worklog/` khi PR/todo
   không đủ chứa contract, nhưng khi task land thì durable facts phải promote về
   doc sở hữu hoặc task/regression, rồi xóa worklog. Worklog không phải backlog.
5. **Plan không tạo cây agent-doc mới.** Implementation plan sống trong PR body,
   `tasks/todo.md`, `docs/plan/decisions.md`, hoặc worklog tạm đúng loại; không
   thêm cây docs agent-only mới.

**Consequences:** Cleanup workflow hiện tại phải ưu tiên xóa/promote staging
docs, tách lane dirty WIP, và chạy guard nhỏ (`rules-mirror`, `doc-staleness`,
`guard-sync`, `review-tier`) trước khi quay lại feature code.

## D055: Operator plane mở rộng cho warehouse/production qua central site; /employee giữ cho office (2026-07-02)

**Context:** Sau khi Operator plane chín (D050 + cutover spec), 3 role không có `operator_home` (`office`, `warehouse_manager`, `production_manager`) vẫn "ở nhà" tại `/employee`. Proxy-level redirect `/employee/*` → `/br/{branchId}/...` (Wave A) chỉ áp cho role có `operator_home` + branch — 3 role này KHÔNG bị redirect.

**Decision (owner):**

1. **Hướng chốt:** mở `operator_home` cho `warehouse_manager` + `production_manager`, gắn họ vào **central site** của mình (`/br/{central-site-id}` — `branches.branch_kind` `central_supply`/`central_kitchen`, D000). Operator hub trở thành home thống nhất cho MỌI role gắn site.
2. **Thi công là workstream riêng** (chưa làm ở đợt cutover này): cần thiết kế tile set cho central site (nhận/điều chuyển/sản xuất thay vì POS/KDS), rà network-gate + `MODULE_ACL` + route matrix, và JWT `branch_id` cho 2 role này (hiện tenant-level null).
3. **`/employee` giữ nguyên làm home cho `office`** (và cho warehouse/production tới khi §1 thi công xong) — đây là trạng thái CHỦ ĐÍCH, không phải leftover; cấm xóa `/employee` khi còn role home ở đó.

**Consequences:** Mở rộng D050 (không đảo). Khi thi công §1 phải sửa `MODULE_ACL.operator_home.allowedRoles`, JWT hook branch assignment, network-gate central-site, và bản ghi này (đánh dấu đã thi công). Đảo hướng (giữ warehouse/production ở `/employee` vĩnh viễn) phải sửa bản ghi này trước.
