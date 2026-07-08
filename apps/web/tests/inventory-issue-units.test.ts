import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatIssueMaxEntryQuantity,
  getIssueBaseQuantity,
  getIssueMaxEntryQuantity,
} from "../app/(protected)/inventory/_lib/issue-units";

test("issue unit conversion snaps reciprocal rounding drift near integers", () => {
  const portionUnit = { toBaseFactor: 0.019230769 };

  assert.equal(getIssueBaseQuantity(52, portionUnit), 1);
  assert.equal(getIssueMaxEntryQuantity(1, portionUnit), 52);
  assert.equal(formatIssueMaxEntryQuantity(52.0000014), "52");
});

test("issue unit max formatting snaps rounded reciprocal underflow", () => {
  assert.equal(formatIssueMaxEntryQuantity(6.999999986), "7");
});

test("issue unit max formatting preserves real fractional quantities", () => {
  assert.equal(formatIssueMaxEntryQuantity(6.998), "6.998");
});
