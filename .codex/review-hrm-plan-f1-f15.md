# T3 Review Task — HRM F1→F15 Implementation PLAN (Second Opinion)

You are a **senior reviewer (T3 full-debate)** reviewing an *implementation PLAN* (not code) for the `comtammatu` repo (Next.js + Supabase + TS single-tenant multi-branch F&B ERP). Repo at current cwd. AGENTS.md is the entrypoint. This is **READ-ONLY**: do not modify files/migrations, do not commit. You may read files to VERIFY the plan's factual claims (bug existence, RPC shapes, table absence, etc.).

## Your job
For each phase, judge: **is the plan correct, feasible, and correctly ordered? Are risks missed? Are there cheaper/safer alternatives? Are any earlier findings (F1–F7) or new findings (F8–F15) mis-stated?** Cite file:line you read. Push back hard on anything wrong.

## Repo rules bounding the plan (from AGENTS.md + docs/agent/rules)
- Writes spanning multiple rows MUST use a Postgres RPC; TS strict (`noUncheckedIndexedAccess`); Zod-validate all action inputs; never leak raw Supabase error.
- Atomic payroll via RPC (`PAYROLL-CALCULATE-MUST-BE-ATOMIC-RPC`); proration cap `payableDays = min(workingDays + paidLeaveDays, standardDays)` (`PAYROLL-PRORATION-CAP-AT-STANDARD`).
- Decisions D012 (NO rostering/auto-late/auto-absent/leave-balance-enforcement/multi-tier-approval), D027 (shift-based, 0.5 công/shift), D041 (atomic payroll RPC), D026 (HR vs Finance payroll boundary), D052 (position_shift_tasks replaces templates) are authoritative. **Reversing any (esp. D012) requires a new decision (ADR) in docs/plan/decisions.md per workflow.md — not a silent code change.**
- Environment Registry: Greenfield `enloyfnuerqgaqderbwb` is type source + bootstrap target; Production `iexwsuaqqenyjiskawoj` (matu-prod) is read-only/suspended. Migrations apply to Greenfield only.

## The findings the plan addresses (already second-opinion-reviewed once; verify the load-bearing claims)

F1 🔴 — `createEmployeeAccount` (apps/web/app/(protected)/hr/actions.ts:281-479) seeds no `annual_leave_entitlements` row; payroll then uses 0 entitlement → annual leave overflows to unpaid (splitAnnualLeaveByQuota, payroll-day-math.ts:138-156; default monthly bucket 2 days still paid).
F2 🟡 — `|| true` debug bypass at position-tasks-actions.ts:205-209 (dead filter).
F3 🔴 — `employee_submit_consumption_report` (baseline:15896) + `branch_manager_approve_consumption_report` (20260728190000:5928) have zero UI callers; consumption_report renders as a plain checkbox (tasks-client.tsx).
F4 🟠 — legacy `shift_checklist_templates`/`shift_checklist_template_items`/`default_checklist_template_id` are vestigial (D052 replaced with position_shift_tasks); buildChecklistCoverage has no production caller.
F5 🟠 — `createStaff` (/hr/staff) makes auth+profile but no `employees` row → staff-runtime-context.ts:25-32 returns null → invisible to payroll/attendance runtime.
F6 ⚪ — (previously REFUTED) handle_new_user now handles central/accountant via 20260728140000_d088_b_full_ops_roles.sql; only error-UX opacity remains.
F7 🟡 — small: bank_name dead column, default_checklist_template_id no form field, seasonal enum mismatch, during_shift phase not rendered, shiftSchema no time-ordering, no re-activate shift UI, stale create-only comment.
F8 🔴 NEW — **force-close công bug**: force_close_stale_attendance (baseline:18543, sets check_out=check_in at :18653, comment "không tính công" :18658) but TS buildCompletedWorkdays (payroll-day-math.ts:72) counts any record with check_out IS NOT NULL as a completed shift → 0.5 công. VERIFY this contradiction and the exact math.
F9 🟠 NEW — no HĐLĐ terminate/expire workflow; columns terminated_at/probation_end_date/document_url/contract_sequence exist (baseline:46590-46614) but never written; upsertActiveContract (actions.ts:110-172) OVERWRITES in place (no history append).
F10 🟠 NEW — no salary-history UI; base_salary drift (updateEmployee writes employees.base_salary then trg_contract_sync_insurance overwrites from contract gross_salary, baseline:41651-41658).
F11 🟠 NEW — probation is a label only; no 85%-salary/no-BHXH logic; no probation_end_date computation.
F12 🟠 NEW — contract_sequence never incremented; "warn 3rd fixed-term" feature unimplemented.
F13 🔴 NEW — employee profile compliance-thin: no address/gender/ID-issue/emergency-contact; profiles only has full_name/phone/avatar_url/birth_date (baseline:49357-49369); no employee detail page (only list+edit dialog); no offboarding beyond is_active toggle; no document storage bucket.
F14 — rostering absent (D012 intentional): no shift_assignments/roster table; employee auto-derives shift at clock-in (default-shift.ts:120-166).
F15 — hours tracked as timestamps only; payroll uses shift-count not hours (D027); force-close yields 0 hours (consistent in display).

