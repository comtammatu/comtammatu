import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function read(path: string): string {
  return readFileSync(`${root}${path}`, "utf8");
}

const issueActions = read(
  "apps/web/app/(protected)/inventory/issue-actions.ts",
);

test("branch stock issue drafts resolve the warehouse without a location-kind fallback", () => {
  const resolverStart = issueActions.indexOf(
    "async function resolveIssueSourceLocation",
  );
  assert.ok(resolverStart >= 0, "resolveIssueSourceLocation not found");
  const resolverBody = issueActions.slice(
    resolverStart,
    issueActions.indexOf(
      "export async function fetchStockIssues",
      resolverStart,
    ),
  );

  assert.match(resolverBody, /\.eq\("location_kind", "warehouse"\)/);
  assert.match(resolverBody, /\.order\("is_default_issue"/);
  assert.doesNotMatch(
    resolverBody,
    /resolveDefaultInventoryLocation/,
    "all active sites must resolve their invariant warehouse directly",
  );
});
