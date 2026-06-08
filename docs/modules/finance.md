# Finance Module

> **Lean HKD scope (2026-06):** The business is a **Hộ Kinh Doanh** (simplified books under TT 88/2021, no formal BCTC/VAS). The lean baseline keeps only operating-finance surfaces backed by live tables — daily cash (`cash_entries`), revenue from paid orders, supplier debt (`supplier_invoices` / `supplier_payments`), and HĐĐT (Viettel S-invoice). The Accounting Advanced surfaces below (chart of accounts, journal, fiscal periods, B01/B02/B03-DN, VAS report lines, payroll GL) are **retained historical/contract reference** describing the pre-lean CTCP product; they are CUT from the HKD baseline and must not drive current scope. Read the four-metric "Finance Basic / `hkd_basic`" stage as the live target.

## Verdict

Finance full is **NO-GO for pilot**.

Finance Basic is **CONDITIONAL GO** only when the first screen answers four owner-level questions:

- **Doanh thu**: kỳ này đã thu bao nhiêu?
- **Giá trị tồn kho**: hiện đang giữ bao nhiêu tiền trong kho?
- **Chi vận hành**: kỳ này đã ghi nhận bao nhiêu chi phí vận hành?
- **Lợi nhuận gộp**: doanh thu sau giảm giá/trước VAT trừ giá vốn món còn bao nhiêu?

Do not expand Finance by default into a full enterprise accounting product. The business is a Hộ Kinh Doanh (simplified TT 88/2021 books, no formal VAS/BCTC), so the product surface must serve restaurant operating finance first.

## Scope Boundary

## Reporting Maturity

Finance grows by reporting maturity, not by exposing enterprise accounting
screens to every operator from day one.

| Stage | Key                 | Default audience                     | Product intent                                                                         |
| ----- | ------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| 1     | `hkd_basic`         | Hộ kinh doanh / one-shop owner       | Daily cash, simple gross profit, inventory money, simple expenses, and exceptions only |
| 2     | `branch_control`    | Multi-branch owner / operator        | Compare branches using the same formulas as HKD Basic, then drill into outliers        |
| 3     | `company_reporting` | Accountant / company reporting owner | HĐĐT, AP, payroll liability, accountant exports, and advanced accounting reports       |

The default `/finance` experience must start at `hkd_basic`. It may reveal
`branch_control` comparison only when the user has more than one accessible
branch. `company_reporting` routes stay available by permission, but they must
not become the default Finance landing while the business is still using HKD
level operating reports.

### Finance Basic

Finance Basic is the pilot-facing finance surface. It owns four primary metrics:

1. **Revenue**
   - Completed paid orders by branch/date.
   - Revenue must be bucketed by completed payment time in Vietnam local date.
   - The owner-facing number may show total collected, with before-VAT revenue as supporting context.

2. **Inventory value**
   - Current stock value from inventory stock levels.
   - Use weighted/average unit cost when available, falling back to ingredient unit cost.
   - Treat it as a current snapshot, not a period metric.

3. **Operating expense**
   - Posted operating expenses in the selected period.
   - Exclude direct ingredient COGS from the top-line operating expense number.
   - If operating expenses are not recorded yet, show zero rather than inventing spend from supplier purchases.

4. **Gross profit**
   - Revenue before VAT after discounts minus ingredient cost/food cost.
   - Show gross margin as supporting context.
   - Keep this read-only until recipe/food-cost data is trusted.

Supporting workflows remain available but are not the first screen:

- Cash session reconciliation.
- Payment/order desync recovery.
- HĐĐT recovery and export.
- Supplier payable review.
- Accountant export.

### Accounting Advanced

Accounting Advanced is not the pilot default surface. It includes:

- Chart of accounts.
- Manual journal entries.
- Posting rules.
- Fiscal period close/reopen.
- B01-DN balance sheet.
- B02-DN income statement.
- B03-DN cashflow statement.
- VAS report line configuration.
- Payroll GL posting.
- Full subledger-to-GL reconciliation.

