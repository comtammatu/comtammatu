# Cơm Tấm Má Tư

Hệ thống Vận hành F&B (F&B Operations System) — hệ thống nội bộ của Công ty Cổ phần Chén Sứ để vận hành chuỗi Cơm Tấm Má Tư: thống nhất bán hàng, bếp, kho, in ấn, giao hàng, tiền, hoá đơn và nhân sự trên một nguồn dữ liệu. Định nghĩa và ranh giới phạm vi: ADR 0025.

Mô hình vận hành production: **Tenant (L0) → Chi nhánh (L1)**.

## Modules

| #   | Phân hệ               | Phạm vi & Chức năng                                                                                                  | Trạng thái |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------- |
| M0  | Khung quản trị       | Buồng lái điều hành (Executive Cockpit), branch switcher, shell nền tảng, báo cáo tổng quan                           | HOÀN THÀNH |
| M1  | Menu & Danh mục      | Categories, items, variants, modifiers, combos, giới hạn bán ngày (menu limits)                                      | HOÀN THÀNH |
| M2  | Bán hàng (POS)       | Cart, table/zone, order lifecycle, draft bills, guest QR self-order, PWA installable, POS network gate               | HOÀN THÀNH |
| M3  | Bếp & Bar (KDS)      | Realtime ticket queue, station routing, bump/complete, in phiếu huỷ món                                              | HOÀN THÀNH |
| M4  | Thanh toán (Payment) | Cash + VietQR (EMVCo QR tĩnh/động), xác nhận thu ngân, webhook SePay tự động khớp giao dịch                          | HOÀN THÀNH |
| M5  | Kho & Bếp trung tâm  | Nguyên vật liệu, BOM, PO/GRN/3-way matching, kiểm kê, luân chuyển Kho Tổng (CW) → Bếp (CK) → Chi nhánh, sản xuất BTT | HOÀN THÀNH |
| M6  | Tài chính & Hoá đơn  | Finance Basic, sổ quỹ tiền mặt, chi phí, food-cost, HĐĐT (S-invoice) theo VAT từng dòng                              | HOÀN THÀNH |
| M7  | Nhân sự & Tiền lương | Hồ sơ nhân viên, hợp đồng, ca làm việc, chấm công, bảng lương & phiếu lương điện tử                                  | HOÀN THÀNH |
| M8  | Giao hàng & Relay    | Tiếp nhận đơn giao hàng (GrabFood, ShopeeFood) qua Chrome Extensions & Android Má Tư Agent intake                     | HOÀN THÀNH |
| M9  | Không gian làm việc  | Quản lý nhiệm vụ (Work), checklist ca, phân công công việc phòng ban và chi nhánh                                    | HOÀN THÀNH |

Active tracker: [`tasks/todo.md`](tasks/todo.md).

## Tech Stack

- **Web runtime:** Node.js 24.x · Next.js 16 App Router · React 19 · Turbopack
- **Language & validation:** TypeScript 6 strict (`noUncheckedIndexedAccess: true`) · Zod 4
- **UI & Design system:** Tailwind CSS 4 · Má Tư Design System · `@comtammatu/ui`
- **Data & backend:** Supabase Cloud (Postgres 16, PostgREST, Auth v2, RLS-first, Realtime, Storage)
- **PWA & offline capability:** Serwist service worker · Per-branch installable manifests
- **Branch edge printing:** Node.js 24 ESC/POS LAN print-agent (esbuild bundle + Windows NSSM service)
- **Delivery relay & hardware bridge:** Android Má Tư Agent (Kotlin) · GrabFood & ShopeeFood Chrome Extensions (Manifest V3)
- **Infrastructure & security:** Vercel (`sin1`) · Upstash Redis rate limiting · GitHub Actions CI
- **Monorepo:** pnpm 10.x · Turborepo 2

Exact dependency versions belong to `package.json` files and `pnpm-lock.yaml`.
Runtime, environment, and deployment contracts live in [`docs/modules/infrastructure.md`](docs/modules/infrastructure.md).

## Project Structure

