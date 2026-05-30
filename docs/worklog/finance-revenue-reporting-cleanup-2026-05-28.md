# Finance/Revenue Reporting Cleanup - 2026-05-28

## Scope

- Surface: `/finance` and `/finance/revenue`.
- Primary user job: owner/manager opens Finance and can quickly report revenue, inventory value, operating expense, gross profit, and the supporting revenue breakdown.
- Route family: protected Finance workspace.
- Change type: UI hierarchy, copy clarity, and report composition only. No schema, RPC, RLS, payment, invoice, journal posting, or formula change.
- Primitives used: `AppPage`, `AppPageHeader`, `AppSection`, shadcn `Card`, `Table`, `Badge`, `Button`, existing Finance `KpiCard`, `FilterBar`, `WorkQueueStrip`, and chart components.

## T2 Self-Review

PM: Scope stays inside Finance Basic and Revenue reporting. Done means the first screens answer the four owner metrics and the revenue route reads like an exportable report, without promoting Accounting Advanced.

BA: Keep existing metric formulas: paid-at Vietnam-local revenue, inventory as current stock snapshot, operating expense from posted expense entries excluding direct ingredient COGS, gross profit from before-VAT revenue after discounts minus food cost. Do not invent fallback spend or new KPI formulas.

Senior Dev: Reuse existing Finance data loaders and shared surface primitives. Refactor presentation in `apps/web/app/(protected)/finance/page.tsx`, `revenue/revenue-client.tsx`, and local message copy; avoid touching auth, ACL, actions, RPC contracts, or migrations.

QA/QC: Verify TypeScript, lint, build, and route smoke where auth allows. Re-check mobile/desktop layout for filter, KPI grid, charts, tables, and no arbitrary Tailwind dimensions or nested-card visual regressions.
