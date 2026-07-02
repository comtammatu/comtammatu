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
    /DrawerContent[\s\S]*className="mx-auto flex max-h-dvh-80 w-full max-w-md flex-col overflow-hidden sm:max-w-lg"/,
  );
  assert.match(source, /DrawerHeader className="shrink-0"/);
  assert.match(
    source,
    /ScrollArea[\s\S]*className="min-h-0 flex-1 px-4"/,
  );
  assert.match(source, /data-vaul-no-drag/);
  assert.match(
    source,
    /DrawerFooter[\s\S]*className="pos-safe-bottom shrink-0"/,
  );
});
