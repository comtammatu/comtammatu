# HRM Rebuild Plan

> Workspace: `C:\Users\MATU\Downloads\comtammatu`  
> Date: 2026-04-25  
> Scope: M7 `Nhan su & Luong` rebuild planning for the current Supabase-backed app.

## Decision Summary

Rebuild HRM as a compliance-first HR/payroll module, not a generic HR suite.

The active HR surfaces are:

- `/hr/*`: HR management, contracts, shifts, attendance, payroll, HR reports.
- `/employee/*`: staff self-service only: profile, clock, attendance, schedule, paid payslips.
- `/admin/staff/*`: auth/profile/position/permission administration.

Do not create a parallel `/admin/hr` implementation unless the route map is explicitly changed. The current checkout has `apps/web/app/employee` (fully functional self-service) and `apps/web/app/admin/staff` (fully functional auth/profile/permissions). **`apps/web/app/hr/` does not exist yet** — the entire `/hr` admin workspace must be built from scratch. There are no legacy HR pages to decompose.

Payroll is production-sensitive. If the business wants the system to calculate live payroll, this rebuild is P0. If Excel remains the pilot fallback, system payroll must be marked not production-ready until the rebuild passes legal, RLS, and calculation verification.

## Source Context

Repo rules loaded before planning:

- `AGENTS.md`
- `docs/agent/rules/engineering.md`
- `docs/agent/rules/database.md`
- `docs/agent/rules/ui.md`
- `docs/agent/rules/workflow.md`
- `docs/agent/rules/references.md`
- `tasks/regressions.md`

Primary product and code references:

- `docs/plan/roadmap.md`
- `docs/plan/sprint-6.md`
- `docs/ref/labor-contracts.md`
- `docs/ref/payroll-pit.md`
- `docs/modules/auth.md`
- `docs/modules/web-app.md`
- `docs/spec/architecture.md`
- `docs/spec/database-schema.md`
- `apps/web/app/hr/*`
- `apps/web/app/employee/*`
- `packages/shared/src/auth/module-acl.ts`
- `packages/shared/src/auth/permissions.ts`
- `packages/shared/src/payroll/calculate.ts`
- HR/payroll migrations under `supabase/migrations/*hr*`, `*payroll*`, `*attendance*`, and `20260422220000_auth_v2_m4c3_hr_payroll_finance.sql`

Current legal references checked on 2026-04-25 for planning only:

- Cong Bao page for `Nghi dinh 293/2025/ND-CP`: effective 2026-01-01, minimum wage for employees working under labor contracts.  
  https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-293-2025-nd-cp-46568/59713.htm
- Chinhphu.vn page for `Nghi quyet 110/2025/UBTVQH15`: family deduction from 2026 is 15.5m VND/month for taxpayer and 6.2m VND/month per dependent.  
  https://xaydungchinhsach.chinhphu.vn/nghi-quyet-110-2025-ubtvqh15-dieu-chinh-muc-giam-tru-gia-canh-cua-thue-thu-nhap-ca-nhan-119251110101313787.htm
- Chinhphu.vn page for `Luat Thue TNCN 109/2025/QH15`: law effective 2026-07-01, with salary/wage rules applying from tax year 2026.  
  https://xaydungchinhsach.chinhphu.vn/gioi-thieu-luat-thue-thu-nhap-ca-nhan-so-109-2025-qh15-119260123145437408.htm
- BHXH Vietnam page about 2026 BHXH/BHYT/BHTN guidance based on the new minimum wage rules.  
  https://baohiemxahoi.gov.vn/tintuc/Pages/chinh-sach-ho-tro-nguoi-lao-dong-tu-quy-bhtn.aspx?CateID=0&ItemID=26004&OtItem=date
- Supabase RLS documentation for exposed-schema security.  
  https://supabase.com/docs/guides/database/postgres/row-level-security

Before implementation, the accountant/legal owner must confirm final constants and effective dates. The system design must version legal constants instead of hardcoding them in TypeScript.

## Four-Agent Debate

### PM

Recommendation:

- Build a narrow MVP around employee records, contracts, shifts, attendance, payroll calculation, payroll approval/payment, exports, and employee paid payslips.
- Keep recruitment, performance, e-signature, biometric devices, direct eTax/BHXH filing, and advanced severance outside the MVP.
- Treat the rebuild as 7-10 focused dev days if no major schema reset is required.

