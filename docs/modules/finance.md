# Finance Module

## Product Boundary

Statutory enterprise accounting is a company obligation, but a general ledger
and financial statements are outside the Finance product boundary (D020).

Finance Basic is the default `/finance` experience (`Tổng quan tài chính`).
Period-result formula (two rows):

- **`Doanh thu thuần`**: paid-order merchandise value after discount, before VAT.
- **`Giá vốn món`**: recorded POS ingredient cost for paid orders at sales
  `Chi nhánh` only (`branch_kind = branch`, `order_id` present). Runtime source is
  `inventory_value_allocations` (`allocation_bucket = food_cost`) when
  `inventory_valuation_cutovers.status = active`; otherwise the landing KPI is
  empty. Excludes manual `phiếu tiêu hao`, `Kho Tổng`, and `Bếp Trung Tâm`.
  `/finance/food-cost` **`Định mức/phần`** uses the same catalog resolver as
  `/inventory/menu-recipes` (company WAC, then last-known; missing WAC
  is empty, not `0đ`; no-recipe is `0đ`). **`Giá thuần/phần`** is net revenue /
  qty after side split and discount, not `menu_price`. Company WAC is
  `Giá vốn`, not this column. See `docs/ref/inventory.md` § 3.
- **`Lợi nhuận gộp`**: net revenue minus recorded food cost.
- **`Chi phí vận hành`**: posted period expense (rent, utilities, payroll,
  repairs, consumables, marketing, fees/tax, hospitality, other). Excludes
  `capital`/`deposit`, capitalized equipment, ingredient COGS, cash↔bank.
- **`Biến động tồn kho`**: closing minus opening inventory value (when readable).
- **`Kết quả kinh doanh`**: gross profit − operating expense + inventory change.

Missing food-cost coverage makes gross profit and period result unavailable.
No recorded operating expense keeps period result unavailable (not zero).

After the period result, outside the formula: **`Chi phí ban đầu`**
(`Vốn đã bỏ ra`) — all-time gross `capital`+`deposit`; ignores the period
filter. Branch filter matches opex (selected branch only, never tenant-level).

Below that, tenant-wide current funds (not period/branch filtered):
`Tiền mặt + Tiền tài khoản = Tổng tiền`:

- **`Tiền mặt`**: immutable opening cash + completed cash collections − cash
  refunds, cash expenses, cash supplier payments + append-only audited
  adjustments. POS-session counts/variances are reconciliation evidence only.
- **`Tiền tài khoản`**: immutable opening bank + every canonical SePay movement
  in `bank_transactions` + append-only audited adjustments.
- **`Tổng tiền`**: sum of the two.

Show `Chưa mở sổ` until one verified opening via `initialize_finance_funds`.
Opening cannot be edited/deleted; corrections use
`create_finance_fund_adjustment`. Legacy `cash_opening_*` / `bank_opening_*`
settings are frozen evidence only — never a calculation fallback; their
presence blocks interactive init. Operator UI must not say "cutover": default
boundary is `Ngay bây giờ`; `Từ 0 giờ ngày bắt đầu` only when evidence proves
that boundary.

`bank_transactions` is bank-ledger source of truth. Signed SePay webhooks and
Owner-imported SePay exports are idempotent by stable SePay transaction ID.
`webhook_events` is delivery evidence.
`bank_transaction_reconciliation_matches` classifies only — never changes
bank balance.

Cash supplier payments (`payment_method='cash'`) reduce cash.
`bank_transfer` supplier payments update AP without a second bank movement;
the canonical outgoing `bank_transactions` row reduces bank funds.

Inventory sits in a filtered **`Tồn kho`** section (**`Giá trị tồn kho cuối kỳ`**),
not a full asset section. Attention queue is last. Tax/GTGT stay on existing
HĐĐT routes — not on this landing formula.

Do not expand Finance into a full enterprise accounting product by default.
Metrics must follow `docs/ref/operational-data-contract.md`. Do not add or
reuse a finance KPI label unless that contract states source, formula,
exclusions, confidence, and drilldown.

## Scope Boundary

### Reporting Maturity

Finance grows by reporting maturity, not by exposing enterprise screens to
every operator.

| Stage | Key                    | Default audience              | Intent |
| ----- | ---------------------- | ----------------------------- | ------ |
| 1     | `operating_basic`      | Owner / operator              | Daily cash, simple gross profit, inventory money, expenses, exceptions |
| 2     | `branch_control`       | Multi-branch owner / operator | Same formulas across branches, then drill outliers |
| 3     | `accountant_reporting` | Accountant / reporting owner  | HĐĐT, AP, payroll liability, exports, advanced reports |

Default `/finance` starts at `operating_basic`. Reveal `branch_control` only
with more than one accessible branch. Accountant routes stay permission-gated
but must not become the default landing.

### Finance Basic

Landing cards (formulas in Product Boundary):

1. **Net revenue** — `subtotal_revenue - discount_amount` (paid, ex-VAT).
   `netRevenueBeforeVat` is legacy adapter ID only. `totalCollected` =
   `Tổng tiền đã thu` in detail, not a landing card. `Top món` shares
   `resolved.start→end`; `order_items.sides` are own `món` (parent revenue reduced).
