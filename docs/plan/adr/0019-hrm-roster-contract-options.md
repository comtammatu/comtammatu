# ADR 0019 — HRM roster and contract options

**Status:** Accepted (2026-08-01, owner approval). Previously Parked.

## Context

The active decisions previously prohibited rostering and kept attendance
shift-based. The repository also had unresolved proposals for contract revision
history, probation semantics, and payroll treatment when a contract changes
mid-period. Those proposals would alter D012, D026, and D027. With owner
approval on 2026-08-01, the roster boundary and contract/probation semantics
are now authorized. Remaining HRM finding revalidation lives in
`tasks/todo.md` under the HR domain-integrity outcome.

## Decision

1. **Rostering = optional overlay.** Add a weekly `shift_assignments` overlay so
   an owner/manager can assign an employee to a shift ahead of time; clock-in
   prefers an assigned shift. When no assignment exists, the current wall-clock
   `default-shift` resolver remains the fallback. Mandatory-reject of clock-in
   outside an assignment is a separate policy switch, deferred until operational
   evidence justifies it.
2. **Reverse the rostering clause of D012.** The "no rostering" clause is
   lifted. The remaining D012 prohibitions stay: no auto-late, no auto-absent,
   no leave-balance enforcement, no multi-tier approval.
3. **Amend D026 IA and D027** where they restate no-rostering: the optional
   overlay is now permitted. D027 (attendance unit = SHIFT, 0.5 công per
   completed credited shift) is unchanged.
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
   mid-period proration. Proration is a Payroll V2 decision.

## Consequences

- D012 rostering clause is reversed; D026 IA and D027 no-rostering restatements
  are amended. All other D012/D026/D027 clauses remain in force.
- Rostering overlay and contract history/terminate/probation work are now
  authorized; deliver them as bounded outcomes in `tasks/todo.md`.
- Regression guard `D012-rostering` flips to "rostering overlay optional".
  Payroll guards (`PAYROLL-CALCULATE-MUST-BE-ATOMIC-RPC`,
  `PAYROLL-PRORATION-CAP-AT-STANDARD`, `PAYROLL-2026-FIVE-BRACKET-AND-BHXH-CAP-STEP`,
  `ATTENDANCE-INSERT-SERVICE-ROLE-ONLY`) are unchanged.

## Canonical

- `docs/ref/labor-contracts.md`, `docs/ref/payroll-pit.md`
- `tasks/todo.md` → HR domain-integrity outcome for remaining finding routing
