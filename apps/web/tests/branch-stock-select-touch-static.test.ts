import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const stockSelectOwners = [
  "app/(protected)/br/[branchId]/(operator)/stock/consumption/branch-consumption-list-client.tsx",
  "app/(protected)/br/[branchId]/(operator)/stock/count-assignments/branch-count-assignments-client.tsx",
  "app/(protected)/br/[branchId]/(operator)/stock/grn/_components/grn-line-sheet.tsx",
  "app/(protected)/br/[branchId]/(operator)/stock/grn/branch-grn-list-client.tsx",
  "app/(protected)/br/[branchId]/(operator)/stock/grn/new/[supplierId]/branch-grn-create-client.tsx",
  "app/(protected)/br/[branchId]/(operator)/stock/issues/[id]/branch-stock-issue-detail-client.tsx",
  "app/(protected)/br/[branchId]/(operator)/stock/issues/branch-stock-issues-list-client.tsx",
  "app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx",
  "app/(protected)/br/[branchId]/(operator)/stock/stocktake/branch-stocktake-list-client.tsx",
  "app/(protected)/inventory/waste/waste-operational-form.tsx",
  "lib/staff-runtime/count/count-client.tsx",
] as const;

const selectTagPattern = /<(SelectTrigger|SelectItem)\b[\s\S]*?>/g;

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

test("Branch stock Select triggers and popup items use the named touch size", () => {
  for (const file of stockSelectOwners) {
    const tags = Array.from(read(file).matchAll(selectTagPattern));
    const tagNames = new Set(tags.map((match) => match[1]));

    assert.ok(tagNames.has("SelectTrigger"), `${file}: missing SelectTrigger`);
    assert.ok(tagNames.has("SelectItem"), `${file}: missing SelectItem`);

    for (const [tag, tagName] of tags) {
      assert.match(tag, /\bsize="touch"/, `${file}: ${tagName}`);
    }
  }
});
