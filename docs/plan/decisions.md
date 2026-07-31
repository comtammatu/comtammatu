# Architecture Decisions

> Architecture decision log with rationale. Each `D` number is a stable ID
> referenced by other docs; gaps are deleted or skipped decisions and MUST NOT
> be renumbered. This is a production-track decision record, not an
> implementation worklog or backlog.
> **Maintenance rules (noise control):**
>
> 1. **Each entry keeps its effective net effect.** When a new decision reverses,
>    supersedes, or amends an old one, update the old entry in the same PR (fold
>    the superseded part and record `(amended by D0xx)` in place). Do not append
>    a new entry while leaving two contradictory versions active.
> 2. **No status or worklog content in entries:** no PR numbers, branch names,
>    dated status, or apply instructions. Progress lives in `tasks/todo.md`;
>    history lives in git.
> 3. When a ruling is promoted into a spec/ref/rule document, keep only a short
>    net effect and canonical pointer here. Do not duplicate the long content.

## D000: Inventory branch and central site operating model (2026-06-19)

**Decision (net, after D078):** Inventory uses `branches` as the site table;
`branches.branch_kind` retains `branch`, `central_supply`, and `central_kitchen`
for history. Only `branch` is an active operating site. Each branch has exactly
**one** stock-bearing `warehouse` location. `central_supply`, `central_kitchen`,
and `location_kind='kitchen'` are retired from operations; do not seed or
activate new ones. PO, GRN, stock levels, production, and stock transfers refer
directly to `branch_id`.

**Transfer matrix** (trigger `enforce_stock_transfer_direction`): retained for
history and old stock-transfer batches; new operations do not open same-branch
warehouse-to-kitchen transfers or operator-initiated cross-branch transfers
(D073/D078). Only issue, consumption, and write-off documents reduce branch
stock.

Expanded by D068 (direct supplier receiving and branch production); tightened by
D078 (one warehouse per branch). Operational canonical: `docs/ref/inventory.md`.

## D002: Hộ Kinh Doanh – Chi nhánh 2 cấp (2026-04-01)

**Decision:** Hộ Kinh Doanh (L0) → Chi nhánh (L1). Hộ Kinh Doanh is one technical
row (`id=1`); all scope uses `tenant_id` and `branch_id`. There is no brand tier
or alternative data-source selector.

## D005: User-managed infrastructure (2026-04-01)

**Decision:** Code contains env-var placeholders only. AI agents MUST NOT create
infrastructure resources (Supabase/Vercel/Upstash/GitHub). `.env.example` must be
complete.

## D009: Path-based routing, no subdomains (2026-04-04)

**Decision:** Path-based (`/` for Owner, `/br/[branchId]/...` for Branch runtime,
and the top-level L0 modules) — one domain, straightforward auth, and ACL
centralized in `proxy.ts`. Subdomains are not in the backlog; splitting them
requires a new decision. Canonical: `docs/spec/architecture.md` § Routing.

## D010: RHF + zod + Má Tư DS Field for every form (2026-04-17)

**Decision:** CRUD forms use `react-hook-form + zod 4 + @hookform/resolvers +
Má Tư DS Field`; app-local helpers live in `apps/web/app/components/form/`.
Intentional exceptions are one-field import/export uploads and the GRN mobile
wizard, which have their own shapes and do not use the shared helper. Canonical:
`docs/modules/ui.md` § Form wrapper layer.

## D011: Print-agent LAN-only transport (2026-05-07)

**Decision:** `apps/print-agent` supports LAN printer transport only. There is no
runtime transport flag, USB capability column, or USB native binding. LAN-only is
enforced in the baseline: `printers` CHECK
`printers_connection_type_lan_only` (`connection_type='lan'`), no `usb_*` columns,
no `transport` column on `printer_agents`, and no `src/usb.ts`. Branch rollout is
a terminal-linked Android gateway plus LAN printer.

## D012: Tier-2 trim + consolidated POS role — HKD-supporting software direction (2026-06-10)

**Decision:**

1. Remove from the backlog and do not propose again: Local-First/offline POS,
   VNPay (VietQR is sufficient), and native POS Flutter/Capacitor (the PWA is
   stable; reaffirmed by D062).
2. POS role: the sales floor uses application role `cashier`; serving is work
   performed during a shift, not a separate auth role.
3. Route every new feature through the **HKD-supporting software filter**:
   reduce work for the owner and existing staff; do not add governance rituals
   (rostering, multi-level approval, or multi-layer accounting) that HKD does
   not use.

## D014: UI molecule convergence program — W0–W6 (2026-06-11)

**Decision:** Consolidate molecules by wave; each molecule is a contract in
`docs/spec/design-system.md` plus a ratchet in
`scripts/check-ui-contract.mjs` (the baseline allowlist may only shrink). W5 is
defined in D019; W6 (decomposing god components) remains. Canonical:
`docs/spec/design-system.md` § Component Authority.

## D016: POS reduces branch stock by sales outcome — default (2026-05-28, amended 2026-07-11)

**Decision (net, after D053/D064/D065/D078):** Active branches default to
`pos_stock_outcome_posting` enabled: POS Sale Runtime records stock reduction at
the branch warehouse from the actual outcome, not from payment alone. New
branches initialize enabled; the owner may disable it per branch, in which case
stock is neither reduced nor hard-gated. When enabled, the same switch also
enforces the non-negative stock gate; sale movements post only after the
paid/completed and kitchen-outcome conditions from D053/D065. A shortage during
posting must not fail payment or create a partial movement.

**Boundary:** Manual consumption reporting records only usage outside POS sales;
it must not re-enter ingredients already recorded with
`source_type='pos_sale'` for the same sale. `finalize_paid_order`, idempotency,
the refund boundary, and amount recomputation remain unchanged.

Reversing the default policy requires updating this decision first.

## D017: Owner is L0 Tenant Control; Branch Manager uses L1 Branch Runtime (2026-06-13, amended 2026-07-18)

**Decision (net):** Product framing is `bộ phần mềm quản lý vận hành và bán hàng`
for HKD. Owner enters `/` directly; stable L0 modules are `/inventory`,
`/orders`, `/hr`, `/finance`, `/menu`, `/branches`, and `/settings`.
`branch_manager` enters `/br/{branchId}` and uses branch-native workflows only.
Role and route gate the surface; action and row access continue through
permission keys, RPC/RLS, and branch scope.

**Canonical:** `docs/spec/role-route-matrix.md`. Do not place branch-scoped
workflows on L0 routes.

## D018: Remove secondary tenant-admin — consolidate into `owner` (2026-06-13)

**Decision:** There is no secondary tenant-admin beside `owner`; the Owner route
family accepts `owner` only. `STAFF_ROLES` is canonical in
`packages/shared/src/auth/types.ts` (generated table in
`docs/spec/role-route-matrix.md`).

## D019: W5 — Structure UI (shell · route home · nav · padding) (2026-06-13)

