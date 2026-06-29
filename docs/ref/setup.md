# Hướng Dẫn Cài Đặt

## Yêu cầu trước

- Node.js >= 24 (pin qua `.nvmrc`)
- pnpm 10.33+
- Bun v1.0+ (cho gstack skills)
- Claude Code CLI
- Supabase CLI (`npm i -g supabase`)
- Supabase project (tự tạo)
- Upstash Redis account (tự tạo)

## 1. Clone & cài đặt

```bash
git clone <repo-url>
cd comtammatu
pnpm install
```

## 2. Biến môi trường

Copy `.env.example` sang `.env.local` trong `apps/web/`:

```bash
cp .env.example apps/web/.env.local
```

Điền giá trị của bạn:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_PROJECT_ID=your-project-id
UPSTASH_REDIS_REST_URL=https://YOUR_REDIS.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

## 3. Cài đặt Claude Code

### 3a. MCP Servers

Repo chỉ giữ template không có token: `.mcp.json.example`. File chạy thật là
`.mcp.json`, được gitignore và nằm cục bộ trên máy của người vận hành.

```bash
cp .mcp.json.example .mcp.json
```

MCP dùng remote HTTP + OAuth, không hardcode PAT trong repo. Sau khi copy file,
mở agent trong project root và kích hoạt luồng đăng nhập MCP của client.

| Server       | URL                                                                                                                               | Scope                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **supabase** | `https://mcp.supabase.com/mcp?project_ref=iexwsuaqqenyjiskawoj&read_only=true&features=database,debugging,development,docs`       | Project-scoped, read-only production inspection + docs    |
| **vercel**   | `https://mcp.vercel.com`                                                                                                          | Vercel projects, deployments, logs, runtime docs via OAuth |

Tùy chọn (cài global khi cần):

- **Sentry** — error tracking sau khi deploy
- **Figma** — luồng design-to-code

### 3b. Kiểm tra Claude Code

Mở Claude Code trong project root và chạy:

```
/verify          → typecheck + build
/review          → regression check
```

## 4. Cài đặt database

Link Supabase project của bạn (migration do owner apply sau khi PR merge):

```bash
supabase link --project-ref YOUR_PROJECT_ID
```

### Bật JWT Custom Claims Hook

1. Vào Supabase Dashboard → Authentication → Hooks
2. Bật hook "Custom Access Token"
3. Chọn function: `custom_access_token_hook`

### Tạo admin user đầu tiên

1. Vào Supabase Dashboard → Authentication → Users → Add User
2. Sau khi tạo, cập nhật profile:

```sql
-- profiles không có cột role; chức vụ là FK position_id → positions (tenant-scoped)
UPDATE public.profiles
SET position_id = (
      SELECT p.id FROM public.positions p
      WHERE p.code = 'owner'
        AND p.tenant_id = profiles.tenant_id
      LIMIT 1
    ),
    full_name = 'Your Name'
WHERE id = '<user-uuid>';
```

### Seed tài khoản QA test (dev / staging)

Ưu tiên CLI: `supabase db query --linked --file supabase/seed.sql`. Fallback qua SQL Editor: paste `supabase/seed.sql` và chạy với role `postgres`. Seed là idempotent, chạy lại được.

Mật khẩu tất cả: `Test1234!`. Bao phủ toàn bộ `STAFF_ROLES`:

| Email                            | Role                 | Scope                           |
| -------------------------------- | -------------------- | ------------------------------- |
| `owner@comtammatu.vn`            | `owner`              | Tenant (pin dev branch)             |
| `keeper@comtammatu.vn`           | `owner`              | Tenant (pin dev branch); mốc neo FK-reassignment, không bị xoá khi rerun |
| `warehouse@comtammatu.vn`        | `warehouse_manager`  | Kho Tổng                       |
| `production@comtammatu.vn`       | `production_manager` | Bếp Trung Tâm                  |
| `manager.datdo@comtammatu.vn`    | `branch_manager`     | Chi nhánh Đất Đỏ                |
| `cashier.datdo@comtammatu.vn`    | `cashier`            | Chi nhánh Đất Đỏ                |
| `cashier.service.datdo@comtammatu.vn` | `cashier`       | Chi nhánh Đất Đỏ                |
| `chef.datdo@comtammatu.vn`       | `chef`               | Chi nhánh Đất Đỏ                |
| `manager.phuochai@comtammatu.vn` | `branch_manager`     | Chi nhánh Phước Hải             |
| `cashier.phuochai@comtammatu.vn` | `cashier`            | Chi nhánh Phước Hải             |
| `cashier.service.phuochai@comtammatu.vn` | `cashier`  | Chi nhánh Phước Hải             |
| `chef.phuochai@comtammatu.vn`    | `chef`               | Chi nhánh Phước Hải             |
| `office@comtammatu.vn`           | `office`             | Tenant (branch NULL)            |

