import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("root route renders the Owner overview", () => {
  const rootPage = read("apps/web/app/page.tsx");
  const overview = read("apps/web/app/_components/owner-overview.tsx");

  assert.match(rootPage, /loadAuthState/);
  assert.match(rootPage, /<OwnerModuleShell[\s\S]*module="owner"/);
  assert.match(rootPage, /<OwnerOverview/);
  assert.match(overview, /<AppPageHeader/);
  assert.match(overview, /<AppSection/);
  assert.match(overview, /<AppLinkCard/);
  assert.doesNotMatch(rootPage, /redirect\(/);
});
