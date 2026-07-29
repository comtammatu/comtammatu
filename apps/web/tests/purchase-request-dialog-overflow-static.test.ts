import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("purchase request dialog keeps its actions visible with many lines", () => {
  const source = readFileSync(
    join(
      process.cwd(),
      "app/(protected)/inventory/purchase-requests/purchase-requests-client.tsx",
    ),
    "utf8",
  );
  const dialog = source.match(
    /title=\{copy\.createTitle\}[\s\S]*?<\/AppDialog>/,
  );

  assert.ok(dialog);
  assert.match(
    dialog[0],
    /contentClassName="[^"]*grid-rows-\[auto_minmax\(0,1fr\)_auto\][^"]*"/,
  );
  assert.match(
    dialog[0],
    /bodyClassName="[^"]*min-h-0[^"]*overflow-y-auto[^"]*"/,
  );
});
