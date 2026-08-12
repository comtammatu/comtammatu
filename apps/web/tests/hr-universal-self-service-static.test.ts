import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("canonical self-service uses Control shell and keeps Owner denied", () => {
  const acl = read("packages/shared/src/auth/module-acl.ts");
  const layout = read("apps/web/app/(protected)/me/layout.tsx");
  const protectedLayout = read("apps/web/app/(protected)/layout.tsx");
  const shell = read("apps/web/app/components/control-surface-shell.tsx");
  const appShell = read("apps/web/app/components/app-shell.tsx");
  const clock = read("apps/web/lib/staff-runtime/clock/actions.ts");
  const migration = read(
    "supabase/migration-archive/20260801030457_hr_universal_self_service.sql",
  );

  assert.match(acl, /role === "owner" && moduleKey === "me"/);
  assert.match(protectedLayout, /<ControlSurfaceShell/);
  assert.match(layout, /PwaRuntimeProvider/);
  assert.doesNotMatch(layout, /AppHeader|SELF_NAV|redirect|loadAuthState/);
  assert.match(shell, /ControlSurfaceModuleId[\s\S]*\| "me"/);
  assert.match(shell, /activeModule === "me"/);
  assert.match(protectedLayout, /canonicalizeSelfServicePath\(claims, "\/me"\)/);
  assert.match(shell, /personalHref=\{personalHref\}/);
  assert.doesNotMatch(shell, /personalHref=\{canAccess\(role, "me"\)/);
  assert.match(appShell, /personalHref\?: string/);
  assert.match(appShell, /mobileHeaderTitle\?: string/);
  assert.match(appShell, /copy\.personalPage/);
  assert.match(appShell, /bottomNav && tier1WithBadges\.length > 0/);
  assert.ok(
    appShell.indexOf("render={<Link href={personalHref} />}") <
      appShell.indexOf("<ThemeMenuItem"),
  );
  assert.ok(
    appShell.indexOf("<ThemeMenuItem") <
      appShell.indexOf("<DropdownMenuSeparator />"),
  );
  assert.ok(
    appShell.indexOf("<DropdownMenuSeparator />") <
      appShell.indexOf("copy.signOut"),
  );
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

test("personal workday keeps Branch and Company route families distinct", () => {
  const mePage = read("apps/web/app/(protected)/me/page.tsx");
  const branchPage = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/shift/page.tsx",
  );
  const runtime = read("apps/web/lib/staff-runtime/page.tsx");
  const clockClient = read("apps/web/lib/staff-runtime/clock/clock-client.tsx");

  assert.match(mePage, /href: "\/me\/schedule\/leave"/);
  assert.match(mePage, /href: "\/me\/payslip"/);
  assert.match(
    branchPage,
    /leave: `\/br\/\$\{branchId\}\/shift\/schedule\/leave`/,
  );
  assert.match(branchPage, /payslip: `\/br\/\$\{branchId\}\/profile\/payslip`/);
  assert.doesNotMatch(mePage, /workflowLayout="stepper"/);
  assert.doesNotMatch(mePage, /StaffWorkdayPageContent/);
  assert.match(branchPage, /workflowLayout="stepper"/);
  assert.doesNotMatch(branchPage, /manager-dashboard|redirect\("\/me/);
  for (const label of ["scheduleTitle", "leaveTitle", "payslipTitle"]) {
    assert.ok(runtime.includes(label), `missing personal shortcut ${label}`);
  }
  assert.match(clockClient, /useIsOnline\(\)/);
  assert.match(clockClient, /clockCopy\.offline/);
  assert.doesNotMatch(clockClient, /router\.push\(/);
  assert.match(clockClient, /router\.replace\(/);
});

test("payroll is contract-based without double unpaid deduction", () => {
  const payroll = read("apps/web/app/(protected)/hr/payroll-actions.ts");
  const migration = read(
    "supabase/migration-archive/20260801030457_hr_universal_self_service.sql",
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
  assert.doesNotMatch(migration, /leave not required for central role/);
  assert.match(migration, /\/hr\/attendance\?tab=approvals/);
  assert.doesNotMatch(
    migration,
    /INTO\s+v_record\s*,/,
    "ROWTYPE cannot share an INTO list with scalars (42601)",
  );
});
