# Finance Module

## Product Boundary

Statutory enterprise accounting is an obligation of the company, but a general
ledger and financial statements are outside the current Finance product
boundary.

Finance Basic is the default Finance experience when `/finance` opens as
`Tổng quan tài chính`. The first section shows one period-result formula across
five cards:

- **Doanh thu thuần**: paid-order merchandise value after discount and before
  VAT.
- **Giá vốn món**: recorded ingredient cost for the paid orders in the period.
- **Lợi nhuận gộp**: net revenue minus recorded food cost.
- **Chi phí vận hành**: posted operating spend for rent,
  utilities, payroll, repairs, supplies, marketing, fees/tax, and other
  operating categories?
- **Kết quả vận hành**: gross profit minus recorded operating expense.

Missing food-cost coverage makes both gross profit and operating result
unavailable. A period with no recorded operating expense keeps operating result
unavailable instead of treating missing data as zero.

Below the period result, keep the tenant-wide current-funds row:

- **Tiền mặt theo sổ**: immutable opening cash plus completed cash collections,
  minus cash refunds, cash expenses, and cash supplier payments, plus
  append-only audited adjustments. POS-session counts and variances are
  reconciliation evidence only and never change this balance.
- **Tiền trong ngân hàng**: immutable opening bank amount plus every canonical
  SePay movement in `bank_transactions` and append-only audited adjustments.
  Incoming amounts add and outgoing amounts subtract.

These two balances do not follow the page's period or branch filter. Show
`Đang xác minh` until the Owner has created one verified opening through
`initialize_finance_funds`. The opening is the first delta from zero at its
verified boundary and cannot be edited or deleted. Corrections use
`create_finance_fund_adjustment`; they never replace the opening.

Legacy `cash_opening_balance`, `bank_opening_balance`, and `cash_opening_date`
settings remain frozen as investigation evidence and are never a calculation
fallback. Their presence blocks interactive initialization and requires a
controlled cutover. A verified cutover uses the exact server timestamp; a
project-start day may use 00:00 Vietnam time only when the evidence proves the
balance at that boundary. Otherwise, describe it honestly as a verified
cutover rather than a project-start opening.

`bank_transactions` is the bank-ledger source of truth. Signed SePay webhooks
and Owner-imported SePay exports are idempotent ingestion paths keyed by the
stable SePay transaction ID. `webhook_events` remains delivery and processing
evidence. `bank_transaction_reconciliation_matches` only classifies a bank row
against a payment, operating expense, supplier payment, or refund; adding or
removing a match must never change the bank balance.

A supplier payment reduces cash only when
`supplier_payments.payment_method='cash'`. A `bank_transfer` supplier payment
updates accounts payable but does not create a second bank movement; the
canonical outgoing `bank_transactions` row reduces bank funds whether or not
it has been reconciled.

Inventory sits in a separate filtered **Tài sản hiện có** section and is labeled
**Giá trị tồn kho cuối kỳ**.
The attention queue remains the last section. Tax and GTGT reporting are not
added to this landing formula; HĐĐT and tax workflows keep their existing
separate routes and contracts.

Do not expand Finance by default into a full enterprise accounting product.
The Finance surface serves restaurant operating finance first: daily money,
stock value, food cost, expenses, HĐĐT, AP and accountant export.

Finance metrics, cards, titles, and overview summaries must also follow
`docs/ref/operational-data-contract.md`. Do not add a new finance KPI or reuse a
generic label such as "doanh thu" or "lợi nhuận" unless the metric contract
states the exact source, formula, exclusions, confidence, and drilldown.

## Scope Boundary

## Reporting Maturity

Finance grows by reporting maturity, not by exposing enterprise accounting
screens to every operator from day one.

| Stage | Key                    | Default audience               | Product intent                                                                         |
| ----- | ---------------------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| 1     | `operating_basic`      | Owner / operator               | Daily cash, simple gross profit, inventory money, simple expenses, and exceptions only |
| 2     | `branch_control`       | Multi-branch owner / operator  | Compare branches using the same operating formulas, then drill into outliers           |
| 3     | `accountant_reporting` | Accountant / reporting owner   | HĐĐT, AP, payroll liability, accountant exports, and advanced accounting reports       |

The default `/finance` experience must start at `operating_basic`. It may reveal
`branch_control` comparison only when the user has more than one accessible
branch. Accountant-reporting routes stay available by permission, but they must
not become the default Finance landing while the operating dataset is not a
complete accounting close.

### Finance Basic

Finance Basic is the current finance surface. Its landing owns five primary
period-result cards:

