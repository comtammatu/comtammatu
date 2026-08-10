import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const issuesClient = readFileSync(
  new URL(
    "../app/(protected)/inventory/issues/issues-client.tsx",
    import.meta.url,
  ),
  "utf8",
);
const issuesPage = readFileSync(
  new URL(
    "../app/(protected)/inventory/issues/issues-page-content.tsx",
    import.meta.url,
  ),
  "utf8",
);
const branchContext = readFileSync(
  new URL("../app/_lib/branch-context.ts", import.meta.url),
  "utf8",
);

test("scope=all write gate disables create without inventing defaultBranchId", () => {
  assert.match(issuesPage, /writeRequiresSitePick=\{scope\.scopeMode === "all"\}/);
  assert.match(issuesClient, /writeRequiresSitePick/);
  assert.match(issuesClient, /disabled/);
  assert.doesNotMatch(
    issuesClient,
    /createHref && defaultBranchId\s*\n?\s*\? `\$\{createHref\}\?branch=\$\{defaultBranchId\}`/,
  );
});

test("mutation-oriented selectBranchScope documents requestAll without null writes", () => {
  assert.match(branchContext, /requestAll/);
  assert.match(branchContext, /scopeMode: "all"/);
  assert.match(branchContext, /selectedBranchId: null/);
});
