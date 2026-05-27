# Cơm Tấm Má Tư

ERP vận hành chuỗi nhà hàng cho chuỗi Cơm Tấm Má Tư CTCP. Single-tenant, multi-branch, đa kho. Không phải CRM, không phải ERP đa ngành.

Mô hình vận hành production: **Trụ sở chính (HQ) → Kho Tổng → Bếp Trung Tâm → Chi nhánh**.

## Modules

| #   | Module               | Scope                                                                      | Status      |
| --- | -------------------- | -------------------------------------------------------------------------- | ----------- |
| M0  | Khung quản trị       | ERP cockpit, sidebar, foundation, executive reporting                      | SHIPPED     |
| M1  | Menu                 | Categories, items, variants, modifiers, sides                              | SHIPPED     |
| M2  | POS                  | Cart, table/zone, order lifecycle, bill, PWA installable                   | SHIPPED     |
| M3  | KDS                  | Realtime queue, bump/complete, station config, partial-cancel ticket       | SHIPPED     |
| M4  | Payment              | Cash + VietQR (EMVCo QR, cashier-confirm) + Momo (IPN webhook). All live in production.  | SHIPPED     |
| M5  | Stock                | Ingredients, recipes, PO/GRN/3-way, stocktake, transfers, central kitchen  | SHIPPED     |
| M6  | Finance              | Finance Basic, COA/Journal, BCTC TT200, reconciliation. HĐĐT active qua Viettel S-invoice | PARTIAL     |
| M7  | Nhân sự & tiền lương | Employees, contracts, attendance, payslip. BHXH/PIT calc deferred          | PARTIAL     |

Active tracker: [`tasks/todo.md`](tasks/todo.md).

## Tech Stack

- **Runtime:** Node.js ≥ 24
- **Framework:** Next.js 16.2 (App Router, Turbopack dev, Webpack production build)
- **Language:** TypeScript 6.0 (strict + `noUncheckedIndexedAccess`)
- **UI:** React 19.2 · Tailwind CSS 4.2 · shadcn/ui (`radix-lyra`, preset `buFywKm`) · Radix
- **Validation:** Zod 4
- **Database:** Supabase (PostgREST + Auth + RLS), JWT custom claims hook
- **Monorepo:** Turborepo 2.9 + pnpm 10.33
- **PWA:** Serwist service worker, per-branch installable POS manifest
- **Rate limiting:** Upstash Redis
- **Native printer:** ESC-POS USB print-agent (Node 24, packaged via `@yao-pkg/pkg`)
- **Hosting:** Vercel

## Project Structure

```
apps/
  web/              # Next.js 16 app (POS, KDS, admin, inventory, finance, hr, employee)
  print-agent/      # ESC-POS USB printer daemon (Windows .exe via pkg)
packages/
  database/         # Supabase clients (server / client / service / middleware) + types
  shared/           # Auth (module-acl, permissions, scope), labels, payroll calc, formatters
  security/         # Upstash Redis rate limiting
  ui/               # shadcn/ui components (Radix + Tailwind 4)
supabase/
  migrations/       # SQL migrations (production: file → PR → merge → owner apply)
docs/
  plan/             # Decisions log and active ADRs
  modules/          # Per-module reference (auth, database, web-app, ui, security, infrastructure)
  spec/             # Architecture, database schema, design system
  ref/              # Business domain, inventory SOP, e-invoice, PIT, glossary
  runbooks/         # Pre-release QA, operator journeys, smoke gates
  user-guides/      # POS flow guides
  worklog/          # Adoption matrix, evidence log
tasks/              # regressions.md, lessons.md, todo.md
scripts/            # SQL seeds, lint helpers
```

## URL Routes

| Path                          | Audience                | Surface                                       |
| ----------------------------- | ----------------------- | --------------------------------------------- |
| `/login`                      | Public                  | Authentication                                |
| `/admin/*`                    | Manager+                | Dashboard, settings, staff, reports, CRM      |
| `/menu`                       | Manager+                | Menu CRUD                                     |
| `/inventory/*`                | Inventory roles         | Canonical inventory hub (PO, GRN, stocktake…) |
| `/finance/*`                  | Finance roles           | COA, journal, statements, food-cost, periods  |
| `/hr/*`                       | HR/payroll              | Payroll periods, payslips                     |
| `/orders`                     | Manager+                | Cross-branch order browser                    |
| `/notifications`              | All staff               | Notification center                           |
| `/employee/*`                 | All staff               | Self-service: clock, schedule, payslip        |
| `/br/[branchId]/pos`          | Cashier / waiter        | Point of Sale (PWA installable)               |
| `/br/[branchId]/kds`          | Chef                    | Kitchen Display                               |
| `/br/[branchId]/settings/*`   | Branch manager+         | Per-branch POS, tables, printers              |

Auth + ACL được enforce tại [`apps/web/proxy.ts`](apps/web/proxy.ts) qua Auth v2 (Position ⟂ Permission, RLS-first). Route catalog: [`packages/shared/src/auth/module-acl.ts`](packages/shared/src/auth/module-acl.ts).

## Getting Started

Setup chi tiết (MCP, gstack skills, Supabase JWT hook, seed accounts): [`docs/ref/setup.md`](docs/ref/setup.md).

```bash
nvm use                                # Node ≥ 24
pnpm install
cp .env.example apps/web/.env.local    # Fill Supabase + Upstash credentials
pnpm dev                               # Turbopack dev server (http://localhost:3000)
```

## Commands

```bash
pnpm dev                # Turbopack dev (all apps)
pnpm dev:web            # Web only
pnpm dev:print          # Print agent only
pnpm build              # Production build (Next.js uses --webpack for service worker)
pnpm typecheck          # TS check across packages
pnpm lint               # ESLint + lint-copy + v2-imports guard
pnpm format             # Prettier
pnpm bones:build        # Pre-render skeleton boneyard
pnpm db:types           # Regenerate Supabase types — needs SUPABASE_PROJECT_ID env
```

End-to-end testing (Playwright):

```bash
pnpm --filter @comtammatu/web test:e2e
pnpm --filter @comtammatu/web guides:capture     # Capture POS flow screenshots
```

## Documentation

| Doc                                                            | Purpose                                          |
| -------------------------------------------------------------- | ------------------------------------------------ |
| [`AGENTS.md`](AGENTS.md)                                       | Canonical agent entrypoint + rule loading        |
| [`docs/CODEBASE_MAP.md`](docs/CODEBASE_MAP.md)                 | Codebase map + hub files + module index          |
| [`tasks/todo.md`](tasks/todo.md)                               | Active work tracker                              |
| [`docs/plan/decisions.md`](docs/plan/decisions.md)             | Architecture decisions log                       |
| [`docs/spec/architecture.md`](docs/spec/architecture.md)       | System architecture                              |
| [`docs/spec/database-schema.md`](docs/spec/database-schema.md) | Database schema reference                        |
| [`docs/spec/design-system.md`](docs/spec/design-system.md)     | Locked UI design-system contract                 |
| [`docs/modules/auth.md`](docs/modules/auth.md)                 | Auth v2 — Position ⟂ Permission model            |
| [`docs/ref/setup.md`](docs/ref/setup.md)                       | Full setup (MCP, Supabase hook, seed accounts)   |
| [`tasks/regressions.md`](tasks/regressions.md)                 | Named regression rules — read before refactor    |

## License

Proprietary — Cơm Tấm Má Tư CTCP. All rights reserved.
