import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/_components/multi-order-table-picker.tsx",
  ),
  "utf8",
);

test("mobile multi-order picker keeps its order list scrollable inside the drawer", () => {
  assert.match(
    source,
    /DrawerContent[\s\S]*className="mx-auto w-full max-w-md overflow-hidden sm:max-w-lg"/,
  );
  assert.match(source, /DrawerHeader className="shrink-0"/);
  assert.match(
    source,
    /ScrollArea[\s\S]*className="h-64 min-h-0 overflow-hidden px-4 sm:h-72"/,
  );
  assert.match(source, /data-vaul-no-drag/);
  assert.match(
    source,
    /DrawerFooter[\s\S]*className="pos-safe-bottom shrink-0"/,
  );
});
