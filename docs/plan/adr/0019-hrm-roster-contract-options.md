# ADR 0019 — HRM roster and contract options

**Status:** Accepted (2026-08-01, owner approval). Amended 2026-08-01 for
hard-require clock-in and hour-ratio `công` (owner decisions 1B + Payroll B).
**Items 1 and 3 further amended by ADR 0036** (multi-shift roster,
`wage_unit`, UI SSOT) — **Accepted** 2026-08-12.

## Context

The active decisions previously prohibited rostering and kept attendance
shift-based. The repository also had unresolved proposals for contract revision
history, probation semantics, and payroll treatment when a contract changes
mid-period. Those proposals would alter D012, D026, and D027. With owner
approval on 2026-08-01, the roster boundary and contract/probation semantics
are now authorized. A later owner decision the same day upgraded rostering from
optional soft-prefer to hard-require for clock-in, and replaced flat 0.5 `công`
per completed shift with hour-ratio credit inside the assigned shift window.

## Decision

1. **Rostering = required for clock-in.** Weekly `shift_assignments` assigns an
   employee to one shift per `work_date`. Clock-in must resolve an assignment
   for the actor at Vietnam-local time; wall-clock default-shift fallback is
   removed for punch. Missing assignment rejects clock-in.
2. **Reverse the rostering clause of D012.** The "no rostering" clause is
   lifted. The remaining D012 prohibitions stay: no auto-late, no auto-absent,
   no leave-balance enforcement, no multi-tier approval.
3. **Amend D026 / D027 for `công` and fixed_monthly.** Attendance unit remains
   SHIFT. Attendance credit (`công`) for a completed shift (has `check_out` / `kết ca`) is
   `min(1.0, round_1dp(|(check_in, check_out) ∩ scheduled_window| / scheduled_len))`
   using the shift window frozen onto the attendance row at clock-in. Both
   `attendance_prorated` and `fixed_monthly` use `working_days` from that
   formula. `fixed_monthly` payable days:
   `min(standard_days, working_days + paid_leave_days)` — do not also auto-deduct
   unpaid leave that is already absent from `working_days`. Manual adjustments
   remain. D027 no longer uses flat 0.5 `công` per completed shift.
4. **Contract revisions are append-only.** A revision creates a new
   `employment_contracts` row and marks the previous one `expired`; history
   begins at the migration — do not synthesize rows overwritten by the legacy
   in-place upsert. Compensation amendments are separated from contract
   sequence (a salary change is not a new contract and does not increment
   `contract_sequence`). A third consecutive fixed-term warning counts two
   preceding consecutive fixed-term contracts (excluding probation/amendment)
   and is a soft warning, not a block. A contract that reaches `end_date`
   untouched transitions to `expired` via a natural-expiry handler.
5. **Probation semantics follow `docs/ref/labor-contracts.md`.** 85% of the
   official salary is a minimum, not a universal rate. BHXH is excluded only
   when probation is a separate probation contract; probation as a clause
   inside an HĐLĐ remains insured. HR selects `probation_arrangement`,
   `probation_end_date`, and `probation_salary` explicitly; it is not inferred
   from the application role.
6. **Payroll V1 mid-month contract selection.** Payroll evaluates base
   compensation using the contract active at the period-end/snapshot date; no
   mid-period proration of contract changes. Attendance `công` proration above
   is separate.

## Consequences

- D012 rostering clause remains reversed; hard-require punch is in force.
- D026/D027 attendance and fixed_monthly semantics follow Decision 3.
- Regression guard `D012-rostering` = "rostering required for clock-in".
- Writers use `hr:assign_shift`. BM assigns own branch; Owner assigns all sites
  including office (`branch_id` null).
- Payroll guards (`PAYROLL-CALCULATE-MUST-BE-ATOMIC-RPC`,
  `PAYROLL-PRORATION-CAP-AT-STANDARD`, `PAYROLL-2026-FIVE-BRACKET-AND-BHXH-CAP-STEP`,
  `ATTENDANCE-INSERT-SERVICE-ROLE-ONLY`) remain; `công` source changes to
  hour-ratio on frozen windows.

## Canonical

- `docs/ref/labor-contracts.md`, `docs/ref/payroll-pit.md`
- `tasks/todo.md` → roster + payroll `công` outcomes
