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

**Decision:** Runtime dùng cloud-first + PWA cache cho offline cơ bản. Local-first (mini PC + SQLite + sync) không nằm trong current product scope sau D012.

**Consequences:** Ship nhanh hơn, validate business logic trước. Muốn mở lại local-first/offline POS phải sửa D012 trước, kèm số liệu vận hành chứng minh nhu cầu thật.

## D009: Path-based routing, không sub-domain (2026-04-04)

**Context:** Cân nhắc sub-domain per module (pos.comtammatu.com, kds.comtammatu.com). Phân tích:

- Sub-domain: auth phức tạp (cross-origin cookies), CORS, wildcard cert, DNS records, dev env phức tạp
- Path-based: 1 domain, auth "just works", proxy.ts ACL tập trung, đã có sẵn
- Team 1 người, monorepo, cùng Supabase Auth → không cần tách deploy

**Decision:** Giữ path-based routing (`/admin/*`, `/br/[branchId]/pos`, `/br/[branchId]/kds`). Sub-domain không nằm trong backlog hiện tại.

**Consequences:** Đơn giản, ship nhanh. Muốn tách sub-domain sau này phải có quyết định mới vì nó kéo theo auth/cookie/CORS/DNS/deploy surface.

## D010: RHF + zod + shadcn Field cho mọi form, helpers ở app-local (2026-04-17)

**Context:** ~40 form dialogs rải trong app dùng lẫn lộn `useState-per-field + useTransition`, `useActionState + form action`, `CrudDialog` wrapper. Mỗi pattern có error handling khác nhau, a11y không đồng đều, validation chỉ chạy server-side (trễ).

**Decision:** Migrate toàn bộ form sang `react-hook-form 7.72 + zod 4 + @hookform/resolvers 5 + shadcn Field primitives`. Tạo app-local helpers ở `apps/web/app/components/form/`:

- `TextField`, `NumberField`, `SelectField`, `TextareaField` — useController-based field wrappers
- `FormDialog` — generic Dialog wrapper (schema + defaultValues + onSubmit render-prop)
- `valuesToFormData` — adapter cho `withFormAction`-wrapped server actions

Helpers ở `apps/web/` (không ở `packages/ui`) vì: bind với RHF + dự án-specific field components (FormattedNumberInput VND).

**Consequences:** Client-side validation trước submit. A11y tự động (aria-invalid, role="alert", htmlFor). Schema-as-truth — không duplicate type + validation. Mỗi dialog CRUD giảm ~20-30% LOC sau helpers. Breakeven tại ~3 dialogs migrated.

**Current state:** RHF helpers là baseline cho CRUD dialog mới và các form đã migrate. Import/export one-field upload và GRN mobile wizard không dùng helper chung vì flow nhập liệu khác shape.

## D011: Print-agent LAN-only transport (2026-05-07)

**Context:** Mỗi chi nhánh dùng một máy Android Super App đã link terminal làm gateway vận hành; máy in dùng LAN. USB transport không còn production payoff và làm tăng surface area vận hành.

**Decision:** `apps/print-agent` chỉ hỗ trợ LAN printer transport. Không giữ runtime flag chọn transport, không giữ USB capability columns, và không giữ USB native binding.

**Migration:** `20260507083322_drop_printer_usb_and_transport.sql` xoá `AGENT_TRANSPORT`, `printer_agents.transport`, `printers.usb_vendor_id`, `printers.usb_product_id`, và `apps/print-agent/src/usb.ts`.

**Consequences:** Branch rollout tập trung vào terminal-linked Android gateway + LAN printer config; không có fallback USB trong runtime hoặc docs active.

## D012: Tier-2 trim + gộp role POS — định hướng phần mềm hỗ trợ Hộ Kinh Doanh (2026-06-10)

**Context:** Sau khi vận hành thật (≈70–75 đơn/ngày trên prod), owner chốt lại phạm vi sản phẩm: đây là phần mềm HỖ TRỢ vận hành Hộ Kinh Doanh, không phải nền tảng F&B đa năng. Dữ liệu prod xác nhận: 14 tài khoản `cashier` vs 2 `waiter` (cùng một người làm cả hai việc trong thực tế), `shift_assignments` = 0 dòng từ trước tới nay (chia ca chưa bao giờ là workflow thật — đã xử lý bằng ca mặc định khi chấm công).

**Decision:**

1. LOẠI BỎ khỏi backlog (không đề xuất lại): Local-First / offline POS (mini PC + SQLite — fiber ổn định, D008 đã ghi internet hiếm khi mất), VNPay (VietQR + MoMo đã đủ phương thức; vấn đề thật là đối soát tiền về), Native POS migration Flutter/Capacitor (PWA đang chạy production ổn).
2. GỘP role Thu ngân + Phục vụ thành 1 role POS. Code hiện còn tách `cashier`/`waiter` (`packages/shared/src/auth/types.ts`, `module-acl.ts`, role templates) — việc gộp trong code là task T3 (auth/ACL/template/RLS) cần migration riêng.
3. Mọi đề xuất tính năng mới phải qua phễu "phần mềm hỗ trợ HKD": giảm thao tác hằng ngày của chủ + nhân viên hiện có; không thêm nghi thức quản trị (phân ca, duyệt nhiều tầng, kế toán doanh nghiệp) mà HKD không dùng.

**Consequences:** Tracker Tier-2 đã rút gọn tương ứng. Threat-model quyền POS đổi theo: khi role đã gộp, mọi người đứng quầy đều có quyền xác nhận thanh toán — việc siết `create_payment` RPC theo `pos:confirm_payment` trở thành hygiene khi gộp role, không còn là lỗ hổng vận hành giữa hai role. Các surface gắn với chia ca (đăng ký ca, duyệt phân ca) không wire thêm; giữ hướng ca-mặc-định.

## D013: Kế toán (khóa kỳ) giữ ngoài nav admin mặc định (2026-06-11)

**Context:** Default Admin nav là bề mặt điều hành HKD hằng ngày. Khóa/mở kỳ kế toán là direct-support cho owner, không phải workflow mặc định trong sidebar.

