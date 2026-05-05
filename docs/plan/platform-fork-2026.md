# Platform Fork 2026

> Status: fork preparation draft  
> Date: 2026-05-04  
> Scope requested: create a fork-based next version from the current project, using Cloudflare Workers instead of a Node.js app runtime, Flutter/Dart instead of POS PWA, PostgreSQL 18 instead of managed Supabase Postgres 14, and TypeScript 7 native (`tsgo`) for TypeScript tooling. Bun is not in the bootstrap stack.

## Core Decision

This is not an in-place refactor of the current production project.

The current repository remains the source-of-truth for shipped business behavior, schema lessons, terminology, UI contracts, and regression rules. The fork becomes a new version with a new runtime and infrastructure architecture.

Implication:

- Do not gradually mutate the current app into the new stack.
- Do not force the current Next.js/PWA/Supabase architecture to carry Bun/Flutter/PostgreSQL 18 decisions.
- Use the current project as a verified baseline and contract source.
- Build a separate fork workspace/repository, then port behavior by domain slices.

## Fork Boundary

Recommended fork identity:

```text
Current product: comtammatu
Fork product:   matu-pros
```

Recommended local layout:

```text
/Users/luongthebinh/Downloads/comtammatu       # current repo, do not destabilize
/Users/luongthebinh/Downloads/matu-pros        # fork workspace
```

The fork should start from a clean committed baseline, not from untracked local UI edits, unless the owner explicitly decides to include those edits. The current worktree has unrelated modified UI files, so the base commit decision must be explicit before creating the actual fork.

## Current Project Assets To Reuse

Reuse as contracts:

- Domain rules and terminology in `docs/ref/`.
- Regression rules in `tasks/regressions.md`.
- Database table/RPC behavior from `supabase/migrations/`.
- ACL permission catalog from `packages/shared/src/auth/`.
- POS/KDS workflows and edge cases from `apps/web/app/br/[branchId]/`.
- Design-system decisions from `docs/spec/design-system.md`.
- Existing runbooks and smoke tests.

Do not blindly copy as architecture:

- Next.js App Router runtime.
- PWA/Serwist offline strategy.
- Supabase Auth/PostgREST/Realtime/Storage as managed-platform assumptions.
- Node-based print-agent service model.
- `pnpm`/Turborepo command contract, unless kept only during extraction.

## Target Architecture

Preferred fork architecture:

```text
Flutter Android/iOS mobile app
  -> Cloudflare WAF/rate limits
  -> Cloudflare Worker (Hono API + auth + OpenAPI)
  -> Hyperdrive
  -> Workers VPC/Tunnel
  -> PostgreSQL 18 private host

Cloudflare Worker
  -> R2 object storage
  -> Durable Object branch rooms for WebSocket fanout
  -> scheduled outbox reconciliation

Branch print agent
  -> Worker API/WebSocket
  -> LAN ESC/POS printer
```

Fork repo skeleton:

```text
matu-pros/
├── apps/
│   └── mobile/              # Flutter POS/KDS mobile app
├── services/
│   ├── worker/              # Cloudflare Worker + Hono API + auth + OpenAPI
│   └── print-agent/         # Branch printer agent; runtime chosen after hardware spike
├── packages/
│   ├── contracts/           # OpenAPI/JSON Schema + generated TS/Dart clients
│   ├── domain/              # shared business constants, labels, ACL keys
│   └── db/                  # SQL migrations, seeds, pg tests
├── infra/
│   ├── wrangler/
│   ├── docker-compose.dev.yml
│   ├── backups/
│   └── monitoring/
└── docs/
    ├── fork-charter.md
    ├── architecture.md
    ├── migration-map.md
    └── runbooks/
```

## Database Strategy

The fork can move to raw self-hosted PostgreSQL 18, but it must replace the Supabase platform contracts intentionally.

Required replacement contracts:

- `auth.uid()`, `auth.jwt()`, `auth_tenant_id()`, `auth_branch_id()`, and `auth_role()` behavior.
- JWT custom claims currently emitted by Supabase Auth hook.
- PostgREST filters and RPC calling semantics currently hidden behind `supabase-js`.
- Realtime publication semantics for POS/KDS, payments, notifications, and print jobs.
- Storage bucket policy behavior for menu images and future documents.
- Generated DB types currently produced by Supabase tooling.

Recommended DB fork approach:

