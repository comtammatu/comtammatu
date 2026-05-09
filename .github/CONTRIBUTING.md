# Contributing to Cơm Tấm Má Tư

> **Vietnamese:** Cảm ơn bạn quan tâm đến dự án. Đây là dự án single-tenant CTCP nội bộ, hiện chỉ có một owner (`@comtammatu`). Hướng dẫn này dành cho người mới làm quen với codebase — cả nhân viên nội bộ và bất kỳ ai bên ngoài muốn báo lỗi hoặc đề xuất tính năng.
>
> **English:** Thanks for your interest. This is a single-tenant CTCP internal project, currently single-owner (`@comtammatu`). These notes are for anyone touching the codebase — internal staff and outside reporters alike.

## Before you start

Read these in order:

1. **[`CLAUDE.md`](../CLAUDE.md)** — the canonical engineering rules (architecture, constraints, things-that-will-bite-you, the 4-agent debate workflow). This file is the source of truth; if anything below conflicts with it, `CLAUDE.md` wins.
2. **[`docs/CODEBASE_MAP.md`](../docs/CODEBASE_MAP.md)** — the routing map that points into `docs/modules/*`, `docs/spec/*`, and `docs/ref/*`.
3. **[`tasks/regressions.md`](../tasks/regressions.md)** — named failure rules. Every PR should leave this file as-tight-or-tighter than it found it.

## Quality gates (mandatory before commit)

Per `CLAUDE.md`, every change must pass these three commands locally before push:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

CI re-runs them on every push and PR (`.github/workflows/ci.yml`). Don't skip them locally — a CI failure on a 2-minute typecheck wastes the same time on the GitHub side.

If you're touching `packages/shared/src/`, also run:

```bash
pnpm --filter @comtammatu/shared test
```

The full suite is 147 tests today; they're fast (sub-500ms).

## Commit conventions

- **Conventional Commits** style: `type(scope): subject` (e.g. `fix(inventory): hint ingredient FK on production_recipes select`).
- **No `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.** Per the global `CLAUDE.md` rule and the project repo: AI assistance is a tool, the human author from local `git config` takes full responsibility. This applies to ALL AI assistants, ALL commits, no exceptions unless the human explicitly opts in for a specific commit.
- Use `git` for push/pull/clone/commit/tag. Reserve `gh` for GitHub-specific actions (PRs, releases, viewing issues).
- Prefer new commits over amends; new commits over force-push.

## Branching + PRs

- The default branch is `main`. The owner currently commits directly to `main` for repo-metadata and small bugfixes (consistent with the cycle 1-7 release pattern in `docs/releases/`).
- For non-trivial changes (>3 LOC source code, schema migrations, security-sensitive paths), open a PR.
- The PR template lives at [`.github/pull_request_template.md`](pull_request_template.md). Fill out the checklist — it mirrors the CLAUDE.md gates.
- A single owner reviews everything today (`.github/CODEOWNERS` routes `* @comtammatu`).

## The 4-agent debate workflow

For features, bugs, and refactors, `CLAUDE.md` mandates running 4 specialist agents (PM/BA/Sr.Dev/QA) before writing code. This applies to AI-assisted work AND human-led changes — the agents are a discipline, not a crutch.

Skip is allowed only for: typo <3 LOC, docs-only, dependency bump.

| Role     | Asks                                       |
|----------|--------------------------------------------|
| PM       | scope, MVP, acceptance criteria            |
| BA       | business rules, edge cases, data flow      |
| Sr. Dev  | architecture, plan, risks, affected files  |
| QA/QC    | test plan, regression risks, quality gates |

Full protocol: wiki `team-agent-workflow-4-agent-debate.md`.

## Reporting bugs and proposing features

- **Bugs:** use [`.github/ISSUE_TEMPLATE/bug_report.md`](ISSUE_TEMPLATE/bug_report.md). Include repro, expected, actual, environment (commit SHA), severity.
- **Features:** use [`.github/ISSUE_TEMPLATE/feature_request.md`](ISSUE_TEMPLATE/feature_request.md). Include problem, proposal, acceptance criteria, risk surface.
- **Triage SLO:** best-effort. Single-owner CTCP — expect a few business days for first response.

## Security disclosures

**Do NOT open a public GitHub issue for security vulnerabilities.** Email **comtammatu@gmail.com**. Full policy: [`.github/SECURITY.md`](SECURITY.md). Machine-readable contact: [`apps/web/public/.well-known/security.txt`](../apps/web/public/.well-known/security.txt) (RFC 9116).

Initial acknowledgement: 5 business days. Severity-tiered fix windows (Critical 7d / High 14d / Medium 30d / Low 90d) — see SECURITY.md for the table.

## Code style

- TypeScript 6.0 strict, `noUncheckedIndexedAccess`. No `any` without a comment explaining why.
- Tailwind 4.2 — semantic tokens only (`bg-success`, `text-warning`, `border-destructive`). NEVER raw palette outside `packages/ui/src/styles/*.css`.
- shadcn primitives under `packages/ui/src/components/*` are the building blocks. NEVER fake primitives with `div` / `span`.
- Server Action inputs validated with Zod 4. NEVER return raw Supabase / Postgres `error.message` to the client.
- Migrations: dev/test via `supabase db push` allowed. Production = file → PR → merge → owner applies manually → `pnpm db:types`.

## Dependency updates

- Dependabot (`.github/dependabot.yml`) batches minor + patch bumps monthly. Approve grouped PRs after the local CI gate passes.
- Major-version bumps land via deliberate upgrade PRs, not Dependabot. Open an issue first; tag `dependencies` + `enhancement`.

## License + attribution

This is a private, internal CTCP repo. There is no open-source license today. If you've contributed code via PR and want public credit, mention it in the PR — we'll cite contributors in the relevant `docs/releases/X.Y.Z.md` file.

## Document History

- `2026-05-09` — Initial publication (release `1.2.0.5`).
