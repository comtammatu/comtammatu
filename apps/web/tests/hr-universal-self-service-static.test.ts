import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("universal self-service keeps Owner denied and uses guarded HR RPCs", () => {
  const acl = read("packages/shared/src/auth/module-acl.ts");
  const clock = read("apps/web/lib/staff-runtime/clock/actions.ts");
  const migration = read(
    "supabase/migrations/20260801030457_hr_universal_self_service.sql",
  );

  assert.match(acl, /role === "owner" && moduleKey === "me"/);
  for (const rpc of [
    "self_service_clock_in",
    "self_service_toggle_task",
    "self_service_request_checkout",
    "self_service_cancel_checkout",
  ]) {
    assert.ok(clock.includes(rpc), `missing runtime RPC ${rpc}`);
    assert.ok(migration.includes(rpc), `missing migration RPC ${rpc}`);
  }
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE ON public\.attendance_records FROM anon, authenticated/,
  );
});

test("payroll is contract-based without double unpaid deduction", () => {
  const payroll = read("apps/web/app/(protected)/hr/payroll-actions.ts");
  const migration = read(
    "supabase/migrations/20260801030457_hr_universal_self_service.sql",
  );

  assert.ok(payroll.includes('contract?.pay_basis ?? "attendance_prorated"'));
  assert.ok(payroll.includes("calculatePayableDays"));
  assert.doesNotMatch(payroll, /fixedMonthlyUnpaidLeaveDeduction/);
  assert.match(
    migration,
    /employment_contracts[\s\S]*pay_basis[\s\S]*fixed_monthly/,
  );
  assert.ok(migration.includes("set_payroll_entry_pay_basis"));
  assert.ok(
    migration.includes(
      "NEW.pay_basis := COALESCE(NEW.pay_basis, 'attendance_prorated')",
    ),
  );
  assert.doesNotMatch(
    migration,
    /WHEN v_role = 'accountant' THEN 'fixed_monthly'/,
  );
  assert.doesNotMatch(
    migration,
    /staff_role_from_position_code\(position\.code\) = 'accountant'/,
  );
  assert.doesNotMatch(
    migration,
    /leave not required for central role/,
  );
  assert.match(migration, /\/hr\/attendance\?tab=approvals/);
  assert.doesNotMatch(
    migration,
    /INTO\s+v_record\s*,/,
    "ROWTYPE cannot share an INTO list with scalars (42601)",
  );
});
