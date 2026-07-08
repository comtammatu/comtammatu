# HR Leave Monthly/Annual Policy

> Reconciled-through 23500913b

Skill plan: repo rules = engineering + skills + database + workflow + team; external skills = supabase; runtime tools = codegraph + Supabase CLI migration generator; skipped = no live DB apply.

PM: scope is the leave/payroll policy only. Done means monthly paid leave is capped at 3 days, unused monthly leave is not carried, annual leave accrues one day per month from the employee start month, and overflow becomes unpaid in payroll.

BA: two monthly days are paid first and expire at month end. The third paid day consumes annual leave if accrued annual balance exists. Annual carryover is spent only after the two monthly days. Annual leave requests can still be approved when overflow exists; payroll records the overflow as unpaid.

Senior Dev: keep `leave_requests` schema unchanged. Replace stale year-level entitlement reads with runtime month-accrual helpers. Update the existing `approve_leave_request` RPC to stop rejecting annual quota overflow while preserving auth, branch permission, own-request block, lock, audit, and notification behavior.

QA/QC: cover helper behavior with node tests, cover payroll static coupling, cover the migration sentinel removal, then run targeted web tests plus repo gates. No production migration apply in this task.

Second opinion fallback: no independent second runtime was invoked in this Codex-only session. Self-review challenge focused on payroll overpay risk, stale `annual_leave_entitlements` reads, and RPC privilege preservation.