1. Create a squashed PostgreSQL 18 baseline migration from a verified current schema.
2. Recreate required `auth` helper functions using transaction-local claims set by the Cloudflare Worker API.
3. Keep high-value RLS policies where practical, especially tenant/branch isolation.
4. Keep multi-item writes inside Postgres RPCs.
5. Replace Supabase Realtime with an explicit event model: PostgreSQL outbox tables plus Cloudflare Durable Object WebSocket fanout and scheduled reconciliation.
6. Add database tests for ACL, RLS, payment/stock atomicity, and POS/KDS lifecycle invariants.

Important: do not replay 282 historical migrations as the fork's normal install path unless audit or data migration requires it. Use them as source material, then ship a clean v2 baseline plus forward migrations.

## Cloudflare Runtime And Tooling Strategy

Production API runtime is Cloudflare Workers. Bun is not a production runtime requirement for the fork.

Default tooling is Node LTS + pnpm because it is the lowest-risk path for Wrangler, Worker runtime tests, OpenAPI generation, Flutter codegen, and CI. Bun can be reconsidered only after a dedicated tooling spike proves a clear advantage.

Use the selected tooling runtime for:

- Workspace/package management.
- TS scripts and codegen.
- Non-Worker helper scripts.
- Plain SQL migration runner if it stays smaller than adding a migration framework.

Use Cloudflare for:

- `services/worker` API runtime.
- Hono HTTP routing.
- R2 object storage.
- Durable Objects WebSocket rooms.
- Hyperdrive PostgreSQL access.
- Workers Observability.

Avoid assuming Bun can run production Worker code:

- Cloudflare Workers is a V8/Web Platform runtime, not Bun.
- Worker request code must not depend on Bun-only APIs such as `Bun.serve` or `Bun.SQL`.
- Worker runtime tests should run through Cloudflare's Workers-compatible test path, not `bun test` as the primary gate.
- Database access from Workers should go through Hyperdrive and a Worker-compatible PostgreSQL driver.
- The current print-agent uses `node:net`, optional native `usb`, Windows service scripts, and real hardware paths.
- The new print-agent runtime is chosen only after a real hardware spike; Bun is accepted only if real printers pass, and Node LTS fallback is approved.
- Wrangler may require a Node-compatible tooling environment; this is a tooling/runtime distinction, not a backend architecture decision.

Fork rule: the API backend is not Node and not Bun. It is Cloudflare Workers.

## Vercel Reuse Strategy

Vercel remains useful as the current production operating model and as the strongest fallback if the fork needs a dedicated web/admin surface.

Reusable Vercel assets:

- Current Next.js implementation as route, Server Action, ACL, and UI behavior reference.
- Preview deployment workflow if a dedicated web admin is approved.
- Next.js on Vercel as the preferred admin web path if that surface is approved for the fork.
- Vercel Blob and Edge Config only for a Vercel-hosted admin/API layer, not as default cross-cloud dependencies.

Do not use Neon or Vercel-managed Postgres. Do not make Vercel the default v2 runtime. Vercel remains the strongest fallback only if the fork needs a dedicated admin web app, because the current product already uses Next.js and Vercel well. Vercel Functions/Fluid Compute help with APIs and streaming, but the realtime POS/KDS requirement still needs a native WebSocket room model or a third-party realtime provider.

## Flutter Strategy

Flutter is the fork's mobile client for POS/KDS first.

Phase order:

1. Android and iOS POS/KDS for one pilot branch.
2. Employee lightweight flows if mobile-first value is clear.
3. Admin/back-office stays outside Flutter mobile scope and needs a separate web decision if the pilot requires it.

First vertical slice:

```text
Login
  -> branch/session context
  -> table/order creation
  -> KDS ticket appears
  -> chef bump/ready
  -> cashier payment
  -> print job emitted
  -> audit and stock movement verified
```

Do not copy PWA offline semantics directly. The fork needs an explicit local/offline model:

- What can be done offline.
- What is read-only offline.
- Which writes must be blocked.
- How conflicts are materialized.
- How stock/payment/accounting divergence is prevented.

## TypeScript 7 Strategy

Use TypeScript 7 native (`tsgo`) as the fork's default TypeScript checker once stable enough for the fork's tooling.

Near-term approach:

- Use `@typescript/native-preview@beta` side-by-side during bootstrap.
- Keep TS6 compatibility only for tools that still depend on the old TypeScript programmatic API.
- Generate OpenAPI clients and Dart models from source contracts, not by coupling Flutter to TS internals.

## Fork Bootstrap Plan

### F0: Freeze Current Baseline

Deliverables:

