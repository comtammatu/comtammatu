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
   canonical = `/br/[branchId]/settings/*` (matrix:49,80); chuyển
   `/admin/settings/{tables,pos,kds,printers}` thành redirect shim. (b) Kỳ kế
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
