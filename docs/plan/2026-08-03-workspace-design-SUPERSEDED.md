# Superseded — Workspace separate-app design

**Status:** Superseded · 2026-08-11

The separate-app design (`apps/workspace`, `work.comtammatu.com`, dual Vercel
project) formerly planned on branch `codex/workspace-foundation` / PR #348 is
**not** the accepted direction.

**Authoritative replacements:**

- `docs/plan/2026-08-11-work-module-integration.md` (Accepted)
- `docs/plan/adr/0033-work-control-surface-module.md` (Accepted)

Work ships as Control Surface module `/work/*` on `apps/web` only. Domain ideas
(`work_*` tables, membership authority, inbox-first) are retained in those
documents; hosting/runtime from the separate-app plan must not be merged.
