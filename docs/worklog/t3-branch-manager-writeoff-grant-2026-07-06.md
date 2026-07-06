# T3 Branch Manager Writeoff Grant And Re-baseline - 2026-07-06

> Reconciled-through 5a4237cf4

Skill plan: `supabase` for owner-delegated production apply, migration policy, and re-baseline flow. `supabase-postgres-best-practices` skipped because the only production write is an existing-key grant/backfill: no new schema shape, index, RLS, or query-plan change.

PM: scope = let branch managers enter the existing `Báo hao hụt` flow and squash the now-applied forward chain into the baseline. Acceptance = PROD ledger has `branch_manager_writeoff_grant`, `branch_manager` template includes `inventory:writeoff`, active branch-scoped branch managers get the matching `staff_permissions` row, and a fresh baseline replay succeeds.

BA: rule = grant is branch-scoped only, never tenant-wide. Existing manual overrides are preserved through idempotent conflict handling. Out of scope = transfer RPC, menu availability, print templates, GRN RLS hardening, and unrelated Supabase advisor findings.

Senior Dev: approach = apply the grant-only migration via owner-delegated MCP `apply_migration`, dump current PROD `public,private`, replace `00000000000000_baseline.sql`, and archive all forward public/private migrations now represented by the new baseline. Keep `20260627140000_fold_managed_surfaces.sql` active because `pg_dump --schema=public,private` excludes managed surfaces.

QA/QC: verify SQL contains only `role_templates` update and `staff_permissions` backfill; verify ledger/template/grants after apply; prove baseline replay with `corepack pnpm db:baseline:local-check`; run `db:types`, hard gates, and CodeGraph refresh.

Attestation: BA rule maps to archived migration `supabase/migrations/_archive/20260706030652_branch_manager_writeoff_grant.sql` and the refreshed baseline `supabase/migrations/00000000000000_baseline.sql`; test plan covered PROD SELECT verification plus local baseline replay; no follow-up learning needed.
