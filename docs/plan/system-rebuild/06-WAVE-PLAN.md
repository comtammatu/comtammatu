# 06 — Wave Plan (W0–W6 Detailed)

> **Vai trò:** Per-wave detailed plan — scope, gates, deliverables, dependencies, exit criteria. Expansion of `PROGRAM-READINESS.md` §7 sketch.
> **Reads:** `PROGRAM-READINESS.md` §4 (module index), §7 (wave summary), §9 (Go/No-Go gate); `05-MODULE-CATALOG.md` (per-module catalog).
> **Read by:** Per-wave kickoff; sprint planning; cutover decision (`04-CUTOVER-QA-RUNBOOK.md`).
> **Date:** 2026-05-07
> **Owner:** ngocnghia128@gmail.com

---

## §1. Wave Index

| Wave | Scope | Module(s) (per `05`) | Wall time | Entry gate | Exit gate |
|---|---|---|---|---|---|
| W0 | Design tokens, typography, logo, app shells | Cross-cutting §14.5 | 1 wk | B8 approved | Design-system locked + primitives reviewed |
| W1 | Login + shared shell + Auth + Master Data | Auth §2 + Master Data §4 (folded) | 2 wks | W0 + B1+B2+B3+B4+B19 | RLS persona tests green; login flow green for all roles |
| W2 | Admin + Settings + Staff + Employee shell | Admin §3 + Employee shell §5 | 1.5 wks | W1 + B11+B23 | Admin CRUD operational; persona ACL tests green |
| W3 | Inventory greenfield (no V1 surface) | Inventory §6 | 3.5 wks | W2 + B16+B17+B27–B30 + inventory schema baseline | Inventory persona + workflow E2E (PO→GRN→stock→consume) green |
| W4 | Finance + Nhân sự & tiền lương (port logic, no code carry) | Finance §7 + HR §8 | 3 wks | W3 + B19+B31–B38 | Period close + payroll + HĐĐT issue + refund GL reversal E2E green |
| W5 | Orders + POS + KDS + Print | Orders §9 + POS §10 + KDS §11 + Print §12 | 3 wks | W4 + B41–B50 + revenue parity rehearsal | Revenue path E2E green; webhook idempotency verified; printer smoke test pass |
| W6 | Notifications + Reporting + final brand pass | Notifications + Reporting §13 + Brand §14.5 final pass | 2 wks | W5 + B51+B52+B53 | Full smoke suite green; persona + device matrix complete |

**Total wall time:** 16 wks sequential 1-dev; 10–12 wks parallelized 2-dev (split frontend × backend) per master §7.

**Cutover:** end of W6, after migration rehearsal × 2 (per `04-CUTOVER-QA-RUNBOOK.md` §Rehearsal Runbook).

---

## §2. W0 — Design Foundation

### 2.1 Scope

Lock the design system before any feature work. Tokens, typography, logo, icons, spacing, app shells. Per `01-BRAND-SOFTWARE-PROGRAM.md` Brand Rules + UX Principles.

### 2.2 Deliverables

| Artifact | Owner | Notes |
|---|---|---|
| Design tokens locked | Brand + Architect | `packages/ui/src/styles/*.css` semantic tokens; `--tier-*` palette; no raw Tailwind palette outside this dir |
| Typography setup | Frontend | Inter + Montserrat + JetBrains Mono via `apps/web/app/layout.tsx` |
| Logo + icon set | Brand | Ma Tu Concept 01 (B8); SVG + favicon variants |
| Spacing + radius + shadow scale | Brand | Token-driven; no arbitrary `w-[200px]` / `text-[10px]` |
| shadcn preset `b6G3vbGue` / `radix-lyra` applied | Frontend | Per `docs/spec/design-system.md` |
| App shells (6 surfaces) | Frontend | AdminShell, InventoryShell, FinanceShell, HRShell, EmployeeShell, plus inline POS/KDS shells in `/br/[branchId]/{pos,kds}/layout.tsx` |
| Login shell | Frontend | Strongest brand expression per `01-BRAND-SOFTWARE-PROGRAM.md` |
| Primitive review | QA + Designer | Confirm: no fake primitives (div/span/p posing as primitives), no fork primitive, no `app-*` per-surface theme |
| `docs/spec/design-system.md` updated | Designer | Reflect locked tokens |
| Storybook / preview | Frontend (optional) | Component previews; nice-to-have, not blocking |

### 2.3 Entry gate

- B8 (Brand authority — Ma Tu Concept 01) APPROVED ✓
- W0 has no upstream module dependency; can start in parallel with B-gate sign-offs

### 2.4 Exit gate

- Design tokens locked in `packages/ui/src/styles/` — owner reviews + signs
- All 6 app shells render with empty content; routing skeleton in place
- Lint rule active: no raw Tailwind palette outside `packages/ui/src/styles/*.css`
- Lint rule active: no arbitrary dimensions in app code
- Per CLAUDE.md UI rule: "Trước UI rebuild đọc design-system.md → ui.md → tasks/regressions.md và state surface + user job + primitives + regression risks"
- QA: each shell screenshot at 5 viewports (per `04-CUTOVER-QA-RUNBOOK.md` Device Matrix)
- Architect: confirms no parallel theme layer / no `app-*` per-surface theme

### 2.5 Wall time

**1 week.** Sequential — Brand + Frontend + Designer + Architect.

### 2.6 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Token drift from existing components | Medium | Lint rule + grep CI gate |
| Brand cohesion vs operational density (POS/KDS) | High | UX principle: "Operational first" — POS/KDS minimal chrome (per `01-BRAND-SOFTWARE-PROGRAM.md`) |
| Frontend ahead of backend baseline | Low | W0 can ship empty shells; backend wiring waits for W1 |

---

## §3. W1 — Login + Shared Shell + Auth + Master Data

### 3.1 Scope

Green database baseline + Auth module (§2 of `05`) + Master Data folded schema (§4). First module to receive real backend wiring.

