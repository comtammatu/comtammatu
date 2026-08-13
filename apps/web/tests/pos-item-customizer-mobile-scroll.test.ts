import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/item-customizer.tsx",
  ),
  "utf8",
);

test("POS item customizer pins action footer outside the scroll body", () => {
  assert.match(source, /<StationSheet/);
  assert.match(source, /fullscreen/);
  assert.match(source, /contentClassName="overflow-hidden p-0"/);
  assert.match(source, /footer=\{/);
  assert.doesNotMatch(source, /ScrollArea|<SheetContent\b|<DrawerContent\b/);
  assert.match(source, /onClick=\{handleConfirm\}/);

  const footerIndex = source.indexOf("footer={");
  const confirmIndex = source.indexOf("onClick={handleConfirm}");
  assert.ok(footerIndex > 0, "StationSheet footer present");
  assert.ok(
    confirmIndex > footerIndex,
    "confirm CTA lives inside pinned StationSheet footer",
  );
});
