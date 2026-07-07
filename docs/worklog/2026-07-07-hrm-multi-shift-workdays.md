# HRM Multi-Shift Workdays Contract

> Reconciled-through fd912b955

Skill plan: repo rules = engineering + skills + database + workflow + team + ui; external skills = supabase changelog/docs check; runtime tools = CodeGraph + shell; skipped = DB migration because `attendance_records` and `employee_clock_in_with_checklist` already key attendance by `shift_id`.

Tier: T3. Payroll working days affect payroll amounts, so this uses the written-transcript fallback instead of subagents.

PM: Scope is the smallest fix for the owner-reported hardcoded shift count: remove the daily two-shift cap from working-day math and copy. Done means a three-shift day counts as 1.5 workdays, while monthly payable days remain capped by `standard_days`.

BA: Business rule is per-shift attendance. Each closed shift contributes 0.5 workday. Open shifts are not payable workdays until checkout and remain visible as open/stale attendance. The rule must support morning, afternoon, evening, or any other named shift without a new code change.

Senior Dev: Schema and RPC already key by `(employee_id, date, shift_id, tenant_id)`, so no migration is needed. Change the duplicated aggregation in payroll, schedule estimate, and HR attendance summary; update D027 so docs no longer preserve the old cap.

QA/QC: Add a focused test where three completed shifts on the same date produce 1.5 workdays. Recheck targeted tests, review-tier lint, CodeGraph freshness, and the hard gate if the current dirty worktree allows it.

Second-runtime fallback: no independent runtime was spawned because the available subagent tool forbids spawning unless the owner explicitly asks for subagents. This written review is weaker than a real independent pass.
