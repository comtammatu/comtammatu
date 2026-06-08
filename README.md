# Cơm Tấm Má Tư

Bộ phần mềm quản lý vận hành và bán hàng cho **Hộ Kinh Doanh** Cơm Tấm Má Tư.
Single-tenant (một hộ kinh doanh, `tenant_id` được giữ có chủ đích cho scope), multi-branch (các chi nhánh ngang hàng).

Nhiệm vụ hệ thống: bán đúng, bếp nhận đúng, thu tiền đúng, in/hóa đơn đúng,
và chủ/quản lý nhìn được tình trạng vận hành thật theo ngày.
Không phải nền tảng nhiều merchant, không phải CRM độc lập, không phải ERP đa ngành.

Mô hình vận hành (lean HKD): **chi nhánh ngang hàng (flat-branch)** — mỗi chi nhánh tự nhập hàng (GRN) và tự kiểm kê (stocktake). Không có Kho Tổng / Bếp Trung Tâm / luân chuyển nội bộ giữa chi nhánh, không trừ kho theo từng đơn bán.

## Modules

| #   | Module               | Scope (lean HKD)                                                                                  | Status  |
| --- | -------------------- | ------------------------------------------------------------------------------------------------- | ------- |
| M0  | Khung quản trị       | Buồng lái điều hành, sidebar, foundation, báo cáo điều hành                                       | SHIPPED |
| M1  | Menu                 | Categories, items, variants, modifiers, sides                                                     | SHIPPED |
| M2  | POS                  | Cart, table/zone, order lifecycle (pay-after), item discount, bill, PWA installable               | SHIPPED |
| M3  | KDS                  | Realtime queue, bump/complete, station config, partial-cancel ticket                              | SHIPPED |
| M4  | Payment              | Cash + VietQR (EMVCo QR, cashier-confirm) + Momo (IPN webhook). All live in production.           | SHIPPED |
| M5  | Inventory (lean)     | Ingredients, suppliers, GRN, stock_levels, monthly stocktake-variance, supplier debt             | SHIPPED |
| M6  | Staff & scheduling   | Employees, attendance, shift_assignments, cash-book. HĐĐT active qua Viettel S-invoice            | SHIPPED |

> **Lean HKD scope (cut, không còn trong baseline):** GL/VAS/BCTC, payroll engine (BHXH/PIT), heavy inventory (transfers, issues, waste, production, PO, recipes/định mức, QC, ABC), perpetual sale-deduction, feedback/CRM/telegram/AI, area (vùng + area_manager). KEEP có chủ đích: item-level discount, lean scheduling (`shift_assignments`), supplier debt, HĐĐT Viettel.

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
  web/              # Next.js 16 app (POS, KDS, admin, inventory-lean, staff/scheduling, employee)
  print-agent/      # ESC-POS printer daemon (LAN transport; Windows .exe via pkg)
packages/
  database/         # Supabase clients (server / client / service / middleware) + types
  shared/           # Auth (module-acl, permissions, scope), labels, formatters, security (rate limit)
  ui/               # shadcn/ui components (Radix + Tailwind 4)
supabase/
  migrations/       # SQL migrations (lean baseline + forward; production: file → PR → merge → owner apply)
docs/
  plan/             # Decisions log and active ADRs
  modules/          # Per-module reference (auth, database, web-app, ui, security, infrastructure)
  spec/             # Architecture, database schema, design system
  ref/              # Business domain, inventory, e-invoice, glossary
  runbooks/         # Pre-release QA, operator journeys, smoke gates
  user-guides/      # POS flow guides
  worklog/          # Adoption matrix, evidence log
tasks/              # regressions.md, lessons.md, todo.md
scripts/            # SQL seeds, lint helpers
```

> The `security` package was merged into `@comtammatu/shared` (V9): rate limiting now imports from `@comtammatu/shared/security`.

## URL Routes

| Path                        | Audience         | Surface                                       |
| --------------------------- | ---------------- | --------------------------------------------- |
| `/login`                    | Public           | Authentication                                |
| `/admin/*`                  | Owner/Manager    | Dashboard, settings, staff, reports           |
| `/menu`                     | Owner/Manager    | Menu CRUD                                     |
| `/inventory/*`              | Owner/Manager    | Lean inventory (ingredients, GRN, stocktake)  |
| `/orders`                   | Owner/Manager    | Cross-branch order browser                    |
| `/notifications`            | All staff        | Notification center                           |
| `/employee/*`               | All staff        | Self-service: clock, schedule                  |
| `/br/[branchId]/pos`        | Staff            | Point of Sale (PWA installable)               |
| `/br/[branchId]/kds`        | Chef             | Kitchen Display                               |
| `/br/[branchId]/settings/*` | Owner/Manager    | Per-branch POS, tables, printers              |

> Lean HKD roles: 4 only — `owner`, `manager`, `staff`, `chef` (the old 8–10 role tree, including `area_manager`, was cut). Legacy `office` maps to `staff`.

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

| Doc                                                            | Purpose                                        |
| -------------------------------------------------------------- | ---------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                                       | Canonical agent entrypoint + rule loading      |
| [`docs/CODEBASE_MAP.md`](docs/CODEBASE_MAP.md)                 | Codebase map + hub files + module index        |
| [`tasks/todo.md`](tasks/todo.md)                               | Active work tracker                            |
| [`docs/plan/decisions.md`](docs/plan/decisions.md)             | Architecture decisions log                     |
| [`docs/spec/architecture.md`](docs/spec/architecture.md)       | System architecture                            |
| [`docs/spec/database-schema.md`](docs/spec/database-schema.md) | Database schema reference                      |
| [`docs/spec/design-system.md`](docs/spec/design-system.md)     | Locked UI design-system contract               |
| [`docs/modules/auth.md`](docs/modules/auth.md)                 | Auth v2 — Position ⟂ Permission model          |
| [`docs/ref/setup.md`](docs/ref/setup.md)                       | Full setup (MCP, Supabase hook, seed accounts) |
| [`tasks/regressions.md`](tasks/regressions.md)                 | Named regression rules — read before refactor  |

## License

Proprietary — Hộ Kinh Doanh Cơm Tấm Má Tư. All rights reserved.