## The PLAN under review

Owner has CHOSEN: build NEW rostering (reverse D012), full HĐLĐ (terminate+history+probation+sequence+document), minimal employee profile (detail page + basic offboarding + bank_name/DOB fixes), and address ALL of F1–F15.

### Phase 1 — Salary blockers (PR #1)
- New atomic RPC `provision_employee_record(p_profile_id, p_employee jsonb, p_contract jsonb, p_entitlement_year)` mirroring `upsert_payroll_calculation` (SECURITY DEFINER, search_path '', auth+permission assert, advisory lock, jsonb_to_recordset). Replaces the 4-step non-atomic sequence in createEmployeeAccount; inserts employees + seeds annual_leave_entitlements (prorated per migration-archive/20260626102342:71-88: ≤Jan1→12, ≥Dec31→0, else 13-month) + inserts contract + calls sync_insurance_base in one tx, checks result.
- Payroll preflight: add `missing_entitlement` blocker (payroll-preflight.ts kinds/inputs/BLOCKER_ORDER; payroll-actions.ts:741-764 compute missing list; payroll-list-client.tsx:163-204 case + copy); canSnapshot blocks on it.
- Inactive-vanish: payroll-actions.ts:557-559 replace `is_active` filter with payable-in-period predicate using already-loaded workdaysByEmployee/adjustmentsByEmployee/contractByEmployee/finalizedByEmployee; keep is_active for a "departed" badge.
- **F8 force-close fix**: prefer a sentinel `check_out > check_in` in buildCompletedWorkdays (no column) over adding a column. Is sentinel safe given existing data? Any record with equal check_in/check_out other than force-close?

