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
const issueCreateDialog = readFileSync(
  new URL(
    "../app/(protected)/inventory/issues/issue-create-dialog.tsx",
    import.meta.url,
  ),
  "utf8",
);
const branchContext = readFileSync(
  new URL("../app/_lib/branch-context.ts", import.meta.url),
  "utf8",
);

test("scope=all manual consumption requires an explicit branch in the create dialog", () => {
  assert.match(issuesPage, /writeRequiresSitePick=\{scope\.scopeMode === "all"\}/);
  assert.match(issueCreateDialog, /name="branchId"/);
  assert.match(issueCreateDialog, /name="branchId"[\s\S]*required/);
  assert.match(
    issuesClient,
    /resolvedView === "manual"\s*&&\s*allowedCreateIssueTypes\.length > 0\s*\? \(/,
  );
  assert.doesNotMatch(
    issuesClient,
    /resolvedView === "manual"[\s\S]{0,160}!writeRequiresSitePick/,
  );
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
