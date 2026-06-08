# Architecture Decisions

> Log mỗi quyết định kiến trúc quan trọng với rationale.

## D000: Inventory: retire HQ, introduce multi-instance Kho Tổng + Bếp Trung Tâm (2026-04-24)

> **SUPERSEDED (2026-06) by the lean Hộ Kinh Doanh decision:** the entire multi-warehouse model below — `central_warehouse`, `central_kitchen`, inter-site `stock_transfers`, the direction matrix, production orders, PO/3-way matching, recipe sale-deduction — was **CUT**. The current model is **flat-branch**: each peer branch receives directly from suppliers via GRN, holds its own `stock_levels`, and reconciles by monthly stocktake-variance. There are no central sites and no inter-branch transfers. This entry is retained for history only; do not implement from it. See `docs/ref/inventory.md` (lean reframe banner) and `docs/CODEBASE_MAP.md`.

**Decision (historical):** Remove the singleton "HQ / headquarters" branch concept. Replace with multi-instance `central_warehouse` (Kho Tổng / CW) and existing multi-instance `central_kitchen` (Bếp Trung Tâm / CK). Both accept direct supplier GRN.

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
