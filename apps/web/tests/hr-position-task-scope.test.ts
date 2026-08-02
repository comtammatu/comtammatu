import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  matchesHrBranchScope,
  resolveHrBranchScope,
} from "../app/lib/hr-scope";
import type { EmployeeSummary } from "../app/(protected)/hr/position-task-types";

const employees: EmployeeSummary[] = [
  {
    id: 1,
    profileId: "hao",
    name: "Hào",
    positionId: 1,
    positionLabel: "Kế toán",
    branchId: null,
    branchName: null,
  },
  {
    id: 2,
    profileId: "hoa",
    name: "Hoa",
    positionId: 2,
    positionLabel: "Bếp trưởng Bếp TT",
    branchId: 2,
    branchName: "Bếp Trung Tâm",
  },
  {
    id: 3,
    profileId: "thuc",
    name: "Thức",
    positionId: 3,
    positionLabel: "Quản lý kho Tổng",
    branchId: 1,
    branchName: "Kho Tổng",
  },
];

test("position-task employee scope follows the Company HR URL scope", () => {
  const namesIn = (scope?: string) =>
    employees
      .filter((employee) =>
        matchesHrBranchScope(employee.branchId, resolveHrBranchScope(scope)),
      )
      .map((employee) => employee.name);

  assert.deepEqual(namesIn("all"), ["Hào", "Hoa", "Thức"]);
  assert.deepEqual(namesIn("office"), ["Hào"]);
  assert.deepEqual(namesIn("2"), ["Hoa"]);
  assert.deepEqual(namesIn("invalid"), ["Hào", "Hoa", "Thức"]);

  const clientSource = readFileSync(
    new URL("../app/(protected)/hr/position-tasks-client.tsx", import.meta.url),
    "utf8",
  );
  assert.match(clientSource, /matchesHrBranchScope/);
  assert.doesNotMatch(clientSource, /key: "branch"/);
});