- Record base commit SHA.
- Decide whether dirty local UI edits are excluded or intentionally included.
- Run current repo gates or capture the reason they cannot run.
- Export a baseline inventory: routes, modules, ACL keys, DB tables/RPCs, realtime tables, storage buckets, cron jobs, external integrations.

Gate:

- A `fork-baseline.md` document exists with commit SHA, included/excluded changes, and known open P0/P1 gaps.

### F1: Create Fork Workspace

Deliverables:

- New local workspace or repository.
- New `AGENTS.md` for v2 architecture rules.
- New package/app skeleton.
- No connection to production Supabase by default.
- Dev-only PostgreSQL 18 container.

Gate:

- Fresh clone/install starts without touching the current repo.

### F2: Build DB Baseline

Deliverables:

- PostgreSQL 18 schema baseline.
- Auth claim compatibility layer.
- Seed tenant, branch, staff, menu, table, POS/KDS fixtures.
- DB tests for tenant and branch isolation.

Gate:

- Database can recreate from scratch in dev with deterministic seed data.

### F3: Build Cloudflare Worker API Contract

Deliverables:

- Auth endpoints.
- Branch/session endpoints.
- POS order RPC endpoint.
- KDS queue endpoint.
- Payment/print event endpoint.
- OpenAPI generated Dart client; TS client only for service tests/tooling if useful.
- Hyperdrive PostgreSQL connection.
- Durable Object realtime proof.
- R2 signed URL proof.

Gate:

- API integration tests or Worker smoke tests cover the first POS/KDS vertical slice.

### F4: Build Flutter Vertical Slice

Deliverables:

- `apps/mobile` Flutter scaffold.
- Auth/session state.
- POS order creation.
- KDS queue and bump flow.
- Payment and print confirmation surface.

Gate:

- One pilot branch workflow works end-to-end on Android emulator/device and iOS simulator/device.

### F5: Decide Data Migration Or Greenfield

Two possible paths:

- Greenfield v2: seed/configure v2 and start new pilot data.
- Migrated v2: dump current data, transform to v2 schema, reconcile counts, and cut over one branch.

Gate:

- Owner signs off on data migration policy before any production-like data enters v2.

## Immediate Tickets

1. `fork-baseline-inventory`: generate `docs/fork-baseline.md` from the current repo.
2. `fork-workspace-create`: create `/Users/luongthebinh/Downloads/matu-pros` from the approved base commit.
3. `fork-agents-rules`: write v2 `AGENTS.md` with Cloudflare/Bun/Flutter/PostgreSQL 18 rules.
4. `pg18-schema-squash`: produce v2 baseline SQL from the current verified schema.
5. `auth-claims-compat`: implement raw PostgreSQL auth helper functions for Worker-set claims.
6. `worker-api-spike`: implement the first Hono Worker API service, Hyperdrive connection, and OpenAPI generation.
7. `flutter-mobile-scaffold`: scaffold Flutter app with Android and iOS build targets.
8. `pos-kds-contract-map`: map current POS/KDS Supabase calls to v2 API contracts.
9. `flutter-pos-kds-slice`: implement first end-to-end branch workflow.
10. `fork-data-policy`: decide greenfield pilot vs migrated pilot.

## Kill Switches

Stop or redesign the fork if:

- The fork cannot preserve tenant/branch isolation at least as strongly as the current system.
- Payment, stock, or audit writes require client-side multi-step transactions.
- Offline behavior creates silent client-wins conflicts.
- Cloudflare Workers cannot support the required API/auth/database path without adding too much complexity.
- Neither Bun nor Node can support the required printer hardware path with acceptable reliability.
- PostgreSQL 18 self-host operations lack backup, restore, monitoring, and owner-operated runbooks.

## Current Repo Handling

Until the fork is explicitly created:

- Current repo changes should remain docs/planning only.
- Do not modify current production app code for Bun/Flutter/PostgreSQL 18.
- Any implementation work belongs in the fork workspace or a dedicated fork branch after owner decision.
- Existing dirty UI files in the current repo are treated as unrelated user work and must not be reverted.

## Completion Definition

The fork is ready for pilot when:

- It has an independent repo/workspace and dev environment.
- PostgreSQL 18 dev DB can rebuild from scratch.
- Hono Worker API passes smoke/integration tests for the first domain slice.
- Flutter Android and iOS can run the first POS/KDS workflow end-to-end.
- Admin/support path for the pilot is explicitly covered by the current production system or by a separately approved admin web app.
- Backup/restore and incident runbooks are tested.
- The current production app remains untouched except for documented extraction and comparison work.