Open product decisions:

- Is system payroll a pilot blocker, or does Excel remain the payroll fallback?
- Can branch managers see payroll amounts, or only attendance/schedule?
- Which exports are mandatory first: bank transfer, PIT, BHXH, or all three?
- Do payroll approvals need reopen/void in MVP, or only owner manual correction?

### BA

Target workflow:

1. `/admin/staff` creates auth/profile/position/permissions.
2. `/hr` links the profile to an employee legal record.
3. HR creates and activates a contract.
4. Contract syncs salary and insurance base to employee cache.
5. Manager publishes shifts.
6. Employee clocks in/out or manager records correction.
7. HR closes attendance month.
8. Payroll is calculated from immutable source snapshots.
9. Owner approves payroll.
10. Owner marks payroll paid and posts GL.
11. Paid payslip becomes visible in `/employee`.
12. HR exports payroll, insurance, and PIT summaries.

Business invariants:

- Active contract is the salary and insurance source of truth.
- `employees` salary fields are derived cache, not manual payroll truth.
- `payroll_entries` are immutable snapshots after approval/paid.
- Payroll must snapshot contract, attendance, dependents, allowances, legal version, and rate/cap version.
- Payroll must not assume Monday-Friday workdays; restaurants need branch calendars, shifts, holidays, and substitution days.
- Clock-in must prove the employee is valid for the branch/shift/business date, not only GPS plus daily code.

### Senior Dev

Architecture recommendation:

- Keep `/hr`, `/employee`, and `/admin/staff` as separate bounded surfaces.
- Replace multi-row Server Action write chains with RPCs for contract activation, attendance correction/month close, payroll calculation/status changes, and GL posting.
- Keep pure payroll formulas in `packages/shared/src/payroll/calculate.ts` for tests and display parity, but make persistence and state transitions database-atomic.
- Route all authz through Auth v2 permissions and RLS; do not create UI-only policy layers.
- Decompose current tab-heavy HR UI into real routes that match the shell navigation.

High-risk current seams:

- **`/hr` does not exist.** All HR admin routes, pages, server actions, and layout must be created from scratch. This is actually lower risk than rewriting legacy pages but requires building the full route tree, layout shell, navigation, and all CRUD workflows.
- Current clock-in/out actions (`apps/web/app/employee/clock/actions.ts`) write directly to `attendance_records` without RPC wrapping. These must be migrated to `clock_in_employee` / `clock_out_employee` RPCs for atomicity and cross-branch validation.
- Existing `payroll_entries` schema lacks: `contract_id`, `branch_id`, legal version snapshot columns, and the full snapshot fields this plan requires. Additive migration needed.
- Existing `employment_contracts.status` enum is `active | expired | terminated` — missing `draft | signed` lifecycle states.
- No `attendance_month_close` table, no corrections ledger, no dependent declarations table, no branch payroll calendar, and no legal versioning tables exist yet.
- `shift_assignments_select` and payroll/self-service RLS must be rechecked with negative role tests.
- Current payroll constants in `packages/shared/src/payroll/calculate.ts` hardcode 2024 values: `INSURANCE_CAP = 46_800_000`, `PERSONAL_DEDUCTION = 11_000_000`, `DEPENDENT_DEDUCTION = 4_400_000`. Per NQ 110/2025 (effective 2026), personal deduction must be 15,500,000 and dependent deduction 6,200,000. Per NĐ 293/2025, the insurance cap base changes too. Legal versioning tables must replace all hardcoded constants.

### QA/QC

QA stance:

- Verify the whole chain: contract -> insurance sync -> attendance/shift data -> payroll calculation -> approval/payment -> employee payslip.
- Add payroll unit fixtures before changing business code.
- Add RLS/action negative tests for salary, CCCD/tax code, bank account, attendance, and payslip privacy.
- Employee payslip must show only the employee's own paid/released payroll rows.

Required release gates:

- `pnpm typecheck && pnpm lint && pnpm build`
- `pnpm db:types` after applying HR/payroll migrations to the type-source schema
- Payroll formula tests
- RPC atomicity tests
- RLS verification SQL
- Playwright flows for `/hr/payroll` and `/employee/payslip`
- Sample payroll reconciliation checked against `docs/ref/labor-contracts.md`, `docs/ref/payroll-pit.md`, and refreshed legal constants

## Agreements

