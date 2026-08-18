import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  join(process.cwd(), "app/(protected)/inventory/production/[id]/production-detail-client.tsx"),
  "utf8",
);

test("production detail confirms cancellation and keeps state-specific actions", () => {
  assert.match(source, /const accepted = await confirm\(\{/);
  assert.match(source, /variant: "destructive"/);
  assert.match(source, /run\.status === "draft"/);
  assert.match(source, /run\.status === "in_progress"/);
  assert.match(source, /completeProductionRun/);
  assert.match(source, /actualIngredients: actualRows/);
  assert.match(source, /detailCopy\.shipToBranchAction/);
  assert.match(source, /\/inventory\/transfers\/new\?branch=/);
  assert.doesNotMatch(source, /<ScrollArea className="h-72">/);
});
