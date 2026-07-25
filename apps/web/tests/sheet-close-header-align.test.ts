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

test("Sheet side sizes keep a full mobile width with explicit compact desktop mode", () => {
  assert.match(source, /size = "lg"/);
  assert.match(source, /size\?: "md" \| "lg"/);
  assert.match(source, /data-size=\{size\}/);
  assert.match(source, /data-\[side=right\]:sm:max-w-md/);
  assert.match(source, /data-\[side=right\]:w-full/);
});

test("Sheet fullscreen mode removes the default 95dvh cap", () => {
  assert.match(source, /fullscreen = false/);
  assert.match(source, /fullscreen\?: boolean/);
  assert.match(
    source,
    /fullscreen\s+\? "data-\[side=bottom\]:h-dvh data-\[side=bottom\]:max-h-dvh/,
  );
  assert.match(
    source,
    /: "data-\[side=bottom\]:h-auto data-\[side=bottom\]:max-h-dvh-95/,
  );
});

test("compact right-sheet workflows use the shared size contract", () => {
  for (const path of [
    "app/(protected)/br/[branchId]/pos/order-detail-sheet.tsx",
    "app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx",
    "app/(protected)/br/[branchId]/pos/_components/order-detail/discount-sheet.tsx",
    "app/(protected)/br/[branchId]/pos/_components/order-detail/merge-orders-sheet.tsx",
    "app/(protected)/br/[branchId]/pos/_components/order-detail/service-charge-sheet.tsx",
    "app/(protected)/br/[branchId]/pos/_components/order-detail/split-order-sheet.tsx",
    "lib/staff-runtime/count/count-client.tsx",
  ]) {
    const workflow = readFileSync(join(process.cwd(), path), "utf8");
    assert.match(
      workflow,
      /<SheetContent(?=[^>]*side="right")(?=[^>]*size="md")[^>]*>/,
    );
    assert.doesNotMatch(workflow, /data-\[side=right\]:sm:max-w-md/);
  }
});