- `/hr` is the active HR workspace; `/admin/staff` owns auth/position/permissions; `/employee` is self-service.
- Rebuild should be compliance-first and payroll-safe.
- Legal constants must be versioned by effective date.
- Contract activation and payroll calculation must be atomic RPC workflows.
- Employee self-service must never expose draft/calculated payroll or other employees' PII.
- Branch scope belongs in explicit inputs/URL params and RLS, not localStorage or React Context.
- Server Actions must Zod-validate inputs and never return raw Supabase/Postgres errors.
- UI rebuild must use the existing shadcn/design-system primitives.

## Conflicts Resolved

| Conflict | Resolution |
| --- | --- |
| `/hr` vs `/admin/hr` | Keep `/hr` because it is the implemented surface. Add redirects/aliases later only if route architecture is deliberately changed. |
| Excel fallback vs live payroll | Plan for live payroll readiness. If business keeps Excel fallback, mark system payroll as non-production until Phase 3/4 pass. |
| Branch manager payroll visibility | Default: branch managers see attendance/schedule only, not salary/payroll amounts. Any payroll visibility must be explicit permission-based and tested. |
| `office` HR rights | Treat as a product/ACL decision. If office can operate HR, grant narrow HR permissions; do not rely on legacy role widening. |
| Count-only dependents vs full dependent records | MVP stores dependent declarations with effective dates and enough fields for audit; payroll snapshots the count and deduction version. Direct eTax filing stays out of scope. |
| Monday-Friday standard days | Replace with branch payroll calendar and shift/business-date rules. Mon-Fri is invalid for restaurant payroll. |
| One shift/day vs multiple shift segments | Support multiple shift assignments and attendance segments per employee per business date. Enforce one open clock segment at a time. |
| App-layer formula vs DB truth | Formula can live in shared TS for test/display parity, but payroll save/status/lock must be one RPC transaction. |

## MVP Scope

### Included

- Employee master data linked to `profiles`
- Branch, position, employment status, employee code
- Legal identity fields: CCCD/CMND, date of birth, gender, address, phone, personal tax code
- Bank payout fields with strict privacy
- Contract lifecycle: draft, signed, active, expired, terminated
- Fixed-term renewal warning/block for the third fixed-term contract
- Contract-to-employee salary and insurance-base sync
- Shift templates, shift assignments, branch calendars
- Employee clock-in/out with branch, shift, business date, GPS/code validation
- Manager attendance correction with reason and audit trail
- Attendance month close before payroll
- Payroll periods: draft, calculated, approved, paid
- Payroll calculation: salary proration, insurance, PIT, dependents, allowances, overtime placeholders, deductions
- Immutable payroll snapshots after approval/paid
- Owner approval and payment marking
- Payroll GL posting once
- Employee portal: schedule, attendance history, paid payslips only
- CSV exports: payroll summary, insurance summary, annual PIT summary, optional bank transfer CSV

### Out Of Scope

- Recruitment pipeline
- Performance reviews/KPI
- E-signature provider
- Direct eTax or BHXH portal filing
- Biometric time clock hardware
- Full leave-management suite
- Advanced service charge/tips allocation
- Automated severance/final settlement beyond manual owner-reviewed adjustment
- Multi-company payroll
- Cross-tenant HR

## Data Model Plan

Additive migrations first. Do not rewrite destructive schema in production.

### Legal Versioning

Add or equivalent:

- `payroll_law_versions`
- `regional_minimum_wages`
- `pit_deductions`
- `pit_brackets`
- `insurance_rates`
- `insurance_caps`

Minimum required fields:

- `tenant_id` where tenant-specific overrides are allowed
- `effective_from`
- `effective_to`
- `source_reference`
- `created_by`
- `created_at`

Payroll entries must snapshot the version ids used for calculation.

### Employee Record

Expand `employees` or add related tables for:

- `branch_id` or branch assignment history
- `position_id` / display position
- `employment_status`
- `date_of_birth`, `gender`
- `id_number`, `id_issued_date`, `id_issued_place`
- `address`
- `tax_code_personal`
- bank details
- derived current salary fields synced from active contract

Sensitive fields must be permission-gated and absent from unauthorized client payloads.

### Contracts

Add contract lifecycle and audit support:

- `status`: `draft | signed | active | expired | terminated`
- non-overlap guard for active contracts per employee
- signed/effective dates
- termination notice and reason
- contract sequence
- attachment reference
- audit actor/timestamps

