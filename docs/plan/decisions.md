# Architecture Decisions

> Log mỗi quyết định kiến trúc quan trọng với rationale. Số hiệu `D` là ID cố
> định (doc khác trỏ tới) — khoảng trống là quyết định đã xoá/bỏ qua, KHÔNG đánh
> số lại. Đây là bản ghi quyết định + rationale, KHÔNG phải worklog triển khai
> (worklog ở `tasks/`, `docs/worklog/`, git history).

## D000: Inventory branch and central site operating model (2026-06-19)

**Decision:** Inventory dùng `branches` làm site table; `branches.branch_kind` active với `branch`, `central_supply`, `central_kitchen`.

**Transfer matrix** (trigger `enforce_stock_transfer_direction`): cho phép `central_supply → branch`, `central_kitchen → branch`, `branch → branch`; chặn thiếu ref, central direction lạ, same-branch.

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

## D010: RHF + zod + shadcn Field cho mọi form (2026-04-17)

**Decision:** Form CRUD dùng `react-hook-form + zod 4 + @hookform/resolvers + shadcn Field`. App-local helpers ở `apps/web/app/components/form/` (`TextField`/`NumberField`/`SelectField`/`TextareaField`/`FormDialog`/`valuesToFormData`) — bind RHF + field components project-specific (FormattedNumberInput VND), không ở `packages/ui`.

**Status:** Baseline cho dialog CRUD mới + form đã migrate. Import/export one-field upload và GRN mobile wizard có shape riêng, không dùng helper chung.

## D011: Print-agent LAN-only transport (2026-05-07)

**Decision:** `apps/print-agent` chỉ hỗ trợ LAN printer transport. Không runtime flag chọn transport, không USB capability columns, không USB native binding. LAN-only enforced trong baseline: `printers` CHECK `printers_connection_type_lan_only` (`connection_type='lan'`), không cột `usb_*`, `printer_agents` không cột `transport`; `src/usb.ts` đã gỡ (lịch sử ở `supabase/migrations/_archive/`). Branch rollout = terminal-linked Android gateway + LAN printer.

## D012: Tier-2 trim + gộp role POS — định hướng phần mềm hỗ trợ Hộ Kinh Doanh (2026-06-10)

**Context:** Đây là phần mềm HỖ TRỢ vận hành HKD, không phải nền tảng F&B đa năng. Prod xác nhận: cashier ≫ waiter (cùng người làm cả hai), `shift_assignments` = 0 dòng (chia ca chưa bao giờ là workflow thật).

**Decision:**

1. LOẠI khỏi backlog (không đề xuất lại): Local-First/offline POS (D008), VNPay (VietQR+MoMo đủ), native POS Flutter/Capacitor (PWA chạy ổn).
2. Role POS: KHÔNG gộp `cashier` + `waiter` — D018 (2026-06-13) chốt 8 access bucket canonical, giữ hai role tách (đổi quyền POS là thay đổi tier T3, không phải task tracked).
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

**Consequences:** Smoke chain = POS → payment → KDS/print → HĐĐT. Đuôi: remove `consume_stock_for_order` + RPC liên quan (owner-gated, `tasks/todo.md`). Đảo policy (kho seed + owner duyệt) phải sửa quyết định này trước; khi re-enable, caller `complete_payment_and_consume_stock` check `stock_consumed_status != ok` → webhook 500 + notification `high`.

## D017: Admin là L0 Tenant Command; Branch Manager dùng L1 Branch Command (2026-06-13)

**Decision:**

1. Product framing = `bộ phần mềm quản lý vận hành và bán hàng` cho HKD (dùng `ERP` khi so phạm vi, không đổi entrypoint thành ERP đa ngành).
2. `/admin/*` = L0 tenant command + tenant setup cho `owner`: dashboard chuỗi, báo cáo, chi nhánh, nhân sự, quyền, thiết lập tenant. (Bề mặt accounting đã gỡ — xem D035.)
3. `branch_manager` KHÔNG phải Admin user. Home BM = `/employee`; điều hành + thiết lập chi nhánh ở `/br/[branchId]/dashboard` + `/br/[branchId]/settings/*`.
4. Domain workspaces (`/inventory`, `/orders`, `/hr`, `/finance`, `/menu`) là workflow surface độc lập, không phải tab con của Admin.
5. Role/route chỉ là gate bề mặt; action + row-level access vẫn qua permission keys, RPC/RLS, branch scope.

