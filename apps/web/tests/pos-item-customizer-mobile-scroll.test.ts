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
  assert.match(
    source,
    /SheetContent[\s\S]*className="h-dvh max-h-dvh overflow-hidden p-0 data-\[side=bottom\]:h-dvh data-\[side=bottom\]:max-h-dvh"/,
  );
  assert.match(
    source,
    /div className="flex h-full min-h-0 flex-col overflow-hidden"/,
  );
  assert.match(source, /SheetHeader className="shrink-0"/);
  assert.match(
    source,
    /div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4"/,
  );
  assert.doesNotMatch(source, /ScrollArea/);

  const scrollBodyIndex = source.indexOf(
    'className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4"',
  );
  const footerIndex = source.indexOf(
    'SheetFooter className="shrink-0 flex-row items-center justify-between gap-3 pos-safe-bottom sm:flex-row"',
  );
  assert.ok(scrollBodyIndex > 0, "scroll body present");
  assert.ok(footerIndex > scrollBodyIndex, "SheetFooter follows scroll body");
  assert.match(source, /onClick=\{handleConfirm\}/);
  assert.ok(
    source.indexOf("onClick={handleConfirm}") > footerIndex,
    "confirm CTA lives inside pinned SheetFooter",
  );
});
