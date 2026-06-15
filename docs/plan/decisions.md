# Architecture Decisions

> Log mỗi quyết định kiến trúc quan trọng với rationale.

## D000: Inventory branch-only operating model (2026-06-13)

**Decision:** Inventory, procurement, production, POS, KDS, runner, stocktake, and transfer operations are scoped to `branch` records. `branches.branch_kind` is a compatibility column and must stay `branch`.

**Transfer direction matrix** (enforced by DB trigger `enforce_stock_transfer_direction`):

- Allowed: branch-to-branch transfers and intra-branch location transfers.
- Rejected: missing branch references or non-branch `branch_kind` values.

**Current contract:** PO, GRN, stock levels, production orders, and stock transfers all reference `branch_id` directly. Role and permission boundaries decide who can operate on a branch; branch kind no longer creates separate operating site classes.

## D001: Greenfield thay vì refactor (2026-04-01)

**Context:** Project cũ tích lũy 326 `brand_id` references, 43 pages với `/b/[brandId]/`, Prisma dependency không cần thiết, multi-brand architecture cho 1 brand duy nhất.

**Decision:** Start fresh. Không reuse data hay source code cũ. Project cũ chỉ dùng làm reference cho domain knowledge.

**Consequences:** Phải rebuild mọi thứ từ đầu nhưng architecture đúng ngay từ đầu. Không tích lũy tech debt.

## D002: Tenant-Branch 2-level thay vì Company-Brand-Branch 3-level (2026-04-01)

**Context:** Chỉ có 1 brand (Cơm Tấm Má Tư). Company-Brand-Branch 3 levels tạo unnecessary complexity.

**Decision:** `Tenant (L0) → Branch (L1)`. Tenant = single row (id=1). Mọi scope qua `tenant_id` + `branch_id`.

**Consequences:** URL đơn giản hơn (`/admin/` thay vì `/b/[brandId]/admin/`). JWT chỉ cần 2 claims thay vì 3. Không cần brand switcher.

## D003: proxy.ts thay vì middleware.ts (2026-04-01)

**Context:** Next.js 16 deprecated `middleware.ts`, rename thành `proxy.ts` với `export function proxy()`.

**Decision:** Dùng `proxy.ts` theo Next.js 16 convention.

**Consequences:** Forward-compatible. Cần nhớ cú pháp mới khi đọc docs cũ.

## D004: Zod 4 thay vì Zod 3 (2026-04-01)

**Context:** Zod 4 là latest stable. Breaking changes: `{ message }` → `{ error }`, `.email()` → `z.email()`.

**Decision:** Dùng Zod 4 từ đầu.

**Consequences:** Phải cẩn thận khi copy code từ project cũ (Zod 3 syntax).

## D005: User tự quản lý infrastructure (2026-04-01)

**Context:** User muốn toàn quyền kiểm soát Supabase/Vercel/Upstash/GitHub.

**Decision:** Code chỉ chứa placeholder env vars. AI agent KHÔNG tạo infrastructure resources.

**Consequences:** Setup guide cần rõ ràng. `.env.example` phải đầy đủ.

## D006: supabase-js only, no Prisma (2026-04-01)

**Context:** Prisma trong project cũ chỉ dùng cho 1 câu SELECT. Thêm dependency overhead lớn, break Edge Runtime.

**Decision:** Supabase-js (PostgREST) cho tất cả queries. Không Prisma.

**Consequences:** Không có Prisma migration system. Dùng Supabase CLI migrations. Type generation qua `supabase gen types`.

## D006b: system_settings key/value thay vì JSONB column (2026-04-02)

**Context:** Cần lưu tenant-level config (VAT rate, service charge, currency, phone, email). Hai lựa chọn: JSONB column trên `tenants.settings` hoặc separate `system_settings` table.

**Decision:** Separate `system_settings(key, value)` table. Key strings defined as constants in `@comtammatu/shared/settings`.

**Consequences:** Mỗi setting có RLS riêng, audit trail qua `updated_at`, dễ thêm settings mới mà không thay đổi schema. Trade-off: N queries khi upsert nhiều settings cùng lúc (acceptable cho admin-only operation).

## D008: Cloud-first, local-first Phase 2 (2026-04-04)

**Context:** Cân nhắc local-first (mini PC + SQLite per branch) để POS/KDS hoạt động offline. Phân tích cho thấy:

- Internet hiếm khi mất (< 1 lần/tháng, fiber ổn định)
- Local-first tăng effort ~3x (2 DB layers, sync logic, deploy per branch, conflict resolution)
- 200-600 đơn/ngày, < 50 req/s — cloud hoàn toàn đủ

**Decision:** MVP (v1.0.0) dùng cloud-first + PWA cache cho offline cơ bản. Local-first (mini PC + SQLite + sync) đưa vào Post-v1.0, quyết định dựa trên metrics thực tế sau pilot.

**Consequences:** Ship nhanh hơn, validate business logic trước. Nếu pilot cho thấy cần offline thực sự → Phase 2 thêm local layer. Code architecture cần giữ clean enough để tách được sau.

## D009: Path-based routing, không sub-domain (2026-04-04)

**Context:** Cân nhắc sub-domain per module (pos.comtammatu.com, kds.comtammatu.com). Phân tích:

- Sub-domain: auth phức tạp (cross-origin cookies), CORS, wildcard cert, DNS records, dev env phức tạp
- Path-based: 1 domain, auth "just works", proxy.ts ACL tập trung, đã có sẵn
- Team 1 người, monorepo, cùng Supabase Auth → không cần tách deploy

**Decision:** Giữ path-based routing (`/admin/*`, `/br/[branchId]/pos`, `/br/[branchId]/kds`). Sub-domain chuyển sang Post-v1.0, khi cần tách deploy hoặc chuyển local-first.

**Consequences:** Đơn giản, ship nhanh. Khi chuyển sub-domain sau chỉ cần thêm proxy rewrite rules, không cần đổi code logic.

## D010: RHF + zod + shadcn Field cho mọi form, helpers ở app-local (2026-04-17)

**Context:** ~40 form dialogs rải trong app dùng lẫn lộn `useState-per-field + useTransition`, `useActionState + form action`, `CrudDialog` wrapper. Mỗi pattern có error handling khác nhau, a11y không đồng đều, validation chỉ chạy server-side (trễ).

**Decision:** Migrate toàn bộ form sang `react-hook-form 7.72 + zod 4 + @hookform/resolvers 5 + shadcn Field primitives`. Tạo app-local helpers ở `apps/web/app/components/form/`:

- `TextField`, `NumberField`, `SelectField`, `TextareaField` — useController-based field wrappers
- `FormDialog` — generic Dialog wrapper (schema + defaultValues + onSubmit render-prop)
- `valuesToFormData` — adapter cho `withFormAction`-wrapped server actions

Helpers ở `apps/web/` (không ở `packages/ui`) vì: bind với RHF + dự án-specific field components (FormattedNumberInput VND).

**Consequences:** Client-side validation trước submit. A11y tự động (aria-invalid, role="alert", htmlFor). Schema-as-truth — không duplicate type + validation. Mỗi dialog CRUD giảm ~20-30% LOC sau helpers. Breakeven tại ~3 dialogs migrated.

**Migration status (2026-04-17):** M3 shipped 21/24 dialogs (batches 1-9 + recipe-panel). Skip by design: 2 import-export-menu (1-field file upload), 1 grn-create-client (mobile wizard với localStorage drafts).

## D011: Print-agent LAN-only transport (2026-05-07)

**Context:** Mỗi chi nhánh dùng một máy Android Super App đã link terminal làm gateway vận hành; máy in dùng LAN. USB transport không còn production payoff và làm tăng surface area vận hành.

**Decision:** `apps/print-agent` chỉ hỗ trợ LAN printer transport. Không giữ runtime flag chọn transport, không giữ USB capability columns, và không giữ USB native binding.

**Migration:** `20260507083322_drop_printer_usb_and_transport.sql` xoá `AGENT_TRANSPORT`, `printer_agents.transport`, `printers.usb_vendor_id`, `printers.usb_product_id`, và `apps/print-agent/src/usb.ts`.

**Consequences:** Branch rollout tập trung vào terminal-linked Android gateway + LAN printer config; không có fallback USB trong runtime hoặc docs active.

## D012: Tier-2 trim + gộp role POS — định hướng phần mềm hỗ trợ Hộ Kinh Doanh (2026-06-10)

**Context:** Sau khi pilot vận hành thật (≈70–75 đơn/ngày trên prod), owner chốt lại phạm vi sản phẩm: đây là phần mềm HỖ TRỢ vận hành Hộ Kinh Doanh, không phải nền tảng F&B đa năng. Dữ liệu prod xác nhận: 14 tài khoản `cashier` vs 2 `waiter` (cùng một người làm cả hai việc trong thực tế), `shift_assignments` = 0 dòng từ trước tới nay (chia ca chưa bao giờ là workflow thật — đã xử lý bằng ca mặc định khi chấm công).

**Decision:**

1. LOẠI BỎ khỏi backlog (không đề xuất lại): Local-First / offline POS (mini PC + SQLite — fiber ổn định, D008 đã ghi internet hiếm khi mất), VNPay (VietQR + MoMo đã đủ phương thức; vấn đề thật là đối soát tiền về), Native POS migration Flutter/Capacitor (PWA đang chạy production ổn).
2. GỘP role Thu ngân + Phục vụ thành 1 role POS. Code hiện còn tách `cashier`/`waiter` (`packages/shared/src/auth/types.ts`, `module-acl.ts`, role templates) — việc gộp trong code là task T3 (auth/ACL/template/RLS) cần migration riêng.
3. Mọi đề xuất tính năng mới phải qua phễu "phần mềm hỗ trợ HKD": giảm thao tác hằng ngày của chủ + nhân viên hiện có; không thêm nghi thức quản trị (phân ca, duyệt nhiều tầng, kế toán doanh nghiệp) mà HKD không dùng.

**Consequences:** Tracker Tier-2 đã rút gọn tương ứng. Threat-model quyền POS đổi theo: khi role đã gộp, mọi người đứng quầy đều có quyền xác nhận thanh toán — việc siết `create_payment` RPC theo `pos:confirm_payment` trở thành hygiene khi gộp role, không còn là lỗ hổng vận hành giữa hai role. Các surface gắn với chia ca (đăng ký ca, duyệt phân ca) không wire thêm; giữ hướng ca-mặc-định.

## D013: Kế toán (khóa kỳ) giữ ngoài nav admin mặc định (2026-06-11)

**Context:** Một slice đã thêm mục `accounting` (→ `/admin/accounting/periods`, "Hỗ trợ khóa kỳ") vào `ADMIN_NAV_GROUPS`, đảo ngược quyết định quarantine Accounting Advanced cho pilot HKD (xem note "Accounting Advanced quarantine" trong tasks/todo.md). Guard test `scope.test.ts` ("accounting not discoverable") đỏ vì mâu thuẫn này.

**Decision:** Owner tái xác nhận quarantine: mục Kế toán KHÔNG nằm trong nav admin mặc định. Route `/admin/accounting/*` vẫn truy cập trực tiếp theo quyền (`accounting` module ACL: owner/super_manager) — chỉ không có lối vào điều hướng. Đây là áp dụng phễu D012 ("không thêm nghi thức quản trị kế toán doanh nghiệp mà HKD không dùng").

**Consequences:** Entry nav `accounting` bị gỡ khỏi `packages/shared/src/auth/nav-config.ts` (giữ comment trỏ về quyết định này); guard test `scope.test.ts` giữ nguyên làm chốt chặn. Muốn đảo lại phải sửa quyết định này trước, rồi sửa test cùng PR.

## D014: Chương trình hợp nhất tầng molecule UI — W0–W6 (2026-06-11)

**Context:** Owner đánh giá UI hiện tại "tạp nham". Audit composition-level 2026-06-11 (đa tác tử, có kiểm chứng đối kháng) xác nhận tầng token/contract sạch nhưng tầng molecule vô chủ: 25 map trạng thái cục bộ (cùng trạng thái lệch màu + từ giữa POS/orders/admin; `/orders` dùng vocab `pending/in_progress` mà CHECK constraint của `orders.status` cấm → KPI "đơn chờ" luôn 0, 4/7 trạng thái render key tiếng Anh thô), 0 loading/error/not-found toàn app, 24 màn nuôi 2 cây JSX mobile/desktop đã drift, 10 kiểu KPI card, 5 hệ empty-state, 4 cơ chế confirm, 2 `formatVND` trùng tên khác output, 26 file >600 dòng chiếm 30% UI code.

**Decision:**

