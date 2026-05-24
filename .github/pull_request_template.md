## Summary

<!-- 1-3 sentences: what changed and why. Link any ISSUE-XXX from tasks/todo.md. -->

## Type
- [ ] feat (new user-facing capability)
- [ ] fix (bug, regression, or security)
- [ ] refactor (no behavior change)
- [ ] test (regression coverage only)
- [ ] docs (CHANGELOG, release notes, runbook, comments)
- [ ] chore (build, deps, repo metadata)

## Quality gates (CI runs the same checks)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm --filter web build` passes
- [ ] `pnpm --filter @comtammatu/shared test` passes (note new test count if any)

## Regression coverage
- [ ] If this PR closes a behavior described in `tasks/regressions.md`, the relevant rule is referenced in the commit body.
- [ ] If this PR introduces a new invariant worth locking, a named rule is added to `tasks/regressions.md` AND a source-text test is added under `packages/shared/src/feedback/__tests__/regressions.test.ts` (or a per-module equivalent).

## User-visible change
- [ ] Not user-visible (code-only, internal, or repo metadata).
- [ ] User-visible — `/qa` smoke run completed; report attached or referenced.

## Owner action required after merge
<!-- e.g. "Promote Vercel alias", "Apply migration X", "Confirm env var Y". Leave blank if none. -->

## Author attestation
- [ ] No `Co-Authored-By: Claude` (or any AI/assistant) trailer in any commit on this branch — per project policy in AGENTS.md.
- [ ] All commits authored as `comtammatu <comtammatu@gmail.com>` (the human is the sole responsible author).
