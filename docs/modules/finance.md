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
- **`Lợi nhuận gộp`**: net revenue minus recorded food cost. Sales identity only.
  Incomplete POS coverage still shows the recorded portion with a coverage
  badge (`N/M` orders, `needs_review`); blank only when valuation cutover is
  inactive. `/finance/food-cost` gross margin uses recorded food cost over net
  sales, not theoretical portion cost.
- **`Chi phí hàng` / `Chi mua hàng`**: inbound `transfer_in` at branch, or confirmed `/finance/supplier-invoices` `subtotal` (ex-VAT) at company. Bank settlement is payment, not a second P&L hit.
- **`Chi vận hành`**: posted period expense (rent, utilities, payroll,
  repairs, consumables, marketing, fees/tax, hospitality, other). Excludes
  `capital`/`deposit`, capitalized equipment, ingredient COGS, cash↔bank.
- **`Biến động tồn kho`**: closing minus opening inventory value (when readable).
- **`Kết quả kinh doanh`**: revenue − goods-in − opex + inventory change. Not derived from GP.

Incomplete food-cost coverage does not blank gross profit; it warns via
coverage badge. No recorded operating expense keeps period result unavailable
(not zero).

After the period result, **`Tài sản`**: scoped
`Tiền mặt + Tiền tài khoản = Tổng tiền`; filtered period-end **`Tồn kho`**;
all-time **`Thiết bị`** (`category = capital`, spend recorded, not a register;
never `Giá trị thiết bị`); then a separate **`Chi phí ban đầu`** section
(`capital`+`deposit`, period ignored, branch filter matches opex). `Thiết bị`
is the capital slice of startup — do not add the two together.

Funds formula:

- **Company `Tiền mặt`**: sum of sales-branch cash books
  (`branch_kind = branch`). `Kho Tổng` / `Bếp Trung Tâm` have no cash book.
  Readable only when every active sales branch has a cash opening.
- **Sales-branch `Tiền mặt`**: that branch's immutable cash opening + completed
  cash collections − cash refunds, cash expenses, cash supplier payments, cash
  bank deposits + append-only audited adjustments. POS-session counts/variances
  are reconciliation evidence only.
- **Company `Tiền tài khoản`**: one company bank ledger — immutable bank opening
  + every canonical SePay movement in `bank_transactions` + append-only audited
  adjustments. Not split by branch. Shown on `/finance` **`Tài sản`** for every
  location scope (including a single sales branch).
- **`Tổng tiền`**: scoped cash (company sum of sales-branch books, or one
  branch book) + company bank. Branch scope still adds the full company bank
  ledger (not a branch bank book).
- Period `vietqr_revenue` (orders that landed on the company account) belongs on
  revenue reports — not on **`Tài sản`**.

Show `Chưa mở sổ` until `initialize_finance_funds` (company bank) and
`initialize_branch_cash_opening` (each sales branch). Openings cannot be
edited/deleted; corrections use `create_finance_fund_adjustment` (`p_branch_id`
required for cash, null for bank). Legacy `cash_opening_*` / `bank_opening_*`
settings are frozen evidence only — never a calculation fallback; their
presence blocks interactive init. Operator UI must not say "cutover": default
boundary is `Ngay bây giờ`; `Từ 0 giờ ngày bắt đầu` only when evidence proves
that boundary. Cash deposits require a sales branch (`MATU NOP {branch_id}`
or Owner pick).

`bank_transactions` is bank-ledger source of truth. Signed SePay webhooks,
Owner-imported SePay exports, and Owner MB statement backfill
(`restore_mbbank_statement_gap`, `repoint_finance_fund_opening`) are
idempotent by stable transaction ID. `webhook_events` is delivery evidence.
`bank_transaction_reconciliation_matches` classifies only — never changes bank balance.

Cash supplier payments (`payment_method='cash'`) reduce cash.
`bank_transfer` supplier payments update AP without a second bank movement;
the canonical outgoing `bank_transactions` row reduces bank funds.

