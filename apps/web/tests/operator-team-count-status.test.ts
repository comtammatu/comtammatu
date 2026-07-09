import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getEffectiveCountAssignments,
  resolveCountStatusForShift,
  resolveCountStatusFromAnySlip,
  type TeamCountAssignmentRow,
  type TeamCountSlipRow,
} from "../app/(protected)/br/[branchId]/(operator)/team/count-status";

const EVERY_SHIFT: TeamCountAssignmentRow = {
  employee_id: 10,
  location_id: 100,
  ingredient_id: 1000,
  shift_id: null,
};

test("shift-specific count assignment overrides the every-shift cell", () => {
  const assignments: TeamCountAssignmentRow[] = [
    EVERY_SHIFT,
    {
      employee_id: 11,
      location_id: 100,
      ingredient_id: 1000,
      shift_id: 2,
    },
  ];

  assert.deepEqual(getEffectiveCountAssignments(assignments, 10, 1), [
    EVERY_SHIFT,
  ]);
  assert.deepEqual(getEffectiveCountAssignments(assignments, 10, 2), []);
});

test("count slip status is scoped to the displayed shift", () => {
  const assignments: TeamCountAssignmentRow[] = [
    { ...EVERY_SHIFT, shift_id: 1 },
    { ...EVERY_SHIFT, shift_id: 2 },
  ];
  const slips: TeamCountSlipRow[] = [
    {
      employee_id: 10,
      location_id: 100,
      status: "approved",
      shift_id: 1,
    },
  ];

  assert.equal(
    resolveCountStatusForShift(assignments, slips, 10, 1),
    "approved",
  );
  assert.equal(
    resolveCountStatusForShift(assignments, slips, 10, 2),
    "not_submitted",
  );
});

test("slip-only rows do not turn active assignments into shift presence", () => {
  const slips: TeamCountSlipRow[] = [
    {
      employee_id: 10,
      location_id: 100,
      status: "submitted",
      shift_id: 1,
    },
  ];

  assert.equal(resolveCountStatusFromAnySlip(slips, 10), "submitted");
  assert.equal(resolveCountStatusFromAnySlip(slips, 11), "not_assigned");
});
