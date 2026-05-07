# Cơm Tấm Má Tư — Restaurant Management System

Single-tenant multi-branch system for Cơm Tấm Má Tư CTCP.

Hierarchy: `Tenant (L0) → Branch (L1)`.

This file is the agent entrypoint. Keep it short and stable. Detailed, topic-specific rules live under `docs/agent/rules/`.

## Rule Loading

Before implementation, read the applicable rule files:

- Always read `docs/agent/rules/engineering.md` for repo commands, architecture, import boundaries, and core constraints.
- Read `docs/agent/rules/database.md` for Supabase, migrations, RLS, ACL, auth, Server Actions, RPCs, or database type work.
- Read `docs/agent/rules/ui.md` before any UI, UX, route surface, component, styling, or copy change.
- Read `docs/agent/rules/workflow.md` for debate protocol, skip conditions, verification, and completion gates.
- Read `docs/agent/rules/references.md` when onboarding or choosing the source-of-truth docs for a task.
- Read `docs/agent/change-impact-matrix.md` BEFORE every PR to identify which related files must update in the same change.
- Read `tasks/regressions.md` for binding failure-prevention rules touching the changed domain.
- Read `tasks/lint-baseline.md` if `pnpm lint:rebuild-strict` flags pre-existing baseline tail (W0'/W1/W3 cleanup waves).

Instruction memory and learning memory stay separate:

- Shared rules and policies live in `AGENTS.md` and `docs/agent/rules/`.
- Regression lessons live in `tasks/regressions.md`.
- Retrospectives and durable learnings live in `tasks/lessons.md`.
- Current work tracking lives in `tasks/todo.md`.
- Architecture decisions live in `docs/plan/adr/` (see `docs/plan/adr/README.md` for index).

## Critical Constraints

- MUST use TypeScript strict mode. `noUncheckedIndexedAccess: true`
- MUST use `supabase-js` for all queries. NEVER Prisma.
- MUST validate all Server Action inputs with Zod schemas.
- MUST run `pnpm typecheck && pnpm lint && pnpm build` before marking implementation tasks complete.
- NEVER return raw Supabase/Postgres `error.message` to clients.
- NEVER import `@comtammatu/database` barrel in `"use client"` components.
- NEVER store scope in `localStorage` or React Context. Scope belongs in URL params only.
- Multi-item atomic writes MUST use a Postgres RPC function.
- Agents MAY apply migrations directly on approved dev/test Supabase servers only, after verifying the target environment.
- NEVER apply migrations directly to production. Production flow: write migration file → PR → merge → owner applies manually.
- After SQL migration is applied to the schema used for generated types, run `pnpm db:types`.
- ACL single source: `packages/shared/src/auth/module-acl.ts`.
- The W1 ADR set (`0001`, `0006`, `0007`, `0008`, `0009`, `0010`, `0011`, `0012`, `0013`, `0014`) MUST be accepted or explicitly deferred before W1 runtime implementation. See `docs/plan/adr/README.md`.
- Vietnamese operator copy MUST come from `packages/shared/src/labels/vi.ts` (`COMMON_ACTIONS_VI`, `COMMON_STATES_VI`, `COMMON_ERRORS_VI`); never inline-hardcode reused strings (per `COPY-LABEL-SOURCE-OF-TRUTH`).

## UI Authority

- NEVER invent or redesign the UI outside the project's established design system.
- NEVER exceed authority when editing UI; only make UI changes explicitly requested or clearly required by the task.
- USE `shadcn/ui` components and the project's active preset as the default UI path.
- BEFORE UI/UX rebuild work, read and follow `docs/spec/design-system.md` as the locked design-system contract.
- UI/UX rebuild PRs MUST state the surface, primary user job, route family, change type, and primitives used before implementation.

## Architecture

Per UC1=YES (2026-05-07) the rebuild splits client runtimes:

```text
Back-office web (apps/web/, Next.js)
  Browser → proxy.ts (auth + ACL) → App Router → Supabase (PostgREST + Auth)
  Owns: /admin, /inventory, /finance, /hr, /orders, /menu, /settings

Frontline (apps/frontline_flutter/, Flutter — W5 deliverable per ADR-0006)
  Hub flavor → SQLite (Drift) + LAN/BT broker + Supabase RPC writer
  Handheld → LAN/BT client of Hub (emergency direct-cloud per ADR-0008)
  KDS → Read-only LAN/BT client of Hub
  Owns: POS, KDS, employee self-service, branch ops, stocktake, print

Shared
  packages/{shared,database,ui,security,integrations,jobs}
  Supabase Postgres (RLS + RPC) = legal source of truth
```

Existing `apps/print-agent/` (LAN-only Node print process) RETIRES once Hub flavor takes over print ownership in W5 (per ADR-0007).

Next.js 16.2 | React 19.2 | TypeScript 6.0 | Tailwind 4.2 | Zod 4 | Turborepo 2.9 | Node >= 24 | Flutter stable (W5 pin)

## Commands

```bash
pnpm dev                  # Start dev server (Turbopack)
pnpm build                # Production build
pnpm typecheck            # Type checking across all packages
pnpm lint                 # Default lint chain (lint:copy + lint:v2-imports + turbo lint)
pnpm lint:rebuild-strict  # Opt-in: NO-VERSION-SUFFIXES + SAME-PR-DOC-SYNC (baseline tail in tasks/lint-baseline.md)
pnpm db:types             # Regenerate Supabase types after migration is applied to the type source schema
```

## Workflow Summary

Every feature, bug fix, and refactor must follow the 4-agent debate protocol in `docs/agent/rules/workflow.md` before implementation.

Skip the 4-agent debate only for:

- Typo fixes under 3 changed lines
- Documentation-only changes
- Dependency version bumps

Even when debate is skipped, verify changed files and explain why the skip condition applies.

Every change of any size MUST apply `docs/agent/change-impact-matrix.md`: identify which sections apply to the change, update every required file in the same PR, and run `pnpm lint:rebuild-strict` before marking work complete. Doc drift is a regression of `SAME-PR-DOC-SYNC` and `NO-DOC-GRAVEYARD`.

## Skill Routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing:

- Strategy/scope review → `/plan-ceo-review`
- Architecture review → `/plan-eng-review`
- Design plan review → `/plan-design-review`
- Full review pipeline → `/autoplan`
- Bugs/errors → `/investigate`
- QA testing → `/qa` or `/qa-only`
- Code review/diff check → `/review`
- Visual polish → `/design-review`
- Ship/deploy/PR → `/ship` or `/land-and-deploy`
- Save/resume context → `/context-save` / `/context-restore`