Replace app-layer expire-then-insert with one RPC, for example:

- `create_employment_contract_atomic(...)`
- `activate_employment_contract(...)`
- `terminate_employment_contract(...)`

### Attendance And Shifts

Support restaurant reality:

- branch payroll calendar
- shift templates with timezone/business-date behavior
- shift assignments by employee, branch, date, shift
- attendance segments linked to shift assignment when possible
- manual corrections ledger with before/after, actor, reason
- attendance month close rows by tenant/branch/month

Replace unique `employee_id,date,tenant_id` assumptions where they block split shifts or cross-branch borrowing.

### Payroll

Payroll entries must snapshot:

- employee id, branch id, contract id
- period id
- legal version ids
- standard work units and actual work units
- salary components
- taxable and tax-exempt allowances
- overtime/holiday/leave breakdown where supported
- dependent declaration snapshot
- insurance base/cap/rates used
- PIT bracket/deduction used
- gross, deductions, employer costs, net
- adjustment/correction linkage

Approved and paid entries must be immutable except through an explicit correction/reversal flow.

## RPC And Server Action Plan

### Required RPCs

Names can change during implementation, but the capability must exist:

- `create_employment_contract_atomic`
- `activate_employment_contract`
- `terminate_employment_contract`
- `clock_in_employee`
- `clock_out_employee`
- `record_attendance_correction`
- `close_attendance_month`
- `calculate_payroll_period`
- `approve_payroll_period`
- `mark_payroll_period_paid`
- `post_payroll_journal`
- `get_my_paid_payslips`
- `get_my_schedule`

RPCs that mutate multiple rows must lock the relevant period/employee/contract rows and either commit all effects or none.

### Server Actions

Server Actions must:

- validate inputs with Zod
- resolve auth context and permission
- call RPCs for writes/state transitions
- map database errors to safe user-facing messages
- revalidate only the affected paths
- never return raw `error.message`

### RLS/ACL

Use Auth v2 permission keys as the row-level source:

- `hr:view_employee`
- `hr:manage_employee`
- `hr:contract_create`
- `hr:contract_sign`
- `hr:terminate`
- `hr:dependent_manage`
- `staff:view`
- `staff:manage`
- `finance:payroll_calculate`
- `finance:payroll_approve`
- `finance:view`

Default privacy rules:

- All staff can see their own schedule, attendance, and paid payslips.
- Branch managers can see and correct attendance/schedules for branches they manage.
- Branch managers do not see payroll amounts by default.
- Owner/super manager can manage payroll.
- Office/HR access must be granted through explicit permissions, not broad legacy role assumptions.

## UI Plan

Use the existing design system and shadcn primitives. Do not introduce a new HR visual system.

Routes:

- `/hr`: HR overview with exception queues and month status
- `/hr/employees`: employee list and employee detail entry
- `/hr/employees/[employeeId]`: profile, contracts, attendance, payroll history
- `/hr/contracts`: contract queue and expiring contracts
- `/hr/shifts`: shift templates and weekly schedule
- `/hr/attendance`: daily attendance and correction queue
- `/hr/payroll`: payroll periods
- `/hr/payroll/[periodId]`: payroll detail, exceptions, approval/payment
- `/hr/reports`: payroll, insurance, PIT exports
- `/employee/clock`: self clock
- `/employee/schedule`: own schedule
- `/employee/attendance`: own attendance history
- `/employee/payslip`: own paid payslips only

Primary HR workflows should be table/queue-first, not dashboard decoration:

- expiring contracts
- missing employee legal fields
- missing shift assignments
- missed checkout
- attendance exceptions
- payroll calculation blockers
- payroll awaiting owner approval
- payroll paid/released status

## Test And Verification Plan

### Unit Tests

- PIT bracket boundaries
- deduction effective dates
- insurance cap/rates
- zero and negative taxable income
- dependents
- tax-exempt allowances
- rounding
- net salary
- branch calendar standard work units

### RPC/Integration Tests

- contract create/activate expires previous active contract atomically
- active contract syncs employee salary and insurance base
- payroll calculation is idempotent in draft/calculated status
- approved/paid payroll cannot be recalculated silently
- paid payroll posts GL once
- attendance close blocks payroll when required
- correction after payroll close requires explicit reopen/correction path

### RLS Negative Tests