2. **Food cost** — sale-consumption for paid orders; incomplete → missing-data.
3. **Gross profit** — net revenue − food cost; margin only when coverage complete.
4. **Operating expense** — operating categories only. Exclude COGS,
   `capital`, `deposit`, supplier payments, cash↔bank. None → `Chưa ghi nhận`.
5. **Period result** — gross − opex + inventory change. Not "net profit".
6. **Startup capital** — all-time `capital|deposit` gross; ignores period
   dates; outside the formula.

Then: unfiltered funds, filtered period-end inventory, attention queue.
Layout: desktop two rows; tablet two cols; mobile one. Supporting (not first):
food-cost analysis, cash sessions, desync recovery, HĐĐT, AP, export.

### POS Session Cash Contract

Closed POS session is the immutable physical-count record:

1. `opening_cash` — counted cash at shift open.
2. `cash_revenue` — sum completed `payments.amount` with `method='cash'` for
   paid, non-cancelled orders in session.
3. `expected_cash = opening_cash + cash_revenue`.
4. `cash_difference = closing_cash - expected_cash`.

Over-threshold resolution from
`/br/[branchId]/pos-sessions?session=[id]`:

- `staff_repaid` — shortage only; full `abs(cash_difference)` repayment; does
  not rewrite close count or add cash-book adjustment.
- `accepted_adjustment` — keeps close count; records variance for reporting;
  does not change `Tiền mặt`.

Book-fund gains/losses use `create_finance_fund_adjustment` separately.

Payment-method correction: Finance bill drawer / HĐĐT queue (Owner, Accountant)
uses `correct_payment_method`; POS completed-order cash→VietQR conversion uses
`pos_convert_cash_payment_to_vietqr` (`pos:confirm_payment`, stamps `payment_code`).
Both update `payments.method`, the order mirror, and closed-session expected cash; reverse VietQR→cash stays on Finance. Paid VietQR receipts keep the transfer QR (HDDT buyer QR still attaches beside it); cash receipts stay QR-free.

Unmatched expense methods (`cash`/`transfer`/`unpaid`) may be corrected by
Owner/Accountant with `finance:expense_create` via `transition_expense_payment`.
Matched bank evidence, `bank_deposit`, and open transfer-content intents stay
locked. Prior variance resolution clears when classification changes. VietQR
with canonical reconciliation/webhook evidence cannot become cash until Finance
removes that bank evidence; method change never rewrites `bank_transactions`.

### Owner and Accountant Visibility

**Product contract (D076/D091):** authenticated `accountant` is a first-class
role with complete `/finance` operational authority and Inventory GRN/PO slice.
Runtime `MODULE_ACL` admits `owner` and `accountant` to `/finance`. Full
role/route map: `docs/spec/role-route-matrix.md`. JWT central/accountant roles stay until
[ADR 0015](../plan/adr/0015-authorization-model.md) cutover.

| Actor          | Access | Must act on |
| -------------- | ------ | ----------- |
| Owner          | Tenant-wide `/finance`; same ops as Accountant | Landing metrics; cash/bank; POS variances; SePay unmatched; VietQR evidence; expenses; AP; HĐĐT; inventory open/close; exports; staff grants |
| Accountant     | All `/finance` ops + Inventory GRN/PO view/manage; no stock/production/catalog | Supplier docs, matching, service invoice verify, payments/advances, bank reconcile, Finance records |
| Branch Manager | Branch POS-session only; no tenant Finance; no purchase-price / chain-PO | `staff_repaid` / `accepted_adjustment` for subordinate shortage (neither changes book funds). May **read** MTD + day `Doanh thu thuần` / target progress via `get_branch_revenue_target_progress`; cannot edit targets or open `/finance` |

Do not map `office` or retired position codes to Finance. Period-close
enterprise accounting remains outside product (D020).

Money/classification workflows leave durable audit actions:
`bank_transactions.sepay_import`, `bank_transaction.reconcile`,
`payment.method_correct`, `pos_session.variance_resolve`,
`finance_fund_opening_created`, `finance_fund_adjustment_created`.
Reconciliation matches never add/subtract a second bank movement.

### Accounting Advanced Boundary (D020)

Company must apply the appropriate accounting regime (TT 99/2025, TT 133/2016
or TT 58/2026). Current Finance is not the statutory GL, tax finalization, or
financial statements.

`accounting_periods` and close/reopen RPCs remain database-only owner-gated
support. No app route exposes them. Reopening that scope needs a new decision.

### Permission Enforcement (mutation gates)

Action-layer gates (mirrored by RPC):

- **Expense mutations** (`createExpense`, `transitionExpensePayment`, cancel,
  period updates) → `finance:expense_create` (Owner or Accountant).
- **Supplier-invoice / fund mutations** (`createSupplierInvoice`,
  `confirmSupplierInvoice`, `recordSupplierPayment`, `allocateSupplierAdvance`,
  `createSupplierCreditAllocated`, `acceptSupplierInvoiceDiscrepancy`,
  `verifyServiceSupplierInvoice`, `initialize_finance_funds`,
  `create_finance_fund_adjustment`) → `finance:view` + `owner`/`accountant`
  position — not `finance:ap_pay`.