1. **Net revenue**
   - `Doanh thu thuần` is `subtotal_revenue - discount_amount` for paid orders
     and excludes VAT.
   - Keep the internal adapter field `netRevenueBeforeVat` only as a legacy code
     identifier; UI and operating documentation use the precise label above.
   - `totalCollected` remains available in the revenue detail and is labeled
     `Tổng tiền đã thu`; it is not a landing formula card.
   - Top món uses the same `resolved.start→end` window as every other KPI; side
     items in `order_items.sides` are counted as their own món and their revenue
     is subtracted from the parent món line to avoid double-counting.

2. **Food cost**
   - Use recorded sale-consumption movements for paid orders.
   - If food-cost coverage is incomplete, display missing-data state and do not
     calculate the following derived cards.

3. **Gross profit**
   - `Lợi nhuận gộp = Doanh thu thuần - Giá vốn món`.
   - Show gross margin as supporting context only when food-cost coverage is
     complete.

4. **Operating expense**
   - Posted operating expenses in the selected period.
   - Include only `rent`, `utilities`, `gas_fuel`, `salary`, `repair`,
     `supplies`, `marketing`, `fees_tax`, and `other`.
   - Exclude ingredient/material COGS, supplier invoice payments, and internal
     cash-to-bank deposits/transfers from the top-line operating expense number.
   - If no operating expense has been recorded, display `Chưa ghi nhận`.

5. **Operating result**
   - `Kết quả vận hành = Lợi nhuận gộp - Chi phí vận hành`.
   - Do not call it net profit. Keep it unavailable when food cost is incomplete
     or operating expense has not been recorded.

After the formula, show the unfiltered current-funds section, the filtered
period-end inventory value, then the attention queue. Desktop uses five columns,
tablet uses two, and mobile uses one.

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
- `accepted_adjustment` keeps the close count and records the variance outcome
  for reporting and investigation. It does not change `Tiền mặt theo sổ`.

Any verified gain or loss that must change book funds is recorded separately
through `create_finance_fund_adjustment` with its own reason and evidence.

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
| Owner | Tenant-wide `/finance`; owner-only bank import/reconciliation, payment-method correction, one-time fund initialization, and append-only fund adjustments | Daily landing metrics and formulas; current cash/bank opening and adjustments; exact POS cash variances; unmatched SePay movements; VietQR payments missing bank evidence; operating expenses; AP; HĐĐT; inventory opening/closing evidence; exports |
| Branch Manager | Branch POS-session workflow only; no tenant-wide Finance, bank import/reconciliation, opening-balance, fund-adjustment, or payment-correction authority | Resolve an exact subordinate shift shortage as `staff_repaid` or record its variance outcome as `accepted_adjustment`, subject to branch permission and audit; neither action changes tenant-wide book funds |
| Accountant | No authenticated Finance role or write authority in the current model | Receive Owner-controlled revenue/payment exports, canonical SePay evidence, expense/AP evidence, HĐĐT evidence, and inventory opening/closing evidence; report discrepancies back to the Owner |

The system must not silently map `office` or another position to Finance
access. A separate authenticated accountant workspace requires an explicit
Owner decision on role, tenant/branch scope, read-only versus action
permissions, period-close authority, and production profile remediation.

Every money-changing or classification-changing workflow leaves a durable
audit action: `bank_transactions.sepay_import`,
`bank_transaction.reconcile`, `payment.method_correct`, or
`pos_session.variance_resolve`, `finance_fund_opening_created`, or
`finance_fund_adjustment_created`. Reconciliation matches classify evidence;
they never add or subtract a second bank movement.

### Accounting Advanced Boundary (D020)

The company must formally select and apply the accounting regime appropriate to
its size and conditions (TT 99/2025, TT 133/2016 or TT 58/2026 as applicable).
The current Finance surface is not the statutory general ledger, tax
finalization or financial statements.

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

Supplier invoice matching compares the pre-VAT `subtotal` with confirmed net
accepted GRN value and a fully priced PO subtotal. AP balance and supplier
payment use `total_amount = subtotal + vat_amount`. Multi-rate input invoices
store one immutable `vat_breakdown` bucket per rate; database normalization
derives the header totals and leaves the compatibility `vat_rate` null when
more than one rate is present. The legacy
`/inventory/supplier-invoices` route remains a compatibility entry only; new
GRN and report links use `/finance/supplier-invoices`.

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

Do not expose statutory accounting routes as the primary Finance experience for owner or branch operations.

Do not call the module "done" because enterprise-accounting objects exist in old migrations or archived references. Restaurant finance readiness is operating cash, revenue, expense, HĐĐT, inventory value, and accountant export.

## Current Gaps

- Chi phí vận hành is captured in `/finance/expenses`; keep it as an operating record, not a statutory journal entry.
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
