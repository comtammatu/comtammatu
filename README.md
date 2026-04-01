# Cơm Tấm Má Tư

Hệ thống quản lý nhà hàng cho Cơm Tấm Má Tư CTCP — single-tenant, multi-branch.

## Tech Stack

- **Framework:** Next.js 16.2 (App Router, Turbopack)
- **Language:** TypeScript 6.0 (strict mode)
- **Database:** Supabase (PostgREST + Auth + RLS)
- **Styling:** Tailwind CSS 4.2
- **Validation:** Zod 4
- **Monorepo:** Turborepo 2.9 + pnpm workspaces
- **Rate Limiting:** Upstash Redis

## Project Structure

```
apps/
  web/              # Next.js application
packages/
  database/         # Supabase client & types
  shared/           # Auth types, ACL, scope utilities
  security/         # Rate limiting
  ui/               # Shared UI components
supabase/
  migrations/       # SQL migrations
  config.toml       # Local Supabase config
docs/               # Architecture, specs, references
tasks/              # Work tracking & lessons learned
```

## URL Routes

| Path                 | Role      | Description       |
| -------------------- | --------- | ----------------- |
| `/admin/*`           | Manager+  | Tenant management |
| `/br/[branchId]/pos` | Cashier   | Point of Sale     |
| `/br/[branchId]/kds` | Chef      | Kitchen Display   |
| `/employee`          | All staff | Employee portal   |
| `/login`             | Public    | Authentication    |

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10+
- Supabase CLI (for local dev)

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Fill in your Supabase & Upstash credentials

# Start Supabase locally (optional)
supabase start

# Run dev server
pnpm dev
```

### Commands

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm typecheck    # Type checking across all packages
pnpm lint         # ESLint
pnpm db:types     # Regenerate Supabase types (after migration)
```

## License

Proprietary — Cơm Tấm Má Tư CTCP. All rights reserved.
