# T3 Review Task — HRM trục Người · Ngày công (Second Opinion)

You are a **senior reviewer (T3 full-debate)** doing a second opinion on an HRM investigation report for the `comtammatu` repo (Next.js + Supabase + TS single-tenant F&B ERP). The repo is at the current cwd; AGENTS.md is the agent entrypoint.

This is **READ-ONLY review**. Do NOT modify any file, do NOT apply migrations, do NOT commit. You may read any file to verify claims.

## Repo rules that bound your judgment (from AGENTS.md + docs/agent/rules)

- Writes whose correctness spans multiple rows MUST use a Postgres RPC.
- TS strict, `noUncheckedIndexedAccess: true`; all Server Action inputs validated with Zod.
- Multi-row correctness (payroll) MUST go through the atomic RPC (`PAYROLL-CALCULATE-MUST-BE-ATOMIC-RPC`).
- Proration cap: `payableDays = min(workingDays + paidLeaveDays, standardDays)` (`PAYROLL-PRORATION-CAP-AT-STANDARD`).
- Design decisions D012 / D027 / D041 are authoritative:
  - **D012**: NO rostering / NO auto-late / NO auto-absent / NO leave-balance enforcement / NO multi-tier approval.
  - **D027**: attendance unit = SHIFT; each completed shift = 0.5 công; `working_days = Σ 0.5`.
  - **D041**: payroll "tính lương" is atomic via `upsert_payroll_calculation` RPC; TS retains all PIT/BH computation.
  - **D026**: HR only "chốt nghĩa vụ lương"; actual cash payment/reconciliation belongs to Finance `expenses` (category `salary`); HR must NOT set `paid`.

## The report under review (my findings)

I investigated the People·Workday axis and produced 7 findings. For each, your job: **CONFIRM / REFUTE / NUANCE** with concrete file:line you personally read, and surface anything I missed. Severity bars are mine; push back if wrong.

### 🔴 F1 — Employee onboarding does NOT seed `annual_leave_entitlements`
`createEmployeeAccount` (apps/web/app/(protected)/hr/actions.ts ~lines 281-479) creates auth user + profile + `employees` + `employment_contracts`, but inserts nothing into `annual_leave_entitlements`; no SQL trigger seeds it either. New employee → `entitlementDays == null` → in payroll `annualEntitlementForCalculation = 0` (apps/web/app/(protected)/hr/payroll-actions.ts ~581-584), so ALL their `annual` leave overflows to unpaid. Table default `12` only applies if a row exists. No admin UI to set per-employee entitlement (leave-policy form only edits tenant-wide `standardWorkdays`/`monthlyLeaveDays`).
- Is this a real defect, or is there a seed path I missed (trigger, RPC, setting)? Is it actually D012-compliant to *not* store quota? (I believe D012 forbids *enforcement*, not storage.)

### 🔴 F2 — `|| true` debug bypass in position-task filter
`apps/web/app/(protected)/hr/position-tasks-actions.ts:206`: `const hasStaffOrTasks = activeProfilePositionIds.has(...) || taskPositionIds.has(...) || true;` makes the following `if (!hasStaffOrTasks) return []` dead code. Filter "only positions with staff or existing tasks" disabled; dropdown lists all active positions.
- Confirm the line and exact effect. Is the upstream computation at ~191-194 genuinely wasted?

### 🔴 F3 — Consumption report RPCs exist but are NOT wired in UI
`employee_submit_consumption_report` and `branch_manager_approve_consumption_report` are complete RPCs (baseline ~15896 and ~6516) but grep of `apps/web/app/(protected)` + `apps/web/lib/staff-runtime` returns ZERO callers (only tests + migration). `consumption_report` task kind renders as a plain checkbox (`lib/staff-runtime/tasks/tasks-client.tsx`); toggling only flips `is_done`; no quantity form, no submit, no manager approval screen. The consumption→inventory pipeline is dead at the UI layer.
- Verify the zero-caller claim. Is there any route/component I missed?