- cashier/waiter/chef cannot read other employees' payroll or PII
- employee can read only own paid payslips
- employee cannot read draft/calculated payroll
- branch manager can see branch attendance but not payroll amounts
- area manager scope is explicit and not tenant-wide by accident
- service-role-only attendance secrets never reach client payloads

### Browser Tests

- owner creates payroll period, calculates, approves, marks paid
- employee sees new paid payslip
- employee cannot access another employee payslip URL/data
- branch manager corrects attendance with required reason
- employee clock-in rejects wrong code, wrong branch, duplicate open segment

### Completion Gate

Implementation is not complete until:

```bash
pnpm db:types
pnpm typecheck
pnpm lint
pnpm build
```

Only run `pnpm db:types` after the migration is applied to the schema used for generated types.

## Phase Plan

### Phase 0: Decision Lock

Estimate: 0.5-1 day.

Deliverables:

- HRM MVP scope locked
- legal/accountant confirmation for 2026 constants
- route ownership locked: keep `/hr`
- ACL matrix locked
- sample payroll fixtures created
- current direct-write risks documented

Exit criteria:

- Product decisions resolved or explicitly deferred
- implementation prompt accepted

### Phase 1: Schema, RLS, RPC Foundation

Estimate: 1-2 days.

Deliverables:

- additive migration for legal version tables
- employee/contract/attendance/payroll snapshot additions
- RPCs for contract, attendance close/correction, payroll calculate/approve/pay
- RLS policies aligned with Auth v2 permission keys
- verify SQL for negative cases

Exit criteria:

- migration applies on approved dev/test
- `pnpm db:types` runs after migration
- RLS smoke tests pass

### Phase 2: HR Operations

Estimate: 2 days.

Deliverables:

- employee and contract routes
- shift and attendance routes
- employee legal-data validation
- contract activation/sync flow
- attendance correction audit
- branch calendar/business-date handling

Exit criteria:

- HR can prepare payroll without direct DB fixes
- attendance close creates a stable source for payroll

### Phase 3: Payroll And Employee Release

Estimate: 2-3 days.

Deliverables:

- payroll calculation detail
- exception queue
- owner approval/payment flow
- paid payslip release
- CSV exports
- GL post once

Exit criteria:

- sampled rows reconcile with fixtures
- employee sees only own paid payslip
- unauthorized role tests pass

### Phase 4: QA, Docs, Handoff

Estimate: 1-2 days.

Deliverables:

- payroll fixture test report
- RLS/security checklist
- Playwright screenshots or notes for `/hr/payroll` and `/employee/payslip`
- roadmap/doc updates
- implementation worklog

Exit criteria:

- `pnpm typecheck && pnpm lint && pnpm build` passes
- QA sign-off covers calculation, RLS, privacy, and route flows

## Implementation Prompt

Use this prompt for the rebuild implementation turn:

```text
Rebuild HRM/M7 in C:\Users\MATU\Downloads\comtammatu.

Goal:
Make HRM production-ready for employee records, contracts, shift planning, attendance, payroll calculation, payroll approval/payment, employee paid payslips, and payroll/insurance/PIT exports.

Before editing:
1. Read AGENTS.md.
2. Read docs/agent/rules/engineering.md, database.md, ui.md, workflow.md, references.md.
3. Read tasks/regressions.md.
4. Read docs/plan/hrm-rebuild-plan.md.
5. Read docs/ref/labor-contracts.md and docs/ref/payroll-pit.md, but verify current legal constants before coding.
6. Read apps/web/app/hr, apps/web/app/employee, packages/shared/src/auth/module-acl.ts, packages/shared/src/auth/permissions.ts, packages/shared/src/payroll/calculate.ts, and HR/payroll migrations.

Architecture decisions:
- Keep /hr as the HR management workspace.
- Keep /employee as self-service only.
- Keep /admin/staff for auth/profile/position/permission administration.
- Use Supabase + RLS + Auth v2 permissions as the hard security boundary.
- Use Server Actions with Zod validation.
- Use RPCs for all multi-row or state-transition writes.
- Do not use Prisma.
- Do not return raw Supabase/Postgres error messages.
- Do not import @comtammatu/database barrel in client components.
- Do not store scope in localStorage or React Context; use URL params and explicit action inputs.

Implementation slices:
1. Lock HR route/ACL contract and add missing /hr route decomposition.
2. Add additive migrations for legal-versioned payroll constants, employee legal fields, contract lifecycle, attendance close/corrections, payroll snapshots, and required RPCs.
3. Apply migrations only to approved dev/test, then run pnpm db:types.
4. Cut HR Server Actions over to RPC-backed writes.
5. Rebuild HR UI with existing shadcn/ui primitives and queue/table-first workflows.
6. Restrict employee portal to self schedule, self attendance, and own paid payslips only.
7. Add payroll formula tests, RPC atomicity tests, RLS negative tests, and focused browser checks.
8. Run pnpm typecheck && pnpm lint && pnpm build.

MVP acceptance:
- Owner/super manager can manage employee records, contracts, shifts, attendance, payroll periods, payroll calculation, approval, payment marking, and exports.
- Employee can see own schedule, attendance, and paid payslips only.
- Payroll calculation snapshots the legal version, contract, attendance, dependents, allowances, insurance, PIT, and deductions used.
- Approved/paid payroll entries are immutable except via explicit correction/reversal.
- Contract activation syncs salary and insurance base atomically with an audit trail.
- Branch managers can manage attendance/schedules for their branch but cannot see payroll amounts unless explicit permission is added and tested.
- All verification gates pass.
```

