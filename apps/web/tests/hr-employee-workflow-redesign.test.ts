import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const formDialogSource = readFileSync(
  join(import.meta.dirname, "../app/(protected)/hr/employee-form-dialog.tsx"),
  "utf8",
);
const tableSource = readFileSync(
  join(import.meta.dirname, "../app/(protected)/hr/employee-table.tsx"),
  "utf8",
);
const detailSheetSource = readFileSync(
  join(import.meta.dirname, "../app/(protected)/hr/employee-detail-sheet.tsx"),
  "utf8",
);
const offboardingDialogSource = readFileSync(
  join(import.meta.dirname, "../app/(protected)/hr/employee-offboarding-dialog.tsx"),
  "utf8",
);
const actionsSource = readFileSync(
  join(import.meta.dirname, "../app/(protected)/hr/actions.ts"),
  "utf8",
);
const messagesSource = readFileSync(
  join(import.meta.dirname, "../lib/messages/hr.ts"),
  "utf8",
);

test("4-step employee onboarding wizard follows the required operational sequence", () => {
  // Sequence must be: account -> placement -> shift_tasks -> contract
  assert.match(
    formDialogSource,
    /const ONBOARD_STEPS = \[\s*"account",\s*"placement",\s*"shift_tasks",\s*"contract",?\s*\] as const;/,
  );

  // Step 1: Account credentials & identity
  assert.match(formDialogSource, /name="full_name"/);
  assert.match(formDialogSource, /name="email"/);
  assert.match(formDialogSource, /name="password"/);
  assert.match(formDialogSource, /name="phone"/);
  assert.match(formDialogSource, /Gợi ý email theo tên/);
  assert.match(formDialogSource, /Tạo mật khẩu ngẫu nhiên/);

  // Step 2: Placement & Role
  assert.match(formDialogSource, /name="position_code"/);
  assert.match(formDialogSource, /name="branch_id"/);
  assert.match(formDialogSource, /name="employee_code"/);
  assert.match(formDialogSource, /Sinh mã nhân viên tự động/);

  // Step 3: Shift & Tasks Preview
  assert.match(formDialogSource, /name="today_shift_id"/);
  assert.match(formDialogSource, /Việc trong ca theo chức vụ/);

  // Step 4: Compensation presets & Contract
  assert.match(formDialogSource, /Thời vụ \/ Part-time/);
  assert.match(formDialogSource, /Thử việc/);
  assert.match(formDialogSource, /Chính thức \(Full-time\)/);
  assert.match(formDialogSource, /name="wage_unit"/);
  assert.match(formDialogSource, /name="pay_basis"/);
  assert.match(formDialogSource, /name="base_salary"/);
  assert.match(formDialogSource, /name="daily_rate"/);
});

test("employee table integrates Detail Sheet and Offboarding Dialog with onRowClick", () => {
  assert.match(tableSource, /<EmployeeDetailSheet/);
  assert.match(tableSource, /<EmployeeOffboardingDialog/);
  assert.match(tableSource, /onRowClick=\{\(employee\) => setDetailEmployee\(employee\)\}/);
  assert.match(tableSource, /key: "view-detail"/);
  assert.match(tableSource, /key: "offboard"/);
});

test("employee detail sheet exposes 360 overview and security controls", () => {
  // Tabs
  assert.match(detailSheetSource, /activeTab === "profile"/);
  assert.match(detailSheetSource, /activeTab === "tasks"/);
  assert.match(detailSheetSource, /activeTab === "compensation"/);
  assert.match(detailSheetSource, /activeTab === "account"/);

  // Security actions
  assert.match(detailSheetSource, /resetEmployeePassword/);
  assert.match(detailSheetSource, /toggleEmployeeLoginAccess/);
  assert.match(detailSheetSource, /deleteDraftEmployee/);
});

test("employee offboarding dialog captures formal resignation details", () => {
  assert.match(offboardingDialogSource, /offboardEmployee/);
  assert.match(offboardingDialogSource, /name="resignationDate"/);
  assert.match(offboardingDialogSource, /name="reason"/);
  assert.match(offboardingDialogSource, /name="note"/);
});

test("HR backend actions support full lifecycle operations", () => {
  // Actions exist and are exported
  assert.match(actionsSource, /export const createEmployeeAccount/);
  assert.match(actionsSource, /export const offboardEmployee/);
  assert.match(actionsSource, /export const deleteDraftEmployee/);
  assert.match(actionsSource, /export const resetEmployeePassword/);
  assert.match(actionsSource, /export const toggleEmployeeLoginAccess/);

  // createEmployeeAccount auto-assigns initial shift if passed
  assert.match(actionsSource, /todayShiftId/);
  assert.match(actionsSource, /assignEmployeeInitialShift/);

  // deleteDraftEmployee guards against attendance and payroll
  assert.match(actionsSource, /attendance_records/);
  assert.match(actionsSource, /payroll_entries/);
});

test("HR copy messages define Vietnamese labels for new workflows", () => {
  assert.match(messagesSource, /account:\s*\{[\s\S]*title: "Bước 1 · Tài khoản & định danh"/);
  assert.match(messagesSource, /placement:\s*\{[\s\S]*title: "Bước 2 · Vai trò & địa điểm"/);
  assert.match(messagesSource, /shift_tasks:\s*\{[\s\S]*title: "Bước 3 · Ca làm & việc trong ca"/);
  assert.match(messagesSource, /contract:\s*\{[\s\S]*title: "Bước 4 · Chế độ, lương & HĐLĐ"/);
  assert.match(messagesSource, /offboarding:\s*\{/);
  assert.match(messagesSource, /deleteDraft:\s*\{/);
});
