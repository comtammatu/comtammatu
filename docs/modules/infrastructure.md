# Infrastructure Module

## Scope And Authority

This document owns the deployable topology, stack families, environment model,
configuration boundaries, CI, and release gates. `docs/spec/architecture.md`
owns system behavior and runtime boundaries.

Exact dependency versions belong to package manifests and `pnpm-lock.yaml`;
environment key names belong to `.env.example` and runtime readers; database
target rights belong to `docs/agent/rules/database.md`. Do not copy those facts
into a second registry here.

## Runtime Topology

| Runtime          | Location           | Hosting                        | Responsibility                                                                                         |
| ---------------- | ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Web              | `apps/web`         | Vercel, region `sin1`          | Browser delivery, RSC, Server Actions, route handlers, cron endpoints                                  |
| Data platform    | Supabase Cloud     | Managed                        | Auth, Postgres, PostgREST, RLS, Realtime, Storage                                                      |
| Rate-limit store | Upstash Redis      | Managed                        | Distributed request throttling                                                                         |
| Branch edge      | `apps/print-agent` | One Windows service per branch | Claim durable print jobs, render receipts/tickets, deliver ESC/POS over LAN, report heartbeat/presence |

The web runtime is stateless. Supabase is the operational system of record. The
branch agent may recover and retry print delivery, but it does not own orders,
payments, stock, or another local database.

## Tech Stack Contract

| Concern       | Choice                                                      | Version owner                                            |
| ------------- | ----------------------------------------------------------- | -------------------------------------------------------- |
| Runtime       | Node.js 24.x                                                | root `package.json` `engines`                            |
| Workspace     | pnpm 10.33 + Turborepo 2                                    | root `package.json`, `turbo.json`                        |
| Web           | Next.js 16 + React 19                                       | `apps/web/package.json`                                  |
| Language      | TypeScript 6 strict with `noUncheckedIndexedAccess`         | root manifest + `tsconfig.base.json`                     |
| Validation    | Zod 4; React Hook Form for CRUD forms                       | `apps/web/package.json`                                  |
| UI            | Tailwind CSS 4 + Má Tư Design System                        | `packages/ui/package.json`, `docs/spec/design-system.md` |
| Data client   | `supabase-js` 2 + `@supabase/ssr`                           | web/database/agent manifests                             |
| Database CLI  | Workspace-pinned Supabase CLI                               | root `package.json`                                      |
| PWA           | Serwist 9                                                   | `apps/web/package.json`, `apps/web/app/sw.ts`            |
| Branch bundle | esbuild ESM bundle, Node.js installed on host, NSSM service | `apps/print-agent/package.json`, rollout runbook         |
| Verification  | Node test runner through `tsx`; Playwright browser checks   | package scripts                                          |

## Monorepo Structure

```
comtammatu/
├── apps/
│   ├── web/                # Next.js 16.2 — deployable web app (Vercel)
│   └── print-agent/        # ESC/POS print daemon — chạy thật tại chi nhánh (runbook: docs/runbooks/pos-kds/print-agent-rollout.md)
├── packages/
│   ├── database/           # Supabase clients + generated types
│   ├── shared/             # Auth types, ACL, utilities
│   ├── ui/                 # Má Tư DS shared components + token runtime
│   ├── print-render/       # Receipt/template renderer SSoT (agent + web preview)
│   └── security/           # Rate limiting
├── supabase/
│   └── migrations/         # SQL migrations; owner manually applies prod after merge
├── turbo.json              # Task pipeline
├── pnpm-workspace.yaml     # Workspace definition
└── tsconfig.base.json      # Shared TS config
```

## Environment Model

| Environment           | Web runtime                       | Database target                                                                            | Mutation policy                                                                        |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Developer workstation | Local Next.js/print-agent         | Production Supabase for application runtime; database tooling remains read-only by default | Writes require exact current-session owner delegation; no workstation Local substitute |
| Vercel Preview        | Disabled                          | None                                                                                       | Supabase environment variables are rejected                                            |
| CI                    | GitHub-hosted runner              | Isolated Supabase Local started by CI-only harness                                         | Disposable baseline, seed, SQL, and E2E verification only                              |
| Production            | Vercel production + branch agents | Production Supabase                                                                        | Agent reads by default; writes/applies require the rights in the Environment Registry  |

The Environment Registry in `docs/agent/rules/database.md` is the only source
for project refs and agent rights. Preview Branches do not silently promote or
merge into production.

## Configuration And Secret Boundaries