### 🟠 F4 — Two competing checklist template systems, disconnected
- `position_shift_tasks` (per-position) is the REAL snapshot source at clock-in (`employee_clock_in_with_checklist`, baseline ~15602, snapshot at ~15681-15701 reads ONLY `position_shift_tasks`).
- `shift_checklist_templates` + `shift_checklist_template_items` + `employees.default_checklist_template_id` / `positions.default_checklist_template_id` are referenced by `hr/checklist-coverage.ts` and `attendance-table.tsx` but NEVER snapshotted into runtime. `default_checklist_template_id` is effectively unused at runtime.
- Clock-in also hard-codes `template_item_id = NULL` and `checklist_template_id = NULL` on every snapshot row.
- Confirm the disconnect and the hard-coded NULLs. Is `shift_checklist_templates` truly vestigial, or is it used somewhere I missed (e.g. branch_manager clock-in path)?

### 🟠 F5 — Two divergent onboarding paths produce inconsistent data
`createStaff` (apps/web/app/(protected)/hr/staff/actions.ts ~133-214) creates auth user + profile but NO `employees` row, NO contract, NO payroll fields. Such a user is invisible to `/hr` employee views, payroll, `sync_insurance_base`. `createEmployeeAccount` is the superset. No guard against same-email double onboarding; no bridge to later create the `employees` row.
- Confirm the divergence. Is one path intended to be deprecated, or are both legitimately used for different roles?

### 🟠 F6 — `handle_new_user` trigger rejects central-site & accountant roles
- baseline ~24687 hard-codes `branch_kind <> 'branch'` → rejects `central_supply_ops` / `central_kitchen_lead` even though `requiredBranchKindForPositionCode` allows `central_supply`/`central_kitchen`.
- Action allows `accountant` with no branch (its kind is `null`), but trigger requires branch for any non-owner → **direct action-vs-DB contradiction**; onboarding an accountant with no branch fails at the trigger.
- `update_staff_profile` RPC has the same hard-coded `'branch'` check.
- On trigger raise, `createUser` surfaces an opaque "Không thể tạo tài khoản" (no error-code mapping for trigger conditions).
- Verify the hard-coding and the accountant contradiction. Is the accountant-without-branch path actually reachable/used, or blocked earlier?

### 🟡 F7 — Smaller schema/UI gaps
- `default_checklist_template_id` + `employees.bank_name`: in schema but no form field sets them.
- `employment_contracts.contract_type` CHECK allows `seasonal` but the action Zod enum only allows `probation|fixed_term|indefinite`.
- `during_shift` phase allowed in schema but `tasks-client.tsx:27` only renders `start_of_shift`/`end_of_shift`.
- `inventory_count` task kind reachable only via synthetic clock-in row, not authorable as a template.
- `branch_attendance_config` stores only `attendance_secret` (misnamed).
- `shiftSchema` doesn't validate `start_time < end_time` or overnight.
- `updateShift` has no re-activate action.
- HR edit dialog comment says role/branch are create-only, but the dialog DOES send position_code/branch_id and `updateEmployee` applies them.
- Spot-check any 2-3 of these; flag others in the same vein.

## Output format (English, terse, evidence-first)

For EACH finding F1–F7:
- **Verdict**: CONFIRMED / REFUTED / NUANCED
- **Evidence**: file:line you read
- **Correction/nuance** (if any): what I got wrong
- **Severity** (your call vs mine)

Then a section **ADDITIONAL FINDINGS** — anything in this People·Workday axis I missed (onboarding, shifts, in-shift tasks, schedule, leave, attendance, payroll preflight, RLS holes, error-leak). Be specific with file:line.

Then **BOTTOM LINE**: net assessment — is this module's People·Workday axis production-stable, or are F1/F3 (and which others) real blockers?

Keep symbols, file paths, RPC/error names verbatim. Do not propose fixes beyond a one-line hint each.