1. Chạy chương trình 6 wave: W0 khung loading/error/404 → W1 StatusBadge SSOT → W2 formatVND + KpiCard → W3 Empty/Confirm → W4 ListSurface (một đường responsive qua DataTable) → W5 IA → W6 decompose god-components. Đợt 2026-06 thực thi W0–W4 liên tục, dừng trước W5.
2. Hướng W5 chốt trước: gộp điều hướng về 2 shell — "Văn phòng" (admin + finance + hr + menu + orders + inventory chung một sidebar nhiều nhóm) và "Vận hành" (POS/KDS/runner/employee giữ chrome riêng). Plan chi tiết lập sau W4.
3. Mỗi molecule hợp nhất phải kèm: mục contract trong `docs/spec/design-system.md` + check ratchet trong `scripts/check-ui-contract.mjs` với allowlist = baseline hiện trạng, chỉ được giảm.

**Consequences:** Map trạng thái cục bộ mới, formatVND cục bộ mới, `window.confirm`, skeleton/empty ad-hoc mới bị ratchet chặn dần từ W1–W3. Giữ nguyên có chủ đích: `pos/_lib/order-status-display.ts` (collapse 6→5 nhãn cho thu ngân — thiết kế UX), inventory dictionary 31 key (re-model per-entity là wave riêng), employee wrapper layer (family kỷ luật nhất app).

## D015: Một Platform duy nhất — hệ production in-place là system of record; matu-platform đóng băng vĩnh viễn, harvest một chiều (2026-06-12)

**Context:** Owner đặt lại câu hỏi hợp nhất 2 repo về một Platform/một DB/một nguồn số liệu. Khảo sát đối chiếu 2026-06-12 (code 2 repo + dữ liệu prod + kiểm chứng pháp lý web): prod `iexwsuaqqenyjiskawoj` có 50 ngày live (6.138 đơn, 504,6tr VND đã thu, 2.876 tax_invoices với 2.820 issued — dữ liệu pháp lý NĐ 70/2025, 16.664 print jobs), mật độ đơn x2 trong 7 ngày cuối (~101 đơn/ngày, peak 162 ngày 06-07). `matu-platform` (repo `/Users/luongthebinh/matu-platform`, DB `dyksphedgzqsqjqgxzog`): 280 migrations, kiến trúc tốt ở idempotency/PBAC anti-escalation/inventory ledger/e-invoice worker, nhưng 0 deployment production, 0 đơn thật, frozen 2026-06-09. Ước lượng human-pace 1 dev: absorb điểm mạnh vào hệ sống ≈ 11–16 tuần incremental, zero rủi ro dữ liệu; cutover sang matu-platform ≈ 15–23 tuần serial + feature-freeze 4–5 tháng + rủi ro migrate hóa đơn pháp lý. Base rate 5 chương trình rebuild trước đó: 0/5 thành công.

**Decision:**

1. Một Platform duy nhất = hệ production hiện tại (repo này, DB `iexwsuaqqenyjiskawoj`). Không ETL/migrate dữ liệu vận hành sang DB project khác. "Platform" là vai trò của hệ này, không phải tên repo khác.
2. `matu-platform` đóng băng vĩnh viễn: không deploy, không mở lại bất kỳ feature nào. Repo chuyển archive read-only sau khi trích xong danh mục harvest. DB `dyksphedgzqsqjqgxzog` backup schema rồi pause/xóa — thời điểm do owner xác nhận riêng.
3. Harvest một chiều từ matu-platform, ở mức spec + migration chọn lọc, viết lại theo convention `with-action.ts`/RPC hiện hành. Danh mục được duyệt: (a) pgTAP harness + CI test-db; (b) idempotency_keys + webhook event-claim-before-side-effect; (c) inventory ledger-based — tận dụng cửa sổ prod inventory 0 dòng; (d) HĐĐT worker pattern (queue/retry/awaiting_lookup, vault credentials, token cache, mock-block prod); (e) PBAC anti-escalation; (f) feedback module khi có nhu cầu; (g) reports net-profit-daily shape. PR harvest bê nguyên khối code không viết lại theo convention là vi phạm quyết định này.
4. Ưu tiên 0–30 ngày sau quyết định: land đuôi treo (migrations chờ owner + deploy HRM keys + W4.4 còn lại) → daily close UI (chốt ca thu ngân + xác nhận ngày) → expense capture (bảng + form — phòng thủ thuế Nhóm 3 NĐ 68/2026, run-rate đang vắt ranh 3 tỷ/năm) → harvest (a)+(b).

**Consequences:** Chấm dứt re-litigate hướng platform. Mọi đề xuất rebuild/cutover sau này phải sửa quyết định này trước, kèm số liệu chứng minh thắng phương án absorb. Bằng chứng khảo sát + harvest checklist chi tiết: `docs/worklog/platform-consolidation-2026-06-12.md`.

## D016: POS không trừ kho khi thanh toán (2026-05-28; ghi nhận hồi cứu 2026-06-13)

**Context:** Quyết định owner 2026-05-28 trước nay không có bản ghi canonical trong repo — `tasks/regressions.md` và `docs/runbooks/operations-smoke-gate.md` trỏ vào memory riêng của một agent, các agent khác và người đọc repo không thấy. Bối cảnh nghiệp vụ: dữ liệu kho chưa seed (prod inventory 0 dòng), POS trừ kho chỉ sinh số liệu sai.

**Decision:** Thanh toán POS KHÔNG trừ kho. Action-layer callsites đã gỡ (commit `9ba83205`); webhook stock leg disable qua migration `20260611001000_disable_payment_stock_leg.sql` (đã applied prod). Amount-recompute và `finalize_paid_order` trong các RPC thanh toán GIỮ NGUYÊN — policy chỉ tắt nhánh stock consumption.

**Consequences:** Smoke chain vận hành = POS → payment → KDS/print → HĐĐT (`docs/runbooks/operations-smoke-gate.md`). Đuôi kỹ thuật còn lại: remove `consume_stock_for_order` + RPC liên quan (owner-gated, tracked `tasks/todo.md`). Đảo policy (khi kho seed xong + owner duyệt) = sửa quyết định này trước; khi re-enable, caller của `complete_payment_and_consume_stock` phải check `stock_consumed_status != ok` → webhook trả HTTP 500 + notification severity `high`.

## D017: Admin là L0 Tenant Command; Branch Manager dùng L1 Branch Command (2026-06-13)

**Context:** Admin Dashboard không thể tiếp tục là nơi gom tất cả thứ "quản trị"
vì hệ thống đã bao phủ gần trọn vận hành HKD F&B: mua/nhập, kho, sản xuất,
bán hàng, thanh toán, in, HĐĐT, tài chính vận hành, HR, và báo cáo. Mâu thuẫn
rõ nhất là `branch_manager`: họ phải thiết lập chi nhánh của họ, nhưng nếu quyền
đó sống trong `/admin/settings` thì BM bị biến thành một Admin thiếu quyền.

**Decision:**

1. Product framing vẫn là `bộ phần mềm quản lý vận hành và bán hàng` cho HKD
   Cơm Tấm Má Tư. Có thể dùng `ERP` khi so sánh phạm vi/kiến trúc, nhưng không
   đổi entrypoint sản phẩm thành ERP đa ngành.
2. `/admin/*` là L0 tenant command và tenant setup cho `owner` /
   `super_manager`: dashboard chuỗi, báo cáo điều hành, chi nhánh, nhân sự,
   quyền, thiết lập tenant, và direct-support accounting.
3. `branch_manager` không phải Admin user. Home mục tiêu của BM là
   `/employee`; điều hành và thiết lập chi nhánh sống dưới
   `/br/[branchId]/dashboard` và `/br/[branchId]/settings/*` khi mở đúng việc.
4. Domain workspaces (`/inventory`, `/orders`, `/hr`, `/finance`, `/menu`) là
   workflow surface độc lập, không phải tab con của Admin.
5. Role/route chỉ là gate bề mặt. Action và row-level access tiếp tục phải đi
   qua permission keys, RPC/RLS, và branch scope.

**Consequences:** Code slice tiếp theo phải sửa đồng bộ `module-acl.ts`,
`route-resolution.ts`, `route-map.ts`, `nav-config.ts`, `app-discovery.ts`,
`scope.ts`, và tests. Không thêm workflow branch-scoped mới vào `/admin/*`.
Ma trận canonical: `docs/spec/role-route-matrix.md`; T3 contract:
`docs/worklog/role-route-restructure-2026-06-13.md`.

## D018: Bỏ role `super_manager` — gộp vào `owner` (2026-06-13)

**Context:** HKD đơn (single-tenant) có cả `owner` (Chủ sở hữu) và
`super_manager` (Giám đốc điều hành) làm hai tầng tenant-admin. Với một HKD,
tầng thứ hai là dư thừa — `owner` đã xuất hiện cạnh `super_manager` trong mọi
allowedRoles/RLS list. Prod chỉ có **1 user** mang `super_manager`.

**Decision (supersedes phần `super_manager` của D017 mục 2):**

1. Bỏ hẳn access bucket `super_manager`. Bộ quyền + 1 user prod gộp vào `owner`.
2. `ACCESS_BUCKETS` còn **8**: `owner`, `branch_manager`, `warehouse_manager`,
   `production_manager`, `cashier`, `waiter`, `chef`, `office`.
3. `/admin/*` (L0 tenant command) giờ chỉ `owner`. Mọi list/RLS có
   `super_manager` cạnh `owner` → xóa `super_manager`, `owner` giữ nguyên quyền.
4. Cấu hình sàn/bếp (việc trước đây của `super_manager`) gộp vào `owner` +
   `branch_manager`.

**Consequences:** TS twins sửa cùng PR (`packages/shared/src/auth/types.ts`
`ACCESS_BUCKETS` + `POSITION_CODE_TO_STAFF_ROLE` + role-constant arrays; 16
module-acl lists; 64 file `.ts/.tsx`). Migration
`20260613110000_remove_super_manager_fold_owner.sql` (owner-applied): reassign
1 profile → owner, drop position + role_template, retarget 83 notifications +
auth metadata → owner, cập nhật 3 mapper + `notifications_select` policy,
DO-block self-check. Inline RLS/function dead role-strings (`super_manager`
cạnh `owner` ở các policy khác + `admin_update_profile` /
`toggle_profile_active` / `stock_transfer_list_branches`) để lại như dead-code
(không user nào resolve ra) — dọn ở một migration cleanup riêng (kèm các token
intermediate-scope đã loại trước). Canonical: `docs/spec/role-route-matrix.md`.

## D019: W5 — Cấu trúc hoá UI (shell · route home · nav · padding), chi tiết hoá D014 W5 (2026-06-13)

**Context:** D014 đặt chương trình W0–W6; W0–W4 đã ship, W5 (IA) + W6 (decompose)
chưa làm, và D014 chốt hướng W5 = gộp điều hướng về 2 shell ("Văn phòng" /
"Vận hành") nhưng để "plan chi tiết lập sau W4". Audit đa-tác-tử có kiểm chứng
(`docs/worklog/ui-surface-workflow-audit-2026-06-13.md`) xác định gốc tái-drift:
tầng token được máy enforce (1 nguồn `globals.css`, 0 palette raw, palette ban ở
ESLint), nhưng tầng cấu trúc (chọn shell, route home, nav, padding) chỉ là luật
chữ trong `docs/agent/rules/ui.md` — 0 check. Bằng chứng code: nav SSoT
(`nav-config.ts`) chỉ `admin-shell` dùng (5 shell còn lại hardcode nav inline; 3
resolver `resolveWorkspaceItems` / `resolveQuickLaunchGroups` /
`resolveBranchOperationItems` có 0 caller ngoài test); 8 route mồ côi;
branch-floor settings có 2 nhà (`/br/[branchId]/settings/tables` import thẳng
`TablesClient` của `/admin/settings`); 2 trang "Kỳ kế toán"; `AppShell` main
`p-4` (`app-shell.tsx:302`) đè lên `AppPage` `p-4` (`surface.tsx:75`) dù
`design-system.md:213` nói padding thuộc `AppPage`; ratchet status mù regex (đòi
ký tự trước "STATUS" nên `STATUS_LABELS` / `STATUS_CONFIG` lọt → xanh giả).

**Decision:**

1. Chốt 2 họ chrome (không có họ thứ ba): **Quản trị** = `AppShell` chung (admin +
   domain workspaces + branch command/setup `/br/[branchId]/*`), một sidebar
   nhiều nhóm theo role/scope; **Vận hành** = chrome chuyên dụng full-screen
   (POS, KDS, Runner) + trang nhân viên `/employee`, dùng chung
   token/typography/status/header/bottom-nav primitives. Mở rộng D014 W5 để đặt
   rõ branch command/setup vào họ Quản trị.