**Canonical:** `docs/spec/role-route-matrix.md`. Không thêm workflow branch-scoped mới vào `/admin/*`.

## D018: Bỏ role `super_manager` — gộp vào `owner` (2026-06-13)

**Decision (supersedes phần `super_manager` của D017):** Bỏ access bucket `super_manager` (HKD đơn không cần tầng tenant-admin thứ 2; prod chỉ 1 user). `ACCESS_BUCKETS` còn **8**: `owner`, `branch_manager`, `warehouse_manager`, `production_manager`, `cashier`, `waiter`, `chef`, `office`. `/admin/*` giờ chỉ `owner`. Mọi list/RLS có `super_manager` cạnh `owner` → xoá `super_manager`, `owner` giữ quyền. Cấu hình sàn/bếp gộp vào `owner` + `branch_manager`.

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
3. **Lương qua `employees.base_salary`:** UI nhập `base_salary` + `dependents_count`; `calculatePayroll` eligibility theo base_salary (KHÔNG khôi phục `employment_contracts`). BHXH đơn giản.
4. **Ca làm:** GIỮ (xem D027 — đảo §4 cũ "ca ít giá trị"), đặt ở "Thiết lập".

**IA:** gom 5 tab `/hr` → 3 trục **Người · Ngày công · Lương**; Ca + checklist → "Thiết lập". `defaultTab` động (owner→Người, BM→Ngày công).

**Consequences:** Scope = truthful daily attendance, checklist-by-position, employee CRUD, leave notifications, payroll via `base_salary`. D012 vẫn áp: KHÔNG rostering/auto-late/auto-absent/số dư phép/duyệt nhiều tầng.

**Status (2026-06-20):** IA 3-trục + payroll `base_salary` + checklist-theo-vị-trí ĐÃ SHIP. §1 `standard_days` HIỆN vẫn auto-đếm ngày thường (chưa phải owner nhập) + clamp `working/standard` chưa làm; phần còn lại track ở `tasks/todo.md`.

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

(a) **Payroll vào app theo mô hình HKD đơn giản** — đọc `employees.base_salary` + ngày công + `dependents_count` + PIT legal-version; KHÔNG `employment_contracts`, BHXH = 0; không migration (cột có sẵn prod). Form NV thu `base_salary`/ID/bank/`dependents_count` (owner-only PII). Đi sau/khớp D026/D027.
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
- **GIỮ:** `primary` đỏ gạch + palette Concept 01; Rhythm/Radius/Motion contract. *(Typography Inter/Montserrat/JetBrains → ĐẢO bởi D037: chuyển Geist.)*

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

**Context:** Phễu "phần mềm hỗ trợ HKD" (D012) + "tài chính trước, tiền mặt hiện hữu" (D028). Rò rỉ ở quầy (lệch quỹ, void/discount, giá NCC trườn, food-cost drift) là tổn thất sống còn mà mắt người không thấy theo mẫu. Owner muốn "agent trông quán" để chuyển từ *canh chừng lo âu* sang *mỗi ngày báo đúng + cờ cái sai kèm đề xuất*.