### Phase 2 — Consumption (PR #2)
- Migration: add attendance_checklist_items.position_task_id col (FK position_shift_tasks); fix clock-in snapshot (baseline:15681-15701) to preserve t.id; fix submit RPC validation (baseline:15978-15989) join on position_task_id not template_item_id.
- New staff-runtime/consumption/{actions.ts,page.tsx,consumption-client.tsx} mirroring lib/staff-runtime/count/*; tasks-client.tsx add consumption_report branch (CTA not checkbox); new /br/{id}/shift/consumption-approvals route mirroring inventory/count-slips; notification on submit; copy + nav + e2e.

### Phase 3 — /hr/staff restriction (PR #3)
- staff/page.tsx:81-96 filter dropdown to tenant-level roles only (requiredBranchKindForPositionCode===null && role!==owner); guard banner for orphan accounts; mapCreateUserError (table-driven, 9 handle_new_user RAISE markers from d088.sql).

### Phase 4 — Drop legacy templates (PR #4)
- Migration DROP shift_checklist_template_items, shift_checklist_templates CASCADE; DROP COLUMN attendance_records.checklist_template_id, employees.default_checklist_template_id, positions.default_checklist_template_id + FKs/indexes; DROP FUNCTION upsert_shift_checklist_template; drop shift_checklist_consumption_default_items.template_item_id + relax parent_present check to require position_task_id.
- Code: delete checklist-coverage.ts + its test; remove from actions.ts (loadChecklistTemplateBranch, EMPLOYEE_SELECT_OWNER, create/update writes, 2 attendance joins); _types.ts; attendance-table.tsx; team/data.ts (8 sites); update 3 static tests.

### Phase 5 — Rostering (reverse D012) — REQUIRES ADR first (PR #5)
- ADR D0XX in decisions.md: optional vs mandatory rostering, clock-in-outside-assigned policy, regression guard updates. NO code until ADR approved.
- Migration: shift_rosters table (tenant, branch, employee, shift, work_date, status, assigned_by), UNIQUE(tenant,employee,date,shift), RLS owner+branch_manager scoped. RPC upsert_shift_roster mirroring set_inventory_count_assignments + upsert_payroll_calculation.
- Clock-in integration: resolveCurrentShiftForEmployee/employee_clock_in_with_checklist prefer assigned shift; policy-gated reject/warn for unassigned clock-in.
- UI: /br/{id}/shift/roster (weekly assignment) + /hr/attendance roster tab + schedule forward-looking view + nav + copy + e2e.

### Phase 6 — HĐLĐ full (3 PRs)
- 6A history+append (PR #6): RPC create_contract_revision (append new + mark old expired atomically, increment contract_sequence); replace upsertActiveContract overwrite; contract history tab UI.
- 6B terminate+probation+sequence (PR #7): RPC terminate_contract (status+dates+reason, notice-period validation per labor-contracts.md §4.1); probation_end_date computation + payroll branch (85% gross, no BHXH during probation, legal-versions.ts/calculate.ts); 3rd-fixed-term warning (soft, not block).
- 6C document upload (PR #8): storage bucket hr-documents (RLS owner full, employee read-own); employment_contracts.document_url signed URL; upload UI in contract tab.

### Phase 7 — Minimal profile (PR #9)
- Employee detail page /hr/employees/[id] (read-only dossier: identity/work/contract history/salary/attendance/permissions link).
- Offboarding action offboardEmployee (is_active=false + terminate active contract via 6B + exit_date/reason) + UI button in detail.
- bank_name form field + DOB owner-set field.

### Phase 8 — Cleanup (PR #10): F2 || true, F7 shift validation/re-activate, stale comments.

### Recommended order
P1 → P3 → P4 → P2 → P6A → P6B → P7 → P6C → P8 → (ADR P5) → P5. P5 last (reverses decision, highest risk).

## Output (English, terse, evidence-first)
For EACH phase P1–P8: **Verdict** (SOUND / NEEDS-CHANGE / REFUTE) + **Evidence** (file:line) + **Correction/alternative** + **Risk missed**.
Then **ADDITIONAL PLAN RISKS / GAPS** — anything the plan misses (e.g., RLS holes new tables, payroll regression risk from probation branch, concurrency on roster upsert, storage PII, missing e2e gates, decision-reversal process, Greenfield-vs-Prod migration safety).
Then **REORDERING** — is the proposed order optimal? Better sequencing?
Then **BOTTOM LINE** — is this plan execution-ready, or what must change before Phase 1 starts? Specifically: should F8 use sentinel or a column? Is reversing D012 via a roster table the right shape, or is there a lighter-touch alternative? Is the append-contract (6A) going to lose pre-existing history silently?

Keep file paths / RPC names / error markers verbatim. One-line fix hints only.
