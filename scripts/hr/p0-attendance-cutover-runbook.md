# ADR 0036 Phase P0 — Attendance cutover runbook

Run **after** Phase B migration + roster/clock-in deploy.

## 1. Preview dry run

```bash
corepack pnpm tsx scripts/hr/p0-attendance-cutover.ts
```

Confirm row counts match expectation. Resolve draft Aug 2026 payroll periods if any.

## 2. Production apply (owner delegation)

```bash
corepack pnpm tsx scripts/hr/p0-attendance-cutover.ts --apply
```

## 3. HR operations

1. Reconcile August 2026 roster on `/hr/attendance` and branch `/shift/roster`.
2. Notify staff to re-punch from cutover date via `/me/clock`.
3. Verify every closed August row has `scheduled_start_at` + `scheduled_end_at`.

## 4. Verify before Phase C payroll snapshot

| Check | Query / action |
| --- | --- |
| No Aug rows missing frozen window | `SELECT count(*) FROM attendance_records WHERE date BETWEEN '2026-08-01' AND '2026-08-31' AND check_out IS NOT NULL AND (scheduled_start_at IS NULL OR scheduled_end_at IS NULL)` → 0 |
| Calendar sum of work credit = payroll preview | Manual sample of at least 3 employees |
| Block T8 snapshot if fail | Do not close Aug payroll until pass |