**Decision:** Mục Kế toán KHÔNG nằm trong nav admin mặc định. Route `/admin/accounting/*` vẫn truy cập trực tiếp theo quyền (`accounting` module ACL: owner/super_manager) — chỉ không có lối vào điều hướng. Đây là áp dụng phễu D012 ("không thêm nghi thức quản trị kế toán doanh nghiệp mà HKD không dùng").

**Consequences:** `packages/shared/src/auth/nav-config.ts` không expose entry nav `accounting`; guard test `scope.test.ts` giữ nguyên làm chốt chặn. Muốn đảo lại phải sửa quyết định này trước, rồi sửa test cùng PR.

**Status (2026-06-19):** ĐẢO CHIỀU bởi **D034** — owner chốt gỡ hẳn bề mặt accounting/khóa-kỳ khỏi app (không chỉ ẩn nav). Permission `accounting:period_reopen` + RPC DB giữ lại.

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
3. Harvest một chiều từ matu-platform, ở mức spec + migration chọn lọc, viết lại theo convention `with-action.ts`/RPC hiện hành. Danh mục được duyệt: pgTAP harness + CI test-db; idempotency_keys + webhook event-claim-before-side-effect; inventory ledger-based — tận dụng cửa sổ prod inventory 0 dòng; HĐĐT worker pattern (queue/retry/awaiting_lookup, vault credentials, token cache, mock-block prod); PBAC anti-escalation; reports net-profit-daily shape. PR harvest bê nguyên khối code không viết lại theo convention là vi phạm quyết định này.
4. Active follow-up is tracked in `tasks/todo.md`; this decision only keeps the in-place production system and one-way harvest boundary.

**Consequences:** Chấm dứt re-litigate hướng platform. Mọi đề xuất rebuild/cutover sau này phải sửa quyết định này trước, kèm số liệu chứng minh thắng phương án absorb.

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
Ma trận canonical: `docs/spec/role-route-matrix.md`.

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
"Vận hành") nhưng để "plan chi tiết lập sau W4". Audit đa-tác-tử xác định gốc tái-drift:
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
2. **Một capability = một route home** theo `role-route-matrix.md`. Branch-floor
   settings (tables/pos/kds/printers/pos-sessions) có nhà canonical là
   `/br/[branchId]/settings/*`; Tenant Admin Settings giữ `general`,
   `branches`, `payments`, và tenant printer support only. Owner đi từ branch
   table sang branch setup bằng link "Thiết lập chi nhánh" của từng branch.
   Accounting/period-close không còn app route hiện hành; D034 là quyết định
   current cho lớp đó.
3. **Padding một chủ = `AppPage`** (formalize `design-system.md:213`). `AppShell`
   main bỏ outer padding; `AppPage` nesting-aware; trang lá không tự đặt `p-*`
   gốc.
4. **Nav là data, không phải code per-shell**: mọi sidebar/bottom-nav project từ
   `nav-config.ts` qua resolver chung; cấm `ShellNavGroup[]` literal trong shell.
5. Hợp đồng cấu trúc chi tiết: `docs/spec/design-system.md` § Structural
   Governance. Theo pattern D014: mỗi luật kèm ratchet baseline-đóng-băng-chỉ-giảm
   trong `scripts/check-ui-contract.mjs`. Cổng Stage 0: `shell-registry`,
   route-manifest reachability, page-padding, `nav-acl`, và gỡ mù regex status.

**Scope của bản ghi này:** quyết định + hợp đồng (cập nhật `design-system.md`
§ Structural Governance + bản ghi này). Stage 0/1 code đã bắt đầu trong checkout
`codex/ui-component-governance`; trạng thái thực thi hiện tại xem
`docs/plan/ux-ia-remediation-2026-06.md` và `tasks/todo.md`, không dùng đoạn
quyết định này để mở lại việc đã có code.

**Consequences:** W5 có plan chi tiết để thực thi theo thứ tự governance-first
(khoá cổng trước, cleanup sau). Khi cổng land, shell/route/nav mới phải qua cổng.
Branch Manager trải nghiệm Branch Command + Branch Setup là một luồng L1, không
lạc vào trang hình-Admin. Triệu chứng tầng token (clone status/VND/raw Table)
thuộc vệ sinh ratchet W1–W4 — burn-down riêng, ngoài W5. Đảo bất kỳ điểm nào (cho
phép shell thứ 3, đổi padding owner, đổi route home) phải sửa quyết định này
trước.

## D020: Enterprise Accounting / TT 200 / VAS is outside the HKD product (2026-06-13)

**Context:** Má Tư is a Hộ kinh doanh. Under the current HKD frame, the product
needs operating finance, HĐĐT, expenses, payroll, and accountant exports; it does
not need an enterprise double-entry accounting subsystem.

**Decision:**

1. Enterprise accounting / TT 200 / VAS is not part of the current product contract.
2. Current Finance authority is HKD operating finance: `/finance`, revenue,
   food-cost signal, operating expenses, cash summary, HĐĐT register, B2C
   summary trigger, supplier-invoice/AP handoff, and accountant export support.
3. `accounting_periods` period close/reopen remains database-only owner support;
   no current app route exposes it.
4. Reintroducing enterprise-accounting reports, master-data operations, or
   double-entry workflows requires amending this decision and ADR 0006 first.

**Migration order:** ADR 0006 owns the executed migration-chain ordering and
fresh-environment implications. Do not duplicate that chain here.

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

## D022: HĐĐT lập realtime tại payment; không dùng nháp-local sau thanh toán (2026-06-14)

**Context:** POS phát hành HĐĐT per-order realtime khi payment hoàn tất. Owner cần
giảm lỗi vận hành như bấm nhầm phương thức thanh toán, bấm thanh toán trước khi
khách kiểm tra, hoặc sai số tiền. Cổng pháp lý đã chốt: thời điểm lập HĐĐT khởi
tạo từ máy tính tiền cho dịch vụ ăn uống là **tại thời điểm thanh toán hoàn tất**
(`einvoice-tax.md` §1.1).

**Decision:**

1. Giữ phát hành **realtime per-order tại payment** qua `createInvoice`.
2. Không triển khai `hddt_issuance_mode='deferred_batch'`,
   `createDraftTaxInvoice`, `issueDraftBatch`, hay cron phát hành lô để trì hoãn
   việc lập HĐĐT cho khách.
