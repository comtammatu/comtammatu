import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const permissionsSource = read(
  "app/(protected)/hr/staff/[id]/permissions/role-bindings-client.tsx",
);
const auditFiltersSource = read(
  "app/(protected)/hr/staff/audit/permission-audit-filters.tsx",
);
const leaveSource = read("app/(protected)/hr/leave-requests-table.tsx");
const attendanceSource = read("app/(protected)/hr/attendance-table.tsx");

test("HR permission and audit selects expose persistent accessible names", () => {
  assert.match(
    permissionsSource,
    /<SelectField[\s\S]*?name="roleCode"[\s\S]*?label="Vai trò hệ thống"/,
  );
  assert.match(
    permissionsSource,
    /<SelectField[\s\S]*?name="branchId"[\s\S]*?label="Chi nhánh"/,
  );
  assert.match(auditFiltersSource, /const filterIdPrefix = useId\(\)/);
  assert.match(auditFiltersSource, /htmlFor=\{actionFilterId\}/);
  assert.match(auditFiltersSource, /id=\{actionFilterId\}/);
  assert.match(auditFiltersSource, /htmlFor=\{targetFilterId\}/);
  assert.match(auditFiltersSource, /id=\{targetFilterId\}/);
  assert.match(auditFiltersSource, /htmlFor=\{sinceFilterId\}/);
  assert.match(auditFiltersSource, /id=\{sinceFilterId\}/);
  assert.match(
    auditFiltersSource,
    /const controlSize = useFormControlSize\(\)/,
  );
  assert.equal(auditFiltersSource.match(/size=\{controlSize\}/g)?.length, 2);
  assert.match(auditFiltersSource, /controlSize=\{controlSize\}/);
  assert.equal(auditFiltersSource.match(/size=\{optionSize\}/g)?.length, 4);
  assert.equal(auditFiltersSource.match(/size=\{actionSize\}/g)?.length, 2);
});

test("leave approvals use touch icon actions only in the mobile card", () => {
  assert.equal(
    leaveSource.match(/size=\{touch \? "icon-touch" : "icon-sm"\}/g)?.length,
    2,
  );
  assert.match(leaveSource, /renderPendingActions\(request, true\)/);
  assert.match(leaveSource, /<ItemActions className="basis-full justify-end">/);
  assert.match(
    leaveSource,
    /render: \(request\) => renderPendingActions\(request\)/,
  );
});

test("attendance mobile actions and force-close footer use named touch variants", () => {
  assert.match(attendanceSource, /const isTouchLayout = useIsMobile\(1024\)/);
  assert.equal(
    attendanceSource.match(/size=\{touch \? "touch" : "sm"\}/g)?.length,
    4,
  );
  assert.match(attendanceSource, /photoAction\(record, true\)/);
  assert.match(attendanceSource, /forceCloseAction\(record, true\)/);
  assert.match(attendanceSource, /<ChecklistProgressButton[\s\S]*?touch/);
  assert.match(attendanceSource, /footerClassName="pt-4"/);
  assert.match(attendanceSource, /form=\{forceCloseFormId\}/);
  assert.equal(
    attendanceSource.match(/size=\{isTouchLayout \? "touch" : "default"\}/g)
      ?.length,
    2,
  );
  assert.doesNotMatch(
    attendanceSource,
    /<div className="flex justify-end gap-2 pt-4">/,
  );
});
