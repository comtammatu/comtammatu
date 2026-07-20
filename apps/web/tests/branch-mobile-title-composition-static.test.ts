import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function findTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findTsxFiles(path);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  });
}

test("Branch operator headers hide visually only on mobile when a compact title replaces them", () => {
  const source = read(
    "lib/branch-operator/components/branch-operator-page.tsx",
  );

  assert.match(source, /hideHeaderOnMobile\?: boolean/);
  assert.match(
    source,
    /className=\{hideHeaderOnMobile \? "max-sm:sr-only" : undefined\}/,
  );
  assert.doesNotMatch(source, /className=\{hideHeaderOnMobile \? "hidden"/);
  assert.match(source, /compactOnMobile=\{hideHeaderOnMobile\}/);
});

test("Branch stock pages with an inline mobile title opt into the responsive header contract", () => {
  const stockRoot = join(
    process.cwd(),
    "app/(protected)/br/[branchId]/(operator)/stock",
  );
  const composedPages = findTsxFiles(stockRoot).filter((path) => {
    const source = readFileSync(path, "utf8");
    return (
      source.includes("<BranchOperatorPage") &&
      source.includes("<BranchOperatorControlBar")
    );
  });

  assert.ok(
    composedPages.length >= 17,
    "expected all direct stock compositions",
  );
  for (const path of composedPages) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /<BranchOperatorPage[\s\S]*?hideHeaderOnMobile/, path);
    assert.match(
      source,
      /<BranchOperatorControlBar className="sm:hidden">/,
      path,
    );
  }

  const transferPage = read(
    "app/(protected)/br/[branchId]/(operator)/stock/transfer/[id]/page.tsx",
  );
  const transferClient = read(
    "app/(protected)/br/[branchId]/(operator)/stock/transfer/[id]/branch-transfer-detail-client.tsx",
  );
  assert.match(transferPage, /<BranchOperatorPage[\s\S]*?hideHeaderOnMobile/);
  assert.match(
    transferClient,
    /<BranchOperatorControlBar className="sm:hidden">/,
  );
});
