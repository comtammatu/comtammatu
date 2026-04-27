# Architecture Decisions

> Log mỗi quyết định kiến trúc quan trọng với rationale.

## D000: Inventory: retire HQ, introduce multi-instance Kho Tổng + Bếp Trung Tâm (2026-04-24)

**Decision:** Remove the singleton "HQ / headquarters" branch concept. Replace with multi-instance `central_warehouse` (Kho Tổng / CW) and existing multi-instance `central_kitchen` (Bếp Trung Tâm / CK). Both accept direct supplier GRN.

**Transfer direction matrix** (enforced by DB trigger `enforce_stock_transfer_direction`):
- Allowed: CW→CK, CW→Branch, CK→Branch, intra-branch.
- Rejected: CK→CW, CW↔CW, CK↔CK, Branch→*.

**Superseded stock issue kitchen_use rule:** `stock_issue(issue_type = 'kitchen_use')` used to be valid only at `branch_kind = 'branch'`, but this rule is retired. Current contract: `Kho chi nhánh -> Bếp chi nhánh` uses an intra-branch `stock_transfer` with warehouse/source location and kitchen/default-consumption target location.

**Rationale:** Pilot now plans more than one Kho Tổng and more than one Bếp Trung Tâm. The legacy `is_headquarters` flag assumed a singleton and does not scale.

**Migration:** `20260424000000_rename_warehouse_to_central_warehouse_retire_hq.sql`
- Renames `branch_kind='warehouse'` → `'central_warehouse'`
- Drops `branches.is_headquarters` column
- Replaces `enforce_po_branch_is_headquarters` trigger → `enforce_po_grn_branch_is_procurement` (accepts CW + CK)
- Drops `set_headquarters` RPC (replace with `set_branch_kind`)
- Adds `enforce_stock_transfer_direction` trigger with direction matrix above
- Superseded later by `20260426100100_retire_kitchen_use_issue_type.sql`: no new `kitchen_use`; use intra-branch transfer for `Cấp bếp`

**Superseded:** prior ADRs (D007 `set_headquarters`) are superseded for the CW/CK flow; other parts untouched.

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

## D007: Atomic RPC cho set_headquarters (2026-04-02) — **SUPERSEDED by D000 (2026-04-24)**

**Context (historical):** `setHeadquarters` cần unset current HQ rồi set new HQ. Hai UPDATE riêng biệt tạo TOCTOU race — concurrent calls có thể để 0 hoặc 2 branches làm HQ.

**Decision (historical):** Postgres RPC `set_headquarters(p_branch_id)` chạy cả hai thao tác trong 1 transaction. Dùng single UPDATE với `SET is_headquarters = (id = p_branch_id)`.

**Superseded:** migration `20260424000000` dropped the `is_headquarters` column and the `set_headquarters` RPC. Multi-instance `central_warehouse` removes the singleton constraint; no atomic swap is needed. Use `set_branch_kind(p_branch_id, p_kind)` to tag a branch as `central_warehouse`.

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

## D011: print-agent LAN-only build via runtime flag, not separate package (2026-04-24)

**Context:** Chi nhánh chỉ có máy POS Android (không PC Windows) không thể chạy `apps/print-agent` vì `usb` native binding (WinUSB driver, NSSM service, `.exe` packaging). Nhưng vẫn cần 1 process trong LAN để cầu nối jobs đến printer (browser/server cloud không mở raw TCP socket tới IP LAN private).

**Decision:** Thêm env flag `AGENT_TRANSPORT=lan|all` (default `all`):
- `lan` — skip USB dispatch hoàn toàn. Dynamic `import('./usb.js')` chỉ chạy khi `transport=all` → Termux/Raspberry Pi không cần `usb` prebuild.
- `all` — giữ behavior cũ (LAN + USB). Windows `.exe` không đổi.

Di chuyển `usb` từ `dependencies` → `optionalDependencies`. `pnpm install --no-optional` trên ARM/Termux bỏ qua sạch.

**Pre-claim gate** (quan trọng): agent LAN-only phải check `printer.connection_type` **trước** `claimJob` RPC. Nếu claim-then-fail, job bị mark `failed` vĩnh viễn (không có requeue path). Pre-claim skip → job giữ `pending` cho agent khác claim.

**Capability column:** `printer_agents.transport TEXT NOT NULL DEFAULT 'all' CHECK IN ('lan','all')` — heartbeat báo capability để monitoring/future enqueue-side routing.

**Out of scope (Phase 2):**
- Composite heartbeat key `(branch_id, agent_id)` cho hybrid branch (2 agents cùng 1 branch)
- TTL/expiry reaper cho jobs không claim được trong N phút
- Enqueue-side filtering theo capability
- mDNS printer discovery, Docker image, Bluetooth transport

**Rejected alternatives:**
- Tách 2 package (`-core`, `-usb`) — versioning hell, 2 CI path
- Separate `index-lan.ts` entrypoint — 2 `bin` entries, 2 `pkg` target, doc burden
- Browser gửi TCP trực tiếp — browser không mở raw socket
- Next.js server (cloud) gọi IP printer — NAT/firewall chặn IP LAN private

**Migration:** `20260425140000_printer_agent_transport.sql`

**Consequences:** Shop chỉ có Android POS có thể chạy agent trên Termux (Node 24) hoặc mini-PC/Raspberry Pi. Shop Windows hiện tại không bị regression (default `all`). Future: khi thêm Bluetooth/serial transport, model lại capability thành `TEXT[]`.