3. Gộp lô cuối ngày chỉ có thể áp dụng cho chuyển dữ liệu HĐĐT máy tính tiền lên
   CQT nếu có một quyết định riêng; không dùng nó để cấp số/giao HĐ cho khách
   muộn hơn payment.
4. Sửa sai sau phát hành đi qua luồng owner/accountant: hủy, thay thế, hoặc điều
   chỉnh theo TT 32/2025. Cashier-facing chỉ được thêm guardrail trước payment;
   chi tiết ở D023.

**Gate:** Đảo quyết định này là T3 money + tax workflow, phải có xác nhận kế
toán và cập nhật `docs/ref/einvoice-tax.md` trước khi code.

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
  record fix**: post-D020 không có enterprise-accounting ledger; method "3"=TM/CK hardcode trên HĐĐT ⇒ HĐĐT đã
  phát hành KHÔNG bị ảnh hưởng (xác minh `viettel-sinvoice.ts:591`). Gate T3:
  typecheck/lint/build xanh. **Migration ĐÃ áp prod** (verify 2026-06-15:
  `correct_payment_method` sống trên prod; ledger ghi dưới name
  `20260615120000_correct_payment_method` ở version `20260614213338` — lệch
  version↔name, cần back-fill ledger theo baseline-first); type hand-add tạm vào
  `database.types.ts` (chạy `pnpm db:types` để khớp). ⚠️ Chưa smoke-test live.

**Còn lại:** không còn hạng mục correction owner-level tồn đọng. Migration
`20260615120000` đã áp prod; đường refund + sửa-phương-thức cần owner **smoke-test
live** (prod: 0 refund, 0 correction) + back-fill ledger version↔name trước khi tin dùng.

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
4. `+60%/n=15` là benchmark tác giả tự chấm ⇒ chỉ là input tham khảo, không phải bằng chứng vận hành.

**Lấy ý tưởng (design-time, vào shared docs):** QA cross-boundary taxonomy + incremental
coherence (`workflow.md`); re-runnable-skill descriptions, generalize-don't-overfit,
per-call-model, near-miss routing tax-vn (`skills.md`).

**Cải tổ rule (rule là mutable):**
- `workflow.md`: Skill Plan Gate → MUST(T3)/SHOULD(T2); Verification 2-3 → advisory +
  attestation bắt buộc (gate thật chỉ `pnpm` + CI xanh); Four Perspectives → chọn lens theo
  risk type.
- `scripts/check-review-tier.mjs` (`pnpm lint:review-tier`) — floor tier deterministic theo
  blast-radius, **warn-only** cho đến khi `REVIEW_TIER_STRICT=1` được owner bật fail-closed.
- `tasks/regressions.md`: bỏ framing "low retire = fail"; `pnpm regressions:retire-candidates`
  lister read-only (KHÔNG auto-gate item-3 dead-ref).
- Ghi nhận nguyên tắc tách goal/refactor theo ranh giới sản phẩm, không theo số dòng thay đổi, trong `skills.md`.

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

**Status:** RESOLVED — owner chốt "lấy ý tưởng, không cài tool"; tier guard đang warn-only. Agent Teams là capability tùy chọn cho Claude, không phải policy load-bearing.

## D026: HRM redesign — trục Người · Ngày công · Lương + 4 quyết định nền (2026-06-15)

**Context (snapshot 2026-06-15, không phải task hiện tại):** Owner phản hồi UX HRM vẫn khó cho cả quản lý lẫn nhân viên. Debate đa tác tử (workflow `hrm-debate`, 18 agents, phản biện đối kháng) verify code + prod (`iexwsuaqqenyjiskawoj`, 2026-06-15): 46/46 attendance `present` (taxonomy late/absent/half_day là code chết), 33/46 `shift_id` NULL, 16 ca treo, `employment_contracts`/`payroll_periods`/`payroll_entries` = 0 (lương xử lý ngoài app ở thời điểm audit), `standard_days` đếm chỉ T2–T6 (sai vì quán mở 7 ngày), 6/32 NV có checklist, payroll chưa có lối vào rõ.

**Decision:**

1. **Ngày công chuẩn:** `standard_days` = số công chuẩn CỐ ĐỊNH owner nhập theo tháng (thay vì đếm T2–T6) + **clamp** `working/standard ≤ 1` (lương prorate KHÔNG vượt base trừ khi có chính sách trả thêm cuối tuần). Trích thành helper shared dùng chung payroll + hiển thị ngày công.
2. **Checklist:** GIỮ. Gán theo `positions.code` làm **mặc định** + override theo người (`employees.default_checklist_template_id`). Dựng cơ chế gán theo vị trí (RPC `apply_checklist_template_to_role` hiện chỉ match template Global → mở rộng nếu cần template chi nhánh).
3. **Lương vào app qua `employees.base_salary`:** thêm UI nhập `base_salary` + `dependents_count` vào hồ sơ NV; gỡ phụ thuộc 0-contract trong `calculatePayroll` (eligibility theo base_salary, KHÔNG khôi phục UI `employment_contracts`). BHXH đơn giản; contract/BHXH đầy đủ để sau nếu cần. → ĐẢO phần "LOẠI field salary trong form" của debate (owner quyết).
4. **Ca làm:** GIỮ nhưng hạ xuống nhóm "Thiết lập" (ít chạm), KHÔNG ngang hàng tab hằng ngày. Màn nhân viên hiện giờ check-in/out THỰC; ca chỉ là nhãn phụ, ẩn khi `shift_id` NULL. KHÔNG bỏ ca, KHÔNG xây lại phân ca.

**IA:** gom 5 tab `/hr` (theo bảng) → **3 trục theo công việc**: Người · Ngày công · Lương. Ca + mẫu checklist → "Thiết lập". `defaultTab` động (owner→Người, BM→Ngày công). Khi W5 gộp `/hr`→`/ops` (Hoàng): mang Người+Ngày công+Thiết lập, tách Lương ở lớp Quản trị owner.

**Consequences:** HRM work is scoped to truthful daily attendance, checklist-by-position, employee CRUD, leave notifications, and payroll via `base_salary`. D012 still applies: KHÔNG rostering/auto-late/auto-absent/số dư phép/duyệt nhiều tầng. Đảo quyết định phải sửa D026 trước.

