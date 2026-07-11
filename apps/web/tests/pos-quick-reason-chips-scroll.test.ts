import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  join(
    process.cwd(),
    "app/(protected)/br/[branchId]/pos/_components/quick-reason-chips.tsx",
  ),
  "utf8",
);

test("quick reason chips scroll horizontally in one row", () => {
  assert.match(
    source,
    /no-scrollbar flex flex-nowrap gap-1\.5 overflow-x-auto overscroll-x-contain touch-pan-x/,
  );
  assert.match(source, /className="shrink-0 rounded-full px-3 text-xs font-normal"/);
  assert.doesNotMatch(source, /flex-wrap/);
});