> **Chỉ chạy trên dev / staging.** Script DELETE các account theo email rồi re-INSERT, CASCADE cả profile + employees.

## 5. Generate types

`pnpm db:types` đọc `$SUPABASE_PROJECT_ID` từ shell env (không phải `.env.local`). Có 2 cách:

**Cách 1 — Inline (one-off):**

```bash
SUPABASE_PROJECT_ID=your-project-id pnpm db:types
```

**Cách 2 — Shell profile (persistent):**
Thêm vào `~/.zshrc` hoặc `~/.bashrc`:

```bash
export SUPABASE_PROJECT_ID=your-project-id
```

Sau đó:

```bash
source ~/.zshrc
pnpm db:types
```

## 6. Chạy dev server

```bash
pnpm dev
```

Mở http://localhost:3000

## 7. Kiểm tra

```bash
pnpm typecheck    # All 5 packages should pass
pnpm build        # Production build should succeed
```

## 8. Biến môi trường Vercel

Vercel Dashboard → Project → Settings → Environment Variables.

Thêm các biến sau cho **Production** và **Preview**:

| Variable                        | Scope              | Source          |
| ------------------------------- | ------------------ | --------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Production+Preview | Supabase → API  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production+Preview | Supabase → API  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Production+Preview | Supabase → API  |
| `UPSTASH_REDIS_REST_URL`        | Production+Preview | Upstash console |
| `UPSTASH_REDIS_REST_TOKEN`      | Production+Preview | Upstash console |

> **Lưu ý:** `VERCEL_URL` được Vercel tự inject — KHÔNG set thủ công.
> `SUPABASE_PROJECT_ID` chỉ cần cho `pnpm db:types` (local/CI), không cần cho Vercel runtime.

## 9. CI Secrets (tùy chọn)

Checkout hiện tại không có file `.github/workflows` đang hoạt động. Chỉ dùng phần
này nếu owner khôi phục GitHub Actions hoặc một CI runner khác.

GitHub → Repo Settings → Secrets and variables → Actions → New repository secret.

### Secrets bắt buộc

CI build cần các biến `NEXT_PUBLIC_*` để Next.js build thành công:

| Secret                          | Purpose                 |
| ------------------------------- | ----------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Next.js build (inlined) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Next.js build (inlined) |

### Dùng secrets trong CI workflow

Nếu workflow CI được khôi phục, truyền secrets vào job build thay vì hardcode:

```yaml
- name: Build
  run: pnpm build
  env:
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
```

### Secrets tùy chọn (thêm khi cần)

| Secret                      | When needed                       |
| --------------------------- | --------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | CI cần seed data hoặc run RPC     |
| `SUPABASE_PROJECT_ID`       | CI auto-generate types            |
| `SUPABASE_ACCESS_TOKEN`     | CI `supabase db push` (CLI token) |
| `UPSTASH_REDIS_REST_URL`    | CI integration tests              |
| `UPSTASH_REDIS_REST_TOKEN`  | CI integration tests              |

## Tham chiếu nhanh — File nào bị gitignore (cài theo từng máy)

| File                  | Cách tạo                              | Purpose                 |
| --------------------- | ------------------------------------- | ----------------------- |
| `apps/web/.env.local` | `cp .env.example apps/web/.env.local` | Runtime env vars        |
| `.mcp.json`           | `cp .mcp.json.example .mcp.json`      | Claude Code MCP servers |

Tooling agent theo từng người (gstack, claude-swarm, codex CLI, v.v.) cố ý KHÔNG được bootstrap từ repo này. Cài bộ công cụ bạn dùng từ nguồn upstream của nó vào `$HOME` của bạn và giữ config của nó ngoài repo (xem `.gitignore`).
