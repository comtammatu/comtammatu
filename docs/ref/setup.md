# Cài Đặt Project

Hướng dẫn tối thiểu để chạy repo local. Công cụ agent, MCP, plugin, và guard
adapter (nếu dùng local, không track trong repo) cùng
`docs/agent/rules/` — không thuộc file setup nghiệp vụ này.

## Yêu cầu

- Node.js `>=24` (xem `.nvmrc`)
- pnpm qua Corepack
- Supabase CLI nếu cần thao tác migration/type generation
- Giá trị env do owner cung cấp

## Cài dependency

```bash
corepack enable
corepack pnpm install
```

## Biến môi trường

Sao chép env template cho web app:

```bash
cp .env.example apps/web/.env.local
```

Điền các biến tối thiểu (khớp `.env.example`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
UPSTASH_REDIS_REST_URL=https://YOUR_REDIS.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

`corepack pnpm db:types` chỉ đọc schema từ Production đã đăng ký và bắt buộc
truyền đúng `SUPABASE_PROJECT_ID`:

```bash
SUPABASE_PROJECT_ID=enloyfnuerqgaqderbwb corepack pnpm db:types
```

## Database (Supabase)

- Migration production là owner-gated. Agent viết migration file; owner apply
  production trừ khi owner ủy quyền rõ trong chính session hiện tại.
- Kiểm migration trên Preview Branch throwaway có parent là Production trước
  khi apply Production. Xem `docs/agent/rules/database.md`.
- Không chạy `supabase db push` vào production.
- Layout: [`supabase/README.md`](../../supabase/README.md).

JWT Custom Claims Hook trong Supabase Dashboard:

1. Authentication -> Hooks
2. Bật "Custom Access Token"
3. Chọn `custom_access_token_hook`

User admin đầu tiên:

```sql
UPDATE public.profiles
SET position_id = (
      SELECT p.id
      FROM public.positions p
      WHERE p.code = 'owner'
        AND p.tenant_id = profiles.tenant_id
      LIMIT 1
    ),
    full_name = 'Your Name'
WHERE id = '<user-uuid>';
```

Seed kiểm thử chỉ chạy trên Preview Branch throwaway đã được guard xác minh và
phải dùng literal target binding theo `docs/agent/rules/database.md`. Không dùng
stored CLI link state; nếu guard không hỗ trợ đúng operation/target của task thì
dừng và báo blocker.

## Chạy local

```bash
corepack pnpm dev
```

Mở `http://localhost:3000`.

## Kiểm tra

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
```

Slice cấp release:

```bash
corepack pnpm verify
```

## Env Vercel (Production)

Project: `comtammatu` · region `sin1` · domain `web.comtammatu.com` · chỉ deploy
từ `main` (`apps/web/vercel.json`). Topology:
[`docs/modules/infrastructure.md`](../modules/infrastructure.md).

Thiết lập các biến sau trên Vercel **Production** (và Production only):

| Biến | Nguồn |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase API |
| `UPSTASH_REDIS_REST_URL` | Upstash console |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash console |
| `AI_GATEWAY_API_KEY` | Giọng POS/KDS cloud. Biến Sensitive chỉ có lúc chạy; gắn xong phải deploy lại |

Không set `VERCEL_URL` thủ công; Vercel tự inject biến này.

Vercel Preview hiện bị vô hiệu hóa và **không** được nhận Supabase env.
`scripts/check-preview-supabase-env.mjs` chặn build Preview theo nguyên tắc
fail-closed.

## File chỉ nằm local

| File | Mục đích |
| --- | --- |
| `apps/web/.env.local` | Env runtime của web |
| `.mcp.json` | Local Claude MCP config, gitignored |

Giữ công cụ agent cá nhân, plugin cache, session, và local note ngoài repo này.