**Còn mở (chưa chốt — owner trả lời sau):** (a) payroll đưa vào nav discovery hay giữ direct-support; checkout hiện đã có tab/link `/hr` → `/hr/payroll` nhưng chưa gated; (b) gộp `/admin/staff` + `/hr`-employees ngay hay chờ W5 IA; (c) ảnh selfie check-in có ai xem/dùng không (nếu không → cân nhắc bỏ).

## D027: Chấm công theo CA (per-shift), không theo ngày — 2 ca/ngày là mô hình thật của Má Tư (2026-06-15)

**Context:** Owner xác nhận sự thật vận hành chưa từng ghi trong repo: **toàn bộ nhân viên Má Tư làm 2 ca/ngày** (sáng 06:00–13:00, chiều 16:00–21:00, nghỉ trưa 13:00–16:00). Mô hình hiện tại ràng buộc **1 bản ghi chấm công/người/ngày** (unique `employee_id,date,tenant_id`) → KHÔNG ghi nổi 2 ca. Bằng chứng prod (`iexwsuaqqenyjiskawoj`, SELECT-only, 2026-06-15, 47 bản ghi / 14 NV / 7 ngày): span vào→ra TB **7.0h** (= một ca, không phải 6→21), **23/47 (49%) không check-out**, check-in tách 2 cụm (5–7h và 18–21h) nhưng mỗi người/ngày chỉ ghi được MỘT, tổng bản ghi 47 (lẽ ra ~196 phiên) → adoption thấp vì hệ không khớp cách làm. Việc này ĐẢO giả định nền của D026 (1 lần chấm/ngày = 1 công) và GỠ phán đoán "Ca làm gần như vô nghĩa" của debate ban đầu.

**Decision:**

1. **Đơn vị chấm công = CA, không phải NGÀY.** Mỗi ca = 1 bản ghi `attendance_records`. Unique đổi `(employee_id, date, tenant_id)` → `(employee_id, date, shift_id, tenant_id)`; `shift_id` NOT NULL cho dòng mới. Migration: backfill `shift_id` cho dòng cũ (theo `resolveDefaultShiftId` từ `check_in`) trước khi đổi constraint.
2. **Ca làm = XƯƠNG SỐNG, đặt ở "Thiết lập", phạm vi Global.** 1 bộ ca dùng chung cả 4 chi nhánh (owner chốt giống nhau). `shifts.branch_id` cho phép NULL = global (như checklist template); seed 2 ca global. `resolveDefaultShiftId` đọc ca global (+ override chi nhánh nếu sau này có). Auto-nhận ca theo giờ check-in. GỠ phán đoán "ca ít giá trị" của D026 §4 (vẫn đặt ở Thiết lập vì ít-chạm, nhưng vai trò là NỀN).
3. **Ngày công:** đủ 2 ca = **1 công**; 1 ca = **nửa công (0.5)**. `half_day` lần đầu có nghĩa thật. `working_days = Σ_ngày( min(số_ca_có_mặt, 2) × 0.5 )`. `standard_days` = số ngày công chuẩn/tháng owner nhập (D026 §1, đếm theo NGÀY) + clamp ≤ standard.
4. **Chấm công UX = mỗi ca vào/ra riêng (4 mốc/ngày):** vào sáng → ra trưa → vào chiều → ra tối. `today-work-state` thành máy trạng thái 2-ca/ngày (mỗi ca có vòng not_started→working→pending→done riêng). checkout/`cancelCheckoutRequest` thao tác trên ca đang mở. clock-in: tìm ca theo giờ → nếu ca đó chưa có bản ghi hôm nay thì tạo mới (không còn "đã chấm hôm nay" chặn ca thứ 2).
5. **Checklist theo từng ca:** snapshot checklist riêng cho mỗi bản ghi ca (sáng/chiều khác nhau được). Hợp với D026 §2 (gán theo `positions.code`).

**Consequences:** Đảo thứ tự ưu tiên HRM: **Thiết lập Ca (Global, đủ 2 ca) → chấm công per-shift → ngày công → lương** — Ca là bước 1, không phải mục bị hạ. T3 schema-changing migration → file → PR → owner applies (env dev trỏ prod, KHÔNG test local). Refine D026: §1 giữ (standard_days config), §4 "ca ít giá trị" GỠ. Đợt-1 (a) "Số công = số dòng" tạm thời chưa đúng (1 dòng giờ = 1 ca) → sửa thành công = Σ ca/2 sau rework; nhãn tạm thời ở SummaryView cần ghi chú. Đảo quyết định phải sửa D027 trước. Mở rộng (không đảo) D026.

## D028: Kiểm soát nguyên liệu = đếm thực tế (giữ D016) + lát "tài chính trước" — sổ chi phí, lợi nhuận ròng/thực tế, tiền mặt hiện hữu (2026-06-15)

**Context:** Owner nêu 2 nhu cầu: (1) kiểm soát nguyên liệu tiêu hao 1 ngày + cập nhật tồn kho; (2) chỉ số tài chính: lợi nhuận ròng, lợi nhuận thực tế, tiền mặt hiện hữu. Khảo sát CODE + PROD (`iexwsuaqqenyjiskawoj`, SELECT-only, 2026-06-15):

- **Kho:** hạ tầng đầy đủ (ingredients/recipes/stock_levels/stock_movements/stocktake/stock_issues/transfers/PO-GRN) nhưng **prod 0 dòng mọi bảng** (ingredients=0, recipes=0, stock_levels=0, stocktake_sessions=0) → module **chưa từng chạy thật**. Đúng tiền đề **D016** (POS không trừ kho vì kho rỗng).
- **Tài chính:** doanh thu thật (5.898 payment completed, 4.990 tiền mặt ~85%); **bảng `expense`/`expenses` KHÔNG tồn tại** (`fetchOperatingExpenseTotal` [finance-cockpit.ts:182] hardcode `0`; ô "Chi vận hành" đã render sẵn ở `/finance` + `/admin/dashboard` nhưng nguồn rỗng); cockpit **chưa có field `netProfit`** (`grossProfit` mới = net_revenue − giá vốn); giá vốn hiện = 0 (food-cost MV rỗng vì recipes/GRN trống); lương chưa vào hệ (D026: `payroll_entries`=0, còn Excel); **0 sổ tiền-ra / 0 quỹ chạy** (`cash_movements`/`cash_reconciliation`/`cash_ledger` đều không tồn tại) dù đầu-vào tiền mặt giàu dữ liệu (356 ca đóng có `closing_cash`). NCC đã có `supplier_invoices` (chứng từ chi phí NCC) riêng.