### 3.2 Deliverables

| Artifact | Module | Notes |
|---|---|---|
| Empty green Supabase DB | Master Data | Per `02-GREEN-BASELINE.md` Implementation Sequence step 2 |
| Baseline migrations (apply from empty) | All | Tenant/branch/area/positions/permissions/role_templates baseline |
| Tenant + branch + area seed | Master Data | Single-row CTCP; initial branch + area; representative free-text |
| Positions seed (per ADR-0004) | Auth | English `lower_snake_case` codes; legacy_role_code mapping |
| `permission_keys` seed (94 rows) | Auth | Mirrors `packages/shared/src/auth/permissions.ts` |
| `role_templates` seed | Auth | Default bundles: cashier_default, branch_manager_default, etc. |
| Auth tables: `staff_permissions`, `permission_audit_log` | Auth | Per `05` §2.2 |
| H3a invariant: `profiles.position_id NOT NULL` + FK ON DELETE RESTRICT | Auth | Drafted; apply in W1 |
| H3b invariant: `tenants.owner_user_id` (deferred per ADR-0005) | Auth | Defer review; not blocking W1 |
| Custom JWT hook (SECURITY DEFINER) | Auth | `custom_access_token_hook` injects claims |
| `handle_new_user` trigger | Auth | Invite-only; fails loud on `position_not_resolved` |
| `update_my_profile`, `admin_update_profile` RPCs | Auth | Self vs manager paths |
| `has_permission(branch, key)`, `has_permission_any(key)` SECURITY DEFINER | Auth | RLS gate functions |
| `grant_permission`, `revoke_permission`, `apply_template_to_user` RPCs | Auth | SECURITY DEFINER + audit log |
| `proxy.ts` single auth gate | Auth | Module ACL + branch scope; layouts/pages trust proxy |
| `/login` page + login server action | Auth | Generic error message (anti-enumeration) |
| `/access-denied` page (public) | Auth | Reason copy from `blocked-state.ts` |
| Auth migration rehearsal x1 | QA | Per `04-CUTOVER-QA-RUNBOOK.md` Pre-Rehearsal step + ADR-0001 |
| Upstash rate limit | Security | Fail-open with `console.error` observability |

### 3.3 Schema migrations (from empty)

Order matters (FK dependencies):

1. `tenants` → `branches` → `areas` → `area_branches` → `system_settings`
2. `permission_keys` → `positions` → `role_templates` → `profiles` (FK position_id) → `staff_permissions` → `permission_audit_log`
3. Trigger: `handle_new_user` on `auth.users`
4. Hook: `custom_access_token_hook`
5. RPCs: `auth_*` helpers, `has_permission*`, `grant_*`, `revoke_*`, `apply_template_to_user`, `update_my_profile`, `admin_update_profile`, `set_headquarters`

### 3.4 Entry gate

- W0 done (design system locked)
- B1 (rebuild scope), B2 (data preservation), B3 (auth migration), B4 (DB provider), B19 (in-place freeze) APPROVED ✓
- B22 (position seed + role_templates seed) — sign-off needed BEFORE W1 implementation start

### 3.5 Exit gate

- Login flow E2E green for all 9 roles (owner, super_manager, area_manager, branch_manager, warehouse_manager, production_manager, cashier, waiter, chef, office) → 10 roles total
- RLS positive-persona tests green per `04-CUTOVER-QA-RUNBOOK.md` Persona Matrix
- RLS negative-persona tests green (cashier cannot SELECT inventory; chef cannot UPDATE orders; etc.)
- Rate limit fail-open verified via Upstash unreachable simulation
- JWT custom claims test: `extractClaimsFromAccessToken(access_token)` returns `{tenant_id, branch_id, user_role, position}` correctly
- Auth migration rehearsal: import `auth.users` + map to `profiles` with `position_id` resolved; password reset email rehearsal
- Architect signs: `02-GREEN-BASELINE.md` Auth section invariants verified
- QA signs: persona test report

### 3.6 Wall time

**2 weeks.**

- Week 1: schema migrations + RPCs + JWT hook
- Week 2: proxy.ts + login flow + rate limit + persona tests + rehearsal

### 3.7 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Auth hook missing SECURITY DEFINER → claims silently lost | High | CLAUDE.md regression rule + verify in rehearsal |
| Stale JWT after grant change (1h until refresh) | Medium | Use `has_permission` for destructive UPDATE/DELETE; `auth_role` only for fast-path reads |
| RLS blocked silently (`{data: null, error: null}`) | High | CLAUDE.md regression rule + GRANT review per new table |
| Position-code map regression (legacy `kho_truong` vs green `warehouse_manager`) | Medium | ADR-0004 + seed script tested in rehearsal |

---

## §4. W2 — Admin + Settings + Staff + Employee Shell

### 4.1 Scope

Foundation controls + executive shell + staff CRUD + Employee portal shell (data flows wire in W4). Modules §3 + §5 of `05`.

### 4.2 Deliverables

| Artifact | Module | Notes |
|---|---|---|
| `/admin/dashboard` ERP cockpit landing | Admin | KPI cards (data may be empty until W4–W6) |
| `/admin/settings/general` — system settings key/value | Admin | `vat_rate`, `service_charge`, `currency`, `store_phone`, `store_email`, integration provider keys |
| `/admin/settings/branches` — branch CRUD + set_headquarters atomic | Admin | One HQ per tenant invariant |
| `/admin/settings/areas` — area + area_branches mapping | Admin | For `area_manager` scope |
| `/admin/settings/tables` — tables & zones per branch | Admin | Branch-scoped editing |
| `branch_kind` classification (branch / headquarters / central_kitchen / warehouse) | Admin | Schema + UI |
| `branch_attendance_config` per branch | Admin | HR config |
| `branch_trusted_egress_ips` admin dialog | Admin | POS network gate seed |
| `/admin/staff` — Staff CRUD with hierarchy auth | Admin | Excludes owner / super_manager mutations |
| `/admin/staff/[id]/permissions` — per-user grant/revoke + template apply | Admin | Calls Auth RPCs (W1 surface) |
| `/admin/staff/audit` — permission audit log viewer | Admin | Append-only read |
| `/admin/feedback` — placeholder per B24 decision | Admin | If KEEP: implement; if DROP: remove route |
| `/admin/crm` — placeholder Post-v1.0 | Admin | Empty / "coming soon" |
| `/employee` shell + dashboard | Employee | Quick action tiles; data wires in W4 |
| `/employee/profile` — self-update safe fields | Employee | Calls `update_my_profile` |
| `/employee/clock`, `/attendance`, `/schedule`, `/payslip` | Employee | Stub UI; backend wires in W4 |
| `/notifications` shell | Notifications | Inbox UI; dispatch wires in W6 |

