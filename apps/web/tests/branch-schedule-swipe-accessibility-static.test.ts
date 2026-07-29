import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("shift schedule keeps one aligned calendar wider than narrow phone viewports", () => {
  const source = read("lib/staff-runtime/schedule/schedule-client.tsx");

  assert.equal(
    source.match(/overflow-x-auto overscroll-x-contain/g)?.length,
    2,
  );
  assert.equal(source.match(/min-w-\[28rem\] overflow-hidden/g)?.length, 2);
  assert.match(
    source,
    /<Button\s+type="button"\s+variant="ghost"\s+size="touch"[\s\S]*?aria-pressed=\{selected\}/,
  );
});

test("covered swipe actions stay inert until their row is revealed", () => {
  const hook = read("lib/hooks/use-swipe-reveal.ts");
  const menuLimits = read(
    "app/(protected)/br/[branchId]/(operator)/menu-limits/menu-limits-table.tsx",
  );
  const checkoutApprovals = read(
    "lib/staff-runtime/checkout-approvals/checkout-approvals-client.tsx",
  );
  const approvalRow = checkoutApprovals.split(
    "export function CheckoutApprovalsClient",
  )[0];

  assert.match(hook, /actionRegionProps: \(key: string\)/);
  assert.match(hook, /const hidden = revealedKey !== key/);
  assert.match(hook, /"aria-hidden": hidden,\s*inert: hidden/);

  assert.match(menuLimits, /\.\.\.swipe\.actionRegionProps\(rowId\)/);
  assert.match(menuLimits, /size="icon-touch"/);
  assert.match(
    menuLimits,
    /aria-label=\{[\s\S]*?Bật món \$\{row\.item_name\}[\s\S]*?disableItemAria\(row\.item_name\)/,
  );

  assert.match(
    checkoutApprovals,
    /\.\.\.swipe\.actionRegionProps\(String\(item\.id\)\)/,
  );
  assert.equal(approvalRow?.match(/size="touch"/g)?.length, 2);
});

test("checkout approval details keep one scroll body and semantic checklist roles", () => {
  const source = read(
    "lib/staff-runtime/checkout-approvals/checkout-approvals-client.tsx",
  );

  assert.match(
    source,
    /<DrawerContent className="flex max-h-dvh-80 flex-col overflow-hidden">/,
  );
  assert.match(source, /className="min-h-0 flex-1 overflow-y-auto px-4"/);
  assert.match(
    source,
    /<SectionLabel as="h3">Việc trong ca<\/SectionLabel>/,
  );
  assert.match(source, /<ItemGroup className="gap-2">/);
  assert.match(source, /role="listitem"/);
  assert.doesNotMatch(source, /<ScrollArea[^>]*maxHeight/);
});
