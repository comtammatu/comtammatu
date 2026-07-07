import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const actionsSource = readFileSync("app/(protected)/inventory/grn-actions.ts", "utf8");
const pageSource = readFileSync(
  "app/(protected)/inventory/grn/[id]/page.tsx",
  "utf8",
);

test("GRN detail load failures render an error state instead of inventory not-found", () => {
  assert.match(actionsSource, /\.maybeSingle\(\)/);
  assert.match(actionsSource, /errorCode: "load_failed"/);
  assert.match(actionsSource, /errorCode: "not_found"/);

  assert.match(pageSource, /notFound: res\.errorCode === "not_found"/);
  assert.match(pageSource, /<GrnDetailLoadError error=\{result\.error\} \/>/);
  assert.match(pageSource, /result\.error && !result\.notFound/);
});