### 4.3 Entry gate

- W1 done (Auth live + persona tested)
- B11 (Supabase project — covered by B4) APPROVED ✓
- B23 (master data seed) — sign-off BEFORE W2 implementation
- B24 (Feedback module scope) — owner decides KEEP or DROP

### 4.4 Exit gate

- Admin CRUD persona tests green: owner, super_manager exclusively for general/branches/areas; area_manager, branch_manager for tables/zones/branch-scoped
- Settings sub-page guards verified: page-level redirects fire for unauthorized
- Staff CRUD: owner can manage all; super_manager all-except-owner; branch_manager only own-branch cashier/waiter/chef
- Permission grant via UI calls `grant_permission` RPC + audit log entry verified
- Employee shell: profile read+update green for all roles
- Notifications shell renders empty inbox (no entries until W6)
- QA: ACL persona test green per master §7 W2 gate

### 4.5 Wall time

**1.5 weeks.**

### 4.6 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| set_headquarters race (two branches HQ) | Medium | Atomic RPC unset old + set new in one tx |
| area_manager scope drift if `area_branches` not seeded | Medium | Seed required pre-W2; verify in persona test |
| Feedback module drift (in `module-acl.ts` but not master §4) | Medium | B24 decision before W2 |

---

## §5. W3 — Inventory Greenfield (no V1 surface)

### 5.1 Scope

Full Inventory module greenfield per `02-GREEN-BASELINE.md` Inventory V2 Target. Module §6 of `05`. **Most code-intensive wave.**

### 5.2 Deliverables

#### 5.2.1 Schema (greenfield, no V1 carry)

| Group | Tables / RPCs |
|---|---|
| Master | `ingredients` (with `item_kind`), `recipes` (with `yield_factor`), `suppliers` (with `payment_terms_*`) |
| Locations | `inventory_locations` Phase 1 (default-only seeded per branch); per B27 — Phase 2 location-ledger DEFERRED to Post-v1.0 |
| Stock | `stock_levels` (projection), `stock_movements` (ledger; `production_order_id` FK) |
| Stocktake | `stocktake_sessions` (partial unique 1 active per branch), `stocktake_lines` (with GENERATED `variance`); RPC `complete_stocktake` |
| Transfers | `stock_transfers`, `stock_transfer_items`; transfer state machine RPCs (confirm_ship, in_transit, confirm_receive) |
| Issues | `stock_issues` (consumption / writeoff / other; NOT `Cấp bếp` — that goes through transfers) |
| Procurement | `purchase_orders`, `purchase_order_items` (state machine); `goods_received_notes`, `grn_items` (with `receiving_temperature`); `supplier_invoices` (with `due_date`, `payment_status`, `paid_amount`) |
| Returns | `supplier_returns` |
| Production | `production_recipes`, `production_orders`, `production_order_items`; `is_inventory_production_operator()` helper |
| QC | `inventory_qc_settings` per branch |
| RPCs | `consume_stock_for_order` (uses `recipes.yield_factor`); `grn_confirm`; transfer state RPCs; `complete_stocktake` |

#### 5.2.2 Surfaces (UI)

Per `05` §6.7:

| Surface | Notes |
|---|---|
| `/inventory` task-queue dashboard | Role/site-aware; live data; NOT V1 MV |
| `/inventory/{ingredients,recipes,stock,suppliers}` | Master data (canonical entry) |
| `/inventory/{purchase-orders,grn,supplier-invoices,supplier-returns,receiving}` | Procurement hub (HQ) |
| `/inventory/transfers` | Internal transfer state machine; `?create=cap-bep` for branch `Cấp bếp` |
| `/inventory/production` | Central kitchen only; super_manager / production_manager operator |
| `/inventory/{stocktake,issues,expiry,waste}` | Operations |
| `/inventory/reports` | Live data; stock movement, valuation, food cost feed (Finance W4 consumes) |
| `/inventory/m/*` | Mobile routes (drafts, GRN, production, stock, transfer receive) |
| `/inventory/settings/{expiry,qc}` | Inventory-specific config |

#### 5.2.3 Constraints from `02-GREEN-BASELINE.md`

- **No `kitchen_use` movement type** — drop entirely from green
- **Atomic intra-branch transfer** — RPC bodies cover all state transitions
- **Explicit source/destination** — `inventory_locations` FK on all relevant ledger rows
- **Permission-gated transfer create/ship/receive** — `inventory:transfer_*` keys
- **Stocktake without V1 conflict/recount UI** — pilot keeps open/count/complete only; conflicts/escalate routes retired
- **Dashboard from retained ledger/source, not stale V1 MVs**

### 5.3 Entry gate

- W2 done (Admin + branch_kind config live)
- B16 (V1 data classes drop/archive/migrate per audit) — sign-off after audit run
- B17 (AP/supplier scope KEEP) APPROVED ✓
- B27 (location-ledger Phase 2 cutover plan: STAY Phase 1) — owner confirms
- B28 (Express GRN window + override-code policy) — owner confirms
- B29 (Supplier returns scope: full vs QC-only) — owner confirms
- B30 (Catalog review policy default) — owner confirms
- Inventory schema baseline ADR landed
- Audit run completed (per B10 audit access)