**Decision (net, after D050/ADR 0012):** (1) There are two chrome families and
no third family — **Owner control** is `AppShell` for Owner at `/` and domain
route families; **Branch** is the Operator plane `/br/[branchId]/*` plus station
chrome (POS/KDS/Runner). (2) Each capability has one route home according to
`role-route-matrix.md`. (3) `AppPage` owns page padding. (4) Navigation is data:
all project sidebars and bottom navs come from `nav-config.ts`; literal
`ShellNavGroup[]` in shells is forbidden. Canonical and gates:
`docs/spec/design-system.md` § Structural Governance. Reversing any point
requires updating this decision first.

## D020: Finance operates under the HKD model (2026-06-13)

**Decision:** Finance authority is HKD operating finance: revenue, HĐĐT,
expenses, food cost, inventory, funds, and accountant exports.
`accounting_periods` close/reopen is database-only owner support; no app route
exposes it. Canonical: `docs/modules/finance.md` § Accounting Advanced Boundary;
the migration chain belongs to ADR 0006.

## D022: Issue HĐĐT in real time at payment; no post-payment local draft (2026-06-14)

**Decision (owner — legal gate closed):** Issue HĐĐT when payment completes,
in real time per order through `createInvoice`. There is no delayed issuance mode
after payment. Post-issue corrections go through Owner/accountant workflows (D023,
limited by D049). Canonical: `docs/ref/einvoice-tax.md` § 3. Reversing the issue
time requires updating this decision first.

## D023: Real-time POS correction — Owner/accountant only (2026-06-14)

**Decision (net, after D049):** HĐĐT/payment corrections (cancellation,
replacement, refund, or payment-method correction) do NOT appear on the POS
screen; they are Owner/accountant-only. The sole narrow exception is
full-void-after-paid under D049. Cashier-facing payment confirmation is
**one-tap**, with no secondary confirmation dialog (locked by
`pos-payment-single-tap.test.ts`); error prevention relies on post-issue
correction. The `correct_payment_method` RPC is a pure record fix and does not
affect an issued HĐĐT.

## D026: HRM redesign — People · Attendance · Payroll (2026-06-15)

**Decision (amended — HR-1, 2026-07-16):**

1. `standard_days` is the standard-day count selected by the Owner for the viewed
   month (default 26), with `working/standard ≤ 1` clamped. It is a preview
   parameter, **not** a payroll period that must be created first; it is
   snapshotted when payroll is finalized.
2. Shift tasks are configured by position; details are defined by D052, replacing
   the old template/override model.
3. Use an active HĐLĐ during the period when available, falling back to
   `employees.base_salary` for old HKD data.
4. Retain shifts (D027), configured under "Thiết lập".
5. Live payroll reads only current operational sources: checked-out shifts,
   approved leave requests, HĐLĐ/employee records, and sourced pay adjustments.
   `payroll_entries` is an immutable post-finalization snapshot, not a source for
   recalculation.
6. HR **finalizes the payroll obligation only**. Cash/transfer payment and
   reconciliation evidence belong to Finance `expenses` (category `salary`);
   HR cannot mark them `paid`.

**IA:** Owner HR is split by job: `/hr` = **Nhân viên**;
`/hr/attendance` = **Ngày công & nghỉ phép**; `/hr/payroll` = **Lương**;
`/hr/setup` = **Thiết lập**; `/hr/staff` = **Tài khoản & quyền**. Branch Manager
reads staff/attendance/leave status for the assigned branch at
`/br/[branchId]/team` and approves subordinate shift close and leave on
Branch-native routes; no self-approval, no approval of another Branch Manager,
no profile editing, and no payroll/HĐLĐ/BHXH access. D012 still rejects
rostering, auto-late, auto-absent, leave balances, and multi-level approval.
Payroll canonical details: `docs/ref/labor-contracts.md` and
`docs/ref/payroll-pit.md`.

## D027: Attendance is per shift, not per day (2026-06-15)

**Decision:**

1. **Attendance unit = shift.** Unique `(employee_id, date, shift_id, tenant_id)`;
   `shift_id` is NOT NULL for new rows; backfill old rows through
   `resolveDefaultShiftId` from `check_in`.
2. **Shift is the global backbone.** One shared shift set across branches
   (`shifts.branch_id` NULL = global); formulas do not hardcode shifts per day;
   auto-select the shift from check-in time.
3. **Workday:** each completed shift = 0.5 day; `working_days = Σ 0.5`; do not
   cap by day, only clamp total payroll by `standard_days`.
4. **UX:** separate check-in/out per shift each day; `today-work-state` selects
   the current shift by time and still shows unfinished shifts.
5. **Shift tasks are per shift** (a separate snapshot on each shift record).

Extension of D026; does not reverse it.

## D028: Ingredient control = physical counting + finance-first slice (2026-06-15)

**Decision (owner):**

1. **Ingredient consumption = PHYSICAL COUNT** (consumption = opening stock +
   receipts − closing stock) through daily stocktake + stock issues. Retain the
   D016 default.
2. **Order: FINANCE FIRST** — the `expense` ledger (`/finance/expenses` is the
   canonical entry); **net operating profit** = gross profit − operating expense
   − payroll − tax; **realized profit** = cash received − cash paid; **current
   cash** = opening fund + receipts − cash payments (the Owner enters opening
   balance in `system_settings`; never infer it from payment history); temporary
   payroll is one `expense` category until `payroll_entries` is populated.

Canonical metric formulas: `docs/ref/operational-data-contract.md`. Extension of
D015/D020; does not reverse them.

## D029: Canonical money glyph = `đ` (U+0111); vnd-format gate is render SSoT (2026-06-15)

**Decision:** Canonical money glyph = `đ` (U+0111); `₫` (U+20AB) must not appear
in any canonical render path — a remaining `₫` is drift to remove.
`vnd-format-ssot` is a render-governance gate, not a mandate to route every
formatter through `formatVND`; non-money formatters remain typed by domain.
Changing the glyph app-wide requires updating money render, print render,
SQL/EMV mirror, and receipt template in one wave. Canonical gate semantics:
`docs/spec/design-system.md`.

## D030: Gate precision — allowlist is a false-positive floor, not a zero backlog (2026-06-15)

**Decision:** All per-gate semantics are canonical in
`docs/spec/design-system.md` § Ratchet allowlist semantics. Do not chase the
allowlist to zero; do not lower a gate below the actual count; fix new UI debt
in the primitive/pattern.

## D031: App-wide UX/IA remediation — five Owner rulings (2026-06-16)

**Verification correction:** For HĐĐT `sellerName`, the app does not send
`sellerInfo`; Viettel fills it from the registered tax code. Concurrency and
idempotency are locked at the database layer. Neither is a bug.

**Rulings (net):**

- (a) HKD payroll has the minimum HĐLĐ/BHXH contract — canonical
  `docs/ref/labor-contracts.md` and `payroll-pit.md`.
