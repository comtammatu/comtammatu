import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  join(process.cwd(), "app/_components/responsive-toaster.tsx"),
  "utf8",
);

const compactBranchStart = source.indexOf("if (compactOperationalToaster) {");
const compactBranchEnd = source.indexOf(
  "  }\n\n  return (",
  compactBranchStart,
);
const compactBranch =
  compactBranchStart >= 0 && compactBranchEnd > compactBranchStart
    ? source.slice(compactBranchStart, compactBranchEnd)
    : "";

test("POS and KDS routes use the compact operational toaster preset", () => {
  assert.ok(
    source.includes(
      String.raw`const OPERATIONAL_TOAST_ROUTE_PATTERN = /^\/br\/[^/]+\/(?:pos|kds)(?:\/|$)/;`,
    ),
  );
  assert.match(source, /isMobile \|\| isOperationalToastRoute\(pathname\)/);
  assert.match(compactBranch, /position="top-center"/);
  assert.match(compactBranch, /visibleToasts=\{3\}/);
  assert.match(compactBranch, /closeButton/);
  assert.match(compactBranch, /expand=\{false\}/);
  assert.match(compactBranch, /offset=\{COMPACT_TOAST_OFFSET\}/);
  assert.match(compactBranch, /mobileOffset=\{COMPACT_TOAST_OFFSET\}/);
});

test("non-operational desktop routes keep the desktop toaster preset", () => {
  assert.match(source, /position="top-right"/);
  assert.match(source, /visibleToasts=\{5\}/);
  assert.ok(source.includes("\n      expand\n"));
});
