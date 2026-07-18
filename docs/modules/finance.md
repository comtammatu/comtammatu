# Finance Module

## Product Boundary

Enterprise accounting is outside the current Finance product boundary.

Finance Basic is the default Finance experience when `/finance` opens as
`Sức khỏe tài chính` and shows four decision cards without ambiguous revenue
labels:

- **Tiền đã thu**: kỳ này đã thu bao nhiêu tiền?
- **Doanh thu ròng**: doanh thu sau giảm giá và trước VAT là bao nhiêu?
- **Giá trị tồn kho**: hiện đang giữ bao nhiêu tiền trong kho?
- **Chi vận hành**: kỳ này đã ghi nhận bao nhiêu chi phí vận hành?

Gross profit and food-cost coverage remain supporting analysis in
`/finance/food-cost`; they are not default landing cards.

Do not expand Finance by default into a full enterprise accounting product.
The current business model is HKD, so the Finance surface must serve restaurant
operating finance first: daily money, stock value, food cost, expenses, HĐĐT,
and accountant export.

Finance metrics, cards, titles, and overview summaries must also follow
`docs/ref/operational-data-contract.md`. Do not add a new finance KPI or reuse a
generic label such as "doanh thu" or "lãi gộp" unless the metric contract states
the exact source, formula, exclusions, confidence, and drilldown.

## Scope Boundary

## Reporting Maturity

Finance grows by reporting maturity, not by exposing enterprise accounting
screens to every operator from day one.

| Stage | Key                    | Default audience               | Product intent                                                                         |
| ----- | ---------------------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| 1     | `hkd_basic`            | Hộ kinh doanh / one-shop owner | Daily cash, simple gross profit, inventory money, simple expenses, and exceptions only |
| 2     | `branch_control`       | Multi-branch owner / operator  | Compare branches using the same formulas as HKD Basic, then drill into outliers        |
| 3     | `accountant_reporting` | Accountant / reporting owner   | HĐĐT, AP, payroll liability, accountant exports, and advanced accounting reports       |

The default `/finance` experience must start at `hkd_basic`. It may reveal
`branch_control` comparison only when the user has more than one accessible
branch. Accountant-reporting routes stay available by permission, but they must
not become the default Finance landing while the business is still using HKD
level operating reports.

### Finance Basic

Finance Basic is the current finance surface. Its landing owns four primary
cards:

1. **Money collected**
   - Completed paid orders by branch/date.
   - Revenue must be bucketed by completed payment time in Vietnam local date.
   - `Tiền đã thu` is money collected from completed payments.

2. **Net revenue**
   - `Doanh thu ròng` on the owner-facing surface means net sales after
     discounts/refunds and before VAT; this is the margin denominator.
   - Never ask the owner to choose the meaning of `doanh thu ròng`; adapt legacy
     source fields into either `total_collected` or `net_sales_before_vat`.
   - Top món uses the same `resolved.start→end` window as every other KPI; side items in `order_items.sides` are counted as their own món and their revenue is subtracted from the parent món line to avoid double-counting (migrations `20260609151615` + `20260609161402`, applied on prod).

3. **Inventory value**
   - Current stock value from inventory stock levels.
   - Use weighted/average unit cost when available, falling back to ingredient unit cost.
   - Treat it as a current snapshot, not a period metric.

4. **Operating expense**
   - Posted operating expenses in the selected period.
   - Exclude direct ingredient COGS from the top-line operating expense number.
   - If operating expenses are not recorded yet, show zero rather than inventing spend from supplier purchases.

Supporting analysis:

- **Gross profit**
  - Revenue before VAT after discounts minus ingredient cost/food cost.
  - Show gross margin as supporting context.
  - Keep this read-only until recipe/food-cost data is trusted.

Supporting workflows remain available but are not the first screen:

- Food-cost and gross-profit analysis.
- Cash session reconciliation.
- Payment/order desync recovery.
- HĐĐT recovery and export.
- Supplier payable review.
- Accountant export.

### Accounting Advanced Boundary (D020)

Má Tư operates as a Hộ kinh doanh on single-entry bookkeeping (TT 152/2025).
Enterprise double-entry accounting (TT 200 / VAS) is outside the current Finance scope.

`accounting_periods` and the close/reopen RPCs remain database-only owner-gated
support. No current app route exposes period close/reopen. Reopening that scope
requires a new decision.

## Route Contract

Current code has a broad `/finance/*` workspace. The target product contract is:

| Route family                 | Current role                 | Decision                                                                  |
| ---------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| `/finance`                   | Four-card basic landing      | Show money collected, net revenue, inventory value, and operating expense |
| `/finance/revenue`           | Revenue analytics            | Keep, but do not make it the only money-control entry                     |
| `/finance/food-cost`         | Gross profit / margin signal | Keep as read-only analysis, not enterprise accounting                     |
| `/finance/supplier-invoices` | Supplier payable review      | Thin Finance/AP entry to supplier invoices; do not count as expenses      |
| `/finance/invoices`          | HĐĐT queue                   | Keep as support workflow                                                  |
| `/finance/summary`           | HĐĐT summary trigger         | Keep admin-only by action permission                                      |

Inventory owns the detailed stock-value workspace. Finance displays only the
current inventory-value card and does not expose a duplicate inventory route.

There is no current `/admin/accounting/*` app surface.

## Acceptance Criteria

Finance Basic is operationally acceptable only when all of these are true:

1. Owner can open one screen and see money collected, net revenue, inventory value, and operating expense.
2. Revenue uses the paid-at Vietnam-local period contract.
3. Inventory value uses actual stock valuation data, not a static estimate.
4. Operating expense is clearly separate from direct ingredient COGS.
5. Gross profit remains supporting read-only analysis derived from revenue before VAT after discounts minus food cost.
6. Labels avoid advanced accounting terms unless the user is inside an advanced accounting route.
7. Support workflows for HĐĐT, payment/order desync, cash sessions, and supplier payables stay accessible but do not dominate the first screen.
8. No current operating action depends on enterprise-accounting screens.

## Stop Rules

Do not implement new Accounting Advanced work until Finance Basic passes the acceptance criteria above.

Do not add new finance KPIs unless they answer a daily operator question or a required accountant export question.

Do not expose VAS/TT200 routes as the primary Finance experience for owner or branch operations while Má Tư is operating as HKD.

Do not call the module "done" because enterprise-accounting objects exist in old migrations or archived references. Restaurant finance readiness is operating cash, revenue, expense, HĐĐT, inventory value, and accountant export.

## Current Gaps

- Chi vận hành is captured in `/finance/expenses`; keep it as single-entry HKD operating expense, not enterprise accounting.
- Inventory value detail stays in Inventory; Finance shows only the current-value card.
- HĐĐT is active through Viettel S-invoice, but recovery and archival workflows are support workflows, not the Finance Basic landing.
- Period close/reopen is not an app workflow. Treat it as database-only support unless a new owner decision reopens it.

## Source Files

- `apps/web/app/(protected)/finance/*`
- `apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/*`
- `apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts`
- `apps/web/app/(protected)/inventory/supplier-invoices/*`
- `apps/web/app/(protected)/inventory/report-actions.ts`
- `packages/shared/src/auth/module-acl.ts`
- `packages/shared/src/auth/nav-config.ts`
- `packages/shared/src/auth/permissions.ts`
- `supabase/migrations/*finance*.sql`
- `supabase/migrations/*hddt*.sql`
- `supabase/migrations/*supplier*.sql`