- (b) **Runner = waiting clock:** show only orders IN PROGRESS
  (`['pending','preparing']`, never the `ready` lane); it does not mean
  "Gọi số" and uses age tiers plus overflow.
- (c) Split invoices are outside the current payment contract; reopening them
  requires a new decision and an atomic multi-payment RPC.
- (d) HKD identity: SSoT is `tenants.legal_name`/`tax_code`, never
  `system_settings`.
- (e) Derive VAT by bracket through `resolve_gtgt_rate` and the shared mirror;
  do not hardcode it. Existing 8% invoices are a correction-forward task for
  accounting reconciliation. Canonical: `docs/ref/einvoice-tax.md` § 2.1.
- (f) Deprioritize the unreachable refund sum guard and the non-atomic
  two-RPC `refundOrderPayment` rough edge.

**Active Production note:** destructive database changes require expand-contract;
delete zero-reference objects BEFORE the owner applies the change. Reversing
(a)–(f) requires updating this decision first.

## D032: UI redesign = convergence (A) plus in-contract visual upgrade (B) (2026-06-16)

**Net:** UI converges under the Custom Theme contract. Typography follows D038 →
D069; the palette keeps terracotta `primary` plus Concept 01. Unresolved ideas
do not remain in the decision log.

## D033: `phuoc-hai` is the current TS/Supabase branch — remove the Go port (2026-06-16)

**Decision:** `phuoc-hai` is the current source branch for the HKD product. The
Go port is outside the current architecture (tag `archive/go-port-2026-05`).
Every trunk rollback requires a new incident plan based on current history and
explicit Owner approval.

## D035: Fully remove accounting/period-close surfaces from the app (2026-06-19)

**Decision (owner):** Remove all accounting UI/routes. **Keep unchanged:**
permission `accounting:period_reopen`, RPCs `close_period_soft/hard` and
`reopen_period`, and table `accounting_periods` (the database layer is owned by
the Owner through migrations). If rebuilt later, it is a compact "Khóa số liệu
tháng" feature under `/settings`, not a restored accounting framework.
Canonical: `docs/modules/finance.md`.

## D036: Agentic OS — Notification/Alert/Report backbone + autonomy ladder (2026-06-19)

**Decision (net, channel defined by D046):** Build the "Agentic OS" as
**95% deterministic + 5% thin, bounded LLM** on the `notifications` backbone.
The producer/dedup/routing/invariants SSoT is
`docs/spec/toast-notification-system.md`; do not duplicate it here.

Only the following content lives in this decision:

- **Autonomy ladder R0→R3** (shadow → inform → recommend → bounded auto-act).
  **Hard line: an agent touching money, tax, or labor is permanently capped at
  R1 (report-only).** Service Janitor is the ONLY auto-act (R3) agent and must
  be idempotent and reversible. The LLM never holds DB/RPC access or numbers;
  it narrates values computed by SQL.
- **Agent tools are existing `SECURITY DEFINER` RPCs** (allowlist plus cap); do
  not build a new action API. New cron jobs only provide triggers that existing
  mechanisms cannot. Telegram outbound routing/topic mapping remains Parked
  because it has no runtime owner; external delivery follows the configured
  outbox contract only.
- Increasing autonomy requires three separate gates: T3 DoR, production-apply
  delegation, and Owner approval for R0→R1. Do not infer approval from runtime
  age or LLM confidence.
- Telegram CHAT and Telegram outbound routing remain Parked options; reopening
  either requires Owner config, a secret boundary, and a dedicated dedup/retry
  contract.

## D038: Move typography to Geist (2026-06-20)

**Decision (net, after D069):** Body and data face = **Geist** + **Geist Mono**
(`geist` package, self-hosted, with full Vietnamese glyph coverage); heading and
display = Be Vietnam Pro under D069. Do not reintroduce Inter, Montserrat, or
JetBrains. The print pipeline is unchanged. Canonical:
`docs/spec/design-system.md` § Typography Contract.

## D039: Real-time HĐĐT instant issue when the provider returns a synchronous CQT code (2026-06-20)

**Decision (T3):** In `createInvoice`: both non-empty `invoiceNo` and `codeOfTax`
  → `issued`; `invoiceNo` without `codeOfTax` → `submitted`; no `invoiceNo`
  → `signing`. `1/...` behavior is unchanged. `createTaxInvoice` captures
  `codeOfTax` → `tax_invoices.cqt_code`. The settled trade-off is that realtime
  direct INSERT does not write `tax_invoice_events`; audit uses `audit_logs` +
  `provider_data.codeOfTax` + `cqt_code` (invariant: `einvoice-tax.md` § 3.3).

## D040: Disable fake `taxPercentage` for `2/...` templates (S-invoice) (2026-06-20)

**Decision (owner):** `2/...` templates MUST NOT send
`taxPercentage`/`taxAmount`; they use `taxBreakdowns: []` and GROSS prices.
`1/...` templates retain the actual rate; the percentage obligation is reported
on the return over total revenue. Canonical (full restatement and verification):
`docs/ref/einvoice-tax.md` § 3.2.

## D041: Atomic payroll calculation — one `upsert_payroll_calculation` RPC (2026-06-20)

**Decision (T3):** Combine the `payroll_entries` upsert, the
`payroll_periods.status='calculated'` flip, and clean-recompute deletion in one
`SECURITY DEFINER` RPC. TypeScript retains all PIT/BH calculation authority
(`calculatePayrollEntry` + `legal-versions.ts`); the RPC only persists the
result atomically. The RPC contract uses `NOT EXISTS` clean recomputation in the
same transaction, no EXCEPTION block, and in-body gates (`auth_tenant_id()`
forces the tenant and `payroll_period_id` on EVERY row; never trust client JSONB;
`has_permission_any('finance:payroll_calculate')`; period `FOR UPDATE`; status
`IN (draft,calculated)`; reject empty entries). `employee_count` equals
`ROW_COUNT`; grant EXECUTE to `authenticated` only. Guard:
`PAYROLL-CALCULATE-MUST-BE-ATOMIC-RPC` (`tasks/regressions.md`).

## D042: Expiry write-off uses the waste pipeline and truly reduces stock (2026-06-21)

**Decision (owner):** Expired-stock write-off MUST NOT use raw `adjustStock`;
it goes through the waste pipeline (`create_expiry_writeoff`): tier, photo gate,
tier-2 approval, WAC reduction, and lot persistence in `source_ref`
(`kind=expiry`, `grn_item_id`). All three waste paths
(`create_waste_entry`, `approve_waste`, and expiry) post stock-reducing
movements through `_post_writeoff_movements` (the `confirm_stock_issue` mirror).
Security: REVOKE the helper from `authenticated`/`anon`; `confirm_stock_issue`
blocks confirmation of a `pending` write-off (tier-2 approval bypass).

## D043: `create_payment` internal authz gate `pos:use`; defer completion tightening (2026-06-21)

