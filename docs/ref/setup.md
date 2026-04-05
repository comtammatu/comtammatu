# Setup Guide

## Prerequisites

- Node.js >= 24 (pin via `.nvmrc`)
- pnpm 10.33+
- Bun v1.0+ (for gstack skills)
- Claude Code CLI
- Supabase CLI (`npm i -g supabase`)
- Supabase project (self-created)
- Upstash Redis account (self-created)

## 1. Clone & Install

```bash
git clone <repo-url>
cd comtammatu
pnpm install
```

## 2. Environment Variables

Copy `.env.example` to `.env.local` in `apps/web/`:

```bash
cp .env.example apps/web/.env.local
```

Fill in your values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_PROJECT_ID=your-project-id
UPSTASH_REDIS_REST_URL=https://YOUR_REDIS.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

## 3. Claude Code Setup

### 3a. MCP Servers

Dự án dùng 2 loại MCP config:

**Shared (committed, không cần token):** `.claude/.mcp.json`

- `shadcn-ui` — có sẵn, không cần setup

**Local (gitignored, cần token):** `.mcp.json`

```bash
cp .mcp.json.example .mcp.json
```

Edit `.mcp.json` — fill tokens:

| Server       | Token source                                                                           | Purpose                   |
| ------------ | -------------------------------------------------------------------------------------- | ------------------------- |
| **supabase** | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) | SQL, migrations, type gen |
| **vercel**   | [vercel.com/account/tokens](https://vercel.com/account/tokens)                         | Deploy, logs, runtime     |

Optional (install globally as needed):

- **Sentry** — error tracking post-deploy
- **Figma** — design-to-code workflow

### 3b. gstack Skills

```bash
./scripts/setup-gstack.sh
```

Installs 31 gstack skills (`/ship`, `/review`, `/qa`, `/cso`, ...). Requires Bun.

### 3c. Claude Swarm (multi-agent coordination)

```bash
./scripts/setup-swarm.sh
```

Installs claude-swarm MCP server for multi-agent collaboration. Allows multiple Claude Code sessions to discover each other, form rooms, delegate tasks, and share memory. See `.claude/rules/swarm.md` for agent roles and conventions.

### 3d. Verify Claude Code

Open Claude Code in project root and check:

```
/verify          → typecheck + build
/review          → regression check
```

## 4. Database Setup

Link your Supabase project (migrations are applied by owner after PR merge):

```bash
supabase link --project-ref YOUR_PROJECT_ID
```

### Enable JWT Custom Claims Hook

1. Go to Supabase Dashboard → Authentication → Hooks
2. Enable "Custom Access Token" hook
3. Select function: `custom_access_token_hook`

### Create First Admin User

1. Go to Supabase Dashboard → Authentication → Users → Add User
2. After creating, update their profile:

```sql
UPDATE public.profiles
SET role = 'owner', full_name = 'Your Name'
WHERE id = '<user-uuid>';
```

## 5. Generate Types

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

## 6. Run Dev Server

```bash
pnpm dev
```

Visit http://localhost:3000

## 7. Verify

```bash
pnpm typecheck    # All 5 packages should pass
pnpm build        # Production build should succeed
```

## 8. Vercel Environment Variables

Vercel Dashboard → Project → Settings → Environment Variables.

Thêm các biến sau cho **Production** và **Preview**:

| Variable                        | Scope              | Source          |
| ------------------------------- | ------------------ | --------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Production+Preview | Supabase → API  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production+Preview | Supabase → API  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Production+Preview | Supabase → API  |
| `UPSTASH_REDIS_REST_URL`        | Production+Preview | Upstash console |
| `UPSTASH_REDIS_REST_TOKEN`      | Production+Preview | Upstash console |

> **Note:** `VERCEL_URL` is auto-injected by Vercel — do NOT set manually.
> `SUPABASE_PROJECT_ID` is only needed for `pnpm db:types` (local/CI), not Vercel runtime.

## 9. GitHub Actions Secrets

GitHub → Repo Settings → Secrets and variables → Actions → New repository secret.

### Required Secrets

CI build cần `NEXT_PUBLIC_*` vars để Next.js build thành công:

| Secret                          | Purpose                 |
| ------------------------------- | ----------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Next.js build (inlined) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Next.js build (inlined) |

### CI Workflow Usage

Trong `.github/workflows/ci.yml`, thay placeholder bằng secrets:

```yaml
- name: Build
  run: pnpm build
  env:
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
```

### Optional Secrets (thêm khi cần)

| Secret                      | When needed                       |
| --------------------------- | --------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | CI cần seed data hoặc run RPC     |
| `SUPABASE_PROJECT_ID`       | CI auto-generate types            |
| `SUPABASE_ACCESS_TOKEN`     | CI `supabase db push` (CLI token) |
| `UPSTASH_REDIS_REST_URL`    | CI integration tests              |
| `UPSTASH_REDIS_REST_TOKEN`  | CI integration tests              |

## Quick Reference — What's Gitignored (per-machine setup)

| File                     | How to create                         | Purpose                  |
| ------------------------ | ------------------------------------- | ------------------------ |
| `apps/web/.env.local`    | `cp .env.example apps/web/.env.local` | Runtime env vars         |
| `.mcp.json`              | `cp .mcp.json.example .mcp.json`      | Claude Code MCP servers  |
| `.claude/skills/gstack/` | `./scripts/setup-gstack.sh`           | 31 gstack skills         |
| `~/.claude-swarm/`       | `./scripts/setup-swarm.sh`            | Multi-agent coordination |
