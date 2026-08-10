import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const consumptionSource = readFileSync(
  "app/(protected)/inventory/consumption/page.tsx",
  "utf8",
);
const issuesSource = readFileSync(
  "app/(protected)/inventory/issues/page.tsx",
  "utf8",
);

test("Owner consumption hub keeps issues as waste-tab redirect", () => {
  assert.equal(
    existsSync("app/(protected)/inventory/operations/page.tsx"),
    false,
  );
  assert.match(
    consumptionSource,
    /scope="hub"[\s\S]*listBasePath="\/inventory\/consumption"[\s\S]*detailBasePath="\/inventory\/consumption"/,
  );
  assert.match(issuesSource, /redirect\([\s\S]*\/inventory\/consumption/);
  assert.match(issuesSource, /qParams\.set\("view", "waste"\)/);
  assert.match(issuesSource, /qParams\.set\("branch", branch\)/);
  assert.doesNotMatch(issuesSource, /branchId/);
});
