# Auth Positions And Central Sites T3 Contract

Status: Reconciled-through 7f1e011d.

Skill plan: repo rules = engineering + skills + database + workflow; external skills = supabase + supabase-postgres-best-practices; runtime tools = CodeGraph, Supabase CLI for migration file only; skipped = live DB apply because the registry has no dev/test Supabase project and production is owner-applied only.

## Four Perspectives

PM: Scope is the minimum auth model correction for the owner decision: no active `waiter` role, and Kho Tổng/Bếp Trung Tâm operators can be assigned to their central sites. Done means active TS/SQL auth mappers, HR account creation/update, route ACL, seeds/tests/docs agree on the new model.

BA: `position` remains the HR job, `access_bucket` remains the compatibility route bucket, permissions remain action grants, and RLS/RPC remains final enforcement. `cashier` covers the former service/POS floor workflow. `warehouse_manager` may be scoped to `central_supply`; `production_manager` may be scoped to `central_kitchen`.

Senior Dev: Keep the existing access spine. Patch shared auth types, HR forms/actions, SQL mapper/RPCs, forward migration/backfill, and targeted tests/docs. Do not introduce per-department access buckets unless route families actually diverge.

QA/QC: Verify TypeScript, lint, build, and targeted auth tests. Cross-check TS mapper versus SQL mapper, route ACL versus tests, and create/update staff payload versus `admin_update_profile`. Migration is file-only in this session; no production apply.

## Contract

- `waiter` is not an active `AccessBucket` or creatable HR role.
- Existing `waiter` position/users/templates are migrated to `cashier` semantics.
- HR staff and employee creation submit `position_code`; actions derive the access bucket.
- Central supply and central kitchen are valid assignment sites for their operators.
- Archive migrations remain historical and are not rewritten.