Inventory sits in **`Tài sản`** with funds and **`Thiết bị`**. **`Chi phí ban đầu`**
is a separate section after **`Tài sản`** (outside `Tổng giá trị`).
No attention queue or VAT mosaic on this landing; tax/GTGT stay on HĐĐT routes.

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
2. **Food cost** — sale-consumption for paid orders; incomplete → warning + `N/M` coverage, still show recorded amount.
3. **Gross profit** — net revenue − recorded food cost; warning tone when coverage incomplete; blank only when valuation is inactive.
4. **Operating expense** — operating categories only. Exclude COGS,
   `capital`, `deposit`, supplier payments, cash↔bank. None → `Chưa ghi nhận`.
5. **Period result** — revenue − goods-in − opex + inventory change. Not from GP. Not "net profit".
6. **Assets** — company funds (`Tiền mặt` = sum of sales-branch books + one
   bank ledger); single-branch scope shows that branch cash book plus period
   VietQR inflows, not the company bank balance. Then
   **`Tổng tiền + Tồn kho + Thiết bị = Tổng giá trị`**. Inventory term only with
   valuation permission. Funds not opened → do not invent the total.
   **`Chi phí ban đầu`** (`capital`+`deposit`) stays outside that sum. Equipment
   drills `/finance/equipment` (capital spend LIST, not a `TSCĐ` register).
   Exceptions stay on `/` and list queues, not this landing.
Layout: desktop two rows; tablet two cols; mobile one. Supporting (not first):
food-cost analysis, cash sessions, desync recovery, HĐĐT, AP, export.

### POS Session Cash Contract

Closed POS session is the immutable physical-count record:

1. `opening_cash` — counted cash at shift open.
2. `cash_revenue` — completed cash `payments.amount` with `paid_at` in
   `[opened_at, closed_at]` (or `now()` if open). D1 unpaid may remain after
   close. Paying a carry-forward unpaid order rebinds `pos_session_id` to the open session.
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
| Branch Manager | Branch POS-session only; no tenant Finance; no purchase-price / chain-PO | Shortage `staff_repaid` / `accepted_adjustment`. May **read** MTD/day net revenue (`get_branch_revenue_target_progress`) and **day totals only** on `/close-day` (`get_branch_day_report`: gross profit, day operating result, top items). No `/finance`, WAC lines, or purchase price. |

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
  `initialize_branch_cash_opening`,
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
| `/finance`                   | Finance Basic landing        | Period formula then `Tài sản` (funds `TM + NH = Tổng tiền`, then `Tổng tiền` + inventory + equipment = `Tổng giá trị`); `Chi phí ban đầu` in its own section after assets |
| `/finance/bank-transactions` | Bank LIST | Manual match by `order_number` (`mã đơn`); classify only, never change bank balance |
| `/finance/expenses`          | Operating expense LIST       | Period KPI from `get_finance_expense_period_summary`; list stays paged |
| `/finance/equipment`         | Capital equipment LIST       | All-time `category=capital` spend; not a depreciation register |
| `/finance/targets`           | Monthly revenue targets      | Finance-managed targets + non-cumulative reward tiers; no auto payroll |
| `/finance/food-cost`         | Gross profit / margin        | Recorded gross-margin KPI; per-item table is theoretical portion cost |
| `/finance/supplier-invoices` | Supplier payable             | Thin AP entry; not expenses |
| `/finance/invoices`          | HĐĐT queue                   | Support workflow; same-VN-day issue window |

Inventory owns stock-value detail; Finance shows only the current-value card
inside `Tài sản`. Sidebar: `Tiền` (includes `Thiết bị`), `Doanh thu`, `Chứng từ` (food-cost and
targets stay sibling routes). No `/accounting/*` app surface.

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
below-criteria tools → expense/allocate; period consumables → expense).
`/finance/equipment` lists recorded `capital` spend (`máy móc`, `thiết bị`). It is
not a `TSCĐ` register or carrying-value card.

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
- Not "done" because enterprise objects exist in old migrations. Readiness is cash, revenue, expense, HĐĐT, inventory value, accountant export.

## Current Gaps

- `/finance/expenses` is operating + opening-capital ledger, not a statutory journal. Deductible VAT / equipment value / period close stay blocked (D020).

## Source Files

- Finance UI: `apps/web/app/(protected)/finance/*`; POS sessions and
  `payment-actions.ts`; inventory supplier-invoice shim and `report-actions.ts`
- ACL: `packages/shared/src/auth/{module-acl,nav-config,permissions}.ts`
- SQL: `supabase/migrations/*finance*.sql`, `*hddt*.sql`, `*supplier*.sql`