**Phán quyết owner (2026-06-15, qua 2 câu hỏi định hướng — chọn 2 phương án "đề xuất"):**

1. **Nguyên liệu tiêu hao = ĐẾM THỰC TẾ, KHÔNG định-mức-POS-tự-trừ.** Đo bằng kiểm kê: tiêu hao = tồn đầu + nhập − tồn cuối, dùng đúng module stocktake (mode `daily`) + stock_issues đã có. **GIỮ D016** — KHÔNG bật `consume_stock_for_order`/recipe-based auto-deduct (Approach "định mức" owner đã loại; muốn bật sau phải sửa D016 + có định mức chuẩn). Kích hoạt module = bài toán **seed dữ liệu** (vài món chủ lực + tồn đầu), không phải viết tính năng.
2. **Thứ tự: TÀI CHÍNH TRƯỚC** (nhịp 1-dev). Phạm vi lát này:
   - (a) **Bảng `expense`** — sổ chi phí đơn (đúng D020), cho chi phí vận hành NGOÀI NCC. Nối D015 §gap-2 + D020 §3. Implement `fetchOperatingExpenseTotal` đọc bảng này → "Chi vận hành" bật ở cả 2 dashboard.
   - (b) **Lợi nhuận ròng** (theo phát sinh) = lãi gộp − chi vận hành − lương − thuế → thêm field `netProfit` + card vào cockpit.
   - (c) **Lợi nhuận thực tế** (theo tiền mặt) = tiền thực thu − tiền thực chi trong kỳ (hợp ghi sổ đơn HKD TT 152/2025).
   - (d) **Tiền mặt hiện hữu** = quỹ đầu kỳ + thu tiền mặt − chi tiền mặt (tổng hợp từ `closing_cash` + vế chi tiền mặt của `expense`/trả NCC).
   - Tạm thời: **giá vốn nhập tay** tới khi module kho (mục 1) chạy; **lương** tạm là một danh mục của `expense` tới khi D026 đợt-3 populate `payroll_entries` rồi cockpit chuyển nguồn.

**Quan hệ quyết định:** Mở rộng (KHÔNG đảo) D015 P0-2 + D020 §3. GIỮ D016 (không đụng POS stock leg). Nối D026/D027 (payroll vào hệ = nguồn "lương" tương lai cho P&L). Định nghĩa metric quản trị ("doanh thu" cho P&L = HĐĐT issued vs tiền thu; các khoản trừ của "lợi nhuận") vẫn là việc owner chốt — tạm dùng net (subtotal−discount, trước VAT) cho lãi theo phát sinh + tiền thu cho lãi tiền mặt để không chặn build; chốt chính thức trước khi khóa số.

**Gate:** T3 (finance + money + schema mới + RLS). "Spec rồi code" (chuẩn D021). Migration **file → PR → owner applies trên prod** (không dev DB — D015); chỉ chứng minh được typecheck/lint/build + unit, owner smoke-test số thật sau apply. Đảo quyết định (chọn định-mức-POS / đổi thứ tự / bỏ expense) phải sửa D028 trước.

**Current status:** Finance cockpit owns operating expenses, net profit, actual cash profit, and current cash balance. `/finance/expenses` is the canonical expense entry surface. Cash balance uses owner-entered opening balance in `system_settings`; it must not guess from all historical cash payments. Expense-backed metrics require the `expenses` migration to exist in the target schema before they can be trusted from live data.

**Status:** Deliverable 1+2+3 code xong (sổ chi phí · lợi nhuận ròng · tiền mặt hiện hữu · lợi nhuận thực tế). Migration `20260615140000_add_expenses_table.sql` và generated types hiện có trong repo; trước khi tin live data ở môi trường nào, kiểm ledger/schema của môi trường đó và smoke `/finance/expenses`. Track **nguyên liệu đếm-thực-tế** (D028 §1) là pha kế theo thứ tự "tài chính trước".

## D029: Glyph tiền canonical = `₫` (U+20AB); vnd-format gate là render-SSoT, KHÔNG phải "money debt" về 0 (2026-06-15)

**Context:** `vnd-format-ssot` mixes two concerns: duplicate money formatting and legitimate non-money locale formatting (counts, quantities, dates, ratios). Treating the whole allowlist as "money debt to zero" creates false positives.

**Decision:**

1. Canonical money glyph is `₫` (U+20AB).
2. `vnd-format-ssot` is a render-governance gate, not a mandate to route every `vi-VN` formatter through `formatVND`.
3. App-wide glyph changes must update money render, print render, SQL/EMV mirrors, and receipt templates in one coordinated money-render wave.

**Consequences:** Do not chase the `vnd-format-ssot` allowlist to zero. Only duplicate money-format helpers are debt. Non-money formatters must stay typed to their domain. Changing glyph behavior without updating D029 is out of contract.

## D030: Meta gate-precision audit — allowlist = sàn false-positive, KHÔNG phải backlog về 0 (2026-06-15)

**Context:** Several UI ratchet gates intentionally include allowlisted patterns that are valid current implementation, not debt. Some gates also over-match because static regex cannot distinguish all valid JSX composition patterns.

**Decision:** `docs/spec/design-system.md` is the canonical source for per-gate semantics: healthy gates, reframe gates, mixed gates, and active-zone allowlists. Allowlist count is not a backlog by itself.

**Consequences:**

1. Do not chase reframe allowlists to zero.
2. Reconciling stale allowlist entries is allowed when actual count falls below the recorded floor.
3. Do not lower a gate below actual count or reinterpret a gate without updating `docs/spec/design-system.md`.
4. New UI debt should be fixed at the primitive/pattern level, not by adding route-local visual language.

## D031: Đợt remediation UX/IA toàn app — 5 phán quyết owner + đính chính từ verify (2026-06-16)

