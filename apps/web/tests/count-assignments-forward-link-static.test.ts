import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  "app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
  "utf8",
);

test("count assignments links managers into the branch counting surface", () => {
  assert.match(
    source,
    /const href = `\/br\/\$\{branchId\}\/stock\/count`;/,
    "count assignment forward link must stay branch-scoped",
  );
  assert.match(
    source,
    /\?location=\$\{locationId\}/,
    "count assignment forward link must preserve the selected count location",
  );
  assert.doesNotMatch(
    source,
    /\/employee\/count/,
    "manager forward link should not leave the branch operator shell",
  );
});
