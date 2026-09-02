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

Production stack: Vercel project `comtammatu` · domain `web.comtammatu.com` ·
Supabase Production `enloyfnuerqgaqderbwb`. Registry and agent rights:
`docs/agent/rules/database.md`.

## Platforms

### GitHub

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on `push` /
`pull_request` (docs-only paths ignored) and `workflow_dispatch`:

| Job | When | What |
| --- | --- | --- |
| `gates` | Always (non-docs) | `pnpm verify` |
| `baseline-replay` | PR touches `supabase/` (or dispatch) | Fresh Local Docker baseline replay |
| `e2e-smoke` | PR touches apps/packages/scripts/supabase (or dispatch) | Isolated Supabase + Playwright smoke |

Overview: [`.github/CI.md`](../../.github/CI.md).

### Vercel

Config: [`apps/web/vercel.json`](../../apps/web/vercel.json).

- Region: `sin1`
- Git deploy: `main` only; other branches disabled
- `ignoreCommand`: skip deploy when the commit does not touch apps, packages,
  scripts, supabase, or root workspace manifests
- Crons: `/api/cron/kds-maintenance`, `/api/cron/tax-invoice-issue`, `/api/cron/attendance-checkout-auto-approve`
- Preview: fail-closed via `scripts/check-preview-supabase-env.mjs` — do not put
  Supabase credentials on Vercel Preview
- Service worker headers: `apps/web/next.config.ts` serves `/sw.js` with
  `Cache-Control: no-cache` (contract: `docs/spec/pwa.md`). Security headers
  still apply via `source: "/:path*"`.

Owner env checklist: `docs/ref/setup.md`.

### Supabase

- Production is the repository type source (`pnpm db:types` requires the
  registered Production project id).
- Active migrations: `supabase/migrations/` (baseline + forwards). Historical
  incrementals are git history, not an in-tree archive.
- Production apply is owner-gated; never raw `supabase db push` to Cloud.
- Disposable Preview Branches must be children of Production; Local Docker is
  not a Cloud substitute (CI E2E harness is the sole Docker write exception).

Pointers: [`supabase/README.md`](../../supabase/README.md),
[`supabase/migrations/README.md`](../../supabase/migrations/README.md),
`docs/runbooks/db/preview-branch-setup.md`,
`docs/runbooks/db/re-baseline.md`.

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
