# Architecture Decisions

> Log mỗi quyết định kiến trúc quan trọng với rationale.

## D000: Inventory: retire HQ, introduce multi-instance Kho Tổng + Bếp Trung Tâm (2026-04-24)

**Decision:** Remove the singleton "HQ / headquarters" branch concept. Replace with multi-instance `central_warehouse` (Kho Tổng / CW) and existing multi-instance `central_kitchen` (Bếp Trung Tâm / CK). Both accept direct supplier GRN.

**Transfer direction matrix** (enforced by DB trigger `enforce_stock_transfer_direction`):

- Allowed: CW→CK, CW→Branch, CK→Branch, intra-branch.
- Rejected: CK→CW, CW↔CW, CK↔CK, Branch→\*.

**Superseded stock issue kitchen_use rule:** `stock_issue(issue_type = 'kitchen_use')` used to be valid only at `branch_kind = 'branch'`, but this rule is retired. Current contract: `Kho chi nhánh -> Bếp chi nhánh` uses an intra-branch `stock_transfer` with warehouse/source location and kitchen/default-consumption target location.

**Rationale:** Pilot now plans more than one Kho Tổng and more than one Bếp Trung Tâm. The retired `is_headquarters` flag assumed a singleton and does not scale.

**Migration:** `20260424000000_rename_warehouse_to_central_warehouse_retire_hq.sql`

- Renames `branch_kind='warehouse'` → `'central_warehouse'`
- Drops `branches.is_headquarters` column
- Replaces `enforce_po_branch_is_headquarters` trigger → `enforce_po_grn_branch_is_procurement` (accepts CW + CK)
- Drops `set_headquarters` RPC (replace with `set_branch_kind`)
- Adds `enforce_stock_transfer_direction` trigger with direction matrix above
- Superseded later by `20260426100100_retire_kitchen_use_issue_type.sql`: no new `kitchen_use`; use intra-branch transfer for `Cấp bếp`

**Current contract:** CW/CK flow uses `branch_kind` plus the direction matrix above; there is no live `set_headquarters` decision in this file.

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
