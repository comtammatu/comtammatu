import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  join(import.meta.dirname, "../app/(protected)/hr/employee-table.tsx"),
  "utf8",
);
const clientSource = readFileSync(
  join(import.meta.dirname, "../app/(protected)/hr/hr-client.tsx"),
  "utf8",
);
const messages = readFileSync(
  join(import.meta.dirname, "../lib/messages/hr.ts"),
  "utf8",
);

test("employee list hides suspended staff until explicitly shown", () => {
  assert.match(
    source,
    /const \[showInactive, setShowInactive\] = useState\(false\)/,
  );
  assert.match(source, /showInactive \|\| employee\.is_active/);
  assert.match(source, /<AppToolbar[\s\S]*filters=\{/);
  assert.doesNotMatch(source.slice(source.indexOf("<DataTable")), /\bfilters=/);
  assert.match(source, /setShowInactive\(\(current\) => !current\)/);
  assert.match(source, /const \[branchFilter, setBranchFilter\]/);
  assert.match(source, /const \[positionFilter, setPositionFilter\]/);
  assert.match(source, /const \[salaryFilter, setSalaryFilter\]/);
  assert.match(source, /const \[contractTypeFilter, setContractTypeFilter\]/);
  assert.match(source, /matchesBranch/);
  assert.match(source, /matchesPosition/);
  assert.match(source, /matchesSalary/);
  assert.match(source, /matchesContractType/);
});

test("employee list uses table columns for ordinal, salary, and contract type", () => {
  assert.match(source, /key: "index"/);
  assert.match(source, /header: "#"/);
  assert.match(source, /\{index \+ 1\}/);
  assert.match(source, /key: "salary"/);
  assert.match(source, /key: "contractType"/);
  assert.match(source, /formatVND\(amount\)/);
  assert.match(source, /CONTRACT_TYPE_OPTIONS\.find/);
  assert.match(source, /<DataTable/);
  assert.match(source, /mobileCardRender=\{\(employee, index\) =>/);
});

test("employee list uses the same card surface as payroll tables", () => {
  assert.doesNotMatch(clientSource, /AppSection/);
  assert.match(source, /<AppToolbar/);
  assert.match(source, /<AppSection contentFlush contentScroll>/);
  assert.match(clientSource, /<EmployeeTable/);
});

test("employee labels describe values instead of a salary source", () => {
  assert.match(messages, /salary: "Lương"/);
  assert.match(messages, /contractType: "Loại HĐ"/);
  assert.doesNotMatch(messages, /salarySource:/);
});
