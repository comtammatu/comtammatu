# ADR 0019 — HRM roster and contract options

**Status:** Parked

## Context

The active decisions still prohibit rostering and keep attendance shift-based.
The repository also has unresolved proposals for contract revision history,
probation semantics, and payroll treatment when a contract changes mid-period.
Those proposals would alter D012, D026, and D027 and are not implementation
authority while owner approval is unresolved.

## Parked option

- Add an optional weekly `shift_assignments` overlay while retaining the current
  wall-clock shift resolver when no assignment exists.
- Keep clock-in outside an assignment allowed until operational evidence
  justifies a separate mandatory-assignment policy.
- Make contract revisions append-only, distinguish contract sequence from
  compensation changes, and record probation arrangement explicitly.
- Select payroll compensation from the contract active at the period-end
  snapshot; mid-period proration remains a separate decision.

## Revisit trigger

Reopen only after the owner explicitly approves the roster boundary and the
contract/probation semantics, and a fresh CodeGraph/source audit confirms the
current attendance, payroll, contract, and employee-provisioning flows.

## Consequences

- D012, D026, and D027 remain unchanged.
- Rostering implementation is not authorized by this ADR.
- Confirmed HR correctness defects may proceed independently under current
  attendance, payroll, security, and legal contracts.
