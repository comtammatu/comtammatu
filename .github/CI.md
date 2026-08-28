# GitHub CI

Workflow: [`workflows/ci.yml`](workflows/ci.yml).

Runs on `push` to `main`, pull requests, and `workflow_dispatch`. Markdown /
`docs/**` path changes are ignored for automatic triggers.

| Job | Trigger filter | Purpose |
| --- | --- | --- |
| `gates` | Always (non-docs) | `pnpm install --frozen-lockfile` then `pnpm verify` |
| `detect` | Always when workflow runs | Path filter for docker-backed jobs |
| `baseline-replay` | PR changes under `supabase/` (or dispatch) | Replay squashed baseline on fresh Supabase Local |
| `e2e-smoke` | PR changes under apps/packages/scripts/supabase (or dispatch) | Isolated Supabase + Playwright smoke (+ optional visual baselines) |

CI uses placeholder Supabase public env for compile/build only. The E2E harness
writes ignored `apps/web/.env.test.local` on the runner; it never writes
repository `.env.local`.

Deploy is not performed here — Vercel deploys `main` for project `comtammatu`.
Platform contract: [`docs/modules/infrastructure.md`](../docs/modules/infrastructure.md).
