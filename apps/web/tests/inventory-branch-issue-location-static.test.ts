import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function read(path: string): string {
  return readFileSync(`${root}${path}`, "utf8");
}

const issueActions = read("apps/web/app/(protected)/inventory/issue-actions.ts");
const migration = read(
  "supabase/migrations/20260709104156_branch_issue_location_to_kitchen.sql",
);

test("branch stock issue drafts prefer kitchen before default issue", () => {
  const resolverStart = issueActions.indexOf(
    "async function resolveIssueSourceLocation",
  );
  assert.ok(resolverStart >= 0, "resolveIssueSourceLocation not found");
  const resolverBody = issueActions.slice(
    resolverStart,
    issueActions.indexOf("export async function fetchStockIssues", resolverStart),
  );

  assert.match(resolverBody, /\.eq\("location_kind", "kitchen"\)/);
  assert.match(resolverBody, /\.order\("is_default_consumption"/);
  assert.ok(
    resolverBody.indexOf('.eq("location_kind", "kitchen")') <
      resolverBody.indexOf('resolveDefaultInventoryLocation('),
    "branch kitchen must be tried before default issue fallback",
  );
});

test("branch stock writers use kitchen/default consumption, not default issue", () => {
  assert.match(
    migration,
    /ORDER BY il\.is_default_consumption DESC, il\.sort_order NULLS LAST, il\.id/,
  );
  assert.match(
    migration,
    /default_consumption_location_missing:branch %; using kitchen location %/,
  );
  assert.match(
    migration,
    /b\.branch_kind = 'branch' AND il\.location_kind = 'kitchen'/,
  );
  assert.match(
    migration,
    /b\.branch_kind IS DISTINCT FROM 'branch' AND il\.is_default_issue = TRUE/,
  );
  assert.match(
    migration,
    /'RAISE WARNING ''default_issue_location_missing:branch %; using warehouse location %''',\s*'RAISE WARNING ''default_consumption_location_missing:branch %; using kitchen location %'''/,
  );
});