2. **Một capability = một route home** theo `role-route-matrix.md`. Giải quyết
   trùng: (a) branch-floor settings (tables/pos/kds/printers/pos-sessions) nhà
   canonical = `/br/[branchId]/settings/*` (matrix:49,80);
   `/admin/settings/{tables,pos,kds}` thành redirect shim → `/admin/settings/branches`
   (owner cấu hình theo từng chi nhánh qua link "Thiết lập chi nhánh" mỗi branch).
   `/admin/settings/printers` KHÔNG redirect thuần được (là cha của tenant-infra
   `printers/templates` owner-only + `printers/jobs`) → thành hub tenant "Máy in":
   bỏ config cross-branch (canonical = branch), tile → templates/jobs + cấu hình
   theo CN. (b) Kỳ kế
   toán canonical = `/admin/accounting/periods` (direct-support, ngoài nav —
   theo D013); `/finance/periods` giải quyết (redirect/gộp) SAU KHI xác minh
   `accounting_periods` vs `fiscal_periods` không phải hai concept khác nhau.
3. **Padding một chủ = `AppPage`** (formalize `design-system.md:213`). `AppShell`
   main bỏ outer padding; `AppPage` nesting-aware; trang lá không tự đặt `p-*`
   gốc.
4. **Nav là data, không phải code per-shell**: mọi sidebar/bottom-nav project từ
   `nav-config.ts` qua resolver chung; cấm `ShellNavGroup[]` literal trong shell.
5. Hợp đồng cấu trúc chi tiết: `docs/spec/design-system.md` § Structural
   Governance. Theo pattern D014: mỗi luật kèm ratchet baseline-đóng-băng-chỉ-giảm
   trong `scripts/check-ui-contract.mjs`. Cổng Stage 0: `shell-registry`,
   route-manifest reachability, page-padding, `nav-acl`, và gỡ mù regex status.

**Scope của bản ghi này:** chỉ là quyết định + hợp đồng (cập nhật
`design-system.md` § Structural Governance + bản ghi này). CODE (script ratchet +
refactor shell/nav + redirect shim + sửa `app-shell.tsx`) là Stage 0/1, CHƯA
thực thi.

**Consequences:** W5 có plan chi tiết để thực thi theo thứ tự governance-first
(khoá cổng trước, cleanup sau). Khi cổng land, shell/route/nav mới phải qua cổng.
Branch Manager trải nghiệm Branch Command + Branch Setup là một luồng L1, không
lạc vào trang hình-Admin. Triệu chứng tầng token (clone status/VND/raw Table)
thuộc vệ sinh ratchet W1–W4 — burn-down riêng, ngoài W5. Đảo bất kỳ điểm nào (cho
phép shell thứ 3, đổi padding owner, đổi route home) phải sửa quyết định này
trước.

## D020: Thoái phân hệ kế toán kép doanh nghiệp (GL / TT 200 / VAS) khỏi sản phẩm HKD — DUYỆT (2026-06-13)

