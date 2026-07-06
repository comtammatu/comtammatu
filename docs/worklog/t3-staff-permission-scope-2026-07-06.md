# T3 Staff Permission Scope

Skill plan: repo rules = engineering + skills + database/auth + ui + workflow + team; external skills = supabase + supabase-postgres-best-practices for Auth/RLS/RPC scope review; runtime tools = CodeGraph + CLI static test; skipped = subagents, because Codex has no live Agent Teams here and this transcript captures the four required lenses inline.

PM: Owner must be able to manage staff permission grants from `/hr/staff/{userId}/permissions`. Acceptance is tenant-scope grants using `branch_id = NULL`, branch-scope grants still requiring a branch, and no production DB mutation.

BA: `permission_keys.scope` owns the scope rule. `tenant` keys must not carry a branch, `branch` keys must carry one, and `either` keys can use either `Toàn quán` or a branch. Owner route access does not mean app code can send the wrong scope to the RPC.

Senior Dev: Keep the existing RPC contract and fix the client/action adapter: allow a `Toàn quán` sentinel, pass `null` to `grant_permission` / `revoke_permission` / `apply_template_to_user`, and remove the app-layer null-branch rejection.

QA/QC: Add a static test covering the scope adapter and action guard. Run the focused staff-permission test, then typecheck/lint/build if the surrounding worktree allows it.

Attestation: BA rules map to `apps/web/app/(protected)/hr/staff/[id]/permissions/permissions-client.tsx` and `actions.ts`; regression coverage maps to `apps/web/tests/staff-permissions-scope-static.test.ts`. Deferred: no database migration and no owner self-permission management.