**Decision (owner):** `create_payment` (SECURITY DEFINER, GRANT authenticated)
must verify tenant, actor, and `has_permission(branch, 'pos:use')` internally.
Completion permission remains specific to each RPC; every change must update the
action, UI, and RPC contract in one slice.

## D044: Má Tư Design System is the only UI contract (2026-06-21)

**Decision:** Authority is `docs/spec/design-system.md`; runtime tokens are in
`packages/ui/src/styles/globals.css`; primitives are in
`packages/ui/src/components/*`; app adapters are in
`apps/web/app/components/surface.tsx`. External tooling and skills must map to
these files and must not create parallel authority.

## D045: One-sidebar navigation shell (tier1 tab + tier2 sub-tab) (2026-06-22)

**Decision (net, collapse mode under D063):** The Owner surface uses ONE
sidebar inside one `SidebarProvider`/`SidebarInset`; `AppShell` receives
`tier1` (the ACL-controlled cross-module primary tab) plus `tier2` (deep
navigation for the open module). Primary tabs do not flatten child pages; `/`
is the Owner overview and `/settings` owns settings pages. On mobile `<md`, the
bottom nav is tier-2 plus one "Mô-đun" tab that opens a drawer. The nav-as-data
and MODULE_ACL single-source rules remain. Canonical:
`docs/modules/ui.md` § Management Shell Structure. Reversing this requires
updating this record first.

## D046: Remove server-side Web Push; use foreground `Notification` API popups (2026-06-22)

**Decision:** "On-device notification" means a client OS popup through the
`Notification` API while the PWA is open (Realtime INSERT → refetch →
`showNotification`). There is NO server-side Web Push layer (VAPID/cron/ledger
were removed). Accepted trade-off: no notification while the app is closed.
The popup fires for every visible severity, including `info` `pos.order_new`.
The in-app feed remains. Canonical:
`docs/spec/toast-notification-system.md`. Reversing this requires updating this
record first.

## D047: Production type source; Preview runtime disabled (2026-06-27, updated 2026-07-20)

**Decision (net):** Production is the only type source and `pnpm db:types` must
receive the literal `SUPABASE_PROJECT_ID` for the Production ref. There is no
persistent non-Production database; Vercel Preview is disabled and receives no
Supabase ENV. Preview Branch may be operated on demand by the Owner; agent-side
mutations still require trusted registration. Per-PR auto-provisioning remains
Parked until target identity, seed safety, teardown, spend, env binding, and
trusted registration are proven.
Canonical: `docs/agent/rules/database.md` +
`docs/runbooks/db/preview-branch-setup.md`.

## D048: Consolidate People + Branch management IA (2026-06-28)

**Decision:**

- **People:** consolidate staff administration in `/hr/staff` (label
  "Nhân sự"); **keep the `staff` ACL key separate** (owner-only account/role/
  permission administration nested under `/hr`).
- **Branches:** list → `/branches` (owner-only module key `branches`);
  `menu-limits` → Branch home, with Owner/`branch_manager` authority tightened.
  Cashier/chef retain a separate path for 86 menu items through KDS
  `mark_kds_item_out_of_stock`.
- **Branch switcher** in `AppShell`: show for every multi-branch role; hide when
  there is one or fewer branches.
- Not chosen: a new `/people` route or merged shells.

Canonical route/ACL: the generated table in `docs/spec/role-route-matrix.md`.

## D049: Allow full void of paid orders at POS — D023 exception (2026-06-28)

**Decision (owner — narrow full-void-after-paid exception; D023 remains for all
other corrections):** full void of a paid order at POS means refund + per-order
HĐĐT cancellation + board removal in one atomic transaction, manager-gated, with
a required reason and complete audit.

1. **Gate:** key `pos:void_paid_order` — `owner` + `branch_manager` only;
   NEVER grant `cashier` and NEVER reuse `pos:void_order`.
2. **Reason:** trim to 20–500 characters (matching `cancelInvoiceSchema`).
3. **HĐĐT:** full void means **CANCEL**, not adjustment/replacement.
   **Cross-period block:** the proxy uses the conservative ICT calendar-month
   rule (`issued_at < date_trunc('month', now())` → accounting route). Accounting
   confirmed that Má Tư files quarterly; the month boundary is more conservative
   and must remain so it never lets an already-filed invoice through. A true
   period-close hard block is a separate deferred task. Cancellation basis:
   NĐ 254/2026 + TT 32/2025.
4. **Actor:** `branch_manager` MAY cancel an issued HĐĐT under this gate. The
   inline RPC flips `tax_invoices.status='cancelled'` and records
   `tax_invoice_events`; it MUST NOT call the owner-only
   `transition_tax_invoice_state`.
5. **Default:** a `cancelled` order leaves the board and revenue; refund is one
   tap at the till; re-pay means a new order; full-void only; reject
   `multiple_payments`.

**Keep with Owner + accountant:** partial/item refunds and adjustment/replacement
invoices. Reversing this requires updating this record first.

## D050: Operator Workspace — one mobile-first operating plane at `/br/[branchId]/*` (2026-06-29)

**Decision (owner, net):**

1. **Two planes = two chrome families, D019/ADR 0012:** Branch plane
   (mobile/tablet, rooted at `/br/[branchId]/*`) plus Owner control (responsive
   `AppShell` for Owner only: `/`, domain route families, and `/branches`).
2. **Every operator-facing route lives under `/br/[branchId]/*`.** The URL
   `branchId` is SSoT; staff pinning lets Branch home fill it automatically.
3. Branch dashboard, control, setup (tables/POS/KDS/printers), and `pos-sessions`
   belong to the Operator plane (amend D019 §1 + D017).
4. **Branch context = one provider:** `resolveBranchContext()` replaces three
   old scope mechanisms. Proxy + RLS + `MODULE_ACL` + `has_permission` remain
   gates; context is read-only composition.
5. **Branch home = device-aware entry** (`resolvePostLoginRedirect`); canonical
   source is the generated "Post-Login Home By Role" table in
   `docs/spec/role-route-matrix.md`.
6. **Phone operator bottom nav = `Hôm nay · Ca · Lịch · Tôi`** (ratified by
   D058 §2) plus capability tiles from `nav-config.ts`/`MODULE_ACL`, gated
   server-side.
7. Do not rewrite POS/KDS/Runner; only re-root them in branch context and
   Branch home.

Scope: Owner-control People/Branch IA belongs to D048; "Việc trong ca" belongs
to D052. Reversing any point requires updating this record and D019 first.

## D052: "Việc trong ca" — consolidate and configure by position (2026-06-29)

**Decision:**

1. **One "Việc trong ca" concept** (remove "Checklist"/"Mẫu checklist").
   Each task has a TYPE: `Việc thường` / `Tiêu hao` / `Kiểm kê`, reusing the
   existing consumption and stocktake engines.
2. **Configure directly by position** — remove the separate template and
   assignment step; reduce six config surfaces to two (Shift + Position →
   Việc trong ca).
