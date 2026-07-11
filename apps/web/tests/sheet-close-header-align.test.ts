import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  join(
    process.cwd(),
    "../../packages/ui/src/components/sheet.tsx",
  ),
  "utf8",
);

test("SheetHeader reserves close padding only when the absolute close is shown", () => {
  assert.match(source, /data-close-button=\{showCloseButton \? "true" : "false"\}/);
  assert.match(source, /group\/sheet/);
  assert.match(
    source,
    /group-data-\[close-button=true\]\/sheet:pr-16/,
  );
  assert.doesNotMatch(
    source,
    /px-3 py-2\.5 pr-16 text-left sm:px-4 sm:pr-16/,
  );
});

test("Sheet absolute close uses notch inset without chrome-safe-top floor", () => {
  assert.match(
    source,
    /className="absolute top-\[env\(safe-area-inset-top,0px\)\] right-2"/,
  );
  assert.doesNotMatch(source, /chrome-safe-top/);
});
