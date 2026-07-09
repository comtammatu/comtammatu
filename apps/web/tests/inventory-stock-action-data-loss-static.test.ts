import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

function sliceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1, end);
  return source.slice(startIndex, endIndex);
}

test("quick stock issue keeps the dialog open when the line save fails", () => {
  const source = read(
    "apps/web/app/(protected)/inventory/stock/quick-stock-issue-dialog.tsx",
  );
  const lineFailureBlock = sliceBetween(
    source,
    "if (!lineRes.success)",
    "\n\n    router.push(`${issueBasePath}/${issueId}`);",
  );

  assert.doesNotMatch(lineFailureBlock, /router\.push/);
  assert.match(
    source,
    /router\.push\(`\$\{issueBasePath\}\/\$\{issueId\}`\);\n {4}return \{ success: true \};/,
  );
});

test("adding a saved GRN line does not refresh away client line state", () => {
  const source = read(
    "apps/web/app/(protected)/inventory/grn/[id]/_hooks/use-grn-line-actions.ts",
  );
  const upsertLocalLineBlock = sliceBetween(
    source,
    "function upsertLocalLine",
    "\n\n  function validateBeforeConfirm",
  );

  assert.match(upsertLocalLineBlock, /setLines\(\(prev\) =>/);
  assert.doesNotMatch(upsertLocalLineBlock, /router\.refresh\(\)/);
});