**Context:** Owner yêu cầu thiết kế lại tỉ mỉ bố cục/IA/direct-route/workflow/visual/spacing, **đặc biệt dữ liệu hiển thị từng màn**, ra vấn đề + giải pháp dứt điểm. Audit đa-tác-tử (16 agent, 100 page, verified vs CODE + PROD `iexwsuaqqenyjiskawoj` SELECT-only) → **185 finding** (5 critical / 40 high / 78 medium / 62 low; dimension lớn nhất = data-display 75). Pass verify (5 agent) chạy TRƯỚC khi chốt phán quyết, lật 2 hạng mục "đáng sợ":
- **ĐÍNH CHÍNH 1 — HĐĐT `sellerName` KHÔNG phải bug.** App không gửi `sellerInfo`; Viettel tự điền người bán từ tài khoản đăng ký (URL `supplierTaxCode`=`COMPANY_TAX_CODE`). Prod: 3.111 HĐ issued đều mang MST `077200004194`. `request.sellerName/sellerTaxCode/sellerAddress` (`finance/actions.ts:271`, `replace-invoice-actions.ts:300`, `hddt-daily-summary.ts:142`) là **input chết** — không bao giờ lên wire. Gỡ khỏi rủi ro pháp lý.
- **ĐÍNH CHÍNH 2 — Concurrency/idempotency đã khóa ở tầng DB.** POS double-pay / refund double / KDS double-bump / checkout double-approve đều có `FOR UPDATE` + precondition + partial unique index `idx_payments_order_active`; prod 0 ca trùng. **Đóng**, không sửa (thêm guard = churn trên T3 money RPC).

**Phán quyết owner (2026-06-16):**

(a) **Payroll → vào app theo mô hình HKD đơn giản.** KHÔNG migration cho cột lương căn bản (các cột đã có prod). Owner đã chốt không phụ thuộc `employment_contracts`: payroll đọc `employees.base_salary`, ngày công, `dependents_count`, và PIT legal-version; BHXH trong app = 0 cho scope hiện tại. Build: (i) form tạo/sửa NV thu `base_salary`/ID/bank/`dependents_count` + thêm `updateEmployee` [T2]; (ii) `calculatePayroll` eligibility `is_active && base_salary > 0`, 2 ca/ngày = 1 công, `standard_days` owner nhập + clamp, atomic RPC calculate+status trước go-live [T3]; (iii) overview/đối chiếu/export + StatusBadge `payroll-period` [T2]. Không build surface hợp đồng lao động trong phán quyết này. **Phụ thuộc:** đi sau/khớp HRM redesign D026/D027 (chạm cùng file HR). Quyết owner sau: chủ HKD có vào payroll app hay xử lý ngoài app.

(b) **Runner = đồng hồ chờ, chỉ hiện đơn ĐANG LÀM; KHÔNG lane ready + đổi nhãn.** GIỮ filter `['pending','preparing']` (không thêm `ready`); `resolveRunnerListStatus` giữ "Đang chờ"; **đổi tên khỏi "Gọi số"** (vd "Đơn đang làm"/"Bếp đang làm") để khỏi gợi ý pickup-board. Thêm thang tuổi (age escalation kiểu KDS `getAgeStyle`) + xử lý overflow (xoay/nén) để không giấu đơn chờ lâu. [T2, không migration].

(c) **POS: bỏ hẳn `customer_count` (số khách) + thêm tách hóa đơn (bắt buộc).** `customer_count` cleanup/drop đã được thực thi trong D3 (`c191cce4` + `20260616100000_drop_orders_customer_count.sql`); không mở lại như active work. Phần còn mở của (c) là **tách hóa đơn** = N partial payment/đơn (split-by-amount; split-by-item dùng `split_order` có sẵn). **1 migration T3 nguyên tử**: DROP `idx_payments_order_active` + nới gate amount==total ở `create_payment`/`confirm_cash_payment`/`confirm_vietqr_payment` (0<amount<=remaining) + viết lại `complete_payment_and_consume_stock` (bỏ check ABS>1) + RPC mới `record_partial_payment` (FOR UPDATE + SUM, lock thay index — phải ship CÙNG migration). Order flip 'paid' chỉ khi SUM(completed)>=total. UI: `bill-receipt-sheet` mode "Thanh toán một phần". Owner-default (ghi để khỏi chặn): status 'partial' = **derive-at-read** (ít blast-radius hơn thêm enum); đơn trả-một-phần **KHÔNG** cho split/merge tới khi định nghĩa rõ; QR/MoMo phải encode/khớp số tiền tender.

(d) **Đưa danh tính HKD vào UI + bỏ 3 field chết.** SSoT định danh người bán = **`tenants.legal_name`/`tenants.tax_code`** (+địa chỉ) per `legal-framework-2026.md:66` — KHÔNG phải `system_settings`. Card "Định danh hộ kinh doanh" (owner-only) đọc/sửa `tenants`; print-render + mọi hiển thị người bán đọc từ đó thay literal `''`; dọn 3 literal chết. **KHÔNG** đụng payload Viettel / KHÔNG thêm `SELLER_*` env (docs cấm khi chưa có tài liệu Vinvoice riêng). 3 field chết General (`service_charge`/`store_phone`/`store_email` — prod rỗng, không consumer) → bỏ khỏi `settings-form` + `GENERAL_SYSTEM_SETTING_KEYS`. [T2; gửi `sellerInfo` cho Viettel = T3 gated, chờ HDSD Viettel].

  - **ĐÓNG (d) — cập nhật 2026-06-16:** Card định danh (`tenants.legal_name`/`tax_code`) + bỏ 3 field chết = ĐÃ SHIP (verified). Phần "print-render hiển thị người bán đọc `tenants.legal_name`" = **BỎ theo owner** — KHÔNG phải gap đáng làm. Lý do (chốt, đừng nêu lại lần 3): trên HĐĐT, danh tính người bán do **Viettel S-invoice tự điền từ MST đăng ký** (`supplierTaxCode`=`COMPANY_TAX_CODE`, xem ĐÍNH CHÍNH 1); `sellerName` KHÔNG phải field API S-invoice. Chỉ cần `tax_code` đúng (prod 3.111 HĐ đều MST `077200004194`). Seller-name trên slip in không phải hạng mục compliance → không theo đuổi. **(d) đóng.**

