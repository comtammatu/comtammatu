# Cơm Tấm Má Tư

Hệ thống Vận hành F&B (F&B Operations System) — hệ thống nội bộ của Công ty
Cổ phần Chén Sứ để vận hành chuỗi Cơm Tấm Má Tư: thống nhất bán hàng, bếp,
kho, tiền, hoá đơn và nhân sự trên một nguồn dữ liệu.
Định nghĩa và ranh giới phạm vi: ADR 0025.

Mô hình vận hành production: **Tenant → Chi nhánh**.

## Modules

| #   | Module               | Scope                                                                                                                | Status  |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------- | ------- |
| M0  | Khung quản trị       | Buồng lái điều hành, sidebar, foundation, báo cáo điều hành                                                          | SHIPPED |
| M1  | Menu                 | Categories, items, variants, modifiers, sides                                                                        | SHIPPED |
| M2  | POS                  | Cart, table/zone, order lifecycle, bill, PWA installable                                                             | SHIPPED |
| M3  | KDS                  | Realtime queue, bump/complete, station config, partial-cancel ticket                                                 | SHIPPED |
| M4  | Payment              | Cash + VietQR (EMVCo QR, cashier-confirm).                                                                           | SHIPPED |
| M5  | Stock                | Ingredients, recipes, PO/GRN/3-way, stocktake, transfers, branch production                                          | SHIPPED |
| M6  | Finance              | Finance Basic, HĐĐT theo VAT từng dòng, reconciliation, accountant export; Enterprise COA/Journal chưa thuộc phạm vi | PARTIAL |
| M7  | Nhân sự & tiền lương | Employees, contracts, attendance, payslip, payroll calc. BHXH/PIT export/reconcile partial                           | PARTIAL |

Active tracker: [`tasks/todo.md`](tasks/todo.md).

## Tech Stack

- **Web runtime:** Node.js 24.x · Next.js 16 App Router · React 19 · Turbopack
- **Language and validation:** TypeScript 6 strict · Zod 4
- **UI:** Tailwind CSS 4 · Má Tư Design System · `@comtammatu/ui`
- **Data and auth:** Supabase Cloud (Postgres, PostgREST, Auth, RLS, Realtime, Storage)
- **PWA:** Serwist service worker and per-branch installable manifests
- **Infrastructure:** Vercel (`sin1`) · Upstash Redis · GitHub Actions
- **Branch edge:** Node 24 ESC/POS LAN print-agent, esbuild bundle, Windows service via NSSM
- **Monorepo:** pnpm 10.33 · Turborepo 2

Exact dependency versions belong to `package.json` files and `pnpm-lock.yaml`.
Runtime, environment, and deployment contracts live in
[`docs/modules/infrastructure.md`](docs/modules/infrastructure.md).

## Project Structure

```
apps/
  web/              # Next.js 16 app (POS, KDS, admin, inventory, finance, hr, branch operator hub)
  print-agent/      # ESC-POS LAN printer daemon (esbuild bundle + NSSM service)
packages/
  database/         # Supabase clients (server / client / service / middleware) + types
  print-render/     # Shared receipt/template renderer for web preview + print-agent
  shared/           # Auth (module-acl, permissions, scope), labels, payroll calc, formatters
  security/         # Upstash Redis rate limiting
  ui/               # Má Tư Design System shared components (`@comtammatu/ui`) + Tailwind 4 token runtime
supabase/
  migrations/       # SQL migrations (production: file → PR → merge → owner apply)
docs/
  plan/             # Decisions log and active ADRs
  modules/          # Per-module reference (auth, database, web-app, ui, security, infrastructure, finance, feedback)
  spec/             # Architecture, database schema, design system
  ref/              # Business domain, inventory SOP, e-invoice, PIT, glossary
  runbooks/         # Pre-release QA, operator journeys, smoke gates, db Preview/re-baseline
tasks/              # regressions.md, lessons.md, todo.md
scripts/            # SQL seeds, lint helpers
```

## URL Routes

