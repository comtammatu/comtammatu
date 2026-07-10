# Cơm Tấm Má Tư

Bộ phần mềm quản lý vận hành và bán hàng cho Hộ kinh doanh Cơm Tấm Má Tư.
Single-tenant, multi-branch, đa kho.

Nhiệm vụ hệ thống: bán đúng, bếp nhận đúng, thu tiền đúng, in/hóa đơn đúng,
kho trừ đúng, và chủ/quản lý nhìn được tình trạng vận hành thật theo ngày.
Không phải nền tảng nhiều merchant, không phải ERP đa ngành.

Mô hình vận hành production: **Tenant → Chi nhánh**.

## Modules

| #   | Module               | Scope                                                                                     | Status  |
| --- | -------------------- | ----------------------------------------------------------------------------------------- | ------- |
| M0  | Khung quản trị       | Buồng lái điều hành, sidebar, foundation, báo cáo điều hành                               | SHIPPED |
| M1  | Menu                 | Categories, items, variants, modifiers, sides                                             | SHIPPED |
| M2  | POS                  | Cart, table/zone, order lifecycle, bill, PWA installable                                  | SHIPPED |
| M3  | KDS                  | Realtime queue, bump/complete, station config, partial-cancel ticket                      | SHIPPED |
| M4  | Payment              | Cash + VietQR (EMVCo QR, cashier-confirm) + Momo (IPN webhook). All live in production.   | SHIPPED |
| M5  | Stock                | Ingredients, recipes, PO/GRN/3-way, stocktake, transfers, branch production               | SHIPPED |
| M6  | Finance              | Finance Basic, HĐĐT HKD, reconciliation, accountant export. Enterprise COA/Journal outside HKD scope | PARTIAL |
| M7  | Nhân sự & tiền lương | Employees, contracts, attendance, payslip, payroll calc. BHXH/PIT export/reconcile partial | PARTIAL |

Active tracker: [`tasks/todo.md`](tasks/todo.md).

## Tech Stack

- **Runtime:** Node.js ≥ 24
- **Framework:** Next.js 16.2 (App Router, Turbopack dev, Webpack production build)
- **Language:** TypeScript 6.0 (strict + `noUncheckedIndexedAccess`)
- **UI:** React 19.2 · Tailwind CSS 4.2 · Com Tam Ma Tu Custom Theme · Má Tư Design System primitives (`@comtammatu/ui`)
- **Validation:** Zod 4
- **Database:** Supabase (PostgREST + Auth + RLS), JWT custom claims hook
- **Monorepo:** Turborepo 2.9 + pnpm 10.33
- **PWA:** Serwist service worker, per-branch installable POS manifest
- **Rate limiting:** Upstash Redis
- **Native printer:** ESC-POS LAN print-agent (Node 24, packaged via `@yao-pkg/pkg`)
- **Hosting:** Vercel

## Project Structure

```
apps/
  web/              # Next.js 16 app (POS, KDS, admin, inventory, finance, hr, branch operator hub)
  print-agent/      # ESC-POS LAN printer daemon (packaged via pkg)
packages/
  database/         # Supabase clients (server / client / service / middleware) + types
  shared/           # Auth (module-acl, permissions, scope), labels, payroll calc, formatters
  security/         # Upstash Redis rate limiting
  ui/               # Má Tư Design System primitives + Tailwind 4 token runtime
supabase/
  migrations/       # SQL migrations (production: file → PR → merge → owner apply)
docs/
  plan/             # Decisions log and active ADRs
  modules/          # Per-module reference (auth, database, web-app, ui, security, infrastructure)
  spec/             # Architecture, database schema, design system
  ref/              # Business domain, inventory SOP, e-invoice, PIT, glossary
  runbooks/         # Pre-release QA, operator journeys, smoke gates
  worklog/          # Policy only; no historical worklog archive
tasks/              # regressions.md, lessons.md, todo.md
scripts/            # SQL seeds, lint helpers
```

## URL Routes

| Path                        | Audience          | Surface                                                 |
| --------------------------- | ----------------- | ------------------------------------------------------- |
| `/login`                    | Public            | Authentication                                          |
| `/admin/*`                  | Manager+          | Dashboard, settings, staff, reports                     |
| `/menu`                     | Manager+          | Menu CRUD                                               |
| `/inventory/*`              | Inventory roles   | Canonical inventory hub (PO, GRN, stocktake…)           |
| `/finance/*`                | Finance roles     | Finance Basic, tiền đã thu, food-cost, chi phí, HĐĐT    |
| `/hr/*`                     | HR/payroll        | Payroll periods, payslips                               |
| `/orders`                   | Manager+          | Cross-branch order browser                              |
| `/notifications`            | All staff         | Notification center                                     |
| `/br/[branchId]/*`          | All staff         | Operator hub (Hôm nay · Ca · Lịch · Tôi) + `stock/*`    |
| `/br/[branchId]/pos`        | Cashier / service | Point of Sale (PWA installable)                         |
| `/br/[branchId]/kds`        | Chef              | Kitchen Display                                         |
| `/br/[branchId]/settings/*` | Branch manager+   | Per-branch POS, tables, printers                        |

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
pnpm build              # Production build (next build + Serwist service worker)
pnpm typecheck          # TS check across packages
pnpm lint               # ESLint + repo guards (copy, ui-contract, client-storage, rules-mirror, guard-sync, regression-guards, review-tier, doc-staleness)
pnpm test               # Test suites (turbo test)
pnpm verify             # Full gate: deps audit + baseline hygiene + typecheck + lint + build + test
pnpm format             # Prettier
pnpm db:types           # Regenerate Supabase types after a migration
```

End-to-end testing (Playwright):

```bash
pnpm --filter @comtammatu/web test:e2e
pnpm --filter @comtammatu/web guides:capture     # Capture POS flow screenshots
```

## Documentation

| Doc                                                            | Purpose                                        |
| -------------------------------------------------------------- | ---------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                                       | Canonical agent entrypoint + rule loading      |
| [`docs/CODEBASE_MAP.md`](docs/CODEBASE_MAP.md)                 | Codebase map + hub files + module index        |
| [`tasks/todo.md`](tasks/todo.md)                               | Greenfield preparation gate tracker            |
| [`docs/plan/decisions.md`](docs/plan/decisions.md)             | Legacy decision index; no backlog             |
| [`docs/spec/architecture.md`](docs/spec/architecture.md)       | System architecture                            |
| [`docs/spec/database-schema.md`](docs/spec/database-schema.md) | Database schema reference                      |
| [`docs/spec/design-system.md`](docs/spec/design-system.md)     | UI design-system SSOT / Custom Theme contract  |
| [`docs/modules/auth.md`](docs/modules/auth.md)                 | Auth v2 — Position ⟂ Permission model          |
| [`docs/ref/setup.md`](docs/ref/setup.md)                       | Minimal local project setup                    |
| [`tasks/regressions.md`](tasks/regressions.md)                 | Named regression rules — read before refactor  |

## License

Proprietary — Hộ kinh doanh Cơm Tấm Má Tư. All rights reserved.
