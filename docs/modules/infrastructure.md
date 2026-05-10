# Infrastructure Module

## Overview

Turborepo monorepo with the web app deployed to Vercel and the print agent shipped as an out-of-band Node service. Supabase provides database + auth. Upstash Redis backs rate limiting. GitHub Actions covers CI.

## Monorepo Structure

```
comtammatu/
├── apps/
│   ├── web/                # Next.js 16.2 — primary Vercel app
│   └── print-agent/        # Out-of-band Node service for branch printers / presence
├── packages/
│   ├── database/           # Supabase clients + generated types
│   ├── shared/             # Auth types, ACL, utilities
│   ├── ui/                 # shadcn/ui component library
│   ├── security/           # Rate limiting
│   └── design-tokens/      # Generated matu-* pilot tokens
├── supabase/
│   └── migrations/         # SQL migrations (prod applied manually by owner after PR merge)
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

Build order: `packages/*` (parallel) → app builds that depend on them (`apps/web`, plus `apps/print-agent` when its filter is included).

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
NEXT_PUBLIC_APP_HOST              # Canonical app/admin host in production
NEXT_PUBLIC_FEEDBACK_HOST         # Canonical public feedback host in production
ALLOWED_ORIGINS_FEEDBACK          # Allowed Origin list for /r/* submissions
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

# 3. Generate types (after migrations are applied to the type source schema)
pnpm db:types

# 4. Start dev server
pnpm dev
```

Full setup guide: `docs/ref/setup.md`

## Deployment

- **Vercel:** Auto-deploy from main branch. Environment variables set in Vercel dashboard.
- **Supabase:** Dev/test migrations may be applied for verification after confirming the target is not production. Production migrations are applied manually by owner after PR merge.
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

<!-- ORACLE-META
Written by codebase-oracle (manual) | 2026-04-02
Data: Direct source reading
Audience: new engineer, devops | Confidence: 90%
Updated: monorepo app/package map + feedback host env sync (2026-05-09)
Unknowns: 1 (GitHub Actions workflow details not verified)
-->
