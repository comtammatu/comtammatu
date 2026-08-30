import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getShiftCoverageAlerts,
  getShiftGroup,
  isCashierPosition,
  isGuardPosition,
  isKitchenPosition,
  isWaiterPosition,
  matchesCoverageNeed,
  type RosterEmployee,
  type RosterShift,
} from "../lib/hr/roster/roster-model";

const OP_SHIFT: RosterShift = {
  id: 1,
  name: "Ca Sáng",
  startTime: "06:00:00",
  endTime: "14:00:00",
};

const GUARD_SHIFT: RosterShift = {
  id: 4,
  name: "Ca Bảo vệ Ngày",
  startTime: "06:00:00",
  endTime: "18:00:00",
};

function makeEmp(id: number, fullName: string, positionLabel: string | null): RosterEmployee {
  return {
    employeeId: id,
    fullName,
    employeeCode: `NV${id}`,
    positionLabel,
    startDate: "2026-01-01",
  };
}

test("position check helpers identify standard roles accurately", () => {
  assert.equal(isCashierPosition("Thu ngân"), true);
  assert.equal(isCashierPosition("Thu ngân (kiêm phục vụ)"), true);
  assert.equal(isCashierPosition("Phục vụ"), false);

  assert.equal(isKitchenPosition("Bếp chính"), true);
  assert.equal(isKitchenPosition("Quầy nướng"), true);
  assert.equal(isKitchenPosition("Phụ bếp"), true);
  assert.equal(isKitchenPosition("Bảo vệ"), false);

  assert.equal(isWaiterPosition("Phục vụ"), true);
  assert.equal(isWaiterPosition("Thu ngân (kiêm phục vụ)"), true);
  assert.equal(isWaiterPosition("Tạp vụ"), false);

  assert.equal(isGuardPosition("Bảo vệ"), true);
  assert.equal(isGuardPosition("An ninh"), true);
  assert.equal(isGuardPosition("Thu ngân"), false);
});

test("getShiftGroup distinguishes operations vs guard shifts", () => {
  assert.equal(getShiftGroup(OP_SHIFT), "operations");
  assert.equal(getShiftGroup(GUARD_SHIFT), "guard");
});

test("empty shift returns no coverage alerts (handled by empty state)", () => {
  assert.deepEqual(getShiftCoverageAlerts(OP_SHIFT, []), []);
  assert.deepEqual(getShiftCoverageAlerts(GUARD_SHIFT, []), []);
});

test("operations shift detects missing cashier, kitchen, or waiter", () => {
  const onlyWaiter = [makeEmp(1, "Nguyễn Văn A", "Phục vụ")];
  const alerts1 = getShiftCoverageAlerts(OP_SHIFT, onlyWaiter);
  assert.ok(alerts1.includes("missing_cashier"));
  assert.ok(alerts1.includes("missing_kitchen"));
  assert.ok(!alerts1.includes("missing_waiter"));

  const waiterAndCashier = [
    makeEmp(1, "Nguyễn Văn A", "Phục vụ"),
    makeEmp(2, "Trần Thị B", "Thu ngân"),
  ];
  const alerts2 = getShiftCoverageAlerts(OP_SHIFT, waiterAndCashier);
  assert.ok(!alerts2.includes("missing_cashier"));
  assert.ok(alerts2.includes("missing_kitchen"));
  assert.ok(!alerts2.includes("missing_waiter"));

  const fullyCovered = [
    makeEmp(1, "Nguyễn Văn A", "Phục vụ"),
    makeEmp(2, "Trần Thị B", "Thu ngân"),
    makeEmp(3, "Lê Văn C", "Bếp chính"),
  ];
  const alerts3 = getShiftCoverageAlerts(OP_SHIFT, fullyCovered);
  assert.deepEqual(alerts3, []);
});

test("guard shift detects missing guard position", () => {
  const nonGuard = [makeEmp(1, "Nguyễn Văn A", "Phục vụ")];
  assert.deepEqual(getShiftCoverageAlerts(GUARD_SHIFT, nonGuard), ["missing_guard"]);

  const hasGuard = [makeEmp(2, "Phạm Văn D", "Bảo vệ")];
  assert.deepEqual(getShiftCoverageAlerts(GUARD_SHIFT, hasGuard), []);
});

test("matchesCoverageNeed checks if employee fills an alert", () => {
  assert.equal(matchesCoverageNeed("Thu ngân", ["missing_cashier"]), true);
  assert.equal(matchesCoverageNeed("Phục vụ", ["missing_cashier"]), false);
  assert.equal(matchesCoverageNeed("Quầy nướng", ["missing_kitchen", "missing_cashier"]), true);
  assert.equal(matchesCoverageNeed("Bảo vệ", ["missing_guard"]), true);
  assert.equal(matchesCoverageNeed(null, ["missing_guard"]), false);
});
