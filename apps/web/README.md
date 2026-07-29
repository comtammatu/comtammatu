# @comtammatu/web

Next.js 16 App Router app for Cơm Tấm Má Tư: POS, KDS, admin/control surface,
inventory, finance, HR, and branch operator hub.

## Quick start

From the repo root (see root [`README.md`](../../README.md) and
[`docs/ref/setup.md`](../../docs/ref/setup.md)):

```bash
nvm use
corepack pnpm install
cp .env.example apps/web/.env.local   # fill Supabase + Upstash
corepack pnpm dev:web                 # http://localhost:3000
```

## Surfaces

| Path | Role |
| --- | --- |
| `/admin/*`, `/menu`, `/inventory/*`, `/finance/*`, `/hr/*`, `/orders` | Control surface (Hệ thống) |
| `/br/[branchId]/*` | Branch operator hub (Vận hành) |
| `/br/[branchId]/pos` | POS (PWA) |
| `/br/[branchId]/kds` | Kitchen Display |
| `/login`, `/notifications` | Shared |

Auth + ACL: [`apps/web/proxy.ts`](./proxy.ts) +
[`packages/shared/src/auth/module-acl.ts`](../../packages/shared/src/auth/module-acl.ts).

## Commands (from root)

```bash
corepack pnpm --filter @comtammatu/web typecheck
corepack pnpm --filter @comtammatu/web lint
corepack pnpm --filter @comtammatu/web test
corepack pnpm --filter @comtammatu/web test:e2e
corepack pnpm --filter @comtammatu/web guides:capture
```

## Docs

- Module map: [`docs/modules/web-app.md`](../../docs/modules/web-app.md)
- UI contract: [`docs/spec/design-system.md`](../../docs/spec/design-system.md)
- Auth: [`docs/modules/auth.md`](../../docs/modules/auth.md)
- Infrastructure: [`docs/modules/infrastructure.md`](../../docs/modules/infrastructure.md)
- E2E guide capture: [`e2e/guides/README.md`](./e2e/guides/README.md)
