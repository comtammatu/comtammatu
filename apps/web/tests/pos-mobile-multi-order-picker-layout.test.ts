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
    /contentClassName="mx-auto flex max-h-dvh-80 w-full max-w-md flex-col overflow-hidden sm:max-w-lg"/,
  );
  assert.match(source, /<AppDrawer/);
  assert.doesNotMatch(source, /data-vaul-no-drag/);
  assert.match(
    source,
    /footerClassName="pos-safe-bottom shrink-0"/,
  );
});