3. **Grid = position × opening/closing shift** using explicit
   `shifts.is_opening/is_closing` flags, not MIN/MAX `start_time`; tenant-level
   positions are shared.
4. **Stocktake:** assignment remains in Inventory (RLS blind count); status is
   read from today's count document, `submitted`/`approved`.
5. **Remove per-employee overrides.**
6. **Two phases remain:** `Đầu ca` / `Cuối ca`; remove `weekly` scope.

Reversing this requires updating the record first.

## D053: POS/KDS inventory truth by final order outcome (2026-06-30)

**Decision (net, flag defined by D065):**

1. **Rollout:** the sell-time stock gate uses one branch flag,
   `pos_stock_outcome_posting` (D065), default ON for every operating branch;
   rollback means the Owner disables the flag for that branch.
2. **D016:** an enabled flag is the default policy; a branch disabled by the
   Owner remains neither stock-reducing nor stock-gated.
3. **UI ownership:** the Branch Manager surface owns sell state
   (`Tồn | Sẵn bán | Còn`); POS/KDS sees only sellable/locked status.
4. **Pending demand:** POS create/append creates demand/reservation only through
   `branch_menu_item_daily_holds`; there is no second reservation table.
5. **Payment-before-ready (Option B):** post stock outcome only when both are
   true: the order is paid/completed AND the stock-tracked KDS ticket has reached
   ready at least once.
6. **Ready boundary:** `kds_tickets.first_ready_at` is immutable and set the
   first time a ticket becomes `ready`; recall does not reset it.
7. **Outcome mapping:** paid/completed + first-ready →
   `consumption`/`sale_consumption`; cancel before first-ready → no movement;
   cancel after first-ready → waste `cancelled_after_kds_ready` (only ready/
   served lines; pending lines only release demand).
8. **Idempotency:** partial unique index on `stock_movements` grain
   `(tenant_id, order_id, movement_subtype, ingredient_id, location_id)`.
9. **Stock owner = branch warehouse/default issue location;** KDS/kitchen is
   not the stock owner.
10. **Multi-unit:** convert every movement to base units through the
    tenant-aware helper before writing the ledger.

Reversing points 1–10 requires updating D053 first.

## D055: Operator plane qua active branch context (2026-07-02)

**Decision (net):** Do not soft-route by device or site type. Owner enters `/`;
every branch-pinned role enters `/br/{branchId}` from JWT. Missing or mismatched
branch scope fails closed. Canonical: `docs/spec/role-route-matrix.md`.

## D056: Operator GRN-receive route + consumption direction (2026-07-02)

**Decision:**

1. The `receive` URL under `/br/[id]/stock` is reserved for
   **transfer-receipt**; goods receipt (GRN) does not share the prefix. Operator
   GRN detail is `stock/grn/[id]` wrapping `GRNDetailPageContent` (embedded,
   branch-scoped), and `afterCreateGrnHref` points there.
2. **Consumption ≠ Issues:** keep the concepts distinct as defined by
   `docs/ref/inventory.md`; consumption must not be labeled as an internal stock
   issue.

## D058: Two presentation planes, one contract (2026-07-03)

**Decision (net after D059/D061/D076/D077):** Branch runtime is touch-first under
`/br/[branchId]/*`; Management workspaces retain dense desktop-responsive
presentation. The two planes share data loaders/models/Server Actions/RPCs/
permissions where appropriate, but Branch never uses Owner-control chrome. Each
role advertises one entry point per job; routes outside the matrix have no alias
or redirect.

Page archetypes live in `docs/spec/page-archetypes.md`; component ownership and
queries live in the machine registry. Every changed surface requires phone,
tablet, and desktop QA.

## D059: Branch-complete native workflow (2026-07-03)

**Decision (net, after ADR 0012):** Each active branch-pinned role must complete
its authorized job in Branch runtime without crossing an Owner-control bridge.
Branch home is the home; Owner control retains one permission-checked shortcut
for Owner.
Branch touch-native presenters may share loaders/models/actions with Management,
but must not share chrome or a desktop-first presenter.

## D060: Inventory workflow — WAC, no lot/FIFO/requisition (2026-07-03)

**Decision (net after D073/D078):** Inventory uses WAC for the branch's
stock-bearing warehouse. Do not open FIFO/FEFO, lot/expiry ledgers, multi-bin
WMS, requisition/PO workflows, or formal multi-level approval. GRN is
supplier-first; current stocktake and ledger/RPC are the correctness boundary.
Canonical: `docs/ref/inventory.md`.

## D061: Management Inventory oversight (2026-07-03)

**Decision (net after D078):** Management workspaces may read stock, stocktakes,
and transfer history for oversight; Branch runtime owns on-site actions. Do not
use an oversight entry to reopen same-branch warehouse-to-kitchen transfers or
new cross-branch transfers.

## D062: Native-quality PWA is the delivery direction (extends D012; no native rewrite) (2026-07-03)

**Decision (owner):** The goal is a native-quality experience through a PWA;
D012's native-framework rejection remains. The additive program is: **PWA-1**
installable Operator Landing (dedicated `/br/[branchId]` manifest, station mirror
pattern, reuse `pwa-runtime`/`pwa-toolbar`); **PWA-2** minimum offline shell for
Landing; **PWA-3** native feel (standalone chrome, safe area, press feedback —
Motion Contract § G, no new animation library); **PWA-4** performance connected
to the existing lane. No route/ACL/schema change, no second PWA framework or
dependency, and push notification remains optional. Reopening a native rewrite
or removing installable Landing requires updating this record first.

## D063: Desktop mode for Management chrome (2026-07-03)

**Decision (net):** Management uses the same `SidebarProvider` with icon
collapse; do not build a second rail. Flat modules do not wrap a one-item group
with the same name. Width, density, and master-detail must follow the design
system/page archetype; do not keep implementation backlog items in the decision
log.

## D064: POS capacity and manual quota (2026-07-04)

**Decision (net after D065/D078):** A missing recipe or unit conversion must not
create false stock capacity; the item stays outside the stock gate and fails
loudly in the management surface. Manual daily limits are separate Owner/
Manager inputs and are not seeded from stock. Refund/void returns quota only
when the line has not reached first-ready. Stock availability/posting uses one
D065 flag and one branch warehouse; the kitchen-stock trigger is retired.

## D065: "Trừ tồn khi bán" = one complete switch — ON means hard gate, no negative stock (2026-07-04)