- **`finance:ap_pay`** reserved for `attachSupplierInvoiceVatEvidence` (also
  accepts `procurement:invoice_create`), matching its RPC.
- Owner-only "pay above current allocation" is inside
  `recordSupplierPayment` / allocation RPC, not a separate permission key.

`finance:ap_pay` / `finance:expense_create` / `accounting:period_close` in
`module-acl.ts` remain for future delegation; they are not the current gate for
the actions above. RLS remains final enforcement.

## Route Contract

| Route family                 | Role                         | Decision |
| ---------------------------- | ---------------------------- | -------- |
| `/finance`                   | Finance Basic landing        | Period formula + funds + inventory card + attention |
| `/finance/bank-transactions` | Bank LIST | Manual match by `order_number` (`mã đơn`); classify only, never change bank balance |
| `/finance/targets`           | Monthly revenue targets      | Finance-managed targets + non-cumulative reward tiers; no auto payroll |
| `/finance/food-cost`         | Gross profit / margin        | Read-only analysis |
| `/finance/supplier-invoices` | Supplier payable             | Thin AP entry; not expenses |
| `/finance/invoices`          | HĐĐT queue                   | Support workflow |

Inventory owns stock-value detail; Finance shows only the current-value card.
No `/accounting/*` app surface.

Supplier invoice matching/VAT/payment: actions +
[ADR 0018](../plan/adr/0018-inventory-finance-route-boundary.md). Invariants:
goods match confirmed GRN/PO (VAT out of inventory cost; PO/GRN not price
source); additive VN HĐĐT VAT (`gross = line + vat`; auto
`round(line*rate/100,2)`; manual VAT authoritative; header `±1 VND` or
`discrepancy`); service invoices `pending` until Accountant verifies;
confirm seals lines + price history + receipt settle; payment is AP/cash only
(never second inventory/COGS); multi-rate → immutable `vat_breakdown`; payment
needs HĐĐT GTGT path; only Owner pays above allocation (remainder = advance).
Legacy `/inventory/supplier-invoices` = `REDIRECT-SHIM`. LIST under
`finance/supplier-invoices/`; create/match/pay may stay in Inventory actions.

## VAT And Equipment Boundary

### Monetary precision

| Finance value | Scale |
| --- | ---: |
| Money total, VAT, discount, supplier unit price, payment, credit, advance, fund balance, fixed reward | 2 |
| Supplier quantity | 3 |
| VAT rate | enum `0`, `5`, `8`, `10` |
| POS settlement, menu price, cash, VietQR | 0 |

Canonical decimal strings cross browser / Server Action / RPC. Aggregation uses
scaled integers. Round-half-up at 2dp for supplier lines and auto VAT. Document
VAT amounts stay authoritative until operator recalculates. UI always shows 2dp.

Supplier invoice VAT and `expenses.vat_breakdown` are `input_vat_recorded` only.
Do not label `input_vat_deductible` or derive `vat_payable` without evidence,
allocation, period, and adjustment state. Operating-expense KPI uses pre-VAT
`expenses.subtotal`; cash/payable use gross `expenses.amount`.

Output VAT belongs to issued/corrected sales invoice snapshots — not revenue.

Equipment: classify before operating result (fixed asset → depreciation;
below-criteria tools → expense/allocate; period consumables → expense). No asset
register in product → no equipment-value card until full source/recon contract.

## Acceptance Criteria

1. One Owner screen: paid revenue, sales after discount, inventory open/close, opex.
2. Revenue = paid-at Vietnam-local period. Inventory = actual valuation.
3. Opex separate from ingredient COGS. Gross profit = supporting read-only.
4. No advanced-accounting labels outside advanced routes.
5. HĐĐT / desync / cash sessions / AP accessible but not first screen.
6. No operating action depends on enterprise-accounting screens.

## Stop Rules

- No Accounting Advanced until Finance Basic meets acceptance above.
- No new KPI unless daily operator or required accountant-export question.
- Statutory routes must not be primary Finance experience.
- Not "done" because enterprise objects exist in old migrations. Readiness =
  cash, revenue, expense, HĐĐT, inventory value, accountant export.

## Current Gaps

- `/finance/expenses` is operating + opening-capital ledger, not a statutory
  journal. Deductible VAT / equipment value / period close stay blocked (D020).

## Source Files

- `apps/web/app/(protected)/finance/*`
- `apps/web/app/(protected)/br/[branchId]/(operator)/pos-sessions/*`
- `apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts`
- `apps/web/app/(protected)/inventory/supplier-invoices/page.tsx` (REDIRECT-SHIM)
- `apps/web/app/(protected)/inventory/report-actions.ts`
- `packages/shared/src/auth/module-acl.ts`
- `packages/shared/src/auth/nav-config.ts`
- `packages/shared/src/auth/permissions.ts`
- `supabase/migrations/*finance*.sql`
- `supabase/migrations/*hddt*.sql` / `*supplier*.sql`
