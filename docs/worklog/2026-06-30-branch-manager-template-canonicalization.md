# Legacy Auth Template Canonicalization

Status: Draft implementation.
Reconciled-through d06fd9da.

Skill plan: repo rules = engineering + database + workflow; external skills = supabase; runtime tools = CodeGraph, rg, Supabase CLI SELECT-only, local SQL tests; skipped = production writes.

PM: Remove legacy auth/template names from active seed/test/baseline surfaces. Done means fresh local replay and existing environments use canonical English `role_templates.name = role_templates.position_code` for system templates.

BA: `positions.code` and `role_templates.position_code` are canonical English codes. `role_templates.name` must not keep old mixed-language names because operators and tests can confuse them with position codes.

Senior Dev: Keep the diff narrow: rename or merge legacy system templates, replace legacy notification target roles, remove retired access buckets from active RPC paths, and update seed/test/baseline references.

QA/QC: Verify by static tests, exact-string scan, local DB replay/query, and targeted pgTAP for branch-manager KDS permissions. Production remains SELECT-only from the agent.

Unified contract: no active seed, pgTAP, baseline code, or post-cleanup RPC may depend on retired role/template names. Cleanup SQL may reference retired names only to migrate existing rows. `waiter` remains only as a compatibility alias/backfill target and inactive-position UI filter; it is not an access bucket.

Verification:

- Static scan with allowlist for cleanup/backfill/compatibility paths: no active-source references to retired role/template tokens.
- Supabase Local replay from empty temp project: migration chain applied through `20260630031456_canonicalize_branch_manager_template.sql`, local seed applied.
- Local DB checks: legacy role/template refs = 0; active legacy positions = 0; system template name/position mismatch = 0; staff permission scope mismatch = 0.
- Local function checks: `split_order`, `weekly_grn_override_report`, and `weekly_waste_report` have no retired role/target strings; `auth_role_to_position` keeps only the compatibility service-position alias.
- Local grants: `weekly_waste_report` and `weekly_grn_override_report` are executable by `service_role`, not `anon` or `authenticated`.
- Targeted tests: Auth/RLS static tests, SECURITY DEFINER grant static tests, shared auth/HR static tests, branch-manager KDS pgTAP.
- Repo gates: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`.
