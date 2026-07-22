import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const operationsSource = readFileSync(
  "app/(protected)/inventory/operations/page.tsx",
  "utf8",
);
const consumptionSource = readFileSync(
  "app/(protected)/inventory/consumption/page.tsx",
  "utf8",
);
const issuesSource = readFileSync(
  "app/(protected)/inventory/issues/page.tsx",
  "utf8",
);

test("consumption combines operational usage and waste while keeping issue details", () => {
  assert.match(
    consumptionSource,
    /scope="all"[\s\S]*listBasePath="\/inventory\/consumption"[\s\S]*detailBasePath="\/inventory\/issues"/,
  );
  assert.match(operationsSource, /tab === "consumption" \|\| tab === "issues"/);
  assert.match(issuesSource, /`\/inventory\/consumption\?\$\{query\}`/);
});
