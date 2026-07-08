# Cài Đặt Project

Hướng dẫn tối thiểu để chạy repo local. Công cụ agent, MCP, plugin, và guard
adapter thuộc `.claude/`, `.codex/`, và `docs/agent/rules/`, không thuộc file
setup nghiệp vụ này.

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

Điền các biến tối thiểu:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
UPSTASH_REDIS_REST_URL=https://YOUR_REDIS.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

`SUPABASE_PROJECT_ID` dùng cho `corepack pnpm db:types`. Thiết lập ở shell env
khi cần generate types:

```bash
SUPABASE_PROJECT_ID=your-project-id corepack pnpm db:types
```

## Database

- Migration production là owner-gated. Agent viết migration file; owner apply
  production trừ khi owner ủy quyền rõ trong chính session hiện tại.
- Kiểm migration non-production bằng Supabase Preview Branch khi có. Xem
  `docs/agent/rules/database.md`.
- Không chạy `supabase db push` vào production.

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

Seed QA/dev chỉ chạy trên non-production:

```bash
supabase db query --linked --file supabase/seed.sql
```

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

Slice cấp release dùng:

```bash
corepack pnpm verify
```

## Env Vercel

Thiết lập các biến sau trong Vercel cho Production và Preview:

| Biến | Nguồn |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase API |
| `UPSTASH_REDIS_REST_URL` | Upstash console |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash console |

Không set `VERCEL_URL` thủ công; Vercel tự inject biến này.

## File chỉ nằm local

| File | Mục đích |
| --- | --- |
| `apps/web/.env.local` | Env runtime của web |
| `.mcp.json` | Local Claude MCP config, gitignored |

Giữ công cụ agent cá nhân, plugin cache, session, và local note ngoài repo này.