These capabilities may remain in code and database because they protect legal/accounting continuity, but they must not define the pilot UX until Finance Basic is stable.

## Route Contract

Current code has a broad `/finance/*` workspace. The target product contract is:

| Route family                     | Pilot role                   | Decision                                                              |
| -------------------------------- | ---------------------------- | --------------------------------------------------------------------- |
| `/finance`                       | Four-metric basic landing    | Should show revenue, inventory value, operating expense, gross profit |
| `/finance/revenue`               | Revenue analytics            | Keep, but do not make it the only money-control entry                 |
| `/admin/reports/inventory-value` | Inventory value drilldown    | Link from Finance Basic, implemented under reporting/inventory        |
| `/finance/food-cost`             | Gross profit / margin signal | Keep as read-only analysis, not GL accounting                         |
| `/finance/reconciliation`        | Payment/order recovery       | Keep as support workflow, not primary Finance nav                     |
| `/finance/invoices`              | HĐĐT queue                   | Keep as support workflow                                              |
| `/finance/summary`               | HĐĐT summary trigger         | Keep admin-only by action permission                                  |
| `/finance/chart-of-accounts`     | Advanced accounting          | Hide from default pilot nav                                           |
| `/finance/journal`               | Advanced accounting          | Hide from default pilot nav                                           |
| `/finance/posting-rules`         | Advanced accounting          | Hide from default pilot nav                                           |
| `/finance/periods`               | Advanced accounting          | Hide from default pilot nav                                           |
| `/finance/statements`            | Advanced accounting          | Hide from default pilot nav                                           |
| `/finance/audit-trail`           | Audit/admin support          | Keep accessible for owner/super_manager, but not core daily workflow  |
| `/admin/accounting/periods`      | Advanced accounting admin    | Keep restricted                                                       |

Do not delete advanced routes without a data-retention and accounting review. First step is navigation and landing simplification.

## Acceptance Criteria

Finance Basic is acceptable for pilot only when all of these are true:

1. Owner can open one screen and see revenue, inventory value, operating expense, and gross profit.
2. Revenue uses the paid-at Vietnam-local period contract.
3. Inventory value uses actual stock valuation data, not a static estimate.
4. Operating expense is clearly separate from direct ingredient COGS.
5. Gross profit is derived from revenue before VAT after discounts minus food cost.
6. Labels avoid advanced accounting terms unless the user is inside an advanced accounting route.
7. Support workflows for HĐĐT, payment/order desync, cash sessions, and supplier payables stay accessible but do not dominate the first screen.
8. No pilot-critical action depends on manual journal entry creation.

## Stop Rules

Do not implement new Accounting Advanced work until Finance Basic passes the acceptance criteria above.

Do not add new finance KPIs unless they answer a daily operator question or a required accountant export question.

Do not expose VAS/TT200 routes as the primary Finance experience for owner or branch operations.

Do not call the module "done" because journal, statements, or chart of accounts exist. Those prove accounting capability, not restaurant finance readiness.

## Current Gaps

- This file is the active Finance contract. Do not infer current scope from removed historical plans.
- Chi vận hành has no dedicated simple expense entry workflow yet; the current read model depends on posted operating expense entries.
- Inventory value exists under reporting/inventory, not as a native Finance route.
- HĐĐT is active through Viettel S-invoice, but recovery and archival workflows are support workflows, not the Finance Basic landing.
- Advanced accounting routes exist for continuity but must remain hidden from the default pilot Finance nav.

## Source Files

- `apps/web/app/(protected)/finance/*`
- `apps/web/app/(protected)/br/[branchId]/settings/pos-sessions/*`
- `apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts`
- `apps/web/app/(protected)/inventory/supplier-invoices/*`
- `apps/web/app/(protected)/inventory/report-actions.ts`
- `packages/shared/src/auth/module-acl.ts`
- `packages/shared/src/auth/nav-config.ts`
- `packages/shared/src/auth/permissions.ts`
- `supabase/migrations/*finance*.sql`
- `supabase/migrations/*hddt*.sql`
- `supabase/migrations/*supplier*.sql`
