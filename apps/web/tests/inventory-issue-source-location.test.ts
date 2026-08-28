import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  selectIssueSourceLocation,
  type IssueSourceLocationCandidate,
} from "../app/(protected)/inventory/_lib/issue-source-location";

function location(
  id: number,
  defaults: Partial<Omit<IssueSourceLocationCandidate, "id">> = {},
): IssueSourceLocationCandidate {
  return {
    id,
    is_default_issue: false,
    is_default_consumption: false,
    ...defaults,
  };
}

describe("selectIssueSourceLocation", () => {
  test("fails closed when a branch has no warehouse", () => {
    assert.deepEqual(selectIssueSourceLocation([]), {
      ok: false,
      reason: "location_not_configured",
    });
  });

  test("selects the sole active warehouse without relying on a default id", () => {
    assert.deepEqual(selectIssueSourceLocation([location(47)]), {
      ok: true,
      locationId: 47,
    });
  });

  test("prefers the consumption default when multiple warehouses are active", () => {
    assert.deepEqual(
      selectIssueSourceLocation([
        location(47, { is_default_issue: true }),
        location(91, { is_default_consumption: true }),
      ]),
      { ok: true, locationId: 91 },
    );
  });

  test("falls back to the issue default", () => {
    assert.deepEqual(
      selectIssueSourceLocation([
        location(47),
        location(91, { is_default_issue: true }),
      ]),
      { ok: true, locationId: 91 },
    );
  });

  test("fails closed when multiple warehouses have no unique default", () => {
    assert.deepEqual(
      selectIssueSourceLocation([location(47), location(91)]),
      { ok: false, reason: "location_ambiguous" },
    );
  });
});