| Scope              | Examples                                                               | Rule                                                                              |
| ------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Browser-public     | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`     | Safe to embed; the publishable key is canonical for new configuration             |
| Web server-only    | service-role key, Upstash tokens, cron/webhook/provider credentials    | Server environment only; never expose through `NEXT_PUBLIC_*` or client bundles   |
| Database tooling   | project ref and database password                                      | Explicit verified target; never infer a write target from local link state        |
| Branch agent-local | Supabase URL/service key, tenant/branch/agent identity, presence token | Local protected `.env`; one identity/token per agent; never sync to cloud storage |

`NEXT_PUBLIC_SUPABASE_ANON_KEY` remains a compatibility fallback in runtime and
CI. Do not add new usage. The complete web key catalog is `.env.example`; the
branch-agent catalog is `apps/print-agent/.env.example`.

## Build And Verification Pipeline

Turborepo owns task ordering in `turbo.json`:

- `build`, `lint`, `typecheck`, and `test` depend on dependency-package builds.
- `dev` is persistent and uncached.
- Web build outputs include Next.js artifacts and the generated Serwist worker;
  print-agent build outputs `dist/index.js`.
- `corepack pnpm verify` runs dependency audit (including Node runtime drift),
  baseline hygiene, typecheck, lint/guards, build, and tests.

GitHub Actions runs the standard gates on pull requests and `main`. Conditional
jobs replay the from-empty database baseline and run the POS → payment → KDS
smoke against the CI-only isolated Supabase stack.

Every Vercel Preview build runs `scripts/check-preview-supabase-env.mjs` before
Next.js compilation and fails closed. The repository has no persistent
non-production database, and the build cannot currently prove that supplied
credentials belong to an ephemeral child of Production. Production and CI-only
Local builds stay outside this Preview gate.

### Dependency maintenance boundaries

Package manifests and the lockfile remain the version source of truth. The
following compatibility boundaries explain why a dependency can intentionally
remain below the registry's latest major:

| Dependency family | Owner             | Retention reason                                                                                                            | Revisit trigger                                                                                                                                           |
| ----------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript        | Platform tooling  | The ESLint TypeScript integration still requires the TypeScript 6 programmatic API; TypeScript 7 does not expose that API.  | Upgrade when `typescript-eslint` supports the stable TypeScript 7 API, or when TypeScript 7.1 provides the API and the full lint/typecheck matrix passes. |
| Node.js types     | Runtime platform  | CI, Vercel, and the branch bundle target Node.js 24, so declarations must model that runtime instead of a newer major.      | Upgrade only with an explicit Node.js 26 runtime migration across CI, Vercel, and branch agents.                                                          |
| pnpm              | Workspace tooling | The next major changes install trust and lockfile behavior, which requires a dedicated clean-install and remote-CI rollout. | Revisit in an isolated package-manager wave with clean Linux/macOS installs and all CI jobs available.                                                    |

The workspace keeps only three transitive overrides:

| Override             | Owner               | Reason                                                                                                                                                                                       | Revisit trigger                                                                                                                     |
| -------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| ExcelJS unzip reader | Spreadsheet runtime | Replaces ExcelJS's legacy unzip chain, removing unlicensed and obsolete packages; ExcelJS stays external to the Next server bundle because the reader exposes an unused optional S3 adapter. | Remove when ExcelJS declares a current unzip reader; the XLSX round-trip and Next external-boundary contract tests must stay green. |
| ExcelJS UUID helper  | Spreadsheet runtime | Keeps the last CommonJS-compatible UUID line behind ExcelJS's CommonJS call site.                                                                                                            | Remove when ExcelJS updates its UUID dependency or becomes ESM-compatible.                                                          |
| Next.js PostCSS      | Web build           | Aligns Next.js's exact legacy declaration with the audited PostCSS used by the Tailwind build, avoiding two installed copies.                                                                | Remove when Next.js declares the same or newer PostCSS line.                                                                        |

Four deprecated transitive packages remain upstream-owned: `glob`, `inflight`,
and `lodash.isequal` under ExcelJS's archive writer, plus the beta `source-map`
under Serwist. Spreadsheet runtime owns the first group and must recheck every
ExcelJS release or before expanding XLSX features. Web/PWA owns `source-map` and
must recheck every Serwist release. New deprecated or unresolved-license groups
are not accepted silently; dependency inventory and `deps:audit` must classify
them before merge.

## Development Setup

```bash
corepack enable
corepack pnpm install
corepack pnpm dev
```

Generate database types from the registered Production schema only after the
migration is applied:

```bash
SUPABASE_PROJECT_ID=REGISTERED_PRODUCTION_REF corepack pnpm db:types
```

Full setup: `docs/ref/setup.md`. Preview database setup:
`docs/runbooks/db/preview-branch-setup.md`.

## Release Gates

| Deliverable | Promotion path                                                               | Completion evidence                                                        |
| ----------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Web         | PR → CI → merge to `main` → Vercel production deployment                     | CI URL/status and Vercel deployment evidence                               |
| Database    | migration file → review/Preview proof → merge → owner-gated production apply | Target ref, migration ledger/schema check, generated types when applicable |
| Print-agent | build bundle → deploy Windows service per branch → on-site smoke             | Version heartbeat, Realtime subscription, physical print and retry proof   |

`written`, `CI green`, `merged`, `Vercel deployed`, `production migration
applied`, and `branch runtime proven` are separate states.

## Deliberate Non-Goals

The current platform does not need Kubernetes, a microservice split, a second
database, workstation Docker as a Cloud substitute, Terraform scaffolding, or a
native POS rewrite. Add infrastructure only when a measured reliability,
security, scale, or repeatability gap cannot be closed by the current managed
platform and repo guards.

## Key Commands

```bash
corepack pnpm dev
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
corepack pnpm test
corepack pnpm verify
corepack pnpm db:types
```