## Appendix A: Codebase Inventory (2026-04-25)

### Existing Tables (from migrations)

| Migration | Tables |
|-----------|--------|
| `20260406320000_hr.sql` | `employees`, `shifts`, `shift_assignments`, `attendance_records` |
| `20260416010000_hr_employment_contracts.sql` | `employment_contracts`, `sync_insurance_base()` RPC |
| `20260416040000_hr_payroll.sql` | `payroll_periods`, `payroll_entries` |
| `20260417000000_attendance_pwa.sql` | `branch_attendance_config`, GPS/code fields on `attendance_records` |
| `20260419110000_gl_payroll_autopost.sql` | `post_payroll_journal()` RPC |
| `20260422220000_auth_v2_m4c3_hr_payroll_finance.sql` | Auth v2 RLS cutover for 13 tables |

### Missing Tables (must add)

- `payroll_law_versions`, `regional_minimum_wages`, `pit_deductions`, `pit_brackets`, `insurance_rates`, `insurance_caps`
- `employee_dependents`
- `attendance_month_close`
- `attendance_corrections`
- `branch_payroll_calendars` (or extend `branches`)
- Payroll snapshot columns on `payroll_entries`: `contract_id`, `branch_id`, legal version FKs

### Existing RPCs

- `sync_insurance_base()` — auto-sync `insurance_base_salary` from contract to employee
- `post_payroll_journal()` — GL auto-post from payroll entries

### Missing RPCs (must create)

All 13 RPCs listed in the RPC plan section above.

### Existing Routes

| Route | Status |
|-------|--------|
| `/employee` | **Complete** — dashboard, clock, schedule, attendance, payslip, profile |
| `/admin/staff` | **Complete** — CRUD, permissions, audit |
| `/admin/staff/[id]/permissions` | **Complete** — grant/revoke/template |
| `/hr` | **Does not exist** — must build all routes from scratch |

### Existing Shared Code

| File | Status |
|------|--------|
| `packages/shared/src/payroll/calculate.ts` | Complete but hardcoded 2024 constants — must be versioned |
| `packages/shared/src/auth/module-acl.ts` | Complete — `hr` module defined, maps to `/hr`, owner+super_manager |
| `packages/shared/src/auth/permissions.ts` | Complete — 6 HR + 3 payroll + 3 staff permission keys defined |

### Outdated Constants (2024 → 2026)

| Constant | 2024 Value | 2026 Value | Source |
|----------|-----------|-----------|--------|
| Personal deduction | 11,000,000 | **15,500,000** | NQ 110/2025/UBTVQH15 |
| Dependent deduction | 4,400,000 | **6,200,000** | NQ 110/2025/UBTVQH15 |
| PIT brackets | 7-bracket table | New law 109/2025/QH15 effective 2026-07-01 | Luat Thue TNCN |
| Insurance cap base | 2,340,000 × 20 = 46,800,000 | Updated per NĐ 293/2025 minimum wage | NĐ 293/2025/ND-CP |
| BHXH/BHYT/BHTN rates | 10.5% employee / 21.5% employer | Confirm with BHXH 2026 guidance | baohiemxahoi.gov.vn |
