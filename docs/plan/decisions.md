# Architecture Decisions

> Log mỗi quyết định kiến trúc quan trọng với rationale.

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

## D007: Atomic RPC cho set_headquarters (2026-04-02)

**Context:** `setHeadquarters` cần unset current HQ rồi set new HQ. Hai UPDATE riêng biệt tạo TOCTOU race — concurrent calls có thể để 0 hoặc 2 branches làm HQ.

**Decision:** Postgres RPC `set_headquarters(p_branch_id)` chạy cả hai thao tác trong 1 transaction. Dùng single UPDATE với `SET is_headquarters = (id = p_branch_id)`.

**Consequences:** Atomic, không race condition. Cần maintain thêm 1 RPC function + type stub.

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
