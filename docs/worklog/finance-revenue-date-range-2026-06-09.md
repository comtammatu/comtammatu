# Finance Revenue Date Range Contract

Date: 2026-06-09

Surface: `/finance/revenue` plus the Finance Basic top-items summary that reuses
the same data action.

Primary user job: owner/manager selects a period and trusts every visible revenue
indicator to use that exact branch/date scope.

Change type: read-only money reporting fix; existing `SECURITY DEFINER` RPC
contract extends from month bucket to explicit date range and decomposes
`order_items.sides` into separate sold menu items; no write path, no RLS policy
change, no schema table change.

Skill plan: repo rules = engineering + skills + workflow + database + ui +
finance module; external skills = supabase, supabase-postgres-best-practices,
next-best-practices, shadcn; runtime tools = CLI, local tests, optional browser
smoke if dev server/auth is available; skipped = subagent spawn because this
runtime only allows delegation when explicitly requested by the user.

Tool note: `supabase` CLI is not installed in this shell, so the migration file
was created manually after checking the current migration timestamp order.

PM: Scope is to remove the fixed-month top-items period from Finance Revenue and
the reused Finance Basic summary, then make top món count paid side-items as
their own menu items. Acceptance means top món uses the same
`resolved.start -> resolved.end` as KPI cards, chart, CSV, cashier, cash
variance, and food-cost snippets; `Cơm tấm Sườn Cốt Lết + Chả` reports
`Sườn Cốt Lết x1` and `Chả x1`. No new KPI family is added.

BA: Revenue remains completed paid orders bucketed by `payments.paid_at` in
`Asia/Ho_Chi_Minh`. Branch scope remains `finance:view`. Custom ranges must
work even when they start or end mid-month, and reversed/invalid dates must be
rejected before RPC execution. Side-item revenue is separated from the main line
so the report does not double-count the same paid amount.

Senior Dev: Preserve the existing server-action boundary and Supabase RPC ACL
pattern. Add a four-argument `get_top_items(branch, start, end, limit)` range
contract while keeping the old month-bucket signature as a compatibility wrapper.
Keep the return shape stable, but aggregate component rows from main lines plus
`order_items.sides`.

QA/QC: Add static regression coverage that fails if `fetchTopItems` is called
with only `resolved.start.slice(0, 7) + "-01"`, if the Revenue page does not
pass both `resolved.start` and `resolved.end`, or if the side-item migration
stops expanding `order_items.sides` / subtracting side revenue from main-line
revenue. Run targeted tests plus `pnpm typecheck && pnpm lint && pnpm build`
before claiming complete.
