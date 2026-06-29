import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("root route delegates to Branch Hub instead of rendering another hub", () => {
  const rootPage = read("apps/web/app/page.tsx");

  assert.match(rootPage, /resolvePostLoginRedirect/);
  assert.match(rootPage, /resolveBranchHubContextFromHeaders/);
  assert.doesNotMatch(rootPage, /resolveDiscoveredAppGroups/);
  assert.doesNotMatch(rootPage, /AppLinkCard/);
  assert.doesNotMatch(rootPage, /messages\.appEntry/);
});
