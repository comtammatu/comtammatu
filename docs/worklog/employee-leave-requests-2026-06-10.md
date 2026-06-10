# Employee Leave Requests — 2026-06-10

## Contract

Surface = `/employee/leave` + `/hr` leave tab. Primary job = employee can ask for time off and HR/branch manager can approve or reject it by branch. Change type = T3 schema/RLS/RPC + Employee/HRM UI wiring. Primitives = existing Employee shell, HR tabs/table, shadcn `Button`, `Badge`, `Dialog`, `Select`, `Table`, `Textarea`, `Empty`, `Item`.

Skill plan: repo rules = engineering + skills + database + ui + workflow + references; external skills = supabase + supabase-postgres-best-practices + shadcn; runtime tools = local CLI/static tests/browser if an authenticated dev session is available. Skipped live Supabase apply until an owner-approved dev/test target is verified; migration status remains **drafted** until then.

## T3 Debate

PM: scope is minimum self-service leave request plus HR approval. Keep leave secondary in Profile, not a fifth Employee bottom-nav item. Acceptance = employee can submit/cancel pending leave and HR/branch manager can approve/reject by branch.

BA: date range is inclusive, future/today only, `start_date <= end_date`, statuses are pending/approved/rejected/cancelled, managers cannot review their own request, and this slice does not calculate leave balance, payroll deduction, or attendance rows.

Senior Dev: create `leave_requests` table plus `submit/cancel/approve/reject` SECURITY DEFINER RPCs with fixed `search_path`, branch-scoped permission keys, explicit Data API grants, RLS select policies, and Zod-validated Server Actions that never return raw Supabase errors.

QA: verify migration contains RLS/RPC/grants/search path, TS permissions/types are wired, Employee profile links to leave, HRM exposes a leave tab, and full gates pass. If DB is not applied, call out that `pnpm db:types` was not run from live schema.

## State

- Migration file: `supabase/migrations/20260610110000_employee_leave_requests.sql`
- Migration status: drafted
- Live DB apply: pending owner-approved dev/test target
- Generated DB types: manually mirrored for local build until live `pnpm db:types` can run after apply
