# Employee Legacy Cleanup And HR Contract

> Reconciled-through b179630bb

Review tier: T3, because the slice touches proxy/auth boundaries and migration files.

Skill plan: Ponytail for the smallest correct cleanup; Supabase/database rules only as auth/RLS boundary guardrails; no production DB apply and no RLS policy change in this slice.

PM: scope = remove live `/employee` compatibility paths and clarify `/hr`; acceptance = generated route docs and auth docs no longer present `/employee` as a surface, HR ownership is explicit.

BA: rules = Auth identity, route ACL, PBAC grants, action/RPC gates, and RLS stay separate; `/hr` manages staff records/config/payroll oversight, while `/br/[branchId]/shift/*` owns daily staff runtime.

Dev: approach = delete proxy legacy redirect/helper, update static tests, fix route-matrix generator/docs, and avoid renaming broad internal module keys unless required by current runtime.

QA: tests = targeted branch-hub/scope static tests, route-matrix check, typecheck, lint, build, and CodeGraph re-index.

## Retired Employee Module Key Cleanup

Review tier: T3, because this slice removes a route/auth metadata key and
touches proxy ACL behavior.

Skill plan: repo rules = engineering + skills + database + ui + workflow;
external skills = supabase; runtime tools = CodeGraph + local tests; skipped =
DB migration/browser smoke because there is no schema or rendered UI behavior
change.

PM: scope = remove the stale `employee` module key after `/employee` route
retirement; acceptance = staff-day runtime is represented by `operator_home`,
while manager approvals keep their dedicated module keys.

BA: rules = `/br/[branchId]/shift/*` and `/br/[branchId]/profile/*` are branch
runtime, not a standalone Employee app; checkout/leave approval routes remain
manager-tier gates.

Dev: approach = reuse `operator_home` in nav/route-map and delete the dead key;
no new PBAC layer or route helper.

QA: tests = extend HR contract static guard plus module ACL, scope, and
route-table tests.

## Staff Runtime Library Naming Pass

Review tier: T2, because this is an import/path refactor across the branch
runtime surface without behavior changes.

Skill plan: repo rules = engineering + skills + ui + workflow; external skills
= none; runtime tools = CodeGraph + local tests; skipped = browser smoke
because rendered behavior is unchanged.

PM: scope = stop naming the shared branch staff runtime as a live `/employee`
app; acceptance = route consumers import `@lib/staff-runtime/*`.

BA: rules = `/br/[branchId]/*` owns staff daily runtime; `Employee*` component
names may remain as implementation vocabulary for this pass.

Dev: approach = move the helper directory and mechanically update imports and
static file-path tests; no alias layer.

QA: tests = targeted operator/employee static tests plus repo hard gates and
CodeGraph refresh.
