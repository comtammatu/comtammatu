# Cơm Tấm Má Tư

Hệ thống Quản lý Vận hành Nhà hàng cho chuỗi Cơm Tấm Má Tư CTCP.
Single-tenant, multi-branch. Không phải CRM, không phải ERP tổng hợp.

## Modules

| #   | Module      | Scope                                         | Status  |
| --- | ----------- | --------------------------------------------- | ------- |
| M0  | Admin Shell | Layout, sidebar, branches, staff, settings    | SHIPPED |
| M1  | Menu        | Categories, items, variants, modifiers, sides | SHIPPED |
| M2  | POS         | Cart, table/zone, order submit, bill printing | SHIPPED |
| M3  | KDS         | Realtime queue, bump/complete, station config | SHIPPED |
| M4  | Payment     | Cash, VietQR, Momo, refunds, reconciliation   | SHIPPED |
| M5  | Stock       | Ingredients, recipes, stock levels, GRN       | SHIPPED |
| M6  | Finance     | HĐĐT, VAT, dashboard, VAS accounting          | SHIPPED |
| M7  | HR/Payroll  | Shifts, attendance, payroll, PIT              | SHIPPED |

## Tech Stack

- **Runtime:** Node.js >= 24
- **Framework:** Next.js 16.2 (App Router, Turbopack)
- **Language:** TypeScript 6.0 (strict mode)
- **Database:** Supabase (PostgREST + Auth + RLS)
- **Styling:** Tailwind CSS 4.2
- **Validation:** Zod 4
- **Monorepo:** Turborepo 2.9 + pnpm 10
- **Rate Limiting:** Upstash Redis
- **Hosting:** Vercel

## Project Structure

```
apps/
  web/              # Next.js application
packages/
  database/         # Supabase client & types
  shared/           # Auth types, ACL, scope utilities
  security/         # Rate limiting
  ui/               # shadcn/ui components (Radix + Tailwind)
supabase/
  migrations/       # SQL migrations (applied manually post-merge)
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

See [`docs/ref/setup.md`](docs/ref/setup.md) for full setup guide.

```bash
nvm use             # Node 24+
pnpm install        # Install dependencies
cp .env.example .env.local  # Fill in Supabase & Upstash credentials
pnpm dev            # Start dev server (Turbopack)
```

## Commands

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm build        # Production build
pnpm typecheck    # Type checking across all packages
pnpm lint         # ESLint
pnpm db:types     # Regenerate Supabase types (after migration)
```

## Documentation

| Doc                                                            | Purpose                     |
| -------------------------------------------------------------- | --------------------------- |
| [`docs/CODEBASE_MAP.md`](docs/CODEBASE_MAP.md)                 | Codebase map + module index |
| [`docs/plan/roadmap.md`](docs/plan/roadmap.md)                 | Roadmap + module sessions   |
| [`docs/plan/decisions.md`](docs/plan/decisions.md)             | Architecture decisions log  |
| [`docs/spec/database-schema.md`](docs/spec/database-schema.md) | Database schema reference   |
| [`docs/spec/architecture.md`](docs/spec/architecture.md)       | System architecture         |

## License

Proprietary — Cơm Tấm Má Tư CTCP. All rights reserved.