### 5.4 Exit gate

- All 6 inventory roles persona-tested per `04-CUTOVER-QA-RUNBOOK.md`:
  - owner, super_manager, area_manager, branch_manager, warehouse_manager, production_manager
- Workflow E2E green per persona:
  - PO draft → send → partial GRN → invoice match (super_manager / warehouse_manager)
  - Transfer create → ship → in_transit → receive (warehouse_manager → branch_manager)
  - Stocktake open → count → complete (any inventory role)
  - Production create → confirm (production_manager)
  - Waste auto + manual + tier-2 approval (with photo evidence)
- `consume_stock_for_order` RPC: yield_factor = 1.0 baseline + yield_factor = 0.85 cooking-loss case
- Food cost data exposed for Finance W4 consumption
- No V1 surface visible (audit-confirmed)
- QA signs: workflow E2E + persona report

### 5.5 Wall time

**3.5 weeks.** Largest wave.

- Week 1: Schema + master data + stock ledger
- Week 2: GRN + procurement state machine + supplier returns
- Week 3: Transfers + stocktake + production + waste/expiry
- Week 0.5: Reports + mobile routes + persona tests

### 5.6 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Stale V1 mental model contaminates green UI | High | UX boundary per `01-BRAND-SOFTWARE-PROGRAM.md`; explicit V1 retire checklist |
| `inventory_locations` Phase 2 scope creep | High | B27 owner sign-off explicit STAY Phase 1; defer Phase 2 |
| Production module RLS gaps | High | `is_inventory_production_operator()` helper; hard-deny `area_manager`/`branch_manager` |
| Yield factor regression (existing recipes default 1.0) | Medium | `consume_stock_for_order` migration test: yield_factor = 1.0 = same behavior |
| Inventory plan archive content lost in fold | Medium | Cross-reference per `PROGRAM-READINESS.md §2` archive note; capability list verified vs archive docs |

---

## §6. W4 — Finance + Nhân sự & tiền lương

### 6.1 Scope

Finance/Accounting + Nhân sự & tiền lương cross-module. Modules §7 + §8 of `05`. Capabilities ported from archived `finance-redesign.md` + `m4-payments-fix.md` per `02-GREEN-BASELINE.md` "do not port" list — re-implement on green, no code carry.

### 6.2 Deliverables

#### 6.2.1 Finance schema + RPCs