(e) **VAT — DERIVE theo bậc, KHÔNG hardcode (sửa hướng 2026-06-16 theo chỉ đạo owner).** Owner bác cả 2 sai của agent: (1) định "đổi `vat_rate` 8→2,4 + guard" = lặp đúng sai lầm gốc (thay số-cứng này bằng số-cứng khác); (2) đi hỏi kế toán xác nhận số — thừa, vì **8% là phương pháp khấu trừ → HKD trực tiếp KHÔNG BAO GIỜ xuất 8%** (rõ từ `einvoice-tax.md §2`, không cần hỏi). **Sai lầm gốc = `vat_rate` bị fix cứng** (8.00 ở `menu_items` + 3.111 HĐ). Giải pháp đúng = **resolver versioned, suy ra rate theo `bậc doanh thu × ngày hiệu lực × ngành (ăn uống)`** — tự thích nghi khi doanh thu vượt/rớt ngưỡng hoặc luật đổi, KHÔNG hardcode, KHÔNG hỏi:
- ≤ 1 tỷ/năm → **miễn GTGT/TNCN (0)** [NĐ 141/2026].
- > 1 – 3 tỷ (nhóm 2) → GTGT **3% gốc / 2,4% tạm đến 31/12/2026 (tự về 3% từ 01/01/2027)**, TNCN 1,5% [NĐ 68/2026 + NQ 204/2025 + NĐ 174/2025 + einvoice §2].
- > 3 tỷ (nhóm 3) → TNCN **(DT − CP) × 17%** [NĐ 68/2026].

Doanh thu năm = **ước lượng từ dữ liệu** (HĐ issued / paid revenue), không hardcode/không hỏi. Mirror pattern đã có `packages/shared/src/payroll/legal-versions.ts` (versioned `effectiveFrom`) → luật đổi = thêm 1 version. Thay rate fix ở `menu_items.vat_rate`(8.00) / `tax_invoices` / invoice-compute (HĐĐT line-items) / KPI-bucket `get_revenue_kpis` bằng output resolver tại thời điểm phát hành. **T3** (tiền/pháp lý + đường HĐ). 3.111 HĐ cũ ở 8% = **sửa-tiến** (HĐ mới dùng resolver); đối soát hồi tố = việc kế toán/kê khai (flag, KHÔNG tự ghi đè HĐ đã phát hành). **ĐÓNG (e) — cập nhật 2026-06-16:** resolver `resolve_gtgt_rate` + shared mirror đã land; không còn việc đổi số cứng trong settings.

(f) **Hạ ưu tiên (từ verify):** refund `reverse_payment_and_post` sum-guard = T3 defensive low-prio (hiện unreachable); `refundOrderPayment` 2 RPC non-atomic → orphan pending refund = rough-edge riêng (owner chọn gộp RPC hay UI resume). KDS/checkout concurrency = đóng (không việc).

**Quan hệ:** nối D023 (sửa-sai POS), D026/D027 (HRM → payroll nguồn lương cho D028), D028 (finance cockpit số đúng — food-cost grain là gap còn lại của D028), D029 (₫ wave bao trùm double-glyph inventory), D030 (DataTable/StatusBadge/KpiCard wave + HR active-zone off-limits).

**Gate:** mỗi stream theo T-tier ghi trên; T3 (payroll RPC/standard-days, split-bill, food-cost MV) chạy four-perspective debate + migration file→PR→owner→`pnpm db:types` khi schema đổi (D015, không dev DB).

**Plan thực thi chi tiết (track + thứ tự + acceptance criteria):** `docs/plan/ux-ia-remediation-2026-06.md`. Đảo bất kỳ phán quyết (a)-(f) → sửa D031 trước.

**Status:** Phán quyết chốt + verify xong + master plan ghi. Các dòng D3/D5/VAT đã có status đóng trong master plan; active work còn lại nằm ở `tasks/todo.md` và phần "Tiến độ thực thi" của `docs/plan/ux-ia-remediation-2026-06.md`.

**Current production contract:** destructive DB changes such as dropping a column require expand-contract order. The production deployment that is actually serving traffic must already run code with zero references to the removed object before the owner applies the destructive migration. Local typecheck/build and DB-only verification are not sufficient for destructive prod applies.

**Quyết định 1 (Payroll vào app) — chốt mô hình ĐƠN GIẢN/HKD theo owner (2026-06-16):** Payroll chạy kiểu Hộ kinh doanh: `base_salary` + ngày công → lương thực lĩnh, KHÔNG dùng `employment_contracts`, KHÔNG đóng BHXH (`insuranceBaseSalary = 0`), GIỮ TNCN qua bộ legal-version có version (`packages/shared/src/payroll/legal-versions.ts`). Không migration (cột đã có sẵn ở prod). `calculatePayroll` đọc thẳng `employees.base_salary`; điều kiện đủ = `is_active && base_salary > 0`. Form nhân viên thu `base_salary`/`dependents_count`/`id_number`/`bank_account` (owner-only PII, action gated `HR_ROLES=['owner']`). Engine chung KHÔNG sửa.

- **Tradeoff TNCN tầng quản lý:** vì bỏ khấu trừ BHXH (10,5% NLĐ), thu nhập chịu thuế cao hơn → TNCN nhích lên với mức lương quản lý: ~+131k/tháng ở mức 25M, ~+349k/tháng ở mức 35M. Nhân viên vận hành (lương dưới ngưỡng giảm trừ) KHÔNG ảnh hưởng — TNCN vẫn 0.
- **Cuối năm 05/QTT-TNCN sẽ hiện BHXH = 0:** BHXH của chủ hộ xử lý riêng theo NĐ 158/2025 (ngoài app).
- **PII rough-edge (pre-existing, follow-up):** `branch_manager` hiện vẫn xem được `base_salary` qua `fetchEmployees` (service-role read path) — không thuộc phạm vi quyết định này, theo dõi riêng.
- **Phương án thay thế (migration-free) nếu owner muốn sau này:** engine đã hỗ trợ `insuranceBaseSalary` theo từng nhân viên, nên có thể bật BHXH cho riêng tầng quản lý mà không cần migration.

## D032: Redesign UI = Hợp nhất (A) + Nâng cấp thị giác trong contract (B) — KHÔNG đổi ngôn ngữ Concept 01 (2026-06-16)

