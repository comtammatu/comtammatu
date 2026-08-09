# Infrastructure Module

Deployable topology and stack families. Runtime behavior:
`docs/spec/architecture.md`. Versions live in package manifests / lockfile;
env key names in `.env.example`; DB target rights in
`docs/agent/rules/database.md`.

## Runtime Topology

| Runtime | Location | Hosting | Responsibility |
| --- | --- | --- | --- |
| Web | `apps/web` | Vercel `sin1` | RSC, Server Actions, cron |
| Data | Supabase Cloud | Managed | Auth, Postgres, RLS, Realtime, Storage |
| Rate-limit | Upstash Redis | Managed | Throttling (`docs/modules/security.md`) |
| Branch edge | `apps/print-agent` | Windows service / branch | ESC/POS print + heartbeat |

Web is stateless. Supabase is system of record. Print-agent does not own orders,
payments, or stock.

## Stack Contract (owners)

| Concern | Choice | Owner |
| --- | --- | --- |
| Node / pnpm / Turbo | engines + workspace | root `package.json`, `turbo.json` |
| Next / React | App Router | `apps/web/package.json` |
| TypeScript | strict + `noUncheckedIndexedAccess` | `tsconfig.base.json` |
| UI | Má Tư DS + Tailwind 4 | `packages/ui`, `docs/spec/design-system.md` |
| Data client | `supabase-js` + SSR | database / web manifests |
| Verification | `tsx` tests + Playwright | package scripts |

## Monorepo (short)

`apps/web`, `apps/print-agent`, `packages/{database,shared,ui,print-render,security}`,
`supabase/migrations`. CI and release gates live in root `package.json` /
`pnpm lint` / `pnpm verify`. Print rollout: `docs/runbooks/pos-kds/print-agent-rollout.md`.
Preview DB: `docs/runbooks/db/preview-branch-setup.md`.
