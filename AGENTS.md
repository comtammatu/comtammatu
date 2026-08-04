# Cơm Tấm Má Tư — Bộ phần mềm quản lý vận hành và bán hàng

Bộ phần mềm cho CTCP Chén Sứ / Cơm Tấm Má Tư, single-tenant và multi-branch.
Nhiệm vụ: bán đúng, bếp nhận đúng, thu tiền đúng, in/hóa đơn đúng, kho trừ
đúng, và quản lý nhìn được tình trạng vận hành thật theo ngày.

Hierarchy: `Tenant (L0) → Branch (L1)`.

## Start Here

1. On a fresh checkout, or when graph freshness is unknown, run
   `corepack pnpm agent:start`. It verifies the tracked skill bundle and refreshes
   CodeGraph only when status reports drift.
2. Read `docs/agent/rules/engineering.md`, then only the topic rule needed:

| Signal | Read |
| --- | --- |
| Behavior, review, verification | `workflow.md` |
| Supabase, migration, RLS, auth, RPC | `database.md` |
| UI, UX, route surface, copy | `ui.md` |
| External skill, plugin, browser, subagent | `skills.md`; add `orchestration.md` only for fan-out |
| Authority or onboarding | `references.md` |
| Notification, alert, scheduled report | `docs/spec/toast-notification-system.md` |

All rule paths above are under `docs/agent/rules/`. When `.codegraph/` exists,
use CodeGraph before `rg` or manual source reads. Re-run `agent:start` after
source, SQL, or generated-type changes only when later graph review depends on
fresh edges. If `.codegraph/` is absent, skip it; indexing is an owner decision.

## Critical Constraints

- TypeScript stays strict with `noUncheckedIndexedAccess: true`.
- Use `supabase-js`; never Prisma.
- Validate every Server Action input with Zod and never expose raw
  Supabase/Postgres `error.message` to clients.
- Client components may runtime-import only
  `@comtammatu/database/supabase/client`; database-barrel imports are type-only.
- Scope belongs in URL params, never `localStorage` or React Context.
- Multi-row correctness belongs in an atomic Postgres RPC.
- Before any migration apply, verify the target against `database.md`.
  Production apply requires explicit owner delegation in the current task.
- After applying SQL to the generated-type source schema, run
  `corepack pnpm db:types`.
- ACL source: `packages/shared/src/auth/module-acl.ts`. RLS/RPC remains final
  enforcement; UI visibility is not authorization.
- UI source: `docs/spec/design-system.md`. Never create a parallel design
  system or put agent notes and implementation commentary in product UI.
- Comments are English and only explain non-obvious constraints. Delete retired
  code/docs cleanly; Git is the archive, so no tombstones or provenance notes.
- Do not create another agent wiki, task board, memory store, or rule tree.
  Use the existing owner mapped by `references.md`.
- Before calling implementation complete, run
  `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`;
  add targeted tests and `corepack pnpm verify` when the blast radius warrants it.

## Communication And Git

- Owner-facing chat is Vietnamese. Agent-to-agent text, code, identifiers,
  comments, and commit subjects are English.
- New owner/domain docs under `docs/ref/`, `docs/architecture/`, and
  `docs/plan/` default to Vietnamese. Agent rules, technical specs/modules,
  ADRs, and `tasks/` default to English. Preserve an existing file's language.
- Do not commit or push unless the owner asks in the current task. Preserve
  unrelated dirty-tree work and stage only task-owned files.
- `CLAUDE.md` and runtime adapter directories are pointers/wiring, never
  parallel policy sources.

## Architecture

```text
Browser → proxy.ts (session + route/surface/network gates) → App Router → Supabase
Printing → apps/print-agent (Realtime + recovery polling) → ESC/POS LAN printers
```

Package manifests and the lockfile own framework versions; root `package.json`
owns the Node.js runtime requirement.

## Commands

```bash
corepack pnpm dev          # Turbopack development
corepack pnpm build        # Production build
corepack pnpm typecheck    # TypeScript checks
corepack pnpm lint         # Safety, contract, lifecycle, and ESLint gates
corepack pnpm test         # Test suites
corepack pnpm verify       # Dependency, boundary, type, lint, build, and test gate
corepack pnpm agent:start  # Skill check + status-first CodeGraph refresh
corepack pnpm db:types     # Regenerate database types after an applied migration
```

## Cursor Cloud specific instructions

Durable, non-obvious notes for Cloud Agent VMs. The startup update script only
runs `corepack pnpm install --frozen-lockfile`; everything below is manual and
snapshot-persisted, not part of that script.

### Node runtime

- The project requires Node 24 (`.nvmrc`), installed via `nvm`. A daemon shim
  `/exec-daemon/node` (Node 22) sits ahead of `nvm` in `PATH`. `~/.bashrc`
  already prepends the Node 24 bin so login shells resolve Node 24; verify with
  `node --version` if a command misbehaves, and run `nvm use 24` if needed.
- Lint/typecheck/test/build/dev commands are the standard ones in `## Commands`
  and the README; no extra flags are needed.

### Backend for running the app end-to-end

The web app has no mock backend — it needs Supabase. Owner Supabase Cloud
credentials are not present in the VM. Use the repo's local Supabase E2E harness
(Docker) for a fully self-contained, seeded backend:

1. Start Docker (no systemd here): `sudo dockerd > /tmp/dockerd.log 2>&1 &`.
   Docker is preinstalled and `/etc/docker/daemon.json` is already set for this
   VM (fuse-overlayfs + `containerd-snapshotter: false`, required for Docker 29).
   If the CLI hits a socket permission error, `sudo chmod 666 /var/run/docker.sock`.
2. Bring up seeded local Supabase (migrations + tenant + QA users). The script
   `scripts/supabase-e2e-bringup.mjs` is CI-guarded, so run it with the guard
   satisfied:
   `CI=true GITHUB_ACTIONS=true GITHUB_ENV=/tmp/gh_env.txt node scripts/supabase-e2e-bringup.mjs`.
   It writes `apps/web/.env.test.local` with the local API URL, anon key,
   service-role key, and test-account credentials.
3. The dev server reads `apps/web/.env.local` (gitignored), not
   `.env.test.local`. Copy the local Supabase `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into
   `apps/web/.env.local`, and add `POS_NETWORK_GATE=off` (otherwise
   `apps/web/proxy.ts` LAN-gates the `/br/*/pos` and `/kds` surfaces and blocks
   in-VM browser access). Then `corepack pnpm dev:web` (http://localhost:3000).

### Seeded test accounts (local Supabase only)

All passwords are `Test1234!`. Examples: `owner@comtammatu.vn` (tenant owner),
`manager.nguyenhuutho@comtammatu.vn`, `cashier.nguyenhuutho@comtammatu.vn`,
`chef.nguyenhuutho@comtammatu.vn` (branch "Chi nhánh Nguyễn Hữu Thọ", id 1).
Full list is in `apps/web/tests/fixtures/supabase-e2e/qa-users.sql`. The tenant
seed creates branches but no menu items, so POS ordering needs menu data created
first (e.g. via `/menu`).

### Playwright E2E

With local Supabase up and `apps/web/.env.test.local` present, run
`corepack pnpm --filter @comtammatu/web test:e2e`. Set `CI=true` to let
Playwright auto-start its own web server; otherwise start `dev:web` yourself.
