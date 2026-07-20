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