**Quyết định owner đã chốt (verify vs CODE + PROD, không từ docs cũ):**
- **Ngưỡng:** lệch quỹ `max(20.000đ, 0.1%×expected_cash)`; void `>10%`/ca; discount `>5%`/ca và `>20%`/đơn; ca mở `>16h`; payment treo `>2h`. (Lệch quỹ #1 ĐÃ có trigger `trg_notify_pos_shift_variance` — chỉ **retune hằng số**, không xây mới.)
- **Routing 2 kênh tách bạch:** Web Push = theo `target_roles` (critical → owner; warning → owner + branch_manager, **digest cuối ngày**, không push giữa ca). **branch_manager chỉ ở Web Push.** Telegram Supergroup = **theo thành viên group** (owner + người được đặc cách mời), **tách khỏi role app**; cả critical lẫn warning vào topic; dispatcher role-agnostic.
- **Quiet hours:** warning → digest; critical → push ngay.
- **Telegram:** Bot API 10.1, forum supergroup + topics (`message_thread_id`, `can_manage_topics`), native fetch, 20 msg/min cho CẢ group → digest là van rate. Cây topic: 🔴 Khẩn · 💵 Tiền-Quỹ · 🍳 Bếp-Void · 📦 Kho-Tồn · 🛒 Mua hàng-Nhập · 🧾 Hóa đơn-Thuế · 👥 Nhân sự · 📊 Báo cáo ngày · 📈 Báo cáo tuần-tháng. Token + chat_id ở env; topic map ở `inventory_qc_settings.telegram_topic_map`.
- **Thang tự chủ R0→R3** (shadow → inform → recommend → auto-act-bounded). **Lằn ranh cứng: agent đụng tiền/thuế/lao động cap R1 (báo) mãi mãi** — không auto-act. Service Janitor là agent auto-act (R3) DUY NHẤT (idempotent/đảo-ngược). LLM không bao giờ cầm DB/RPC/số; chỉ narrate trên số do SQL tính; digest là thứ làm CUỐI.
- **Báo cáo ngày/tuần/tháng** là phần giá trị cao nhất (xác nhận tích cực, không chỉ cảnh báo); "Đóng ngày" 02:05 ICT là flagship.

**Why (kiến trúc + ràng buộc):**
- Producer → `notifications` (dedup_key) → Dispatchers (Web Push role-based **[live]** + Telegram topic-based **[designed]**, mỗi cái claim-RPC + ledger riêng) → Channels → Audiences. **Telegram phải SOI Web Push, KHÔNG dùng `notification_outbox`** (user-gated + read→loop→update đua double-send).
- **Tool của agent = 885 RPC `SECURITY DEFINER` sẵn có** (allowlist + cap), không xây action API mới. Precedent role-hardening: migration `20260619062853`.
- Cron mới CHỈ làm phần trigger không làm được (aggregate + staleness); test khẳng định 0 trùng kind của trigger (#1, #6).
- Migration: file → PR → owner (no dev DB; `guard-prod-db.mjs`). Agent ghi file trong git worktree riêng (kỷ luật shared-tree). Single tenant (`tenant_id=1`).
- Đội thực thi = mô hình `docs/agent/rules/team.md` chĩa vào backlog (KHÔNG org mới): Orchestrator + Contract/Migration/Detector/Dispatcher/Briefer + Verify + Codex stage-6. 1 sprint = 1 workflow run. 3 cổng owner: DoR (T3) · apply migration · duyệt R0→R1.
- **Timeline thật:** code ~2–3 tuần; DONE ~tuần 10–13 (≈70% là shadow-soak + owner review serial). Tính lịch theo shadow-wall-clock + owner review, KHÔNG theo LLM-pace.

**Quan hệ với D024:** D024 (trợ lý Telegram = **mặt tiền CHAT** tương tác, DRAFT) khác phần này (**Telegram OUTBOUND alerting** — dispatcher đẩy notification vào topic). Bổ trợ, không trùng: alerting outbound ship trước; chat-front-end (đọc lệnh, ack/snooze) là việc sau, off-scope S0–S7.

**Consequences / phasing:** S0 spine+shadow (wedge) → S1 Web Push live + severity gate + retune trigger → S2 Telegram dark → S3 Telegram live + rate-valve + void-after-pay → S4 Đóng ngày → S5 mua hàng/kho/tài chính → S6 POS tail+HR+tuần → S7+ migration batch + LLM digest. Critical path S0→S2→S3→S4; S1 ∥ S2. Tài liệu này (D036) + `notifications.md` + `agentic-os-blueprint.md` là of-record; mọi producer/agent code theo đó.

## D036: Import `m-tu-design-system` bundle — touch tier cho form control (2026-06-20)

**Context:** Bundle derive ra từ chính repo này (~85% circular: token/brand/logo/mascot md5-identical; palette lệch ΔE<0.018; template tả màn đã ship). Không màn mới, không token mới.

**Decisions (owner):**

1. **Touch tier form control (gated):** thêm value `touch` vào `size` cva của `Select`(trigger)/`Switch`/`Checkbox`/`RadioGroupItem` (`min-h-12` trigger, box 20px + hit-area ≥44px), theo precedent §"Button is the single source of truth for button height". Consumer opt-in qua `size="touch"`. Default render KHÔNG đổi.
2. **bo-slide deck → standalone** (không vào route surface; không dựng report-export capability).
3. **Glossary casing → `vi.ts` authoritative** (TitleCase "Bếp Trung Tâm" là SSoT; bundle mirror, không fork sentence-case).
4. **Font Geist** *(ĐẢO bởi D037 cùng ngày — owner chốt dùng Geist; xem D037)*.

**Out of scope:** net-new prop khác bundle quảng cáo (`Button rice`, `Avatar` fill/status, `Progress` size/label, `Textarea showCount`) — chưa duyệt, đụng contract khóa.

## D037: Chuyển typography sang Geist theo Má Tư Design System (2026-06-20)

**Decision (owner — đảo D032, supersede D036 §4):** App-UI typography chuyển sang **Geist** (body + heading, single-family) + **Geist Mono** (tiền/mã/ngày giờ/số đơn). Bỏ Inter/Montserrat/JetBrains khỏi runtime UI. Print pipeline (`packages/print-render`, RobotoMono bitmap nhiệt) KHÔNG đụng (pipeline riêng, pixel-locked).

**Cơ chế:** `next/font/google` Geist KHÔNG có subset `vietnamese` → dùng **`geist` package** (Vercel official, next/font/local, full glyph tiếng Việt, self-hosted). `globals.css` bind `--font-sans`/`--font-heading` → `--font-geist-sans`, `--font-mono` → `--font-geist-mono`. App code không đổi. Spec forbid-list lật: cấm tái nhập Inter/Montserrat/JetBrains/Be Vietnam Pro.

## D038: HĐĐT realtime instant-issue khi provider trả mã CQT đồng bộ (2026-06-20)

**Decision (T3):** Trong `createInvoice`, khi có CẢ `invoiceNo` LẪN `codeOfTax` non-empty (trimmed) → trả `issued` (mirror `createBatchInvoice` + `getStatus`). `codeOfTax` rỗng nhưng có `invoiceNo` → `submitted`; không `invoiceNo` → `signing`. HĐ GTGT mẫu `1/...` (mã async) không đổi hành vi. `createTaxInvoice` capture `codeOfTax` → ghi `tax_invoices.cqt_code` (cột trước đây chết). KHÔNG migration (state machine đã cho `signing/submitted → issued`).

**Trade đã chốt:** realtime direct-INSERT KHÔNG ghi `tax_invoice_events` (như hành vi cũ); issuance audit qua `audit_logs` + `provider_data.codeOfTax` + `cqt_code`. Invariant doc: einvoice-tax.md §3.3.

**Open (chờ owner):** (a) có ghi 1 row `tax_invoice_events` cho realtime issue không (hiện audit_logs-only); (b) instant-issue rút mẫu-2 khỏi pool reconcile → `codeOfTax` là nguồn issuance duy nhất; (c) mẫu-1 có codeOfTax đồng bộ (hiếm) cũng instant-issue; (d) owner smoke Viettel sandbox.

## D039: Tắt `taxPercentage` giả cho mẫu `2/...` (S-invoice) (2026-06-20)

**Decision (owner — "phải chuẩn, không để giá trị giả"):** mẫu `2/...` (HĐ bán hàng MTT, direct method) KHÔNG gửi `taxPercentage`/`taxAmount` trên `itemInfo`, `taxBreakdowns: []`. Trước đây hardcode `taxPercentage: -2` (sentinel "không chịu thuế"). Mẫu `1/...` (HĐ GTGT) giữ rate thật.

**Why (verify vs runtime, không chỉ docs):** test sandbox Viettel + XML iPOS prod thật của Má Tư cho thấy template "Hóa đơn bán hàng" **STRIP toàn bộ `taxPercentage` khỏi XML gửi CQT** — `omit`/`-2`/`0` render byte-identical (không `<TSuat>`, không `<TgTThue>`, total = giá GROSS). Phải gửi giá GROSS + `taxAmount=0` (gửi giá NET làm lệch tổng vì template strip dòng thuế bắc cầu). XML mới ký server-side Viettel-CA, cấu trúc giống hệt iPOS thật.

**Nghĩa vụ %** (nếu doanh thu >1 tỷ → GTGT 2,4%/3%) khai ở **tờ khai trên tổng doanh thu**, KHÔNG trên hóa đơn.

**Status:** RESOLVED — verify trên account no-validation `0100109106-509` (caveat: validator prod trên template ĐÃ ĐĂNG KÝ của Má Tư có thể khác) → owner **smoke hóa đơn thật đầu tiên** sau deploy.
