import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("root route renders the Owner overview", () => {
  const rootPage = read("apps/web/app/page.tsx");
  const overview = read("apps/web/app/_components/owner-overview.tsx");
  const surface = read("apps/web/app/components/surface.tsx");
  const appShell = read("apps/web/app/components/app-shell.tsx");
  const inventoryShell = read(
    "apps/web/app/(protected)/inventory/_components/inventory-shell.tsx",
  );

  assert.match(rootPage, /loadAuthState/);
  assert.match(rootPage, /<OwnerModuleShell[\s\S]*module="owner"/);
  assert.match(rootPage, /<OwnerOverview/);
  assert.match(overview, /<AppPageHeader/);
  assert.match(overview, /<AppSection/);
  assert.equal((overview.match(/headingLevel="h2"/g) ?? []).length, 2);
  assert.match(overview, /<AppLinkCard/);
  assert.match(surface, /focus-within:shadow-effect-card-hover/);
  assert.match(surface, /focus-within:ring-\[3px\] focus-within:ring-foreground/);
  assert.match(surface, /<Link href=\{href\} className="block h-full">/);
  assert.doesNotMatch(appShell, /<header/);
  assert.match(inventoryShell, /sidebarHeaderAccessory=\{branchFilter\}/);
  assert.doesNotMatch(rootPage, /redirect\(/);
});
