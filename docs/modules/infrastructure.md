# Infrastructure Module

## Overview

Turborepo monorepo deployed to Vercel. Supabase for database + auth. Upstash Redis for rate limiting. GitHub Actions for CI.

## Monorepo Structure

```
comtammatu/
├── apps/
│   └── web/                # Next.js 16.2 — the only deployable app
├── packages/
│   ├── database/           # Supabase clients + generated types
│   ├── shared/             # Auth types, ACL, utilities
│   ├── ui/                 # shadcn/ui component library
│   └── security/           # Rate limiting
├── supabase/
│   └── migrations/         # SQL migrations; owner manually applies prod after merge
├── turbo.json              # Task pipeline
├── pnpm-workspace.yaml     # Workspace definition
└── tsconfig.base.json      # Shared TS config
```

## Build Pipeline

Managed by Turborepo (`turbo.json`):

```
build:  dependsOn: [^build]  → outputs: [.next/**, dist/**]
lint:   no deps              → parallel
typecheck: no deps           → parallel
dev:    cache: false         → persistent
```

Build order: `packages/*` (parallel) → `apps/web` (depends on packages).

## Runtime Requirements

| Service       | Purpose               | Required   |
| ------------- | --------------------- | ---------- |
| Node.js >= 24 | Runtime               | Yes        |
| pnpm 10.33.0  | Package manager       | Yes        |
| Supabase      | Auth + DB + PostgREST | Yes        |
| Upstash Redis | Rate limiting         | Yes        |
| Vercel        | Hosting               | Production |

## Environment Variables

### apps/web

```
NEXT_PUBLIC_SUPABASE_URL          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY     # Supabase anonymous key (public)
UPSTASH_REDIS_REST_URL            # Rate limiting
UPSTASH_REDIS_REST_TOKEN          # Rate limiting
```

### Supabase (local dev)

```
SUPABASE_URL                      # Local Supabase URL
SUPABASE_SERVICE_ROLE_KEY         # For admin operations
SUPABASE_DB_PASSWORD              # Local DB password
```

## Development Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Link Supabase project
supabase link --project-ref YOUR_PROJECT_ID

# 3. Generate types after migrations are applied to your dev/test type source
pnpm db:types

# 4. Start dev server
pnpm dev
```

Full setup guide: `docs/ref/setup.md`

## Deployment

- **Vercel:** Auto-deploy from main branch. Environment variables set in Vercel dashboard.
- **Supabase:** Migrations applied manually by owner (`supabase db push`) after PR merge.
- **GitHub Actions:** CI pipeline (typecheck + build + lint). Secrets documented in commit `1223952`.

## TypeScript Configuration

Base config (`tsconfig.base.json`):

- `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`
- `strict: true`, `noUncheckedIndexedAccess: true`
- TypeScript 6.0 — packages using `process.env` need `"types": ["node"]` in their tsconfig

## Key Commands

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build (all packages + web)
pnpm typecheck    # Type checking across all packages
pnpm lint         # ESLint across all packages
pnpm db:types     # Regenerate Supabase types
pnpm format       # Prettier format
```
