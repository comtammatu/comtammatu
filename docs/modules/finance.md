# Finance Module

## Product Boundary

Enterprise accounting is outside the current Finance product boundary.

Finance Basic is the default Finance experience when `/finance` opens as
`Sức khỏe tài chính` and shows four primary decision cards without ambiguous
revenue labels:

- **Doanh thu**: how much completed payment value was recorded in the period?
- **Bán hàng sau giảm giá**: what is paid-order merchandise value after
  discount and before VAT?
- **Giá trị tồn kho**: how much operating inventory value remains at period
  end, what was the opening value, and what is the percentage movement?
- **Chi vận hành**: how much posted operating spend was recorded for rent,
  utilities, payroll, repairs, supplies, marketing, fees/tax, and other
  operating categories?

Below those period cards, keep the tenant-wide current-funds row:

- **Tiền mặt theo sổ**: opening cash plus completed cash collections minus cash
  payouts, adjusted only for accepted POS-session variances.
- **Tiền trong ngân hàng**: required `bank_opening_balance` anchor plus every
  canonical SePay movement in `bank_transactions`: incoming amounts add and
  outgoing amounts subtract. The application cannot read the bank's opening
  account balance, so changing the anchor changes the result only by the anchor
  delta; it never removes previously imported movements.

These two balances do not follow the page's period or branch filter. Show `—`
until the owner has set the applicable opening anchor.

`bank_transactions` is the bank-ledger source of truth. Signed SePay webhooks
and Owner-imported SePay exports are idempotent ingestion paths keyed by the
stable SePay transaction ID. `webhook_events` remains delivery and processing
evidence. `bank_transaction_reconciliation_matches` only classifies a bank row
against a payment, operating expense, supplier payment, or refund; adding or
removing a match must never change the bank balance.

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

1. **Completed-payment revenue**
   - Completed paid orders by branch/date.
   - Revenue must be bucketed by completed payment time in Vietnam local date.
   - The owner-facing label is `Doanh thu`; its precise meaning is completed
     payment value and it may include VAT. It is not tax-declared revenue.

2. **Sales after discount**
   - `Bán hàng sau giảm giá` is `subtotal_revenue - discount_amount` for paid
     orders and excludes VAT. The UI must not call this `Doanh thu ròng`, because
     that label implies accounting adjustments that the current formula does
     not model separately.
   - Keep the internal adapter field `netRevenueBeforeVat` only as a legacy code
     identifier; UI and operating documentation use the precise label above.
   - Top món uses the same `resolved.start→end` window as every other KPI; side items in `order_items.sides` are counted as their own món and their revenue is subtracted from the parent món line to avoid double-counting (migrations `20260609151615` + `20260609161402`, applied on prod).

3. **Inventory value**
   - Period-end value is reconstructed from current stock value and movements
     after the selected period; opening value additionally reverses movements
     inside the period.
   - Use movement unit cost when available, falling back to ingredient unit
     cost. Show the opening value and neutral percentage movement, because an
     increase is not inherently good or bad.

4. **Operating expense**
   - Posted operating expenses in the selected period.
   - Include only `rent`, `utilities`, `gas_fuel`, `salary`, `repair`,
     `supplies`, `marketing`, `fees_tax`, and `other`.
   - Exclude ingredient/material COGS, supplier invoice payments, and internal
     cash-to-bank deposits/transfers from the top-line operating expense number.
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
- HĐĐT issuance, cancellation, and replacement support.
- Supplier payable review.
- Accountant export.

### POS Session Cash Contract

The closed POS session is the immutable physical-count record:

1. `opening_cash` is the counted cash at shift open.
2. `cash_revenue` is the sum of completed `payments.amount` with
   `method='cash'` for paid, non-cancelled orders in that session.
3. `expected_cash = opening_cash + cash_revenue`.
4. `cash_difference = closing_cash - expected_cash`, where `closing_cash` is
   the physical count entered at close.

An over-threshold difference is resolved from
`/br/[branchId]/pos-sessions?session=[id]`:

- `staff_repaid` is allowed only for a shortage and records full repayment of
  `abs(cash_difference)`. It does not rewrite the close count or add a cash-book
  adjustment: the repayment restores physical cash to the already expected
  amount.
