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

test("consumption combines operational usage and waste while keeping issue details", () => {
  assert.equal(
    existsSync("app/(protected)/inventory/operations/page.tsx"),
    false,
  );
  assert.match(
    consumptionSource,
    /scope="all"[\s\S]*listBasePath="\/inventory\/consumption"[\s\S]*detailBasePath="\/inventory\/consumption"/,
  );
  assert.match(issuesSource, /redirect\([\s\S]*\/inventory\/consumption/);
});
