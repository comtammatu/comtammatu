import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test("Branch Manager header collapses secondary controls into the existing overflow menu", () => {
  const source = read(
    "app/(protected)/br/[branchId]/(operator)/layout.tsx",
  );

  assert.match(
    source,
    /const usesHeaderOverflow = canOpenOwnerHome \|\| canManageBranch/,
  );
  assert.match(source, /showThemeToggle=\{!usesHeaderOverflow\}/);
  assert.match(source, /\{usesHeaderOverflow \? \([\s\S]*<DropdownMenu>/);
  assert.match(source, /<ThemeMenuItem className="min-h-12 text-sm" \/>/);
  assert.doesNotMatch(source, /canManageBranch && !canOpenOwnerHome/);
});

test("operational overlays keep all exposed controls touch-sized", () => {
  const multiOrderPicker = read(
    "app/(protected)/br/[branchId]/pos/_components/multi-order-table-picker.tsx",
  );
  const sessionHeader = read(
    "app/(protected)/br/[branchId]/pos/pos-session-header.tsx",
  );
  const orderDetail = read(
    "app/(protected)/br/[branchId]/pos/order-detail-sheet.tsx",
  );
  const voidPaidDialog = read(
    "app/(protected)/br/[branchId]/pos/_components/order-detail/void-paid-order-dialog.tsx",
  );
  const kdsHeader = read(
    "app/(protected)/br/[branchId]/kds/_components/board-header.tsx",
  );

  assert.equal(multiOrderPicker.match(/size="touch"/g)?.length, 5);
  assert.doesNotMatch(multiOrderPicker, /<Button[^>]*size="sm"/);
  assert.equal(sessionHeader.match(/min-h-12 text-sm/g)?.length, 4);
  assert.match(orderDetail, /variant="ghost"\s+size="icon-touch"/);
  assert.match(orderDetail, /variant="outline"\s+size="touch"/);
  assert.equal(orderDetail.match(/className="min-h-12 text-sm"/g)?.length, 12);
  assert.match(voidPaidDialog, /SelectTrigger[^>]*className="min-h-12"/);
  assert.match(kdsHeader, /ThemeMenuItem className="min-h-12 text-sm"/);
});

test("POS skeleton and self-order footer follow the runtime breakpoints", () => {
  const posSkeleton = read(
    "app/(protected)/br/[branchId]/pos/pos-page-skeleton.tsx",
  );
  const itemSheet = read("app/q/[token]/self-order/item-sheet.tsx");

  assert.equal(posSkeleton.match(/xl:flex-row/g)?.length, 2);
  assert.equal(posSkeleton.match(/xl:flex xl:flex-col/g)?.length, 2);
  assert.doesNotMatch(posSkeleton, /md:flex(?:-row| md:flex-col)/);
  assert.match(itemSheet, /flex-wrap items-center[^"]*sm:flex-nowrap/);
  assert.match(itemSheet, /className="min-w-0 flex-1 max-sm:basis-full"/);
});