- `accepted_adjustment` keeps the close count and posts the signed difference
  into `Tiền mặt theo sổ`: shortage reduces book cash and overage increases it.

Payment-method correction is owner-only in the session bill drawer and HĐĐT
queue. The atomic RPC updates `payments.method`, the `orders.payment_method`
display mirror, and recomputes a closed session's expected cash and difference.
Any prior variance resolution is cleared because the underlying classification
changed. The audit log preserves the correction reason and prior values. A
VietQR payment with canonical reconciliation or signed webhook evidence cannot
be changed to cash until the Owner explicitly removes that bank evidence from
the bank-reconciliation workflow; changing the payment method never rewrites a
`bank_transactions` movement.

### Owner and Accountant Visibility

The current application authorization model exposes Finance to `owner`; there
is no canonical `accountant` staff role. Therefore:

| Actor | Current system access | Must review or act on |
| --- | --- | --- |
| Owner | Tenant-wide `/finance`; owner-only bank import/reconciliation, payment-method correction, and opening-balance changes | Daily landing metrics and formulas; current cash/bank anchors; exact POS cash variances; unmatched SePay movements; VietQR payments missing bank evidence; operating expenses; AP; HĐĐT; inventory opening/closing evidence; exports |
| Branch Manager | Branch POS-session workflow only; no tenant-wide Finance, bank import/reconciliation, opening-balance, or payment-correction authority | Resolve an exact subordinate shift shortage as `staff_repaid` or accept its signed book adjustment as `accepted_adjustment`, subject to branch permission and audit |
| Accountant | No authenticated Finance role or write authority in the current model | Receive Owner-controlled revenue/payment exports, canonical SePay evidence, expense/AP evidence, HĐĐT evidence, and inventory opening/closing evidence; report discrepancies back to the Owner |

The system must not silently map `office` or another position to Finance
access. A separate authenticated accountant workspace requires an explicit
Owner decision on role, tenant/branch scope, read-only versus action
permissions, period-close authority, and production profile remediation.

Every money-changing or classification-changing workflow leaves a durable
audit action: `bank_transactions.sepay_import`,
`bank_transaction.reconcile`, `payment.method_correct`, or
`pos_session.variance_resolve`. Reconciliation matches classify evidence; they
never add or subtract a second bank movement.

### Accounting Advanced Boundary (D020)

Má Tư operates as a Hộ kinh doanh on single-entry bookkeeping (TT 152/2025).
Enterprise double-entry accounting (TT 200 / VAS) is outside the current Finance scope.

`accounting_periods` and the close/reopen RPCs remain database-only owner-gated
support. No current app route exposes period close/reopen. Reopening that scope
requires a new decision.

## Route Contract

Current code has a broad `/finance/*` workspace. The target product contract is:

| Route family                 | Current role                 | Decision                                                                                     |
| ---------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| `/finance`                   | Four-card basic landing      | Show completed-payment revenue, sales after discount, inventory value, and operating expense |
| `/finance/revenue`           | Revenue analytics            | Keep, but do not make it the only money-control entry                                        |
| `/finance/food-cost`         | Gross profit / margin signal | Keep as read-only analysis, not enterprise accounting                                        |
| `/finance/supplier-invoices` | Supplier payable review      | Thin Finance/AP entry to supplier invoices; do not count as expenses                         |
| `/finance/invoices`          | HĐĐT queue                   | Keep as support workflow                                                                     |

Inventory owns the detailed stock-value workspace. Finance displays only the
current inventory-value card and does not expose a duplicate inventory route.

There is no current `/accounting/*` app surface.

## Acceptance Criteria

Finance Basic is operationally acceptable only when all of these are true:

1. Owner can open one screen and see completed-payment revenue, sales after discount, inventory opening/closing movement, and operating expense.
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
- HĐĐT is active through Viettel S-invoice. The app owns per-order issuance,
  cancellation, and replacement; provider-side artifacts and status lookup stay
  in Viettel S-invoice operations rather than becoming Finance product surfaces.
  Recovery and archival workflows remain support operations, not Finance Basic
  landing surfaces.
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
