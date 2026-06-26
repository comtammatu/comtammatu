# Preview-branch non-prod runtime (Supabase Branching + Vercel Preview)

> Decision: `docs/plan/decisions.md` D047. Provisioning is owner-only (D005) —
> agents do not create Supabase/Vercel resources.

Per-PR ephemeral environment: opening a PR creates a Supabase preview branch
(applies `supabase/migrations/*` then `supabase/seed.sql` once) and a Vercel
Preview deploy that auto-receives the branch DB credentials. Merging/closing the
PR tears the branch down.

## Repo prerequisites

- [x] Migrations replay from an empty DB — gated by `pnpm db:baseline:local-check`
      (CI `baseline-replay` job, #109).
- [x] `supabase/config.toml` → `[db.seed] enabled = true`, `sql_paths = ["./seed.sql"]`.
- [x] `custom_access_token` hook function lives in the migration chain (baseline) so
      Auth can issue tokens on a fresh branch.
- [~] **Fold managed surfaces into migrations** — migration `20260627140000_fold_managed_surfaces.sql` added (idempotent; Section D guarded), pending first-branch validation + owner prod-apply, after which `managed-surfaces.install.sql` is removed. Branching runs only
      migrations + seed; it will NOT run `supabase/managed-surfaces.install.sql`.
      Fold its contents (extensions, storage RLS policies, realtime publication
      membership, cron) into an idempotent forward migration
      (`CREATE EXTENSION/POLICY IF NOT EXISTS`, `DO $$ … $$` guards) so every
      branch is self-contained. Until this lands, preview branches lack storage
      policies / realtime / cron. This intentionally reverses the earlier
      "managed-surfaces excluded from baseline" split (see D047).
- [ ] `supabase/seed.sql` carries no production data and no secrets (branch DBs
      are throwaway).

## Provisioning (owner — Supabase + Vercel dashboards)

1. Supabase project on Pro+ (Branching is paid-plan only).
2. Enable Branching and install the Supabase GitHub App on the repo.
3. Install the Supabase↔Vercel integration (Vercel marketplace) and connect the
   Supabase project to the Vercel project. Keep the Vercel GitHub integration active.
4. Cost: ~$0.01344 / branch / hour (Micro compute) + disk/egress. Compute Credits
   and the Spend Cap do NOT cover branching usage.

## Per-PR flow (once live)

1. Open a PR → the Supabase GitHub App provisions a branch DB, applies migrations
   in order, then runs `seed.sql` once.
2. Supabase writes branch `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
   `SUPABASE_SERVICE_ROLE_KEY` into the Vercel Preview deploy and redeploys.
3. Open the Vercel Preview URL → the app runs against the branch DB.
4. Merge/close the PR → the branch is torn down.

## First-run verification

- Open a throwaway PR; confirm the Supabase branch shows all migrations applied +
  seed run.
- Confirm the Vercel Preview deploy carries branch env vars (not production).
- Exercise one real flow (e.g. POS → payment → KDS) against the branch.

## Gotchas

- `seed.sql` runs ONCE at branch creation; to re-seed, recreate the branch.
- Persistent (non-PR) branches do NOT auto-sync env vars to Vercel — set them
  manually.
- Branch secrets are per-branch; for hook/HTTP secrets use `supabase/.env.preview`
  with the `encrypted:` syntax.

## What this unblocks

design-system surface tails (W5 nav-projection + 7 POS/KDS runtime-gated items),
HRM runtime verify, and α4c `can_access_branch` RLS-regression work. Telemetry
items (unused indexes ~231, dead-RPC wave 2) do NOT need this — they need
`track_functions` / `pg_stat` enabled on prod for one full cycle (incl. month-end).