| Object | Notes |
|---|---|
| `chart_of_accounts` + VAS-aligned seed | Seed required (B32 partial) |
| `journal_entries`, `journal_entry_lines` | Double-entry |
| `fiscal_periods` | State machine |
| `tax_invoices` | HĐĐT state machine; `provider`, `provider_invoice_id`, `pdf_storage_path` |
| `vas_report_lines` | Monthly VAT export |
| `audit_logs` | Cross-cut §14.1 of `05` |
| `posting_rules` + seed | B32 seed: revenue, refund, payroll, AP, food cost |
| `webhook_events(provider, request_id) UNIQUE` | M4 P0 idempotency table — drafted on m4 branch, apply in W4 |
| `close_fiscal_period(p_period_id)` | Permission-gated; `accounting:period_reopen` |
| `gl_reconciliation()` | POS↔GL invariant check |
| `recompute_total(p_order_id)` | Server-side total — anti-tamper (M4 P0 fix) |
| `reverse_payment_and_post()` | Atomic refund + GL reversal + audit (replaces blue's existing on green) |
| `create_supplier_payment()` | AP payment posting |
| `post_payroll_journal()` | Cross-cut HR |
| `confirm_cash_payment()` | POS cash close + GL post |
| `complete_payment_and_consume_stock()` | Atomic payment + stock consumption + finance event (M4 P0 fix on green) |

#### 6.2.2 Finance UI surfaces

Per `05` §7.7:

- `/finance` revenue + invoice overview
- `/finance/{revenue,reconciliation,chart-of-accounts,journal,posting-rules,food-cost,periods,audit-trail,statements}`
- `/admin/accounting/periods` — period close UI
- `/admin/finance` redirect → `/finance/*`

Reconciliation tolerance threshold per B33 (default proposal: 1,000 VND).

#### 6.2.3 HR schema + RPCs

| Object | Notes |
|---|---|
| `employees` (extends `profiles`) | HR PII (ID, address, tax code, bank info) |
| `employment_contracts` | State machine; `signed_at`, `terminated_at`; per BLLĐ 2019 contract types |
| `shifts`, `shift_assignments` | Definition + per-employee assignment |
| `attendance_records` | Clock evidence (geofence + network gate from W2) |
| `payroll_periods` | Monthly cycle |
| `payroll_entries` | Per (period, employee); gross + BHXH/BHYT/BHTN + PIT + net |
| `employee_dependents` | PIT giảm trừ |
| `payroll_calculate(p_period_id)` | BHXH/BHYT/BHTN rates per B35; PIT brackets per B36 |
| `payroll_approve(p_period_id)` | Permission-gated; freeze entries |
| `terminate_employee(...)` | State machine; evidence required |
| `pit_export(p_year)` | eTax / HTKK format per `docs/ref/payroll-pit.md` |
| `bhxh_export(p_period_id)` | iBHXH / VNPT-BHXH format per `docs/ref/third-party-integrations.md` §5.1 |

#### 6.2.4 HR UI + Employee data flows

- `/hr` dashboard
- `/hr/payroll[/[periodId]]` payroll list + detail
- `/admin/hr/payroll[/[periodId]]` admin mirror
- `/employee/clock` — wires backend (calls `clock_in_out` RPC with geofence + network validation)
- `/employee/attendance` — reads self-scope
- `/employee/schedule` — reads `shift_assignments` self-scope
- `/employee/payslip` — reads `payroll_entries` self-scope

#### 6.2.5 HĐĐT integration

- Viettel S-invoice REST integration (primary)
- MISA meInvoice (legacy/optional only when explicitly configured; not an implicit production fallback)
- VNPT (future option; not default fallback)
- HĐĐT issue rehearsal: draft → CQT → mã → PDF stored in Storage
- Webhook + IPN handling for status updates

### 6.3 Entry gate

- W3 done (Inventory data live for food cost + AP)
- B19 (in-place freeze of finance-redesign + m4-payments-fix) APPROVED ✓
- B31 (HĐĐT provider seed: Viettel S-invoice credentials; legacy MISA/VNPT only if explicitly approved) — owner provides
- B32 (Posting rules seed: revenue/refund/payroll/AP/food cost) — owner confirms
- B33 (Reconciliation tolerance: 1,000 VND default) — owner confirms
- B34 (Period close window: monthly close on day-X) — owner confirms
- B35 (BHXH/BHYT/BHTN rate config: 2026 rates) — owner confirms
- B36 (PIT bracket config: 7-bracket lũy tiến) — owner confirms
- B37 (Contract templates per BLLĐ 2019) — owner provides
- B38 (Termination evidence retention: 5 years per labor law) — owner confirms
- M4 P0 hangovers planned (per archived `m4-payments-fix.md` § P0 list)

### 6.4 Exit gate

- Period close E2E green: open → entries posted → recompute → close → reopen with `accounting:period_reopen`
- Payroll calculate + approve E2E green: 1 monthly cycle for 1 employee with all components (gross + BHXH + PIT + net)
- HĐĐT issue rehearsal pass: 1 invoice via Viettel S-invoice sandbox/test account (draft → issued → archived with PDF in Storage)
- HĐĐT legacy-provider smoke test: switch `einvoice_provider` to MISA only if owner explicitly keeps legacy credentials available → re-issue test invoice
- Refund + GL reversal E2E green: order paid → refund created → `reverse_payment_and_post` atomic (GL reversed + stock restored + payment+order status flip + audit)
- AP payment E2E green: supplier_invoice → `create_supplier_payment` → GL post
- Reconciliation: discrepancy under tolerance threshold passes; over fails (manual reconciliation flow)
- BHXH export format validated against iBHXH import (TS24 format spec)
- PIT export format validated against eTax format
- Persona tests for finance + hr roles
- QA signs: period invariant + payroll invariant + HĐĐT rehearsal report

### 6.5 Wall time

**3 weeks.** Cross-module coordination (Finance ↔ HR via payroll journal).

- Week 1: Finance schema + posting rules + period close + audit_logs
- Week 2: HR schema + payroll calculate/approve + employee data flows wire
- Week 3: HĐĐT integration + reconciliation + refund flow + persona tests

### 6.6 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Period close invariant breaks with concurrent journal posts | High | Lock fiscal_period row during close; reject new posts if status='closed' |
| HĐĐT provider abstraction leaks vendor specifics | Medium | Per archived `provider resolver` ADR (D011 v2 — preserved as reference); LocalMisaProvider ↔ ViettelProvider clean interface |
| Refund flow regression (M4 P0 hole) | High | Re-implement per green principle; tenant binding + server recompute + idempotency table apply |
| BHXH/PIT rate change mid-period | Medium | Rates in `system_settings` (config-driven); audit log on change |
| Viettel S-invoice sandbox/test availability for rehearsal | Medium | Escalate with Viettel BU; use MISA only as an explicit owner-approved legacy-provider smoke path if credentials exist |

---

## §7. W5 — Orders + POS + KDS + Print

### 7.1 Scope

Revenue path E2E. Modules §9 + §10 + §11 + §12 of `05`. **Most user-visible wave; first viewport must remain task-dominant** (per `01-BRAND-SOFTWARE-PROGRAM.md` UX principle).

### 7.2 Deliverables

#### 7.2.1 POS

| Artifact | Notes |
|---|---|
| `pos_terminals`, `pos_sessions` schema + RPCs | Per `05` §10.2 |
| `payments`, `payment_webhooks`, `refunds` (with `stock_consumed_status`) | M4 P0 column |
| `webhook_events(provider, request_id) UNIQUE` apply | Idempotency table — apply migration on green |
| `branch_menu_item_daily_limits` table | Per (branch, menu_item, day); intentional `auth_role` fast-path RLS preserved per `BMIDL-RLS-INTENTIONAL-ROLE-FASTPATH` |
| `confirm_cash_payment(...)` RPC | Atomic; recompute_total guard |
| `complete_payment_and_consume_stock(...)` | Atomic — payment state + order state + stock consumption + finance event (M4 P0 fix on green) |
| `recompute_total(p_order_id)` | Server-side anti-tamper |
| `open_session`, `close_session` RPCs | Variance check + permission gate per B44 |
| `/br/[branchId]/pos` UI | Order entry + table + payment + receipt print |
| `/br/[branchId]/menu-limits` UI | Daily limit config (cashier + chef + branch_settings co-owners) |
| `/br/[branchId]/settings/{pos,pos-sessions,printers,tables,kds}` | Branch-scoped config |
| `/api/webhooks/momo` POST handler | HMAC verify + idempotency check + atomic payment+stock RPC |
| `/payment/momo/return` redirect target | Public |
| Branch presence beacon `/api/branch-presence` | POS heartbeat |
| `branch_trusted_egress_ips` enforcement | Per B42: mandatory for cash close-shift, warn for order entry |

#### 7.2.2 KDS

| Artifact | Notes |
|---|---|
| `kds_stations`, `kds_station_categories`, `kds_tickets` schema | Per `05` §11.2 |
| `route_order_to_kds(p_order_id)` RPC | Routes by category mapping; fallback station for uncategorized |
| `bump_kds_ticket(p_ticket_id)` RPC | State machine advance + auto-checks order readiness |
| `recall_kds_ticket(p_ticket_id)` RPC | State machine revert |
| `check_order_ready(p_order_id)` RPC | Internal; called from bump |
| `save_station_categories(p_station_id, p_ids[])` RPC | Atomic replace |
| `/br/[branchId]/kds` UI with realtime board | Supabase realtime publication on `kds_tickets` |
| Station tabs + bump/recall buttons | Touch-safe layout per UX principle 5 |
| Kitchen audio alert | Post-v1.0 per B46 — instrument event log only in green |
| Cooking time tracking | Post-v1.0 per B47 — instrument duration only in green |

#### 7.2.3 Orders

| Artifact | Notes |
|---|---|
| `orders`, `order_items`, `order_status_history` schema | Snapshot pricing + append-only audit |
| `refunds` table | Cumulative cap enforced |
| `create_order(...)` RPC | Server-side price verification; calls `route_order_to_kds` |
| `create_refund(...)` RPC | Rejects non-`completed` payments; cumulative cap |
| `reverse_payment_and_post()` | Cross-cut Finance — atomic refund |
| `/orders` cross-branch list | Filter by branch, status, date, cashier |
| `/orders/[id]` detail + refund actions | Refund approval gate `orders:refund_approve` (H2a perm-gate) |
| Order state machine | `new → confirmed → preparing → ready → served → completed`; `cancelled` reachable |

#### 7.2.4 Print

| Artifact | Notes |
|---|---|
| `print_jobs` queue table | `(printer_id, payload, status, claimed_at, completed_at, expires_at)` |
| `printer_configs` per branch | Schema per `05` §12.2 |
| `claim_print_job`, `complete_print_job`, `expire_print_job` RPCs | Agent polling pattern |
| `enqueue_print_job(...)` RPC | Called from POS after payment + Finance after HĐĐT issue |
| Print agent runtime | Per-branch deployment per B48 |
| Real printer smoke test | Epson TM-T82 / Star (per B49) |
| `/admin/settings/printers[/jobs]` queue inspection | Manager UI |
| `/br/[branchId]/settings/printers` branch-scoped config | Settings roles |

### 7.3 Entry gate

- W4 done (Finance + HR live)
- B41 (daily limit RLS fast-path) — confirmed KEEP
- B42 (POS network gate policy) — owner confirms
- B43 (VietQR partner bank: Vietcombank / VPBank / MB) — owner picks
- B44 (variance threshold for `pos:close_shift_variance_override`) — owner confirms
- B45 (KDS realtime room scope) — owner confirms
- B46 (KDS audio alert: Post-v1.0) — owner confirms defer
- B47 (cooking time tracking: instrument now, dashboard Post-v1.0) — owner confirms defer
- B48 (print agent process model: Pi vs Cloudflare Tunnel vs Windows service) — owner confirms
- B49 (printer model + ESC/POS profile per branch) — owner provides hardware inventory
- B50 (print job stuck → notification policy: 5min expire) — owner confirms
- M4 P0 hangovers planned (4 items in `05` §9.5/§10.5)
- Revenue parity rehearsal: blue → green (last full week) row counts + aggregate match

### 7.4 Exit gate

- Revenue path E2E green per `04-CUTOVER-QA-RUNBOOK.md` Smoke Suite:
  - login owner + cashier
  - create POS order
  - send to KDS
  - chef bumps tickets
  - complete cash payment
  - verify stock movement (recipe-driven consumption)
  - verify finance event (journal entry posted)
  - print receipt (real printer)
- MoMo webhook E2E green: payment trigger → IPN → idempotency → atomic complete_payment_and_consume_stock RPC → order completed
- Refund E2E green: order completed → create_refund → approve → reverse_payment_and_post → GL reversed + stock restored + audit
- Server recompute total verified: discount tampering attempt fails server-side
- Stock consumption fail-soft check: `result.stock_consumed = false` triggers alert + manual reconciliation flow
- Webhook idempotency: replay attack rejected with `webhook_events` UNIQUE
- Print agent claim/complete cycle verified
- Print job stuck → notification surfacing verified (5min expire per B50)
- KDS realtime: bump propagates to all clients in <1s
- Persona tests: cashier, waiter, chef, branch_manager + management
- Device matrix: Android phone (412×915), iPhone (390×844), iPad (768×1024), POS terminal (1024×768)
- QA signs: revenue path report + Persona Matrix per `04-CUTOVER-QA-RUNBOOK.md`

### 7.5 Wall time

**3 weeks.**

- Week 1: POS schema + payment RPCs + webhook idempotency + receipt
- Week 2: KDS realtime + Orders refund + cross-branch list
- Week 3: Print agent + real printer smoke + persona + revenue parity

### 7.6 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| MoMo webhook tenant binding hole (M4 P0) | High | Re-implement on green per `02-GREEN-BASELINE.md` "do not port"; partnerCode + tenant verify before RPC |
| Stock consumption fail-soft on hot path (M4 P0) | High | Check `result.stock_consumed`; add `payments.stock_consumed_status` column |
| Server recompute missing → discount tampering (M4 P0) | High | `recompute_total` in confirm_cash_payment + complete_payment_and_consume_stock |
| Print agent connectivity (Pi vs Cloudflare Tunnel) | Medium | B48 owner decision; smoke test in Week 3 |
| KDS realtime publication scope (per-branch vs tenant-wide) | Medium | B45 owner decision; default tenant-wide + client filter |
| POS first viewport degraded by brand chrome | High | UX principle per `01-BRAND-SOFTWARE-PROGRAM.md`; W5 cannot pass without first-viewport task-dominance check |

---

## §8. W6 — Notifications + Reporting + Final Brand Pass

### 8.1 Scope

Terminal wave. Module §13 of `05`. Final brand pass + smoke suite green.

### 8.2 Deliverables

#### 8.2.1 Notifications

- In-app `notifications` table + dispatch RPCs
- Event sources wired: HR (payroll approve, contract sign), Finance (period close), Inventory (waste approve, GRN hardblock override), POS (refund approved), Print (job stuck)
- `/notifications` inbox UI with read/unread state
- Per-user notification preferences (Post-v1.0 — placeholder UI)
- Zalo ZNS / SpeedSMS / Resend integration: **Post-v1.0** (per B51)
- `branch_feature_flags` decision per B53 (KEEP / ARCHIVE / DROP)

#### 8.2.2 Reporting

- `mv_daily_revenue` REBUILD_FROM_SOURCE — cron refresh (per B52, nightly default)
- `mv_top_items` REBUILD_FROM_SOURCE
- `mv_food_cost` REBUILD_FROM_SOURCE — depends on Inventory + Finance
- Dashboard rollups: `/admin/dashboard` populated with KPIs
- `/admin/reports/revenue` + `/admin/reports/inventory-value` + `/admin/reports/stock-movement`
- VAS reports + PIT export validated end-to-end with eTax / iBHXH formats

#### 8.2.3 Final brand pass

- All surfaces consistency review (no fake primitives, no parallel theme, no per-route theme files)
- Vietnamese copy canonical terms verified per `docs/ref/glossary.md`
- POS/KDS first viewport task-dominance re-verified
- Print receipt brand header consistent
- PWA manifest + installed shell brand
- Storybook / preview pages for documentation

### 8.3 Entry gate

- W5 done (revenue path E2E green)
- B51 (Notification dispatch policy: in-app only for green; provider Post-v1.0) — owner confirms
- B52 (MV refresh: nightly + dashboard "as of X" timestamp) — owner confirms
- B53 (`branch_feature_flags` DEFER_DECISION) — owner confirms KEEP/ARCHIVE/DROP per audit

### 8.4 Exit gate

- Full smoke suite green per `04-CUTOVER-QA-RUNBOOK.md` §Smoke Suite:
  1. login owner + cashier
  2. create POS order
  3. send to KDS
  4. complete payment
  5. verify invoice/payment state
  6. verify stock movement
  7. verify finance event
  8. print receipt
  9. inventory V2 receive/transfer check
  10. employee login/profile
  11. forbidden access for cashier/admin routes
- Persona Matrix complete (10 roles × 2 branches)
- Device Matrix complete (5 devices + PWA mode + real printer)
- Final brand pass approved by Brand + Designer
- Architect: confirms `02-GREEN-BASELINE.md` Auth + Inventory + Finance + Payment invariants verified
- QA: signs full smoke + persona + RLS negative + device matrix
- Owner: ready for cutover gate (per `04-CUTOVER-QA-RUNBOOK.md` §Pre-Cutover)

### 8.5 Wall time

**2 weeks.**

- Week 1: Notifications + Reports + MV refresh
- Week 2: Final brand pass + full smoke + Persona Matrix + Device Matrix

### 8.6 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| MV refresh blocks cutover if not idempotent | Medium | REBUILD_FROM_SOURCE; recompute on cutover, not migrate |
| Notification dispatch flooding on event spike | Medium | Rate limit per user/event class; defer batch dispatch to Post-v1.0 |
| Brand drift between waves accumulated | Medium | Brand pass review checklist; lint rule active since W0 |
| `branch_feature_flags` decision lingering | Low | B53 owner decision before W6 ship |

---

## §9. Cross-Wave Sơ đồ phụ thuộc

```
W0 (Design Foundation)
  │
  ├──> W1 (Auth + Master Data)
  │      │
  │      ├──> W2 (Admin + Settings + Staff + Employee shell)
  │      │      │
  │      │      ├──> W3 (Inventory greenfield)
  │      │      │      │
  │      │      │      └──> W4 (Finance + Nhân sự & tiền lương)
  │      │      │            │   ↑
  │      │      │            │   └─ Employee data flows wire here
  │      │      │            │
  │      │      │            └──> W5 (Orders + POS + KDS + Print)
  │      │      │                  │   ↑
  │      │      │                  │   └─ Inventory consumption path
  │      │      │                  │
  │      │      │                  └──> W6 (Notifications + Reporting + brand pass)
```

**Key dependencies:**

- W1 → ALL: every module depends on Auth (proxy gate + RLS infrastructure)
- W2 → W3,W4,W5: branch_kind config + branch_attendance_config + trusted_egress_ips required
- W3 → W4: Inventory data feeds food cost analysis + supplier_invoices for AP
- W3 → W5: Inventory consumption path (recipe → stock_movement) for POS payment
- W4 → W5: GL posting + refund + recompute_total + payment RPCs
- W4 ↔ W5: payroll_journal posts to GL (W4 module owns RPC, W5 doesn't depend); refund posts to GL (W5 calls W4's RPC)
- W6 → ALL: consumes data from all prior waves

**Parallelization opportunities (2-dev split):**

- W3 + W4 can partially parallelize (different schema namespaces; HR schema independent of Inventory; only Finance food cost needs W3 done)
- W5 modules (POS / KDS / Orders / Print) can parallelize within wave
- W6 N + R can parallelize within wave

---

## §10. Total Wall Time + Parallelization

**Sequential 1-dev:**

| Wave | Duration |
|---|---|
| W0 | 1 wk |
| W1 | 2 wks |
| W2 | 1.5 wks |
| W3 | 3.5 wks |
| W4 | 3 wks |
| W5 | 3 wks |
| W6 | 2 wks |
| **Total** | **16 wks** |

**Parallelized 2-dev (split frontend × backend):**

- W0: 1 wk (Brand + Frontend)
- W1: 2 wks (DB + Frontend co-deps)
- W2: 1 wk (parallel surfaces)
- W3: 2.5 wks (FE+BE parallel; some serialization on schema landings)
- W4: 2 wks (Finance ↔ HR partial parallel)
- W5: 2 wks (4 modules parallelizable)
- W6: 1.5 wks
- **Total: ~12 wks** (matches master §7 "10–12 wks")

**Buffer: 30%** per `04-CUTOVER-QA-RUNBOOK.md` Go/No-Go ("rehearsal completed within maintenance window plus 30 percent buffer").

**Realistic deployment timeline:**

- 1 dev sequential: **Week 1 (today, 2026-05-07) → Week 17 (~2026-09-04)** — assuming 8h/day no holidays
- 2 dev parallel: **Week 1 → Week 13 (~2026-08-07)**

Add migration rehearsal × 2 (per `04-CUTOVER-QA-RUNBOOK.md`) → **+2 weeks before cutover**.

**Cutover candidate:** end of W6 + 2 rehearsals = **Week 19 (~2026-09-18)** sequential, or **Week 15 (~2026-08-21)** parallelized.

---

## §11. Cutover

Per `04-CUTOVER-QA-RUNBOOK.md` §Production Cutover.

### 11.1 Pre-cutover checklist (per master §9)

- [ ] All B-blockers approved (B1–B53+)
- [ ] Migration rehearsal × 2 passed
- [ ] Persona smoke test (10 roles × 2 branches) green
- [ ] `pnpm typecheck && pnpm lint && pnpm build` green on green baseline
- [ ] Storage object manifest parity verified
- [ ] Reverse-delta tooling tested (per B7 if owner requires hard rollback)
- [ ] Blue read-only mode tested
- [ ] Rollback runbook rehearsed
- [ ] Owner decides reverse-delta requirement explicitly

### 11.2 Cutover sequence

1. Announce maintenance window (B5: 22:00–04:00 ICT first cutover)
2. Disable blue write paths
3. Stop cron / webhook writers (or maintenance mode)
4. Take final blue backup
5. Record final blue row counts + aggregates
6. Export final storage delta manifest
7. Apply final delta migration to green
8. Copy final storage delta
9. Switch production env vars to green
10. Rotate or confirm secrets (Viettel S-invoice / MoMo / VietQR / Upstash)
11. Deploy app config
12. Force cache / PWA refresh
13. Run smoke suite immediately

### 11.3 Rollback stance

Per master §6 B7 + ADR-0003:

- **Before green writes:** environment switch back to blue + cache refresh — clean
- **After green writes:** reverse-delta required for revenue tables (per B7 APPROVED); continue-forward fix for `stock_movements` + `attendance` (per B7 APPROVED)
- Owner's reverse-delta decision: APPROVED 2026-05-07 — minimal reverse-delta for revenue tables only

### 11.4 Post-cutover

- Blue retention 12 months read-only (per B6)
- Smoke green ≥ 30 days
- Naming pattern lint rule active in CI (no M0–M7 / S0–S9 / auth v2/v3 regressions; carries B21 cleanup)
- Continue Post-v1.0 backlog (CRM, loyalty, offline mode, GrabFood/ShopeeFood, audio alert, cooking time dashboard, etc. per `05` §15)

---

## §12. Risk Matrix (cross-wave)

Augments `PROGRAM-READINESS.md §8`:

| Risk | Severity | Mitigation | Wave gate |
|---|---|---|---|
| Owner B-blocker sign-off stalls | High | Single sign-off table per master §6; weekly check-in | All |
| Schema baseline drift between waves | High | All migrations apply from empty test (per `04-CUTOVER-QA-RUNBOOK.md`) | W1, W3, W4 |
| Cross-wave RPC contract drift (Finance ↔ HR ↔ Inventory) | High | Contract review at W3→W4 and W4→W5 transitions | W3, W4 |
| Realtime publication overload | Medium | Branch-scoped subscriptions + client filtering | W5 |
| HĐĐT provider outage | Medium | Viettel S-invoice primary; manual recovery or explicit owner-approved legacy MISA switch only if credentials exist | W4 |
| Print agent connectivity failure | Medium | Per B48 + per-branch deployment + queue retry | W5 |
| Test data drift between rehearsals | Medium | Snapshot blue → seeded test fixtures versioned | W1+ |
| Brand drift across modules | Medium | Lint rule + final brand pass W6 | W0–W6 |
| Persona test coverage gap | High | 10 roles × 2 branches matrix per `04-CUTOVER-QA-RUNBOOK.md` | W1, W2, W3, W4, W5 |

---

## §13. Sign-off Block (Wave Plan)

Wave plan feeds the consolidated sign-off table at `PROGRAM-READINESS.md §6`. New blockers introduced via `05` per-module sections (B22–B53).

| Role | Decision (wave plan + B22–B53) | Date |
|---|---|---|
| Owner | ☐ approve / ☐ revise | _____________ |
| Lead Dev | ☐ feasible / ☐ revise | _____________ |
| Architect | ☐ baseline alignment / ☐ revise | _____________ |
| QA Lead | ☐ verifiable / ☐ revise | _____________ |
| Ops | ☐ provisionable / ☐ revise | _____________ |

---

## §14. Cross-References

- **Master:** `PROGRAM-READINESS.md` §4 (module index), §6 (sign-off), §7 (wave summary), §9 (Go/No-Go gate)
- **Module catalog:** `05-MODULE-CATALOG.md` (per-module deliverables + sign-off blockers B22–B53)
- **Strategy:** `00-DEBATE-SYNTHESIS.md`, `01-BRAND-SOFTWARE-PROGRAM.md`, `02-GREEN-BASELINE.md`, `03-DATA-MIGRATION-POLICY.md`, `04-CUTOVER-QA-RUNBOOK.md`
- **ADRs:** `adr/0001-auth-migration.md`, `adr/0002-database-provider.md`, `adr/0003-cutover-rollback.md`, `adr/0004-position-code-normalization.md`, `adr/0005-tenants-owner-user-id.md` (deferred)
- **Existing canonical surfaces:** `docs/modules/{auth,database,web-app,ui,security,infrastructure}.md`
- **Operational:** `tasks/{regressions,lessons,todo}.md`

---

**End of wave plan.** Update when: (a) wave gate definition changes, (b) wall-time estimate revised post-rehearsal, (c) cutover date locked, (d) new B-blocker added.