**Context:** Owner yêu cầu "redesign UI/UX/layout/shell/styles/colors/typo/components/patterns/spacing/radius — hướng đi rõ ràng, đầy đủ giải pháp". Verify vs CODE (`globals.css`, shell, design-system v14.7) + các worklog đang chạy: dự án KHÔNG thiếu DS — đã có Concept 01 khoá (token OKLCH semantic, light+dark token hoá đủ, rhythm/motion/elevation contract, CI ratchet, 2 chrome family, ~45 primitive + adapter). Vấn đề thật = (1) drift/độ phủ chưa 100%, (2) vài trục còn "khô kiểu ERP" + dark mode bị tắt dù đã token, (3) surface chủ lực chưa polish. ⇒ "redesign" đúng = hợp nhất + nâng cấp có kiểm soát, KHÔNG đập đi vẽ lại.

**Phán quyết owner (2026-06-16):** chọn **A + B**, tránh C (rebrand).

- **Hướng A (nền, bắt buộc) = thực thi D031.** Không tạo track mới: A chính là đợt remediation UX/IA toàn app đang chạy (track E nav/IA, F status/DataTable, G pagination, H surface) + HRM (D026/D027). Acceptance theo `docs/plan/ux-ia-remediation-2026-06.md`. 1 trạng thái = 1 màu/nhãn (StatusBadge SSoT), DataTable phủ mọi bảng, KpiCard/Empty SSoT, enforce `AppPage` padding (bỏ self-pad branch-settings), gộp 6 module-shell về 1 `AppShell` (W5).
- **Hướng B (lớp khác biệt, MỚI — phần D032 này thật sự quyết) — chỉ làm SAU khi A đủ phủ, và cập nhật `docs/spec/design-system.md` TRƯỚC khi apply token (governance: không tạo ngôn ngữ thị giác thứ 2):**
  1. **Tách `info`-hue.** Hiện `--info` == `--foreground` (navy y hệt màu chữ) ⇒ `text-info`/viền info tàng hình. Cấp info một hue riêng (xanh dương dịu), giữ light+dark.
  2. **Bật lại dark mode** (token `.dark` đã đủ; đang bị `forcedTheme="light"` chặn ở `layout.tsx`). Re-enable rẻ. **[OPEN]** phạm vi: KDS/POS-bếp-tối trước hay toàn app — chốt khi vào Phase 2.
  3. **Chiều sâu dashboard + chuẩn `chart-1..5`** (border-first vẫn là nền; thêm depth có kiểm soát, không phá elevation contract).
  4. **⌘K command palette toàn cục** (đã có `command.tsx` + `Kbd`, thiếu launcher).
  5. **[OPEN — taste]** nâng `--radius` 0.625rem → 0.75rem (1 dòng, token-driven, an toàn) — chờ owner chốt.
- **GIỮ nguyên (không đụng):** `primary` đỏ gạch + palette Concept 01; typo Inter/Montserrat/JetBrains + base 17px; Rhythm Contract (p-3/p-4, gap 1–6, heading-by-role); Radius 4-token; Motion functional-only.

**Roadmap:** Phase 0 đo (rubric `ui-ux-rubric.md` cho ~10 surface chủ lực + liệt kê clone còn lại) → Phase 1 = A → Phase 2 = B (sửa contract trước) → Phase 3 polish POS/KDS/Runner/Dashboard. Mỗi PR = 1 route family hoặc 1 primitive rollout (Rebuild Rule).

**Quan hệ:** A = D031 (+ D026/D027 HRM); kế thừa D019 (UI structural governance), D029/D030 (DataTable/StatusBadge/KpiCard waves). B nằm trên cùng — không chặn A.

**Status:** Hướng chốt (owner chọn A+B). Branch chuẩn = **`main`** (D033). Phase 1 hiện bám D031/D026/D027 và chỉ các row còn sống trong `tasks/todo.md`; không giữ baseline audit như backlog phụ.

## D033: `main` bị thay hoàn toàn bằng `codex/continue-ts` — bỏ Go-port (2026-06-16)

**Decision:** `main` là trunk hiện hành cho TypeScript/Supabase product. Go-port không thuộc current product architecture. Active docs, plans, runbooks, and branch references must treat `main` as the source branch unless a new owner decision changes trunk.

## D034: Gỡ hẳn bề mặt accounting/khóa-kỳ khỏi app (đảo chiều D013) (2026-06-19)

**Context:** Audit Admin (đa tác tử, có kiểm chứng) cho thấy `/admin/accounting` ("Khóa kỳ hỗ trợ kế toán" — soft-close ngày 5 / hard-close ngày 15, khung audit-trail) là nghi thức kế toán doanh nghiệp HKD không dùng (đóng thuế khoán, không sổ sách formal). Tính năng build đủ RPC nhưng đã bị ẩn khỏi nav (D013) và là entry trùng: cùng cơ chế period-close lại được render duy nhất ở đây. Owner chốt: "Xoá hẳn" thay vì giữ ẩn.

**Decision (owner 2026-06-19):** Gỡ toàn bộ lớp UI/route accounting khỏi app:
- Xoá route `/admin/accounting/*` + redirect `/admin/finance/[[...slug]]` (redirect `/admin/finance → /finance` vẫn do middleware `resolveLegacyRouteRedirectPath` lo, giữ nguyên + test).
- Xoá chain period-close UI: `app/components/period-close-card.tsx` (barrel), `inventory/_components/period-close-card.tsx`, và actions `closePeriodSoft/Hard/reopenPeriod` trong `inventory/dashboard-actions.ts`.
- Gỡ ModuleKey `accounting` khỏi `module-acl.ts`, `labels/vi.ts`, `route-map.ts`, `route-resolution.ts`, `shell-primitives.ts`, comment `nav-config.ts`; gỡ copy `finance.periodsAdmin`.

**Giữ lại (KHÔNG đụng):** permission `accounting:period_reopen` (`permissions.ts`) + các RPC DB `close_period_soft/hard`, `reopen_period`, bảng `accounting_periods`. DB-layer thuộc thẩm quyền owner qua migration; chỉ gỡ lớp app.

**Consequences:** Guard test cập nhật cùng đợt — bỏ test "Accounting period support copy" (`finance-revenue-date-range.test.ts`) và assertion `MODULE_LABELS_VI.accounting` (`scope.test.ts`). Muốn dựng lại khóa-kỳ sau này: làm như tính năng "Khóa số liệu tháng" gọn dưới `/admin/settings`, không tái lập khung kế toán.