| Path                        | Audience          | Surface                                              |
| --------------------------- | ----------------- | ---------------------------------------------------- |
| `/login`                    | Public            | Authentication                                       |
| `/`                         | Control roles     | Control-surface home and branch picker               |
| `/menu`                     | Manager+          | Menu CRUD                                            |
| `/inventory/*`              | Inventory roles   | Canonical inventory hub (PO, GRN, stocktake…)        |
| `/finance/*`                | Finance roles     | Finance Basic, tiền đã thu, food-cost, chi phí, HĐĐT |
| `/hr/*`                     | HR/payroll        | Payroll periods, payslips                            |
| `/orders`                   | Manager+          | Cross-branch order browser                           |
| `/notifications`            | All staff         | Notification center                                  |
| `/br/[branchId]/*`          | All staff         | Operator hub (Hôm nay · Ca · Lịch · Tôi) + `stock/*` |
| `/br/[branchId]/pos`        | Cashier / service | Point of Sale (PWA installable)                      |
| `/br/[branchId]/kds`        | Chef              | Kitchen Display                                      |
| `/br/[branchId]/settings/*` | Branch manager+   | Per-branch POS, tables, printers                     |

Auth + ACL được enforce tại [`apps/web/proxy.ts`](apps/web/proxy.ts) qua Auth v2 (Position ⟂ Permission, RLS-first). Route catalog: [`packages/shared/src/auth/module-acl.ts`](packages/shared/src/auth/module-acl.ts).

## Getting Started

Setup chi tiết (MCP, gstack skills, Supabase JWT hook, seed accounts): [`docs/ref/setup.md`](docs/ref/setup.md).

```bash
nvm use                                # Node 24.x
corepack pnpm install
cp .env.example apps/web/.env.local    # Fill Supabase + Upstash credentials
corepack pnpm dev                      # Turbopack dev server (http://localhost:3000)
```

## Commands

```bash
corepack pnpm agent:start  # Status-first CodeGraph refresh (optional; indexing is an owner decision)
corepack pnpm dev          # Turbopack dev (all apps)
corepack pnpm dev:web      # Web only
corepack pnpm dev:print    # Print agent only
corepack pnpm build        # Production build (next build + Serwist service worker)
corepack pnpm typecheck    # TS check across packages
corepack pnpm lint         # Repo guards (copy, UI, storage, rules, …) + ESLint
corepack pnpm test         # Test suites (turbo test)
corepack pnpm verify       # Full gate: deps:security → deps:audit → deps:boundaries → typecheck → lint → build → test
corepack pnpm format       # Prettier
corepack pnpm db:types     # Regenerate Supabase types after a migration is applied to the type source
```

End-to-end testing (Playwright):

```bash
corepack pnpm --filter @comtammatu/web test:e2e
corepack pnpm --filter @comtammatu/web guides:capture      # Capture POS flow screenshots → docs/user-guides/
corepack pnpm --filter @comtammatu/web guides:capture:list # List guide scenarios
```

## Documentation

| Doc                                                            | Purpose                                       |
| -------------------------------------------------------------- | --------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                                       | Canonical agent entrypoint + rule loading     |
| [`docs/CODEBASE_MAP.md`](docs/CODEBASE_MAP.md)                 | Codebase map + hub files + module index       |
| [`tasks/todo.md`](tasks/todo.md)                               | Active outcome tracker                        |
| [`docs/plan/decisions.md`](docs/plan/decisions.md)             | Legacy decision index; no backlog             |
| [`docs/spec/architecture.md`](docs/spec/architecture.md)       | System architecture                           |
| [`docs/spec/database-schema.md`](docs/spec/database-schema.md) | Database schema reference                     |
| [`docs/spec/design-system.md`](docs/spec/design-system.md)     | UI design-system SSOT / Má Tư Design System contract |
| [`docs/modules/auth.md`](docs/modules/auth.md)                 | Auth v2 — Position ⟂ Permission model         |
| [`docs/ref/setup.md`](docs/ref/setup.md)                       | Minimal local project setup                   |
| [`tasks/regressions.md`](tasks/regressions.md)                 | Named regression rules — read before refactor |

## License

Proprietary — Công ty Cổ phần Chén Sứ. All rights reserved.