**Context:** Xác minh bằng CODE + PROD (không từ docs). Nguồn gốc: cụm migration
`_archive/20260419*` (`gl_*`: posting rules, auto-post journal, fiscal periods,
close & reconcile, payment/grn/payroll/transfer/production autopost) +
`finance_chart_of_accounts` + `finance_journal_entries` + `vas_report_lines` —
một General Ledger kế toán kép hoàn chỉnh. Prod `iexwsuaqqenyjiskawoj`
(2026-06-13): `journal_entries` ~625 (SALE auto-post ĐANG chạy: 155 bút toán/7
ngày, mới nhất hôm nay), `journal_entry_lines` ~1138, `chart_of_accounts` 34
(seed hệ tài khoản DN TT 200/2014: 511/621/622/627/641/642 "CP quản lý doanh
nghiệp"/911/411), `posting_rules` 20 (511/33311/111/112/621/627/331/334/3383-6),
`fiscal_periods` 2, `accounting_periods` 1, `payroll_periods` 0,
`vas_report_lines` 0 (BCTC chưa lập lần nào). HKD theo **TT 152/2025** (thay TT
88/2021 từ 01/01/2026) chỉ ghi sổ đơn (S1a/S2a–S2e/S3a-HKD), KHÔNG kế toán kép,
KHÔNG hệ tài khoản TT 200, KHÔNG BCTC/VAS. `docs/modules/finance.md:71-88` đã
phân loại toàn bộ là "Accounting Advanced — not the pilot default";
`tasks/todo.md:49` đã ghi vấn đề void-BCTC là "moot — HKD files no BCTC". Áp phễu
**D012**, nối tiếp **D013** (kế toán ngoài nav), là phần kế toán của **W5/W6**
trong D014.

**Decision (owner DUYỆT 2026-06-13):**

1. **THOÁI** toàn bộ GL doanh nghiệp khỏi DB sống + UI: tables
   `journal_entries`/`journal_entry_lines`, `chart_of_accounts`, `posting_rules`,
   `fiscal_periods`, `accounting_periods`, `payroll_periods`, `vas_report_lines`;
   functions `auto_post_journal`, `create_manual_journal_entry`,
   `close_fiscal_period`, `validate_journal_balance`, B01/B02/B03-DN; routes
   `finance/{chart-of-accounts,journal,posting-rules,statements,audit-trail,periods}`
   + `admin/accounting(/periods)`; action files
   accounting/journal/chart-of-accounts/posting-rules/period/statement-actions.ts;
   nav/ACL/labels tương ứng.
2. **GIỮ** (tách hẳn, không đụng): HĐĐT `tax_invoices` + `/finance/invoices` +
   `reconcile_run_log` (NĐ 70/2025), `/finance/revenue` (nguồn khai thuế =
   `tax_invoices` status='issued'), `/finance/reconciliation` (đối soát tiền về),
   `/finance/food-cost`, `supplier_invoices` (chứng từ chi phí — D015).
3. **THÊM:** expense capture (bảng + form) — phòng thủ thuế Nhóm 3 NĐ 68/2026, là
   sổ chi phí đơn, KHÔNG phải GL (D015).
4. **Thứ tự thoái an toàn** (không vỡ payment/GRN/HĐĐT): (1) re-source
   `finance-cockpit.ts:196-226` khỏi `journal_entries`/`chart_of_accounts` →
   tính từ `orders`/`payments`/`supplier_invoices`; (2) gỡ `auto_post_journal`
   khỏi RPC payment/GRN/transfer/refund (đã `EXCEPTION WHEN OTHERS` non-fatal nên
   không thể làm hỏng đơn) — redefine từ body SỐNG ở
   `20260611001000_disable_payment_stock_leg.sql` +
   `20260612120000_refund_keep_order_payment_status.sql`, KHÔNG từ baseline; (3)
   drop 7 cột `journal_entry_id` (`payments`, `goods_received_notes`,
   `supplier_invoices`, `stock_transfers`, `production_orders`,
   `supplier_payments`, `payroll_periods`) + dọn map lỗi
   `posting_rule_not_found`/`fiscal_period_closed` ở
   `pos/_lib/payment-messages.ts`; (4) drop functions + tables theo thứ tự FK; (5)
   xóa route/action/nav/labels + re-baseline ratchet/i18n.
5. **Dữ liệu:** ~625 `journal_entries` KHÔNG phải sổ pháp lý HKD → xóa thẳng,
   không archive-forever; DDL/seed giữ lịch sử ở `supabase/migrations/_archive`
   (đủ cho đường chuyển đổi DN tương lai — DN khi chuyển đổi mở sổ mới, không dùng
   lại bút toán HKD).

**Scope / Gate:** Owner DUYỆT 2026-06-13 → cổng `finance.md:111` thông cả hai
nửa: (a) data-retention review — HKD không có nghĩa vụ lưu GL, sổ pháp lý là
`tax_invoices`/`supplier_invoices` giữ độc lập; (b) accounting review — owner ký
2026-06-13. Thực thi theo slice: bước 1 (cockpit decouple, commit `684d4642`) ✓;
bước 2a (xóa UI GL: route/action/nav/labels) — code-only, verify build; bước 2b
(migration thoái GL: redefine money-RPC bỏ `auto_post_journal`, drop cột/fn/table)
— owner-applied (file → PR → owner) theo D015. KHÔNG có dev/test DB nên owner nên
apply thử trên Supabase branch trước prod. Bằng chứng: truy vấn prod 2026-06-13 +
adversarial keep-check (không plan nào trong todo/worklog/plan cần GL).

**Consequences:** Khi ratify + ký → thực thi theo thứ tự trên, gắn vào W5/W6
(D019). Sau thoái: cập nhật `docs/modules/finance.md` (gỡ mục Accounting
Advanced), `role-route-matrix.md` (Direct Tenant Support `/admin/accounting`), và
D013 theo. Đảo quyết định (giữ GL / bật lại VAS) phải sửa quyết định này trước,
kèm lý do nghiệp vụ (vd chuyển đổi sang Doanh nghiệp). Void-BCTC issue
(`tasks/todo.md:49`) trở thành vô nghĩa sau khi thoái.

**Cập nhật 2026-06-13 (trong lúc gỡ slice 2a-2):** Bản đồ keep/remove ban đầu
phân loại NHẦM `/finance/reconciliation` là GIỮ ("đối soát tiền về") — lỗi sinh từ
lens keep-check bị treo trong workflow. Kiểm code: `reconciliation-actions.ts` gọi
`fn_reconcile_period`/`fn_reconcile_drilldown` so `subledger_total` vs `gl_total`
→ đây là đối chiếu sổ-phụ↔sổ-cái (GL reconciliation), phụ thuộc `journal_entries`.
`/finance/revenue` cũng có thẻ reconciliation + work-queue period-health/recon
dùng GL. Phân loại lại: REMOVE thêm `/finance/reconciliation` +
`reconciliation-actions.ts` + `fn_reconcile_period`/`fn_reconcile_drilldown` +
gỡ thẻ reconciliation/period-health khỏi `/finance/revenue`. "Đối soát tiền về"
thật (settle MoMo/VietQR vs payment đã ghi) KHÔNG tồn tại trong hệ → backlog ADD
cùng expense capture. Owner duyệt mở rộng phạm vi (phương án gỡ trọn) 2026-06-13.

**Thực thi 2b (2026-06-14):** Migration đã viết —
`supabase/migrations/20260614100000_d020_retire_enterprise_gl.sql` (1 transaction:
8 RPC rewrite + reshape `get_finance_dashboard_summary` → drop 22 fn / 2 trigger /
6 bảng GL / 7 cột `journal_entry_id`). **Branch-validation bất khả thi**: Supabase
branch replay lịch sử migration prod (458 entry) fail ở `20260425140000` — lỗi infra
có sẵn, không liên quan GL (branch không tái tạo được prod). Thay bằng
**diff-validation**: cả 8 RPC rewrite đối chiếu định nghĩa SỐNG của prod
(`pg_get_functiondef`) — chỉ gỡ leg GL, mọi logic non-GL giữ nguyên byte (4 RPC
tiền: byte-verified; 4 RPC mua-hàng: verified); drop manifest introspect từ prod;
Layer-1 marker scan sạch. Companion code đã ship: `fcf8ad93` (bỏ journal counts +
`fetchReconciliationByDay`) + gỡ nhánh lỗi GL chết trong `refund-actions.ts`. CÒN
LẠI: owner apply file lên prod (file → PR → owner) + `pnpm db:types` regen. **Flag
riêng (ngoài GL):** ledger prod = 458 entry, KHÔNG khớp baseline-first 49 file →
branch-testing hỏng cho MỌI migration tới khi squash/sửa lịch sử prod.

**ĐÃ ÁP DỤNG PROD 2026-06-14 ✓** (owner paste qua SQL Editor + `migration repair
--status applied 20260614100000`). Verify trên prod: 6 bảng GL + 21 function + 2
trigger + 7 cột `journal_entry_id` đã drop; 8 RPC rewrite hiện diện; **0 function
còn tham chiếu GL**; `accounting_periods` + `close_period_*` còn nguyên; migration
có trong `schema_migrations`. `pnpm db:types` regen (−547 dòng GL, commit
`dbce1d86`); typecheck/lint/169 tests/build xanh. **D020 hoàn tất.** Backlog ADD
(tương lai): expense capture + money-settlement reconciliation thật.

## D021: Chiết khấu theo món đặt ngay trong luồng thêm/gọi-thêm (POS) (2026-06-13)

**Context:** Chiết khấu theo món đã có ở DB (`order_items.discount_*` + trigger
`pos_normalize_order_item_discount` + RPC `apply_order_item_discount`) nhưng chỉ
thao tác được HẬU KỲ: thêm món → mở chi tiết đơn → chạm món → "Chiết khấu món"
(~6 chạm). Owner chạy CTKM định kỳ ("đánh giá 5 sao → miễn phí 1 phần nước") nên
cần đặt chiết khấu cho TỪNG MÓN ngay trong customizer lúc thêm/gọi thêm. Owner
chốt: chỉ thêm chiết khấu per-item (KHÔNG promotion engine); "spec rồi code".

**Decision (T3 — debate PM/BA/Dev/QA đã chạy):**

1. **Approach A (in-RPC):** nhồi 3 khóa `discount_type/discount_value/discount_note`
   vào item JSON của `create_order` + `append_order_items`; INSERT thẳng — trigger
   `pos_normalize_order_item_discount` (BEFORE INSERT) tự tính `discount_amount`,
   trigger order tự cộng `item_discount_amount`/`total_amount`. KHÔNG tự tính tiền
   trong RPC. Approach B (gọi `apply_order_item_discount` nối tiếp) bị loại vì 2 RPC
   không trả `order_item_id`.
2. **Schema KHÔNG đổi cột, KHÔNG đổi signature** (`p_items` là `jsonb`) ⇒ generated
   types không đổi; bỏ khóa discount = byte-identical với hiện tại. RPC chỉ
   `CREATE OR REPLACE` từ body SỐNG (baseline — không forward nào redefine) + thêm
   tối thiểu.
3. **Phạm vi UI:** customizer mode `new` / `append` / `edit` (giỏ chưa gửi).
   `edit-sent` GIỮ luồng hậu kỳ. Ghi chú ≥3 ký tự BẮT BUỘC khi có chiết khấu
   (constraint `order_items_discount_metadata_paired`) — Zod `superRefine` chặn
   client trước; chip lý do sẵn để giảm ma sát. Dòng có chiết khấu nhận cart-key
   riêng (không gộp số lượng vào dòng không-chiết-khấu).
4. **Atomicity & deploy guard:** discount ghi cùng transaction tạo/append. RPC trả
   thêm `item_discount_amount`; server action so kỳ vọng (tính từ giỏ) với giá trị
   trả về — lệch ⇒ cảnh báo non-fatal (không chặn bán), phủ cả khoảng trống "deploy
   code trước khi apply migration" (RPC cũ bỏ qua khóa lạ → món nguyên giá).
5. **Tương tác đã soi:** order-discount lấy base = `subtotal − item_discount` (stack
   đúng, total ≥0); void/reduce/edit/cancel/split full-move/merge để trigger tính
   lại (item discount đi theo row). GAP đã biết, NGOÀI phạm vi: split PARTIAL chưa
   copy discount sang clone; bill in nhiệt gộp discount ở khối tổng (không in
   per-line). Cả hai là hành vi sẵn có, không do thay đổi này sinh ra.

**Gate:** Migration owner-applied (file → PR → owner) theo D015; KHÔNG có dev DB ⇒
chỉ chứng minh được typecheck/lint/build + unit; owner phải smoke trên POS thật sau
apply (free 100%, vnd clamp, append, idempotent, void, in bill). Đảo quyết định
(quay lại chỉ-hậu-kỳ, hoặc lên promotion engine) phải sửa quyết định này trước.

## D022: HĐĐT "hàng chờ" — nháp-local → phát hành theo lô cuối ngày (createBatchInvoice) (2026-06-14) — RESOLVED: owner chốt realtime, defer việc-lập bị bác

**Context:** Hiện mọi payment POS trong chế độ HĐĐT active **auto-phát-hành HĐĐT
per-order realtime** (`createInvoice` 1-shot, `viettel-sinvoice.ts`) — không có
cửa sổ sửa. Hệ quả vận hành (xác nhận từ code): sai phương thức (CK bấm tiền
mặt), lỡ bấm thanh toán, sai số tiền → chỉ sửa được qua **hủy/thay thế** (owner +
biên bản, TT 32/2025) hoặc không sửa được; `createRefund` còn thiếu khỏi UI; tiền
mặt `completed` tức thì không có trạng thái `pending` để hủy. Đã xác minh tài liệu
**Viettel S-invoice WS v2.50**: tồn tại endpoint nháp + phát hành lô.

**Decision (PROPOSAL — kỹ thuật chốt, chờ kế toán xác nhận thời điểm lập):**

1. **Mô hình hàng chờ:** lúc thanh toán → tạo **nháp LOCAL** (`tax_invoices
   status='draft'`, có `transactionUuid`, **KHÔNG gọi provider**); khách nhận
   receipt, chưa phải HĐĐT. Cửa sổ trong ngày: sửa/xóa nháp tự do. Cuối ngày
   (cron) hoặc khi bấm "chốt" → **phát hành theo lô** → sync **mã CQT + số** về →
   `issued`.
2. **Endpoint:** dùng `InvoiceAPI/InvoiceWS/createBatchInvoice/{supplierTaxCode}`
   (≤50 HĐ/lô; với HĐ máy tính tiền **trả `codeOfTax` (mã CQT) + số theo
   `transactionUuid`** → sync được). **KHÔNG** dùng `createOrUpdateInvoiceDraft`
   (nháp chỉ phát hành thủ công trên web + **số không sync về** phần mềm tích
   hợp). `createInvoiceDraftPreview` (trả PDF, không lưu) cho bước xem-trước.
3. **State machine** ([einvoice-tax.md:204](../ref/einvoice-tax.md)) đã có
   `draft` → chỉ cần **dừng ở `draft`** thay vì chạy thẳng
   `draft→signing→submitted→issued`. Phát hành lô đẩy `draft→issued`.
4. **Sau phát hành** chỉ sửa qua **điều chỉnh/thay thế** (API
   `cancelTransactionInvoice` đã bỏ từ 01/06 theo NĐ 70/2025) — giữ luồng
   cancel/replace owner hiện có.

**Cổng pháp lý (FLAG kế toán — KHÔNG tự quyết):** "thời điểm lập HĐĐT khởi tạo từ
máy tính tiền cho dịch vụ ăn uống" — phát hành **theo lô cuối ngày** có khớp
**NĐ 123/2020 Đ9 (sửa NĐ 70/2025) + TT 32/2025** không? Viettel cung cấp hẳn API
batch cho HĐ MTT (trả mã CQT) ⇒ *kỹ thuật* rõ là được phép; nhưng *thời điểm lập*
là quy tắc luật → kế toán + điều khoản đăng ký MTT với CQT phải xác nhận trước khi
bật. Không recite quy tắc từ trí nhớ (guardrail `tax-vn`).

**Gate:** T3 (money + HĐĐT). Debate 4 góc nhìn trước khi code; migration
file→PR→owner (D015). Nối với gap **sửa/hoàn payment đã completed** — cửa sổ chỉ
hữu dụng nếu sửa được đơn trong ngày. Spec kỹ thuật:
`docs/plan/hddt-hang-cho-spec.md`. Đảo quyết định (giữ realtime per-order mặc
định) phải sửa quyết định này trước.

**Phán quyết owner (2026-06-14) — cổng pháp lý ĐÓNG, đề xuất §1 BỊ BÁC:** thời
điểm lập HĐĐT = **tại thời điểm thanh toán hoàn tất** (khớp model POS realtime
per-order, einvoice-tax.md §1.1). ⇒ KHÔNG defer *việc lập* đến cuối ngày. Gộp lô
cuối ngày chỉ áp dụng cho **chuyển dữ liệu HĐĐT MTT lên CQT** (bảng tổng hợp),
KHÔNG phải cấp số/giao HĐ cho khách. Hệ quả:
- Phát hành giữ **realtime per-order tại payment** (`createInvoice` không đổi).
- `hddt_issuance_mode='deferred_batch'` + `createDraftTaxInvoice`/`issueDraftBatch`
  + cron cuối ngày: **không triển khai**.
- Provider `createBatchInvoice` (đã build + test 2026-06-14, mặc định không caller)
  **giữ làm hạ tầng** cho backfill/tổng hợp B2C nếu sau cần — không dùng để defer.
- 'Cửa sổ sửa' không thể nằm SAU khi lập (realtime, bất khả hồi) → dời thành: xác
  nhận **TRƯỚC khi bấm thanh toán** + sửa **phương thức thanh toán** + **hủy/thay
  thế** sau phát hành (TT 32/2025; đã có ở `finance/invoice-list.tsx`). Hướng UI:
  xem **D023**.
- `hddt-hang-cho-spec.md`: phần deferral superseded; phần phân biệt endpoint +
  provider batch vẫn đúng làm tham chiếu.

## D023: Sửa-sai POS realtime — guardrail TRƯỚC thanh toán (cashier) + correction ở owner/accountant (2026-06-14)

**Context:** D022 chốt HĐĐT lập realtime tại payment ⇒ không còn cửa sổ sửa SAU khi
lập. 3 gap vận hành owner nêu — sai phương thức (CK bấm tiền mặt); lỡ bấm thanh
toán khi khách chưa kiểm tra; sai HĐ đã phát hành — phải giải bằng UI, không bằng
deferral.

**Phán quyết owner (2026-06-14):**
1. **KHÔNG đưa hủy/thay thế HĐĐT ra màn POS** — "quá nhiều thao tác cho thu ngân,
   gây khó dễ và khó sử dụng". Correction (hủy/thay thế, sửa/hoàn payment) **chỉ ở
   Owner** (đã có `finance/invoice-list.tsx`, owner-gated) + **Kế toán (sau)**.
2. **Cashier-facing chỉ là guardrail NGĂN lỗi, không phải công cụ SỬA lỗi:** chặn
   nút thanh toán bằng xác nhận tóm tắt (phương thức + số tiền + cảnh báo "HĐĐT
   phát hành ngay, sau chỉ hủy/thay thế"). 1 tap, chặn lỡ-bấm + sai-phương-thức từ
   gốc; không tăng gánh sửa-sai cho thu ngân.

**Đã làm (2026-06-14):**
- Guardrail `confirm()` trước `handleConfirmPaid` (cash + VietQR,
  [bill-receipt-sheet.tsx](../../apps/web/app/(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx)); UX: thêm prop `details` vào `confirm()`
  chung ([confirm-dialog.tsx](../../packages/ui/src/components/confirm-dialog.tsx)) hiển thị hàng phương thức + số tiền; copy
  `messages.pos.payment.confirmIssue*`.
- Refund/đảo thanh toán owner-level: action `refundOrderPayment` (resolve payment
  → `create_refund` → `reverse_payment_and_post`,
  [refund-actions.ts](../../apps/web/app/(protected)/finance/refund-actions.ts)) + nút "Hoàn tiền" cạnh hủy/thay thế trong
  [invoice-list.tsx](../../apps/web/app/(protected)/finance/invoice-list.tsx); copy `messages.finance.invoiceList.refund*`. Dùng RPC sẵn
  (không migration). Lưu ý: refund KHÔNG tự hủy HĐĐT (cancel/thay thế riêng); post-D020
  order giữ `payment_status='paid'`. Gate T3: typecheck/eslint/build xanh; **chưa
  smoke-test live** (DB prod read-only) → owner verify đường tiền thật.
- Sửa phương thức thanh toán (CK↔tiền mặt khi tiền nhận đúng, ghi sai method):
  RPC mới `correct_payment_method` ([migration 20260615120000](../../supabase/migrations/20260615120000_correct_payment_method.sql),
  completed-payment + `orders:refund_approve` + audit) + action `correctPaymentMethod`
  ([payment-method-actions.ts](../../apps/web/app/(protected)/finance/payment-method-actions.ts)) + nút "Sửa phương thức" trong invoice-list (picker
  cash/vietqr/momo + lý do); copy `messages.finance.invoiceList.methodFix*`. **Pure
  record fix**: post-D020 không GL; method "3"=TM/CK hardcode trên HĐĐT ⇒ HĐĐT đã
  phát hành KHÔNG bị ảnh hưởng (xác minh `viettel-sinvoice.ts:591`). Gate T3:
  typecheck/lint/build xanh. **Migration ĐÃ áp prod** (verify 2026-06-15:
  `correct_payment_method` sống trên prod; ledger ghi dưới name
  `20260615120000_correct_payment_method` ở version `20260614213338` — lệch
  version↔name, cần back-fill ledger theo baseline-first); type hand-add tạm vào
  `database.types.ts` (chạy `pnpm db:types` để khớp). ⚠️ Chưa smoke-test live.

**Còn lại:** không còn hạng mục correction owner-level tồn đọng. Migration
`20260615120000` đã áp prod; đường refund + sửa-phương-thức cần owner **smoke-test
live** (prod: 0 refund, 0 correction) + back-fill ledger version↔name trước khi tin dùng.

## D024: Trợ lý Telegram — mặt tiền chat cho xương sống Điều phối (4 co-founder) (2026-06-15) — DRAFT, chờ co-founder duyệt

**Context:** Owner đặt câu hỏi về một "AI Agent riêng cho Má Tư" để chủ/quản lý/nhân
viên giao tiếp, theo dõi, giao việc, kiểm tra, điều phối qua Telegram/Zalo. Đối chiếu
CODE + blueprint (không dựng từ ý tưởng rời):

- `docs/plan/platform-rearchitecture-blueprint.md` §4.4 đã đặt **xương sống ③ Điều
  phối** và ghi rõ: phối hợp liên miền hôm nay diễn ra *ngoài hệ* (chat/gọi điện/Excel).
  Một trợ lý chat chính là **kênh** kéo việc đó vào hệ — không phải miền mới.
- Hạ tầng tái dùng được đã có: `notifications` SHIPPED (bảng + policy
  `notifications_select` + `severity`, dẫn chứng D016/D018), realtime, RPC;
  `proxy.ts` một cổng auth+ACL+branch-scope (D003/D015); định danh Position⟂Permission
  + `has_permission(branch, key)` ở RLS (blueprint §3.1).
- Owner chốt (2026-06-15): đối tượng phiên đầu = **4 co-founder + quản lý** (KHÔNG
  nhân viên đại trà ở v1) ⇒ kênh = **Telegram** (API mở, không cần duyệt Zalo OA);
  Zalo defer tới khi chạm nhân viên/khách.

**Decision (PROPOSAL — định hướng, CHƯA code):**

1. **Đóng khung:** trợ lý Telegram KHÔNG phải sản phẩm AI mới mà là **mặt tiền chat
   của xương sống ③ Điều phối**. Tái dùng `notifications`/`proxy.ts`/RPC; CẤM lối
   dữ liệu/định danh/LLM song song (đúng "một schema, một cổng, một nguồn sự thật" — D015).
2. **Ba lớp, làm theo thứ tự, rủi ro tăng dần:**
   - **① Đẩy thông báo (read, một chiều):** chốt ca/ngày, alert HĐĐT bị Viettel từ
     chối, lệch kiểm kê, ngưỡng thuế/dòng tiền. ROI cao nhất, rủi ro ~0.
   - **② Hỏi-đáp read-only:** NL → chọn 1 trong N tool truy vấn **đã định nghĩa**
     (KHÔNG free-form SQL, KHÔNG để LLM tự duyệt DB).
   - **③ Hành động/điều phối (write — giao việc, duyệt):** DEFER — cần audit + xác
     nhận + quyền; là mở rộng phạm vi → ratify riêng (xem §4).
3. **Guardrails BẮT BUỘC:**
   - **Trust-boundary:** LLM KHÔNG tự tính/bịa số tài chính. Mọi con số đến từ RPC
     thật; LLM chỉ *diễn đạt lại*. (HKD — số đụng thuế Nhóm 2/3 NĐ 68/2026, D020.)
   - **Định danh & RLS:** map `telegram_user_id ↔ profile/position`; trợ lý gọi RPC
     dưới danh nghĩa user đã định danh + áp `has_permission(branch, key)`; KHÔNG
     service-role vượt RLS. Lọc alert theo domain-head (Phương án A blueprint §4.3:
     `growth:*`/`ops:*`/`build:*`/`platform:*`).
   - **Secret:** bot token là secret owner-quản (vault/env), KHÔNG commit (D005 +
     rule không commit secrets).
4. **Phạm vi & phễu D012:**
   - Lớp **①/②** KHÔNG mở rộng phạm vi D012 — chỉ là kênh mới cho `notifications` đã
     shipped ⇒ không cần một quyết định mở-rộng riêng để khởi động.
   - Lớp **③** (write/điều phối/giao việc) LÀ nghi thức điều phối mới ⇒ phải qua phễu
     D012 + ratify một `D0xx` riêng (kèm bằng chứng nhu cầu thật) TRƯỚC khi code.
5. **Thứ tự lộ trình:** thuộc **Điều phối v1 = Phase 1** blueprint. Phụ thuộc Phase 0
   (daily-close P0-1 + `expense` P0-2) — KHÔNG làm trước Phase 0 (bot rỗng nội dung
   nếu chưa có chốt ngày + sổ chi phí).

**Consequences:** Khi co-founder duyệt → khởi động bằng PoC lớp ① (báo cáo cuối ngày
+ alert HĐĐT từ chối) ăn theo `notifications`, đo 2–3 tuần adoption của 4 co-founder
trước khi mở lớp ②. Zalo + lớp ③ là nhánh sau, mỗi nhánh một quyết định riêng. Đảo
định hướng (chọn Zalo trước / cho LLM ghi dữ liệu trực tiếp / bỏ ràng buộc RLS) phải
sửa quyết định này trước.

**Status:** DRAFT 2026-06-15 — chờ 4 co-founder rà. Nguồn: hội thoại định hướng +
đối chiếu `platform-rearchitecture-blueprint.md` §4.4/§3.1, D005/D012/D015/D016/D018/D020,
hạ tầng `notifications`.

## D025: Đánh giá `revfactory/harness` — lấy ý tưởng, KHÔNG cài tool; cải tổ 6 rule governance (2026-06-15)

**Context:** Cân nhắc adopt `revfactory/harness` (meta-skill Claude Code sinh agent-team
+ skill) để tối ưu AI Agent System Structure & Workflow. Đánh giá bằng dynamic workflow
17-agent + ý kiến ngoài Codex (gpt-5.5, read-only sandbox) + red-team kiểm chứng filesystem.
Ba nguồn hội tụ độc lập.

**Decision — KHÔNG cài harness làm tool/runtime:**
1. Pattern lõi harness bắt buộc `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
   (`TeamCreate`/`SendMessage`/`TaskCreate` flag-gated). Codex — nửa runtime surface — không
   set được ⇒ vỡ "neither runtime privileged".
2. Harness ghi authority vào `.claude/agents`+`.claude/skills` (Codex không đọc) ⇒
   **governance-capture/split-brain**, vi phạm "policy runtime-neutral; `.claude/`+`.codex/`
   chỉ WIRING". Tệ hơn vendor lock-in.
3. Mandate prose của harness yếu hơn guard `exit non-zero` mình đã có; `model:opus`-mọi-call
   = 0 footprint hôm nay (đừng tạo phantom mandate).
4. `+60%/n=15` là benchmark tác giả tự chấm ⇒ chỉ là prior cho pilot tự đo.

**Lấy ý tưởng (design-time, vào shared docs):** QA cross-boundary taxonomy + incremental
coherence (`workflow.md`); re-runnable-skill descriptions, generalize-don't-overfit,
per-call-model, near-miss routing tax-vn (`skills.md`).

**Cải tổ rule (rule là mutable):**
- `workflow.md`: Skill Plan Gate → MUST(T3)/SHOULD(T2); Verification 2-3 → advisory +
  attestation bắt buộc (gate thật chỉ `pnpm` + CI xanh); Four Perspectives → chọn lens theo
  risk type.
- `scripts/check-review-tier.mjs` (`pnpm lint:review-tier`) — floor tier deterministic theo
  blast-radius, **warn-only** trong pilot; flip `REVIEW_TIER_STRICT=1` fail-closed sau khi tune.
- `tasks/regressions.md`: bỏ framing "low retire = fail"; `pnpm regressions:retire-candidates`
  lister read-only (KHÔNG auto-gate item-3 dead-ref).
- Promote `feedback_refactor_goal_separation_not_loc` từ memory Claude-private → `skills.md`.

**Gate:** `pnpm lint` xanh (gồm guard mới + rules-mirror in-sync). Không đổi TS/schema ⇒
typecheck/build không bị ảnh hưởng.

**Open (chờ owner):** (a) tập path forced-T3 của tier guard (đề xuất: `supabase/migrations`,
`SECURITY DEFINER`, auth/RLS, finance/payments/invoice/hddt/payroll); (b) thời điểm flip tier
guard sang fail-closed. Đảo quyết định (muốn cài harness/Agent-Teams) phải sửa quyết định này
trước.

**Addendum 2026-06-15 — bật Agent Teams cho Claude (capability tùy chọn, KHÔNG phải adopt
harness):** Owner bật `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` ở `.claude/settings.json` (`env`)
để Claude DÙNG ĐƯỢC `TeamCreate`/`SendMessage`/`TaskCreate` cho live multi-agent coordination.
Đây là runtime-specific wiring (đúng chỗ: adapter Claude), không phải policy. **Invariant giữ
nguyên:** không rule/workflow nào được PHỤ THUỘC Agent Teams — Codex không có tương đương, nên
four-perspective debate + mọi orchestration phải runtime-neutral với fallback single-agent/
written-transcript (pin ở `skills.md` → Subagents). Cờ experimental ⇒ kỳ vọng churn; không gắn
governance load-bearing vào nó. Không đụng `check-guard-sync` (chỉ đọc `hooks.PreToolUse`). Caveat:
nếu feature-gate đọc biến TRƯỚC khi load settings, owner có thể cần `export` ở shell profile (per-user,
không commit).

**Status:** RESOLVED 2026-06-15 — owner chốt "lấy ý tưởng, không cài tool"; 4 nhóm reform
đã land. Pilot tier-guard warn-only. Agent Teams bật cho Claude như capability tùy chọn (addendum).

## D026: HRM redesign — trục Người · Ngày công · Lương + 4 quyết định nền (2026-06-15)

**Context:** Owner phản hồi UX HRM vẫn khó cho cả quản lý lẫn nhân viên. Debate đa tác tử (workflow `hrm-debate`, 18 agents, phản biện đối kháng) verify code + prod (`iexwsuaqqenyjiskawoj`, 2026-06-15): 46/46 attendance `present` (taxonomy late/absent/half_day là code chết), 33/46 `shift_id` NULL, 16 ca treo, `employment_contracts`/`payroll_periods`/`payroll_entries` = 0 (lương 100% Excel), `standard_days` đếm chỉ T2–T6 (sai vì quán mở 7 ngày), 6/32 NV có checklist, payroll mồ côi nav. Contract đầy đủ: `docs/worklog/hrm-redesign-2026-06-15.md`.

**Decision:**

1. **Ngày công chuẩn:** `standard_days` = số công chuẩn CỐ ĐỊNH owner nhập theo tháng (thay vì đếm T2–T6) + **clamp** `working/standard ≤ 1` (lương prorate KHÔNG vượt base trừ khi có chính sách trả thêm cuối tuần). Trích thành helper shared dùng chung payroll + hiển thị ngày công.
2. **Checklist:** GIỮ. Gán theo `positions.code` làm **mặc định** + override theo người (`employees.default_checklist_template_id`). Dựng cơ chế gán theo vị trí (RPC `apply_checklist_template_to_role` hiện chỉ match template Global → mở rộng nếu cần template chi nhánh).
3. **Lương vào app qua `employees.base_salary`:** thêm UI nhập `base_salary` + `dependents_count` vào hồ sơ NV; gỡ phụ thuộc 0-contract trong `calculatePayroll` (eligibility theo base_salary, KHÔNG khôi phục UI `employment_contracts`). BHXH đơn giản; contract/BHXH đầy đủ để sau nếu cần. → ĐẢO phần "LOẠI field salary trong form" của debate (owner quyết).
4. **Ca làm:** GIỮ nhưng hạ xuống nhóm "Thiết lập" (ít chạm), KHÔNG ngang hàng tab hằng ngày. Màn nhân viên hiện giờ check-in/out THỰC; ca chỉ là nhãn phụ, ẩn khi `shift_id` NULL. KHÔNG bỏ ca, KHÔNG xây lại phân ca.

**IA:** gom 5 tab `/hr` (theo bảng) → **3 trục theo công việc**: Người · Ngày công · Lương. Ca + mẫu checklist → "Thiết lập". `defaultTab` động (owner→Người, BM→Ngày công). Khi W5 gộp `/hr`→`/ops` (Hoàng): mang Người+Ngày công+Thiết lập, tách Lương ở lớp Quản trị owner.

**Consequences:** Đợt 1 (dọn UI lừa dối + ca treo + `cancelCheckoutRequest` + nhắc ca treo + xóa dead code + card ngày công) tiến hành ngay; bug `standard_days` unblocked theo §1. Đợt 2 = checklist theo `positions.code` + NV CRUD (tạo 1 bước, `updateEmployee`, ngưng việc) + nghỉ phép notification 2 chiều. Đợt 3 = payroll qua `base_salary` (không còn defer thuần Phase 3 cho phần base_salary). Phễu D012 vẫn áp: KHÔNG rostering/auto-late/auto-absent/số dư phép/duyệt nhiều tầng. Đảo quyết định phải sửa D026 trước.

**Còn mở (chưa chốt — owner trả lời sau):** (a) payroll thêm vào nav hay ghi quyết định ẩn-có-chủ-đích như D013 (hiện orphan VÔ TÌNH); (b) gộp `/admin/staff` + `/hr`-employees ngay hay chờ W5 blueprint; (c) ảnh selfie check-in có ai xem/dùng không (nếu không → cân nhắc bỏ).

## D027: Chấm công theo CA (per-shift), không theo ngày — 2 ca/ngày là mô hình thật của Má Tư (2026-06-15)

**Context:** Owner xác nhận sự thật vận hành chưa từng ghi trong repo: **toàn bộ nhân viên Má Tư làm 2 ca/ngày** (sáng 06:00–13:00, chiều 16:00–21:00, nghỉ trưa 13:00–16:00). Mô hình hiện tại ràng buộc **1 bản ghi chấm công/người/ngày** (unique `employee_id,date,tenant_id`) → KHÔNG ghi nổi 2 ca. Bằng chứng prod (`iexwsuaqqenyjiskawoj`, SELECT-only, 2026-06-15, 47 bản ghi / 14 NV / 7 ngày): span vào→ra TB **7.0h** (= một ca, không phải 6→21), **23/47 (49%) không check-out**, check-in tách 2 cụm (5–7h và 18–21h) nhưng mỗi người/ngày chỉ ghi được MỘT, tổng bản ghi 47 (lẽ ra ~196 phiên) → adoption thấp vì hệ không khớp cách làm. Việc này ĐẢO giả định nền của D026 (1 lần chấm/ngày = 1 công) và GỠ phán đoán "Ca làm gần như vô nghĩa" của debate ban đầu.

**Decision:**

1. **Đơn vị chấm công = CA, không phải NGÀY.** Mỗi ca = 1 bản ghi `attendance_records`. Unique đổi `(employee_id, date, tenant_id)` → `(employee_id, date, shift_id, tenant_id)`; `shift_id` NOT NULL cho dòng mới. Migration: backfill `shift_id` cho dòng cũ (theo `resolveDefaultShiftId` từ `check_in`) trước khi đổi constraint.
2. **Ca làm = XƯƠNG SỐNG, đặt ở "Thiết lập", phạm vi Global.** 1 bộ ca dùng chung cả 4 chi nhánh (owner chốt giống nhau). `shifts.branch_id` cho phép NULL = global (như checklist template); seed 2 ca global. `resolveDefaultShiftId` đọc ca global (+ override chi nhánh nếu sau này có). Auto-nhận ca theo giờ check-in. GỠ phán đoán "ca ít giá trị" của D026 §4 (vẫn đặt ở Thiết lập vì ít-chạm, nhưng vai trò là NỀN).
3. **Ngày công:** đủ 2 ca = **1 công**; 1 ca = **nửa công (0.5)**. `half_day` lần đầu có nghĩa thật. `working_days = Σ_ngày( min(số_ca_có_mặt, 2) × 0.5 )`. `standard_days` = số ngày công chuẩn/tháng owner nhập (D026 §1, đếm theo NGÀY) + clamp ≤ standard.
4. **Chấm công UX = mỗi ca vào/ra riêng (4 mốc/ngày):** vào sáng → ra trưa → vào chiều → ra tối. `today-work-state` thành máy trạng thái 2-ca/ngày (mỗi ca có vòng not_started→working→pending→done riêng). checkout/`cancelCheckoutRequest` thao tác trên ca đang mở. clock-in: tìm ca theo giờ → nếu ca đó chưa có bản ghi hôm nay thì tạo mới (không còn "đã chấm hôm nay" chặn ca thứ 2).
5. **Checklist theo từng ca:** snapshot checklist riêng cho mỗi bản ghi ca (sáng/chiều khác nhau được). Hợp với D026 §2 (gán theo `positions.code`).

**Consequences:** Đảo thứ tự ưu tiên HRM: **Thiết lập Ca (Global, đủ 2 ca) → chấm công per-shift → ngày công → lương** — Ca là bước 1, không phải mục bị hạ. T3 schema-changing migration → file → PR → owner applies (env dev trỏ prod, KHÔNG test local). Refine D026: §1 giữ (standard_days config), §4 "ca ít giá trị" GỠ. Đợt-1 (a) "Số công = số dòng" tạm thời chưa đúng (1 dòng giờ = 1 ca) → sửa thành công = Σ ca/2 sau rework; nhãn tạm thời ở SummaryView cần ghi chú. Đảo quyết định phải sửa D027 trước. Mở rộng (không đảo) D026; chi tiết: `docs/worklog/hrm-redesign-2026-06-15.md`.

## D028: Kiểm soát nguyên liệu = đếm thực tế (giữ D016) + lát "tài chính trước" — sổ chi phí, lợi nhuận ròng/thực tế, tiền mặt hiện hữu (2026-06-15)

**Context:** Owner nêu 2 nhu cầu: (1) kiểm soát nguyên liệu tiêu hao 1 ngày + cập nhật tồn kho; (2) chỉ số tài chính: lợi nhuận ròng, lợi nhuận thực tế, tiền mặt hiện hữu. Khảo sát CODE + PROD (`iexwsuaqqenyjiskawoj`, SELECT-only, 2026-06-15):

- **Kho:** hạ tầng đầy đủ (ingredients/recipes/stock_levels/stock_movements/stocktake/stock_issues/transfers/PO-GRN) nhưng **prod 0 dòng mọi bảng** (ingredients=0, recipes=0, stock_levels=0, stocktake_sessions=0) → module **chưa từng chạy thật**. Đúng tiền đề **D016** (POS không trừ kho vì kho rỗng).
- **Tài chính:** doanh thu thật (5.898 payment completed, 4.990 tiền mặt ~85%); **bảng `expense`/`expenses` KHÔNG tồn tại** (`fetchOperatingExpenseTotal` [finance-cockpit.ts:182] hardcode `0`; ô "Chi vận hành" đã render sẵn ở `/finance` + `/admin/dashboard` nhưng nguồn rỗng); cockpit **chưa có field `netProfit`** (`grossProfit` mới = net_revenue − giá vốn); giá vốn hiện = 0 (food-cost MV rỗng vì recipes/GRN trống); lương chưa vào hệ (D026: `payroll_entries`=0, còn Excel); **0 sổ tiền-ra / 0 quỹ chạy** (`cash_movements`/`cash_reconciliation`/`cash_ledger` đều không tồn tại) dù đầu-vào tiền mặt giàu dữ liệu (356 ca đóng có `closing_cash`). NCC đã có `supplier_invoices` (chứng từ chi phí NCC) riêng.

**Phán quyết owner (2026-06-15, qua 2 câu hỏi định hướng — chọn 2 phương án "đề xuất"):**

1. **Nguyên liệu tiêu hao = ĐẾM THỰC TẾ, KHÔNG định-mức-POS-tự-trừ.** Đo bằng kiểm kê: tiêu hao = tồn đầu + nhập − tồn cuối, dùng đúng module stocktake (mode `daily`) + stock_issues đã có. **GIỮ D016** — KHÔNG bật `consume_stock_for_order`/recipe-based auto-deduct (Approach "định mức" owner đã loại; muốn bật sau phải sửa D016 + có định mức chuẩn). Kích hoạt module = bài toán **seed dữ liệu** (vài món chủ lực + tồn đầu), không phải viết tính năng.
2. **Thứ tự: TÀI CHÍNH TRƯỚC** (nhịp 1-dev). Phạm vi lát này:
   - (a) **Bảng `expense`** — sổ chi phí đơn (KHÔNG GL, đúng D020), cho chi phí vận hành NGOÀI NCC. Là P0-2 blueprint, nối D015 §gap-2 + D020 §3. Implement `fetchOperatingExpenseTotal` đọc bảng này → "Chi vận hành" bật ở cả 2 dashboard.
   - (b) **Lợi nhuận ròng** (theo phát sinh) = lãi gộp − chi vận hành − lương − thuế → thêm field `netProfit` + card vào cockpit.
   - (c) **Lợi nhuận thực tế** (theo tiền mặt) = tiền thực thu − tiền thực chi trong kỳ (hợp ghi sổ đơn HKD TT 152/2025).
   - (d) **Tiền mặt hiện hữu** = quỹ đầu kỳ + thu tiền mặt − chi tiền mặt (tổng hợp từ `closing_cash` + vế chi tiền mặt của `expense`/trả NCC).
   - Tạm thời: **giá vốn nhập tay** tới khi module kho (mục 1) chạy; **lương** tạm là một danh mục của `expense` tới khi D026 đợt-3 populate `payroll_entries` rồi cockpit chuyển nguồn.

**Quan hệ quyết định:** Mở rộng (KHÔNG đảo) D015 P0-2 + D020 §3. GIỮ D016 (không đụng POS stock leg). Nối D026/D027 (payroll vào hệ = nguồn "lương" tương lai cho P&L). Định nghĩa metric quản trị ("doanh thu" cho P&L = HĐĐT issued vs tiền thu; các khoản trừ của "lợi nhuận") vẫn là việc 4 co-founder chốt (blueprint §7.3) — tạm dùng net (subtotal−discount, trước VAT) cho lãi theo phát sinh + tiền thu cho lãi tiền mặt để không chặn build; chốt chính thức trước khi khóa số.

**Gate:** T3 (finance + money + schema mới + RLS). "Spec rồi code" (chuẩn D021). Migration **file → PR → owner applies trên prod** (không dev DB — D015); chỉ chứng minh được typecheck/lint/build + unit, owner smoke-test số thật sau apply. Đảo quyết định (chọn định-mức-POS / đổi thứ tự / bỏ expense) phải sửa D028 trước.

**Thực thi (2026-06-15) — Deliverable 1+2 (sổ chi phí + lợi nhuận ròng):** Owner xác nhận danh mục + quy trình file→PR→owner. ĐÃ code:
- Migration `supabase/migrations/20260615140000_add_expenses_table.sql` (bảng `expenses` + 4 RLS policy `has_permission_any('finance:view'|'finance:expense_create')` + CHECK category/method/amount + GRANT). Mirror nguyên mẫu `20260610110000_employee_leave_requests.sql`. Key `finance:expense_create` đã cấp owner (prod-verified) ⇒ KHÔNG backfill role_template.
- `fetchOperatingExpenseTotal` (finance-cockpit) thôi hardcode 0 → SUM `expenses` theo kỳ/CN ⇒ "Chi vận hành" bật ở `/finance` + `/admin/dashboard`.
- Field + card **Lợi nhuận ròng** = lãi gộp − chi vận hành (cockpit `netProfit` + card `/finance` + delta so-kỳ).
- UI nhập/xóa: `/finance/expenses` (page + client FormDialog: ngày·CN·khoản mục·số tiền·phương thức·nơi chi·ghi chú) + nav item + `expense-actions.ts` (create/delete/fetch, owner-gated) + `_lib/expense-categories.ts` + copy `messages.finance.expenses` + types hand-add `expenses` vào `database.types.ts` (tạm tới khi `pnpm db:types`).

Gate T3: typecheck ✓ / lint ✓ (ui-contract, i18n, rules-mirror, guard-sync) / build ✓ (route `/finance/expenses` compiled). **CÒN LẠI: owner apply migration `20260615140000` lên prod (file→PR→owner, không dev DB) + `pnpm db:types` regen + smoke-test nhập 1 khoản chi → kiểm "Chi vận hành"/"Lợi nhuận ròng" lên số.** Test branch có 2 fail HRM redesign (D026/D027) có sẵn — KHÔNG do slice này.

**Thực thi apply prod đợt 2 (2026-06-16, owner-delegated):** owner uỷ quyền apply tiếp. Apply `20260616110000` (RPC `update_tenant_identity` — D031d) + `20260616130000` (D031e: `resolve_gtgt_rate` + trigger `populate_order_item_vat_rate` nguồn rate nội bộ từ resolver + `get_revenue_kpis` generalize `vat_by_rate`/`vat_total` + drop 3 default 8.00). Chunk theo statement + verify + guard restore byte-for-byte (CLEAN) + `db:types` regen + `get_advisors`. **Phát hiện quan trọng: `resolve_gtgt_rate(1)` = 2.40** — doanh thu Má Tư annualized THẬT **≥ 1 tỷ** (≈1,18 tỷ tính từ `orders.total_amount`, không phải ~620M như ước lượng của design agent) → group 2 → GTGT **2,4%** (giảm tạm). **Khớp owner ("cả năm > 1 tỷ")** — resolver tự suy ra từ dữ liệu, KHÔNG hardcode. `order_items` mới snapshot 2,4%; HĐ/order cũ giữ 8% (sửa-tiến, không ghi đè HĐ phát hành); emit mẫu 2 KHÔNG đổi (gross, đã verify). Advisors 157 = toàn category chuẩn; **follow-up:** revoke anon EXECUTE cho `resolve_gtgt_rate`/`update_tenant_identity` (gộp vào sweep song song `20260616120000_revoke_cosmetic_grants`) vì `resolve_gtgt_rate` không có auth-guard nội bộ (lộ bậc doanh thu 0/2,4/3).

**Deploy (owner quyết 2026-06-16):** owner chỉ dùng **local-dev trỏ prod DB**; bản deploy Vercel production đang NGỦ (0 log lỗi/12h, prj `comtammatu-web`) → "để yên", deploy-sync gom sau (owner promote). **Bài học expand-contract (lỗi quy trình của agent):** migration **DESTRUCTIVE** (drop column như D3) phải **deploy code-gỡ-đọc TRƯỚC** rồi mới apply; lần này D3 (drop `customer_count`) apply TRƯỚC khi push/deploy → bản deploy Vercel cũ broken-in-waiting, nhưng KHÔNG gây sự cố vì deploy đang ngủ + owner dùng local-dev (đã có code mới). Migration **ADDITIVE** (RPC/cột mới) apply-trước-deploy là ổn. Quy tắc này đã ghi vào `docs/agent/rules/database.md` §Owner-Delegated Production Apply.

**Thực thi Deliverable 3 (2026-06-15) — tiền mặt hiện hữu + lợi nhuận thực tế:** KHÔNG migration (neo qua `system_settings`).
- **Quỹ tiền mặt chạy** = tồn quỹ đầu (owner đếm, lưu 2 key `cash_opening_balance`/`cash_opening_date` trong `system_settings`) + tiền mặt thu (RPC `get_revenue_kpis` từ ngày neo, tenant-level) − chi tiền mặt (`expenses` method='cash' từ ngày neo). Chỉ hiện khi đã đặt mốc; chưa đặt → prompt (không đoán bừa = cộng dồn cash từ epoch).
- **Lợi nhuận thực tế (kỳ)** = tiền thực thu (`totalCollected`) − chi đã trả (`expenses` method ∈ cash/transfer, bỏ 'unpaid') — phân biệt với lợi nhuận ròng (gồm cả chưa trả).
- Files: `_lib/cash-cockpit.ts` (`fetchCashSummary`), `cash-actions.ts` (`setCashOpening`, gate `settings:tenant`), `components/cash-panel.tsx` (2 card + dialog đặt tồn quỹ), +2 key/default `@comtammatu/shared/settings`, copy `messages.finance.cash`, render `/finance`. Degrade an toàn trước khi apply migration (expenses lỗi → 0).

Gate T3: typecheck ✓ / lint ✓ / build ✓; 2 test fail là HRM redesign có sẵn (không do slice).

**Status:** Deliverable 1+2+3 code xong (sổ chi phí · lợi nhuận ròng · tiền mặt hiện hữu · lợi nhuận thực tế). **CHỜ owner apply migration `20260615140000` + `pnpm db:types` + smoke** (D3 chạy ngay khi bảng `expenses` có). Track **nguyên liệu đếm-thực-tế** (D028 §1) là pha kế theo thứ tự "tài chính trước".

## D029: Glyph tiền canonical = `₫` (U+20AB); vnd-format gate là render-SSoT, KHÔNG phải "money debt" về 0 (2026-06-15)

**Context:** Burn-down `vnd-format-ssot` (chi tiết D014 W2 — "2 formatVND trùng tên khác output"). Recon đa-tác-tử (verified vs CODE 2026-06-15) trên 11 file SAFE (inventory/admin/pos, 28 hit) phát hiện regex gate (`toLocaleString('vi-VN')` / `Intl.NumberFormat('vi-VN')` / local `formatVND` def) **bắt phần lớn là NON-money**: số đơn, số lượng (kg), số món, hệ số quy đổi (maxFractionDigits 3–6), ngày/giờ. Chỉ **1/28** hit là duplicate formatVND thật (`production-order-list` `formatCost`). Glyph tiền **phân mảnh**: `formatVND` emit `đ` (U+0111); nhiều message template/inline emit ` ₫` (U+20AB, có space); 4 chỗ double-suffix `đđ` (bug hiển thị thật: `ingredients-client` ×2, `transfers/[id]`, `issues/[id]`).

**Phán quyết owner (2026-06-15, qua câu hỏi định hướng):**
1. **Canonical glyph = `₫` (U+20AB)** — ký hiệu đồng chính thức. Migration đầy đủ (sửa `formatVND` emit `₫` + đồng bộ `packages/print-render` mirror SQL↔TS↔EMV + mọi màn) **DEFERRED** thành 1 wave phối hợp riêng (chạm money render toàn app + hoá đơn in). KHÔNG ship đổi glyph trong wave này.
2. **Wave W2-micro đã ship (faithful, T2):** `production-order-list` `formatCost`→`formatVND` (giữ render `đ` hiện tại → tự "ride" khi ₫ wave land; allowlist 2→1, giữ `formatShortageNumber` quantity). Fix 4 bug `đđ` = gỡ literal `đ` thừa (formatVND đã có mark). Lưu ý faithful: `total_cost` lý thuyết có thể lẻ (Σ qty×WAC) → formatVND `Math.round` (đúng "không lẻ đồng"); PROD inventory = 0 dòng (D028) nên không regress data thật.

**Gate reframing:** allowlist `vnd-format-ssot` trộn 2 mối quan tâm — (a) **duplicate `formatVND` definition** (debt thật, burn về 0 được) và (b) **non-money locale formatter** (count/qty/date — KHÔNG BAO GIỜ migrate sang formatVND). ⇒ Allowlist **không thể về 0 by design**. Hướng tương lai (chưa làm): tách gate (no-dup-formatVND-def vs money-render) và/hoặc thêm shared `formatQuantity`/`formatCount`, reclassify entry non-money.

**Consequences:** Agent sau **đừng** đuổi allowlist vnd-format về 0 (đa số non-money — là render-SSoT, không phải debt). Migration `₫` là wave deferred chạm `formatVND` + print-render. Còn 2 pre-existing pattern ngoài scope: `inventoryCommon.currency`/template ` ₫` bọc output formatVND (`grn-detail` → "45.000đ ₫") — gộp vào ₫ wave. Đảo chọn glyph → sửa D029 trước.

## D030: Meta gate-precision audit — allowlist = sàn false-positive, KHÔNG phải backlog về 0 (2026-06-15)

**Context:** D029 (vnd-format) + recon button-height (0/38 migratable) cho thấy 2/2 ratchet gate over-match. Owner cho audit **TẤT CẢ** gate. Audit đa-tác-tử (verified vs code, 2026-06-15) phân loại 12 gate non-trivial + 8 gate allowlist-rỗng: **real-debt ~27 vs false-positive ~136**; phần lớn allowlist trộn debt thật với pattern hợp lệ regex không phân biệt được → **không thể về 0 by design**. Phát hiện hệ thống: **lỗ false-negative `cn()`** — anchor `className=\{?['"]` bỏ sót `className={cn(...)}`/multi-line/variant-map ở MỌI gate className (escape thật: `combobox-field` h-10 Button, `FinanceSummaryCard`, brand.tsx, surface/kpi-card).

**Phán quyết owner (2026-06-15):** Document + reconcile + zero-out sạch. Bản đồ per-gate (healthy / reframe / mixed / has-FN + real-debt floor + lỗ `cn()`) = **canonical ở `docs/spec/design-system.md` § Enforcement Status → "Ratchet allowlist semantics"** (SSoT, không dup ở đây). Rule: agent sau KHÔNG đuổi allowlist `reframe` về 0; reconcile stale (allowlist > actual) free; không hạ entry dưới actual.

**Thực thi (2026-06-15, T2):** (a) Ghi bản đồ governance vào design-system.md. (b) Reconcile stale: `radius-scale`→{} (gồm bỏ entry file đã xoá `hr/shift-assignments-table.tsx`), `card-content` maxCount 107→92, `card-title` 25→21, `status-label` runner 2→1, `button-height` transfers-list 2→1. (c) Zero-out sạch non-active-zone: `radius` 2 fix (`rounded-sm`→`md`, delta corner nhỏ spec-mandate) → gate về 0; `card-content` `thresholds` `px-0 py-0`→`flush` (byte-identical, py-0 vốn no-op) → 92; `page-padding` 5 page br/settings (tables/printers/kds/pos/pos-sessions) `<div mx-auto max-w-* space-y-6 p-4 md:p-6>`→`<AppPage>` (thêm `AppPage` vào import `@/components/surface` có sẵn = 0 line-shift, baseline an toàn; width default=max-w-5xl ×4, wide=max-w-7xl ×1) ⇒ `PAGE_PADDING_BASELINE`={} gate→0. (d) Regex precision (vá `cn()` một phần): broaden anchor `\{?(?:cn\()?['"]` cho `icon-size`/`heading-scale`/`radius-scale`/`app-arbitrary-sizing` (0 hit hiện tại, preventive); `stat-card-ssot` widen `\w*` prefix ⇒ bắt `FinanceSummaryCard` (allowlist finance/page.tsx deferred D028). KHÔNG broaden `button-height` (cn()-escape toàn non-Button false-positive → real fix = Button-scoping, defer); multi-line `card-content`/`card-title` miss = SSoT component (surface/kpi-card) nên exempt, không count. (e) **Button-scoping** `button-height`: thay gate "any raw height" (37 entry toàn non-Button false-positive) bằng `button-height-on-button` — scan `<Button>`/`<TouchButton>` opening tag qua helper `extractJsxOpeningTags` (brace/string-aware ⇒ phủ `cn()`+multi-line đúng cấu trúc, không widen regex). Recon: đúng 4 `<Button>` có raw height = form-control trigger (combobox/multi-select/date-picker) `h-10` (40px không có Button variant) → allowlist 4, bỏ 37 false-positive. Unit-test extractor 6/6 (cn-multiline, arrow `>`, child-không-tính, div-không-quét). (f) **Primitive `CardTitle` `size` variant** (`sm`=text-sm, `lg`=text-2xl, `default`=text-base; tách `text-base` khỏi base class). Migrate 8 hit heading-scale sạch non-active-zone: `text-sm`×7 (dashboard ×4, waste-create, qc-settings ×2) `size="sm"`, `text-2xl`×1 (session-gate) `size="lg"` → `card-title` 21→13, maxCount→13. Faithful: variant render đúng class cũ (tailwind-merge). `card-title-runtime-contract` gate cập nhật assert contract mới. Baseline regen isolated (qc-settings 2 entry col-shift do `className`→`size` ngắn hơn). (g) **DataTable migration** (gộp `useIsMobile ? cards : table` fork về adapter một-đường-responsive). Recon 5 file: chỉ **1 clean-faithful** = `supplier-invoices` → **MIGRATED** (7 columns + `mobileCardRender`=card cũ verbatim + `rowClassName` active-tint; bỏ import `useIsMobile`/Table/TableEmptyStateRow; use-is-mobile-budget entry gỡ; faithful trừ empty-state mobile chuẩn-hoá `AppEmptyState`). 2 file owner-OK-delta-nhỏ → **MIGRATED**: `issues` (cell-styling vào render giữ header default; columns + `mobileCardRender`; delta: mất Card frame desktop + mobile gap-2→3), `receiving` (giữ Card+CardContent flush ngoài fork; delta: mobile divide-y→gap-3 + bỏ section label "Hoạt động gần đây"). Cả 2 giữ `useIsMobile` (AppPage width/search/pipeline) → allowlist 2 giữ nguyên; bỏ import Table/Empty/TableEmptyStateRow; eslint-driven unused cleanup; baseline regen isolated (receiving, 786→779 = dedup string mobile/desktop). 2 file KHÔNG migrate được: `stock` (master-detail + aside detail pane DataTable không host), `inventory-value` (custom Card+SummaryBox+divide-y). (h) **KpiCard migration + đ₫ fix.** Recon 18 p-N CardContent → 17 stat-card thật (0 clean, đều +tone-dot/+font-bold = KpiCard canonical look, owner OK "áp hết gồm finance"). MIGRATED 14: `orders-client` ×3, `refunds` ×3, `revenue/[date]` ×3, `finance/page` ×5 + **bỏ local `FinanceSummaryCard` def** (giết stat-card-ssot debt → allowlist entry gỡ; ValueTone/VALUE_TONE_CLASSNAME + unused imports gỡ) — map `title`→`label`, `helper`→`hint`, `valueTone`→`tone` (KpiCard có đủ tone gồm `success`). card-content 92→81; baseline regen isolated (orders/refunds/revenue 774→768; finance/page dùng message-ref nên không shift). DEFER 2 needs-care (migrate sẽ MẤT visual info chứ không chỉ tone-dot): `inventory-value:151` (sibling non-metric → grid lệch), `dashboard:634` (mất tone-frame màu + responsive text-lg/2xl). `reports-client`/`grn-detail` = panel/list/chart không phải stat-card. Fix `đ₫` double-mark ở `receiving` (drop literal `₫`, forward-compat ₫ wave). **Deferred (active-zone/risk):** **₫ glyph app-wide** (D029: formatVND→`₫` + print-render mirror + templates — HR còn active hiển thị tiền → rủi ro mid-flight + double-mark template active-zone; chờ zone free + owner OK visual app-wide); `payroll SummaryCard` + hr vnd-format/status (**HR active** OFF-LIMITS); SectionLabel/eyebrow (taste, 1 hit non-active low-yield); `stock`/`inventory-value` DataTable (infeasible — master-detail/custom layout). Đảo → sửa D030 trước.

## D031: Đợt remediation UX/IA toàn app — 5 phán quyết owner + đính chính từ verify (2026-06-16)

**Context:** Owner yêu cầu thiết kế lại tỉ mỉ bố cục/IA/direct-route/workflow/visual/spacing, **đặc biệt dữ liệu hiển thị từng màn**, ra vấn đề + giải pháp dứt điểm. Audit đa-tác-tử (16 agent, 100 page, verified vs CODE + PROD `iexwsuaqqenyjiskawoj` SELECT-only) → **185 finding** (5 critical / 40 high / 78 medium / 62 low; dimension lớn nhất = data-display 75). Pass verify (5 agent) chạy TRƯỚC khi chốt phán quyết, lật 2 hạng mục "đáng sợ":
- **ĐÍNH CHÍNH 1 — HĐĐT `sellerName` KHÔNG phải bug.** App không gửi `sellerInfo`; Viettel tự điền người bán từ tài khoản đăng ký (URL `supplierTaxCode`=`COMPANY_TAX_CODE`). Prod: 3.111 HĐ issued đều mang MST `077200004194`. `request.sellerName/sellerTaxCode/sellerAddress` (`finance/actions.ts:271`, `replace-invoice-actions.ts:300`, `hddt-daily-summary.ts:142`) là **input chết** — không bao giờ lên wire. Gỡ khỏi rủi ro pháp lý.
- **ĐÍNH CHÍNH 2 — Concurrency/idempotency đã khóa ở tầng DB.** POS double-pay / refund double / KDS double-bump / checkout double-approve đều có `FOR UPDATE` + precondition + partial unique index `idx_payments_order_active`; prod 0 ca trùng. **Đóng**, không sửa (thêm guard = churn trên T3 money RPC).

**Phán quyết owner (2026-06-16):**

(a) **Payroll → vào app.** KHÔNG migration (mọi cột đã có prod: employees=32 / contracts=0 / periods=0 / entries=0). Blocker thật = `employment_contracts=0` ⇒ `calculatePayroll` luôn báo "không có hợp đồng" (`payroll-actions.ts:139-185`) + `employee-form-dialog` không thu lương/ID/bank (server `createEmployee` ĐÃ nhận đủ — chỉ client form thiếu). Build: (i) sửa form (profile-picker thay UUID thô + base_salary/id_number/bank/dependents/contract_type) + thêm `updateEmployee` + Edit dialog [T2]; (ii) **surface hợp đồng lao động** (`contract-actions.ts` + `contract-dialog`, ghi `insurance_base_salary`/`gross_salary`/dates) [T3 — unblocker thật]; (iii) Overview tab thật (KpiCard + StatusBadge domain `payroll-period` mới) [T2]. Dùng `calculatePayrollEntry` (versioned legal tables — KHÔNG hardcode rate). Debt: `calculatePayroll` upsert non-transactional (`payroll-actions.ts:291`) = T3 riêng trước go-live. **Phụ thuộc:** đi sau/khớp HRM redesign D026/D027 (chạm cùng file HR). Quyết owner sau: hồ sơ chủ HKD có lập HĐ + payroll entry? (tax-vn: BHXH chủ hộ doc-only).

(b) **Runner = đồng hồ chờ, chỉ hiện đơn ĐANG LÀM; KHÔNG lane ready + đổi nhãn.** GIỮ filter `['pending','preparing']` (không thêm `ready`); `resolveRunnerListStatus` giữ "Đang chờ"; **đổi tên khỏi "Gọi số"** (vd "Đơn đang làm"/"Bếp đang làm") để khỏi gợi ý pickup-board. Thêm thang tuổi (age escalation kiểu KDS `getAgeStyle`) + xử lý overflow (xoay/nén) để không giấu đơn chờ lâu. [T2, không migration].

(c) **POS: bỏ hẳn `customer_count` (số khách) + thêm tách hóa đơn (bắt buộc).** customer_count: write-path đã chết nhưng **chưa dọn** — còn ~11 chỗ đọc + mirror in 3 chiều ⇒ dọn code [T2] (`order-reads.ts` ×4, `bill-receipt-summary`, `use-order-sync`, `pos-sessions`, `finance/revenue/[date]`, `print-render` `document-render`+`payloads` + SQL print-fn; regen i18n baseline) → migration drop column `orders.customer_count` + param RPC [T3, sau khi code sạch]. `tables.capacity` (số chỗ) ĐÃ bỏ + test-guard — KHÔNG đụng. **Tách hóa đơn** = N partial payment/đơn (split-by-amount; split-by-item dùng `split_order` có sẵn). **1 migration T3 nguyên tử**: DROP `idx_payments_order_active` + nới gate amount==total ở `create_payment`/`confirm_cash_payment`/`confirm_vietqr_payment` (0<amount<=remaining) + viết lại `complete_payment_and_consume_stock` (bỏ check ABS>1) + RPC mới `record_partial_payment` (FOR UPDATE + SUM, lock thay index — phải ship CÙNG migration). Order flip 'paid' chỉ khi SUM(completed)>=total. UI: `bill-receipt-sheet` mode "Thanh toán một phần". Owner-default (ghi để khỏi chặn): status 'partial' = **derive-at-read** (ít blast-radius hơn thêm enum); đơn trả-một-phần **KHÔNG** cho split/merge tới khi định nghĩa rõ; QR/MoMo phải encode/khớp số tiền tender.

(d) **Đưa danh tính HKD vào UI + bỏ 3 field chết.** SSoT định danh người bán = **`tenants.legal_name`/`tenants.tax_code`** (+địa chỉ) per `legal-framework-2026.md:66` — KHÔNG phải `system_settings`. Card "Định danh hộ kinh doanh" (owner-only) đọc/sửa `tenants`; print-render + mọi hiển thị người bán đọc từ đó thay literal `''`; dọn 3 literal chết. **KHÔNG** đụng payload Viettel / KHÔNG thêm `SELLER_*` env (docs cấm khi chưa có tài liệu Vinvoice riêng). 3 field chết General (`service_charge`/`store_phone`/`store_email` — prod rỗng, không consumer) → bỏ khỏi `settings-form` + `GENERAL_SYSTEM_SETTING_KEYS`. [T2; gửi `sellerInfo` cho Viettel = T3 gated, chờ HDSD Viettel].

(e) **VAT — DERIVE theo bậc, KHÔNG hardcode (sửa hướng 2026-06-16 theo chỉ đạo owner).** Owner bác cả 2 sai của agent: (1) định "đổi `vat_rate` 8→2,4 + guard" = lặp đúng sai lầm gốc (thay số-cứng này bằng số-cứng khác); (2) đi hỏi kế toán xác nhận số — thừa, vì **8% là phương pháp khấu trừ → HKD trực tiếp KHÔNG BAO GIỜ xuất 8%** (rõ từ `einvoice-tax.md §2`, không cần hỏi). **Sai lầm gốc = `vat_rate` bị fix cứng** (8.00 ở `menu_items` + 3.111 HĐ). Giải pháp đúng = **resolver versioned, suy ra rate theo `bậc doanh thu × ngày hiệu lực × ngành (ăn uống)`** — tự thích nghi khi doanh thu vượt/rớt ngưỡng hoặc luật đổi, KHÔNG hardcode, KHÔNG hỏi:
- ≤ 1 tỷ/năm → **miễn GTGT/TNCN (0)** [NĐ 141/2026].
- > 1 – 3 tỷ (nhóm 2) → GTGT **3% gốc / 2,4% tạm đến 31/12/2026 (tự về 3% từ 01/01/2027)**, TNCN 1,5% [NĐ 68/2026 + NQ 204/2025 + NĐ 174/2025 + einvoice §2].
- > 3 tỷ (nhóm 3) → TNCN **(DT − CP) × 17%** [NĐ 68/2026].

Doanh thu năm = **ước lượng từ dữ liệu** (HĐ issued / paid revenue), không hardcode/không hỏi. Mirror pattern đã có `packages/shared/src/payroll/legal-versions.ts` (versioned `effectiveFrom`) → luật đổi = thêm 1 version. Thay rate fix ở `menu_items.vat_rate`(8.00) / `tax_invoices` / invoice-compute (HĐĐT line-items) / KPI-bucket `get_revenue_kpis` bằng output resolver tại thời điểm phát hành. **T3** (tiền/pháp lý + đường HĐ). 3.111 HĐ cũ ở 8% = **sửa-tiến** (HĐ mới dùng resolver); đối soát hồi tố = việc kế toán/kê khai (flag, KHÔNG tự ghi đè HĐ đã phát hành). Build đang tiến hành (map doc-grounded trước, cite văn bản — không đọc trí nhớ).

(f) **Hạ ưu tiên (từ verify):** refund `reverse_payment_and_post` sum-guard = T3 defensive low-prio (hiện unreachable); `refundOrderPayment` 2 RPC non-atomic → orphan pending refund = rough-edge riêng (owner chọn gộp RPC hay UI resume). KDS/checkout concurrency = đóng (không việc).

**Quan hệ:** nối D023 (sửa-sai POS), D026/D027 (HRM → payroll nguồn lương cho D028), D028 (finance cockpit số đúng — food-cost grain là gap còn lại của D028), D029 (₫ wave bao trùm double-glyph inventory), D030 (DataTable/StatusBadge/KpiCard wave + HR active-zone off-limits).

**Gate:** mỗi stream theo T-tier ghi trên; T3 (payroll-contract, split-bill, food-cost MV, drop-column) chạy four-perspective debate + migration file→PR→owner→`pnpm db:types` (D015, không dev DB).

**Plan thực thi chi tiết (track + thứ tự + acceptance criteria):** `docs/plan/ux-ia-remediation-2026-06.md`. Đảo bất kỳ phán quyết (a)-(f) → sửa D031 trước.

**Status:** Phán quyết chốt + verify xong + master plan ghi. Bắt đầu Track A (money-safety + bug prod thật).

**Thực thi apply prod (2026-06-16, owner-delegated session apply per `database.md` §Owner-Delegated Production Apply):** owner uỷ quyền apply migrations trong session. Precondition prod: chỉ còn `20260616100000` pending (D028 `20260615140000`+HRM `…130000–181000` đã apply trước đó). Apply `20260616100000_drop_orders_customer_count` qua org-scoped `apply_migration` (guard tạm `process.exit(0)` rồi restore byte-for-byte — git diff guard+settings CLEAN), chia **6 chunk tại ranh giới statement, DROP COLUMN cuối isolated** (prod không vỡ giữa chừng). Verify: `orders.customer_count` đã drop (0 cột), 9 đối tượng recreated đúng signature mới (signature cũ có `integer` param đã biến mất), `mv_daily_revenue` REFRESH lại = 86 rows populated, `get_advisors security` = 0 finding MỚI (152 đều pre-existing: SECURITY-DEFINER-RPC posture + MV-in-API), `pnpm db:types` regen = **0 diff** vs hand-edit đã commit (xác nhận types khớp prod), typecheck 7/7. T=Tài chính/POS T3.
