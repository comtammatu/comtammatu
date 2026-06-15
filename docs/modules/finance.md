# Finance Module

## Verdict

Finance full is **NO-GO for pilot**.

Finance Basic is **CONDITIONAL GO** only when the first screen answers four owner-level questions:

- **Doanh thu**: kỳ này đã thu bao nhiêu?
- **Giá trị tồn kho**: hiện đang giữ bao nhiêu tiền trong kho?
- **Chi vận hành**: kỳ này đã ghi nhận bao nhiêu chi phí vận hành?
- **Lợi nhuận gộp**: doanh thu sau giảm giá/trước VAT trừ giá vốn món còn bao nhiêu?

Do not expand Finance by default into a full enterprise accounting product.
The current business model is HKD, so the pilot surface must serve restaurant
operating finance first: daily money, stock value, food cost, expenses, HĐĐT,
and accountant export.

## Scope Boundary

## Reporting Maturity

Finance grows by reporting maturity, not by exposing enterprise accounting
screens to every operator from day one.

| Stage | Key                 | Default audience                     | Product intent                                                                         |
| ----- | ------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| 1     | `hkd_basic`         | Hộ kinh doanh / one-shop owner       | Daily cash, simple gross profit, inventory money, simple expenses, and exceptions only |
| 2     | `branch_control`    | Multi-branch owner / operator        | Compare branches using the same formulas as HKD Basic, then drill into outliers        |
| 3     | `accountant_reporting` | Accountant / reporting owner       | HĐĐT, AP, payroll liability, accountant exports, and advanced accounting reports       |

The default `/finance` experience must start at `hkd_basic`. It may reveal
`branch_control` comparison only when the user has more than one accessible
branch. Accountant-reporting routes stay available by permission, but they must
not become the default Finance landing while the business is still using HKD
level operating reports.

### Finance Basic

Finance Basic is the pilot-facing finance surface. It owns four primary metrics:

1. **Revenue**
   - Completed paid orders by branch/date.
   - Revenue must be bucketed by completed payment time in Vietnam local date.
   - The owner-facing number may show total collected, with before-VAT revenue as supporting context.
   - Top món dùng đúng `resolved.start→end` như mọi KPI khác; side items trong `order_items.sides` được đếm thành món riêng và doanh thu side bị trừ khỏi dòng món chính để không double-count (migrations `20260609151615` + `20260609161402`, đã apply prod).

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

### Accounting Advanced — retired (D020)

The enterprise double-entry GL (TT 200 / VAS) was retired on 2026-06-14 (**D020**)
because Má Tư operates as a Hộ kinh doanh on single-entry bookkeeping (TT 152/2025).
Dropped from prod: `chart_of_accounts`, `journal_entries`, `journal_entry_lines`,
`posting_rules`, `fiscal_periods`, `vas_report_lines` plus the GL functions/triggers
and everything built on them (B01/B02/B03-DN statements, VAS report-line config,
payroll GL posting, subledger-to-GL reconciliation). The GL history is preserved under
`supabase/migrations/_archive/` for a possible future conversion-to-company path.

What remains is operational period close/reopen on `accounting_periods` (KEPT by design
— `close_period_*` / `reopen_period`, surfaced at `/admin/accounting/periods`). That is
month-close discipline, NOT general-ledger accounting. Do not reintroduce GL
capabilities while Má Tư is HKD; reopening that scope requires a new decision.

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
| `/finance/audit-trail`           | Audit/admin support          | Keep accessible for owner, but not core daily workflow                |
| `/admin/accounting/periods`      | Advanced accounting admin    | Keep restricted and direct-only; hide from default Admin nav          |

The enterprise GL routes were retired in D020 after a data-retention review (history archived under `supabase/migrations/_archive/`). The remaining advanced routes — `/admin/accounting/periods` (period close/reopen) and `/finance/audit-trail` — stay direct-only, not default nav.

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

Do not expose VAS/TT200 routes as the primary Finance experience for owner or branch operations while Má Tư is operating as HKD.

Do not call the module "done" because journal, statements, or chart of accounts exist. Those prove accounting capability, not restaurant finance readiness.

## Current Gaps

- This file is the active Finance contract. Do not infer current scope from removed historical plans.
- Chi vận hành has no dedicated simple expense entry workflow yet; the current read model depends on posted operating expense entries.
- Inventory value exists under reporting/inventory, not as a native Finance route.
- HĐĐT is active through Viettel S-invoice, but recovery and archival workflows are support workflows, not the Finance Basic landing.
- Advanced accounting routes exist for continuity but must remain hidden from the default pilot Finance/Admin nav.

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