```text
apps/
  web/              # Next.js 16 App Router (POS, KDS, admin, inventory, finance, hr, work, operator hub)
  print-agent/      # ESC/POS LAN printer daemon (esbuild bundle + NSSM service)
tools/
  matu-agent/       # Android background intake service + ESC/POS printer discovery & relay
  grab-pos-relay-extension/       # Chrome Extension for GrabFood Merchant web intake
  shopeefood-pos-relay-extension/ # Chrome Extension for ShopeeFood Merchant web intake
packages/
  database/         # Supabase clients (server / client / service / middleware) + generated types
  print-render/     # Shared receipt/template renderer for web preview + print-agent
  shared/           # Auth (module-acl, permissions, scope), labels, payroll calc, formatters
  security/         # Upstash Redis rate limiting
  ui/               # Má Tư Design System shared components (`@comtammatu/ui`) + Tailwind 4 token runtime
supabase/
  migrations/       # SQL migrations (production: file → PR → merge → owner apply)
docs/
  plan/             # Decisions log and active ADRs
  modules/          # Per-module reference (auth, database, web-app, ui, security, infrastructure, finance, feedback)
  spec/             # Architecture, database schema, design system, page archetypes
  ref/              # Business domain, inventory SOP, e-invoice, PIT, glossary
  runbooks/         # Pre-release QA, operator journeys, smoke gates, print-agent rollout
tasks/              # regressions.md, lessons.md, todo.md
scripts/            # Operational verification, regression guards, lint helpers
```

## URL Routes

| Path                        | Audience          | Surface                                                               |
| --------------------------- | ----------------- | --------------------------------------------------------------------- |
| `/login`                    | Public            | Authentication & sign-in                                              |
| `/`                         | Control roles     | Control-surface home and branch picker                                |
| `/menu`                     | Manager+          | Menu CRUD                                                             |
| `/inventory/*`              | Inventory roles   | Canonical inventory hub (PO, GRN, stocktake, transfers, production)   |
| `/finance/*`                | Finance roles     | Finance Basic, tiền đã thu, food-cost, chi phí, HĐĐT                  |
| `/hr/*`                     | HR/payroll        | Staff profiles, payroll periods, payslips                             |
| `/work`                     | Control roles     | Department tasks & operational workflow tracker                       |
| `/orders`                   | Manager+          | Cross-branch order browser                                            |
| `/notifications`            | All staff         | Notification center                                                   |
| `/br/[branchId]/*`          | All staff         | Operator hub (Hôm nay · Ca · Lịch · Tôi) + `stock/*`                  |
| `/br/[branchId]/pos`        | Cashier / service | Point of Sale (PWA installable)                                       |
| `/br/[branchId]/kds`        | Chef              | Kitchen Display System                                                |
| `/br/[branchId]/pickup`     | Staff / Customer  | Customer pickup queue display                                         |
| `/br/[branchId]/settings/*` | Branch manager+   | Per-branch POS, tables, printers, menu limits                         |

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

| Doc                                                            | Purpose                                              |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                                       | Canonical agent entrypoint + rule loading            |
| [`docs/CODEBASE_MAP.md`](docs/CODEBASE_MAP.md)                 | Codebase map + hub files + module index              |
| [`tasks/todo.md`](tasks/todo.md)                               | Active outcome tracker                               |
| [`docs/plan/decisions.md`](docs/plan/decisions.md)             | Legacy decision index; no backlog                    |
| [`docs/spec/architecture.md`](docs/spec/architecture.md)       | System architecture                                  |
| [`docs/spec/database-schema.md`](docs/spec/database-schema.md) | Database schema reference                            |
| [`docs/spec/design-system.md`](docs/spec/design-system.md)     | UI design-system SSOT / Má Tư Design System contract |
| [`docs/modules/auth.md`](docs/modules/auth.md)                 | Auth v2 — Position ⟂ Permission model                |
| [`docs/ref/setup.md`](docs/ref/setup.md)                       | Minimal local project setup                          |
| [`tasks/regressions.md`](tasks/regressions.md)                 | Named regression rules — read before refactor        |

## License

Proprietary — Công ty Cổ phần Chén Sứ. All rights reserved.
