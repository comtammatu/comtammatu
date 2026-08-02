import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const formSource = readFileSync(
  new URL("../app/(protected)/hr/shift-form-dialog.tsx", import.meta.url),
  "utf8",
);
const tableSource = readFileSync(
  new URL("../app/(protected)/hr/shifts-table.tsx", import.meta.url),
  "utf8",
);
const actionSource = readFileSync(
  new URL("../app/(protected)/hr/actions.ts", import.meta.url),
  "utf8",
);
const taskSource = readFileSync(
  new URL("../app/(protected)/hr/position-tasks-client.tsx", import.meta.url),
  "utf8",
);
const taskTypeSource = readFileSync(
  new URL("../app/(protected)/hr/position-task-types.ts", import.meta.url),
  "utf8",
);

test("shift catalog only configures the shared time frame", () => {
  assert.doesNotMatch(formSource, /operation_role|isOpening|isClosing/);
  assert.doesNotMatch(
    tableSource,
    /setShiftBoundaries|renderBoundaryToggle|ShiftOperationBadge|operation_role/,
  );
  assert.doesNotMatch(actionSource, /data\.isOpening|data\.isClosing/);
});

test("shift tasks apply to every shift and only keep their work phase", () => {
  assert.match(taskSource, /applicability: z\.literal\("every_shift"\)/);
  assert.match(taskSource, /applicability: "every_shift"/);
  assert.doesNotMatch(taskSource, /tasks\.\$\{index\}\.applicability/);
  assert.match(taskSource, /tasks\.\$\{index\}\.phase/);
  assert.match(
    taskTypeSource,
    /POSITION_TASK_APPLICABILITY = \["every_shift"\]/,
  );
  assert.doesNotMatch(taskTypeSource, /"opening"|"closing"/);
});
