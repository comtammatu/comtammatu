import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const source = readFileSync(
  resolve(repoRoot, "packages/ui/src/components/row-actions-menu.tsx"),
  "utf8",
);
const adapter = readFileSync(
  resolve(repoRoot, "apps/web/app/components/row-actions-menu.tsx"),
  "utf8",
);

test("RowActionsMenu keeps desktop rows compact and touch-triggered rows touch-sized", () => {
  assert.match(
    adapter,
    /from "@comtammatu\/ui\/components\/row-actions-menu"/,
  );
  assert.match(
    source,
    /itemSize\?: ComponentProps<typeof DropdownMenuItem>\["size"\]/,
  );
  assert.match(
    source,
    /triggerSize === "touch" \|\|[\s\S]*triggerSize === "touch-lg" \|\|[\s\S]*triggerSize === "icon-touch"[\s\S]*\? "touch"[\s\S]*: "default"/,
  );
  assert.equal(source.match(/size=\{resolvedItemSize\}/g)?.length, 2);
});
