import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("AppDetailFooter can expose actions as direct flex children", () => {
  const source = readFileSync(
    "../../packages/ui/src/surface/detail-footer.tsx",
    "utf8",
  );

  assert.match(source, /slotLayout\?: "grouped" \| "direct"/);
  assert.match(source, /slotLayout === "direct"\s*\?\s*\(\s*leading/);
  assert.match(source, /slotLayout === "direct"\s*\?\s*\(\s*trailing/);
});
