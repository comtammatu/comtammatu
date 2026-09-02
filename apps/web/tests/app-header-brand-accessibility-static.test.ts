import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

test("compact linked AppHeaderBrand always has an accessible name", () => {
  const source = readFileSync(
    join(root, "app/components/app-header.tsx"),
    "utf8",
  );

  assert.match(source, /import \{ BRAND_NAME, BrandLogoBox, BrandMark \}/);
  assert.match(
    source,
    /const linkAriaLabel = ariaLabel \|\| \(!showText \? BRAND_NAME : undefined\);/,
  );
  assert.match(source, /<Link[\s\S]*aria-label=\{linkAriaLabel\}/);
  assert.doesNotMatch(source, /<Link[\s\S]*aria-label=\{ariaLabel\}/);
});

test("AppHeaderBrand keeps the branch identity readable and touch-safe on narrow screens", () => {
  const source = readFileSync(
    join(root, "app/components/app-header.tsx"),
    "utf8",
  );
  const operatorLayout = readFileSync(
    join(root, "app/(protected)/br/[branchId]/(operator)/layout.tsx"),
    "utf8",
  );

  assert.match(source, /"flex min-h-11 items-center gap-2"/);
  assert.match(
    source,
    /"font-heading line-clamp-2 min-w-0 text-sm font-semibold leading-tight sm:line-clamp-1 sm:text-base"/,
  );
  assert.match(
    operatorLayout,
    /`\$\{APP_COPY_VI\.branchHome\} · \$\{context\.branch\.name\}`/,
  );
});