**Decision (owner — intentional reversal of D064's original two-flag/advisory model):**

1. **ONE owner-facing "Trừ tồn khi bán" switch** =
   `pos_stock_outcome_posting`. ON = reduce stock by recipe at sale and HARD
   BLOCK when stock is exhausted (sell only the available quantity, never allow
   negative stock, lock an exhausted item until receiving more — GRN receipt
   reopens it because capacity is live). OFF = no reduction, no gate, unlimited
   sales. There is no reduce-without-block mode; `pos_stock_availability_gate`
   is removed; `gate_eff` in the reader RPC equals the posting flag.
2. **Enforcement = DB hard gate:** an AFTER INSERT trigger on `order_items` uses
   the branch warehouse (not the kitchen; the kitchen trigger was removed in
   D064 §7), runs only when the flag is on, scopes ingredients to the order,
   shares the availability demand formula (mains + sides,
   `inv_to_base_for_tenant`), serializes `FOR UPDATE` on `stock_levels`, uses
   the `comtammatu.skip_quota_enforcement` GUC escape hatch, and raises P0001
   `insufficient_stock_ingredient:<id>` (POS maps this to Vietnamese copy,
   non-retryable).
3. **Absolute non-negative stock:** retain the constraint. If a rare race slips
   through the gate during posting, payment STILL completes, NO movement is
   written (no partial post), and the system raises WARNING; stocktake catches
   the discrepancy (D027/D028 counting doctrine).
4. **Items without recipes or conversions:** retain D064 §2; they remain outside
   stock control and sell freely.

The trigger is inert when the flag is OFF. Reversing this requires updating the
record first.

## D066: Central-site context — superseded (2026-07-04)

**Decision (net after D073/D076/D077/D078):** Central-site operator context,
tiles, roles, and Owner-control cards are superseded. Central `branch_kind`
values remain for history; POS/KDS/Runner and Branch home operate only active
`branch` kind.

## D067: Branch Inventory native presentation (2026-07-04)

**Decision (net after D073/D078):** Central-supply Landing is retired. The
remaining durable rule is that Branch stock routes use a touch-native presenter
and share loaders/models/actions with Management where appropriate; do not embed
a desktop presenter or create a new shell. GRN starts from the supplier, not a
PO.

## D068: Branch warehouse direct supplier receiving (GRN) + branch production — branch_manager, own-branch (2026-07-05)

**Decision (owner):** (1) Branch warehouse (`branch`) receives supplier goods
directly; routing through Central Supply is not required. (2) Branches can run
the current production workflow. (3) Actor = `branch_manager`; create/confirm
authority is own-branch through permission + RLS. (4) `branch_manager` may quick-
create suppliers through `procurement:supplier_manage`. (5) **Final net under
D073 §4: PO and supplier returns are retired on both planes.** Defective goods
use waste reporting. Canonical: `docs/ref/inventory.md`; runtime authority:
`module-acl.ts`, `inventory-roles.ts`, permission keys, and RLS/RPC.

## D069: Be Vietnam Pro heading + Shift-aware night mode (2026-07-07)

**Decision (owner, reversing the heading part of D038):** Heading/display = Be
Vietnam Pro (subsets `vietnamese` + `latin`); body/data retain Geist + Geist Mono.
Night mode is warm-dark "gạo cháy", automatic 18:00–06:00 local with
`matu-theme` cookie override, mapped to `.dark`; do NOT use
`prefers-color-scheme`. Scope is app-wide; receipts and ESC/POS are theme-
independent; `ThemeToggle` is the only toggle. Canonical:
`docs/spec/design-system.md` § Typography Contract + Theme runtime; palette
values live in `packages/ui/src/styles/globals.css`.

## D070: SectionLabel primitive + ratchet EASY WIN + HR density-first (2026-07-08)

**Decision (owner):** (1) `SectionLabel` has two density variants
(`default`/`dense`) and renders `<div>` (the eyebrow is a typographic role, not
a semantic heading). (2) `/hr` is density-first (remove the KPI mosaic, make
EmployeeTable the focal point, and use a count strip for readiness). (3) The
easy-win ratchet is reconciled. Canonical: `tasks/regressions.md`
[SECTION-LABEL-SSOT] + `docs/agent/rules/ui.md` § Typography Rules. Out of
scope: SectionLabel group b (9 complex sites), group c (12 Label/Badge), and the
night logo variant.

## D071: DS contrast wave + four adapter items + Motion Step 0-A (2026-07-10)

**Decision (owner):** (1) `--{status}` is ink (AA 4.5:1 on its own background
and tint in both themes); `--{status}-foreground` is text on solid backgrounds
only. Light `--warning` leaves brand gold (`#f2a100` → `#8e5400`), light
`--success` becomes darker (`#446935`); rice gold remains an accent in
`--ring`/`--chart-2`; night CTA foreground flips to the dark background. (2)
Four adapter items: `ItemTitle` keeps default dense plus the `size="heading"`
role contract; field-trigger grammar converges through
`packages/ui/src/lib/field-trigger.ts` (Select/Combobox/TagInput/multi-select);
POS/KDS touch targets use `icon-touch`/`touch`; `DataTable` owns client-side
 paging and six growth lists enable `pageSize={50}` — sorting/sticky headers wait
for the UI Advisor Gate. (3) Motion Step 0 uses option A (ADR 0010): one-shot
content enter `duration-150` + `motion-safe:` for real-time INSERTs (new cart
line, new KDS ticket); `duration-300` remains overlay-only. Enforce gates
`status-foreground-on-tint` + `status-focus-ring-contrast` (baseline 0) and
`design-token-contrast-static.test.ts`. Canonical:
`docs/spec/design-system.md` § Token Contract + §G.

## D072: Formalize live brand expression + open the compact-empty symbol (2026-07-10)

**Decision (owner, option a — formalize rather than remove):** (1) Checkered
pattern placements are a CLOSED list: Runner footer strip, login full-surface
wash, and Management sidebar header wash. Full-surface wash is valid only as
`aria-hidden`/`pointer-events-none` decoration at opacity ≤10; the
`brand-pattern-placement` gate uses a named allowlist. (2) Animated mascot is
full-screen waiting/idle only (Runner idle board, `PageSpinner fullScreen`, login
brand panel), never on interactive controls or in-page chrome; enforce through
`mascot-animation-placement`. (3) Compact-empty allows `BrandSymbol`: `symbol`
is valid on `AppEmptyState compact` when empty is the primary page/section state
(empty queue, empty catalog); inline/row-level remains text-only. (4) Remove the
dead `transition-transform duration-200` from the login lockup card. Canonical:
`docs/spec/design-system.md` § brand-patterns + § utilities + §G.

## D073: Retire Central Kitchen — one operating kind `branch`, stock cutover to Branch home (2026-07-10)

**Context:** Central Supply (site 15) had already been changed to `branch` kind
and deactivated; Central Kitchen (site 16) was the last central site (one
location, 29 stock rows, three production runs on 2026-07-10). D068 enabled
direct supplier receiving and production at branches.

**Decision (owner 2026-07-10):**

1. **Deactivate site 16 completely:** transfer all stock to Phước Hải (site 3)
   through the existing transfer path (`central_kitchen → branch` is valid under
   D000), then set `is_active = false`. For the `production_manager` bucket —
   **amended by D076:** do not remap roles; delete accounts when retiring the
   bucket. Keep the `branch_kind` DB enum for historical data; remove only the
   operational and UI fork.
2. **One operating kind: `branch`.** Apply the prepared Kitchen-wave stock
   upgrades (three-step GRN mockup, one-screen production run, 44px on-hand
   list, Owner-approved) to `/br/[branchId]/(operator)/stock/*` for `branch`.
   The live contract is `docs/ref/inventory.md`; unfinished outcomes remain in
   the active `inventory` lanes in `tasks/todo.md`.
3. **Recipes = Owner-control only:** operators use recipes to prefill quantities
   during a production run but cannot edit them; remove `production/recipes` from
   operator and manage recipes in Owner control `/inventory`.
4. **Only "Danh mục" is open to branches; PO and supplier returns are RETIRED
   on both planes** (Owner tightened this the same day). GRN is supplier-first
   (`po_id` nullable), so PO is unnecessary; defective goods use waste reporting
   (photo + reason) instead of supplier returns. Keep database tables/history;
   remove tiles/routes/actions from Branch and Owner control. Opening catalog to
   `branch` needs no new grant: categories/units/ingredients are gated by
   RLS/module, and suppliers use the `supplier_manage` grant from D068 §4.
5. **Minimal stock model — (amended by D078) one branch · one location
   (warehouse):** remove lot/expiry plumbing and the dedicated tracker slice.
   Retire warehouse-to-kitchen and `commit_intra_branch_transfer`; the
   Request → Send → Receive loop and operator cross-branch transfer also retire
   after site 16 stock moves to site 3.
6. **After site 16 is deactivated, remove the central fork from operator UI** —
   `CENTRAL_HOME_TILE_SUFFIXES`, central-home CTA, `isCentralKitchen`/
   `isCentralSupply` loader branches, central `kinds` entries in nav-config,
   archetype exceptions #19–#23, and the central section of
   `docs/ref/screen-context-map.md` §2.5. Delete cleanly; leave no tombstone.

**Consequences:** D066 §3/§4/§7a is superseded; D067 §2 no longer has a
Kitchen wave; D068 §5's final net is PO retired (not open to Branch). D000's
transfer matrix remains for history. §5's final net is D078. Reversing items
1–6 requires updating this record first.

## D074: KDS voice alerts use browser TTS, not prerecorded clips (2026-07-10)

**Context:** ADR 0008 (2026-07-09) selected prerecorded MP3/WAV clips as the
voice engine and prohibited `speechSynthesis`. No clips had been recorded by
2026-07-10, `apps/web/public/audio/` was empty, and KDS still shipped beep-only;
the voice layer had never shipped.

**Decision (owner 2026-07-10):**

1. **Voice engine = `window.speechSynthesis`** (`lang = "vi-VN"`). No asset or
   dependency; the table-number slot is string interpolation. If a device has
   no loaded `vi-*` voice, skip voice while beep still follows the mode. Cloud/
   realtime TTS remains retired.
2. **Current scope = KDS Phase 1** (three kinds `kds.new` / `kds.append` /
   `kds.add_on`). POS Phase 3 remains parked.
3. **KDS chrome = one rotating control** `off → beep → beep+voice → off`.
   `voice`-only remains valid when reading the preference, but the chrome does
   not expose it. Mode preview is the user gesture that unlocks audio and speech.
4. **Prerecorded clips (Má Tư voice) move to Phase 4** — change the engine
   without changing `kind`/template.

**Consequences:** ADR 0008 §3 and §"Alternatives Rejected" B reverse (clip pack
becomes the rejected MVP option); update the non-goals in
`docs/spec/operational-audio-alerts.md`. Canonical:
`docs/plan/adr/0008-operational-audio-alerts.md` +
`docs/spec/operational-audio-alerts.md`; runtime
`apps/web/lib/operational-audio.ts`.

## D075: Rebuild Self-Order — POS order is the only truth, remove the parallel session layer (2026-07-10)

**Context:** Self-Order QR (`/q/[token]`) created a separate lifecycle
(`self_order_sessions` × `self_order_batches` × `self_order_session_devices` ×
`self_order_payment_requests` × access flags = 4×5×6×5×4 states) beside the POS
order/table lifecycle. The Owner identified these effects on 2026-07-10: (a)
staff had to approve EVERY item round; (b) device and pairing-code constraints
were too burdensome for multi-person tables; (c) tables could remain stuck in
`active` when guests left or paid another way; (d) POS and self-order lacked one
shared "occupied table" concept; and (e) `revoked` could be recovered only by
rotating the token and reprinting the table QR, which was impractical.

**Decision (owner 2026-07-10):**

1. **POS order is the only truth.** One seating = one open `orders` row at the
   table (`payment_status <> 'paid'` and `status not in (completed, cancelled)`).
   Remove the old session tables, capability/token columns, and all
   `self_order_*_v2` RPCs. Keep one new `self_order_requests` table with enum
   `pending | accepted | rejected` and one partial queue per table.
2. **Gate once per seating, not once per round.** A table without an open order
   sends its first round to `pending`; staff approve → `create_order` →
   `route_order_to_kds`. A table with an open order (POS- or QR-created) sends
   items directly through `append_order_items`; no approval. With two or more
   open bills, return to `pending` and make staff choose the target bill; never
   guess the bill.
3. **Remove device constraints.** Remove `device_token`, pairing, join requests,
   device revocation, and the client 428-retry branch. Accepted trade-off: anyone
   with a table QR photo can read and add to an open bill. First-round approval
   blocks strangers from OPENING a table, not from ADDING to an open table. The
   dining room is the trust boundary; staff see unexpected items. Keep
   `self_order_rate_buckets` rate limiting.
4. **Keep payment flow at product level:** one live intent per order, guests
   cannot cancel, staff can cancel. Bind `self_order_payment_requests` directly
   to `order_id`; with multiple bills, guests cannot view or start payment until
   staff selects the bill. Move cancel from the removed `SelfOrderApprovalSheet`
   into the table-map bill sheet or guests remain stuck after VietQR expiry.
5. **Guest IA: menu is the only page.** Remove `Tabs`, `StatusPill`, and branch
   name from the header. Header contains only `Cơm Tấm Má Tư` and table number.
   Use images for main dishes with name/price below; keep sides/drinks compact.
   Sticky cart opens review only; `Gửi món` exists only in the sheet. `Hoá đơn`
   is a persistent bottom-right button + `Badge` opening a `Drawer`, never
   auto-opened. The drawer shows called items and `Thanh toán`; payment moves
   within the drawer with a return-to-invoice action. Empty or multi-bill tables
   show a safe empty state and keep payment locked. Pending/rejected states use
   `Dialog`; refresh errors and feedback use non-blocking toasts. Header carries
   no workflow notification.
6. **Mascot open for G0.** `BrandMascot animated={false}` is valid on "bàn không
   khả dụng"; this reverses the old `BrandMascot = Forbidden` spec line. No new
   asset or keyframe (the mascot has one `cotlet.png` image and CSS mood).
7. **Highlight main dishes with `menu_categories.type`** (`main_dish` → large
   image card; `side_dish | drink | dessert` → compact row). Do not add
   `is_featured` to `menu_items`.
8. **Remove realtime and use adaptive polling:** 3s during `Chờ xác nhận` /
   `Đang thanh toán`, 15s otherwise, plus refetch on tab focus and bfcache.
   Remove topic tokens, broadcast triggers, and realtime policy.
9. **New-request alert = device-local `playAppSignal`** on the open POS device.
   Do not write `public.notifications` or use Telegram; this follows ADR 0008.
10. **After payment, remove the order from the snapshot.** "Đã thanh toán" lives
    only in the current browser session; reload returns to a clean menu, and a
    later table guest never sees the old bill.

**Consequences:** Stuck tables and `revoked ⇒ reprint QR` disappear because no
session can get stuck and `revoked` no longer exists; `trg_order_release_table`
already returns the table. `self_order_batches` dies because round history lives
in `kitchen_send_batches`. Six RPCs remain. There is no admin surface yet for
`self_order_enabled` or table QR printing; this known gap is out of scope for
this wave. Canonical: `docs/spec/self-order-guest-ui.md`.
`docs/spec/self-order-motion-design.md` must be reviewed because it references
the old Tabs and cart.

## D076: Five active application roles (2026-07-10, amended 2026-07-18)

**Decision:** `STAFF_ROLES` has exactly five values:
`owner | branch_manager | cashier | chef | branch_staff`. HR positions do not
create application roles; only canonical TypeScript and SQL mappings create route
authority. Values outside this set fail closed and are not auto-remapped.
Canonical: `packages/shared/src/auth/types.ts` and the generated table in
`docs/spec/role-route-matrix.md`.

## D077: Owner `/`, Branch `/br/[branchId]` (2026-07-10, superseded 2026-07-18)

**Decision:**

1. Owner enters `/` directly; it is the only L0 overview and launcher.
2. A branch-pinned role enters `/br/{branchId}` from JWT; missing or mismatched
   scope fails closed.
3. Owner and Branch use two shells; never cross-render or advertise L0 routes to
   branch roles.
4. Branch Manager operates only the assigned branch: read staff/attendance/leave
   information and approve subordinate shift close/leave; no self-approval, no
   approval of another Branch Manager, no profile CRUD, and no payroll/HĐLĐ/BHXH
   access.
5. Routes outside the matrix have no alias, redirect, or device-context field.

**Consequences:** Canonical runtime is `login-destination.ts`, `scope.ts`,
`route-resolution.ts`, `route-map.ts`, `nav-resolution.ts`, `proxy.ts`, Owner
root page, and Branch home page.

## D078: Retire branch kitchens — one warehouse per branch (2026-07-10)

**Context:** D073 §5 still locked `one branch · two locations (warehouse,
kitchen)` and slice S11 (`commit_intra_branch_transfer` warehouse↔kitchen). On
2026-07-10 the Owner retired branch kitchens completely: each branch has one
warehouse.

**Decision (owner):**

1. **One stock-bearing location per branch:** `location_kind = 'warehouse'`
   (branch warehouse). `location_kind = 'kitchen'` (branch kitchen) is retired:
   deactivate it, do not seed new rows, and exclude it from operating stock.
2. **Every stock flow uses the one warehouse:** GRN receiving, stocktake/count
   assignment, issue/consumption, production, POS stock gate/posting, and
   menu-limit capacity all point to the warehouse / `is_default_*` values.
3. **Retire warehouse↔kitchen transfers:** remove `Chuyển Bếp` UI,
   `quickInternalTransfer`, and same-branch kitchen targets; retire
   `commit_intra_branch_transfer` (raise). Operator "Điều chuyển" and the
   cross-branch send/receive loop also retire under D073 S11.
4. **Keep KDS/POS "kitchen":** `kitchen_send_batches`, `/kds`, and
   `pos:send_kitchen` are cooking workflows, not stock locations.
5. **Keep enums/history:** do not DROP `location_kind` or `branch_kind`; retain
   inactive kitchen rows and historical ledger for audit.

**Consequences:** Amend D073 §5 and the warehouse/kitchen part of D000 in place.
Change S11 in `tasks/todo.md` to retired (do not expand warehouse↔kitchen).
Canonical: `docs/ref/inventory.md`, the single-warehouse migration, and
warehouse-only app defaults.

## D079: Enable TTS for four critical POS alerts, not every ping (2026-07-11)

**Context:** KDS runs TTS under D074. POS has four events that require immediate
cashier attention: self-order, payment request, print failure, and kitchen
out-of-stock.

**Decision (owner):**

1. POS uses the same `OperationalAudioMode` and `playOperationalAlert` as KDS;
   the mode is stored only at `pos:audio-mode:{branchId}`.
2. Speak only `pos.self_order`, `pos.payment_received`, `pos.print_failed`, and
   `pos.out_of_stock`. Speak payment only after the order becomes `paid` and a
   real table number exists, using “Bàn {số} đã thanh toán”; payment requests
   use beep only. Other routine pings remain beep-only when beep is enabled; do
   not voice-spam the cashier counter.
3. POS chrome keeps one existing control and rotates
   `off → beep → beep+voice → off`; preview is the user gesture that unlocks Web
   Audio + `speechSynthesis`.
4. Add no dependency, asset, DB object, notification, or server-synced preference.

**Consequences:** D074 §2 now describes only the KDS Phase 1 shipping scope;
POS Phase 3 is complete under ADR 0008 and runtime
`apps/web/lib/operational-audio.ts`.

## D080: KDS voice has a 15-second quiet window, with no catch-up queue (2026-07-11)

**Context:** KDS groups alerts in one sync tick, but realtime can arrive in
several consecutive bursts. Speaking every table number cuts off the kitchen
and creates noise during rush periods.

**Decision (owner):**

1. Beep still plays immediately using the existing tone and debounce; queue/toast
   is unchanged.
2. KDS TTS speaks at most one sentence every 15 seconds. Events during the quiet
   window are not queued for catch-up; staff use the queue for complete handling.
3. User-triggered mode-preview is exempt from the quiet window and does not delay
   the next live alert.
4. Add no summary sentence or scheduler. Reopen only if kitchen trials prove the
   cooldown loses important signals.

**Consequences:** Voice is a sparse orientation layer, beep is the immediate
attention signal, and the KDS board remains the operational source of truth.

## D081: Beep ends before TTS starts (2026-07-11)

**Context:** In `beep+voice`, Web Audio and `speechSynthesis` started together;
the near-maximum beep masked the beginning of speech and made voice quiet on
POS/KDS.

**Decision (owner):** Finish the beep, wait 120 ms, then speak; set TTS to
`volume = 1`. A new alert replaces speech that is waiting to start, preventing a
stale speech queue. `voice`-only still speaks immediately.

**Consequences:** Speech is clearer without artificial gain or repetition. Actual
maximum volume still depends on media volume and the device speaker.
