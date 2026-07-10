import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  "app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
  "utf8",
);

const branchSource = readFileSync(
  "app/(protected)/br/[branchId]/(operator)/stock/count-assignments/branch-count-assignments-client.tsx",
  "utf8",
);

test("count assignments keep manager follow-up links inside their own plane", () => {
  assert.match(
    branchSource,
    /href=\{`\/br\/\$\{data\.branchId\}\/stock\/count-slips`\}/,
    "branch count assignment follow-up must link to the branch count-slip review surface",
  );
  assert.doesNotMatch(
    branchSource,
    /\/inventory\/count-slips/,
    "branch count assignment follow-up should not leave the branch operator shell",
  );
  assert.doesNotMatch(
    source,
    /`\/br\/\$\{/,
    "office count assignment client should not hardcode branch operator shell paths",
  );
  assert.doesNotMatch(
    source,
    /\/employee\/count/,
    "manager follow-up link should not target the retired employee route family",
  );
});
