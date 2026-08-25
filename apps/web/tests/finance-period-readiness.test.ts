import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePeriodReadinessRpc } from "../app/(protected)/finance/_lib/finance-period-readiness";

const validPayload = {
  period_status: "open",
  valuation_active: true,
  blocker_count: 2,
  warning_count: 1,
  can_close: false,
  blockers: [
    { code: "operating_expense_missing" },
    { code: "negative_stock", branches: [1, 3], count: 5 },
  ],
  warnings: [{ code: "bank_reconciliation_open", count: 4 }],
};

test("period readiness parser accepts a valid object payload", () => {
  const parsed = parsePeriodReadinessRpc(validPayload);
  assert.ok(parsed);
  assert.equal(parsed.periodStatus, "open");
  assert.equal(parsed.valuationActive, true);
  assert.equal(parsed.blockerCount, 2);
  assert.equal(parsed.warningCount, 1);
  assert.equal(parsed.canClose, false);
  assert.deepEqual(
    parsed.blockers.map((finding) => finding.code),
    ["operating_expense_missing", "negative_stock"],
  );
  assert.deepEqual(parsed.blockers[1]?.branches, [1, 3]);
  assert.deepEqual(parsed.blockers[1]?.count, 5);
  assert.deepEqual(parsed.warnings, [{ code: "bank_reconciliation_open", count: 4 }]);
});

test("period readiness parser accepts a JSON string payload", () => {
  const parsed = parsePeriodReadinessRpc(JSON.stringify(validPayload));
  assert.ok(parsed);
  assert.equal(parsed.blockerCount, 2);
  assert.equal(parsed.warningCount, 1);
});

test("period readiness parser accepts whole counts given as strings", () => {
  const parsed = parsePeriodReadinessRpc({
    ...validPayload,
    blocker_count: "3",
    warning_count: "0",
    can_close: true,
  });
  assert.ok(parsed);
  assert.equal(parsed.blockerCount, 3);
  assert.equal(parsed.warningCount, 0);
  assert.equal(parsed.canClose, true);
});

test("period readiness parser rejects null, arrays and malformed strings", () => {
  assert.equal(parsePeriodReadinessRpc(null), null);
  assert.equal(parsePeriodReadinessRpc(undefined), null);
  assert.equal(parsePeriodReadinessRpc([]), null);
  assert.equal(parsePeriodReadinessRpc("not json"), null);
  assert.equal(parsePeriodReadinessRpc(42), null);
});

test("period readiness parser rejects missing or wrong-typed core fields", () => {
  assert.equal(parsePeriodReadinessRpc({}), null);
  assert.equal(
    parsePeriodReadinessRpc({ ...validPayload, period_status: "" }),
    null,
  );
  assert.equal(
    parsePeriodReadinessRpc({ ...validPayload, valuation_active: "yes" }),
    null,
  );
  assert.equal(
    parsePeriodReadinessRpc({ ...validPayload, can_close: 1 }),
    null,
  );
  assert.equal(
    parsePeriodReadinessRpc({ ...validPayload, blocker_count: -1 }),
    null,
  );
  assert.equal(
    parsePeriodReadinessRpc({ ...validPayload, warning_count: 1.5 }),
    null,
  );
  assert.equal(
    parsePeriodReadinessRpc({ ...validPayload, blocker_count: "abc" }),
    null,
  );
});

test("period readiness parser rejects non-array finding lists", () => {
  assert.equal(
    parsePeriodReadinessRpc({ ...validPayload, blockers: "none" }),
    null,
  );
  assert.equal(
    parsePeriodReadinessRpc({ ...validPayload, warnings: { code: "x" } }),
    null,
  );
});

test("period readiness parser skips malformed findings without failing", () => {
  const parsed = parsePeriodReadinessRpc({
    ...validPayload,
    blocker_count: 1,
    blockers: [
      { code: "negative_stock" },
      { code: "" },
      { notACode: true },
      "garbage",
      null,
      { code: "bad_branches", branches: [0] },
      { code: "bad_count", count: "many" },
    ],
  });
  assert.ok(parsed);
  assert.equal(parsed.blockerCount, 1);
  assert.deepEqual(parsed.blockers, [{ code: "negative_stock" }]);
});

test("period readiness parser keeps empty finding lists when sealed clean", () => {
  const parsed = parsePeriodReadinessRpc({
    period_status: "closed",
    valuation_active: true,
    blocker_count: 0,
    warning_count: 0,
    can_close: true,
    blockers: [],
    warnings: [],
  });
  assert.ok(parsed);
  assert.equal(parsed.blockerCount, 0);
  assert.equal(parsed.warningCount, 0);
  assert.deepEqual(parsed.blockers, []);
  assert.deepEqual(parsed.warnings, []);
});
