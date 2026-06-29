# Auth/RLS Core Cleanup T3 Contract

Status: Reconciled-through 02944a16.

Skill plan: repo rules = engineering + skills + database + workflow + team + orchestration; external skills = superpowers:executing-plans + superpowers:using-git-worktrees + supabase + supabase-postgres-best-practices; runtime tools = CodeGraph, Supabase CLI for migration file creation only, shell static checks; skipped = production apply and generated DB types because the Environment Registry has no dev/test Supabase target.

## Four Perspectives

PM: Scope is the Auth/RLS core cleanup only: normalize permission scope data, keep template application usable, remove the active KDS dependency on `can_access_branch`, and add a broad-grant regression guard. Completion-auth tightening, cron alerts, and read-error surfacing stay out of this slice.

BA: Permission scope is owned by `permission_keys.scope`. Branch permissions need a branch at grant time, tenant permissions must be tenant-wide, and `either` permissions remain valid in both places. Role templates can contain mixed-scope permission bundles because they are presets, not grants; each key must resolve to the right grant branch during apply/sync.

Senior Dev: Keep the existing access spine. Patch the SQL RPCs that create/backfill grants, clean existing rows with upsert-then-delete steps to avoid partial unique-index failures, inline the current branch predicate in the four KDS RPCs, then revoke/drop the old helper after references are gone.

QA/QC: Verify static guard coverage for broad `GRANT EXECUTE`, scope cleanup SQL shape, and absence of active `can_access_branch` references outside baseline/archive. Full local DB apply is unavailable in this session; production migration remains owner-applied.

## Contract

- `staff_permissions` rows must match `permission_keys.scope`: tenant keys use `branch_id IS NULL`, branch keys use a concrete branch, and `either` keys are unchanged.
- `apply_template_to_user` and `sync_missing_permissions_from_template` compute branch scope per permission key.
- KDS ticket actions keep their existing permission gates and use only the inline branch predicate.
- New browser-executable RPC grants must have an auth boundary in the same migration or be explicitly allowlisted.
