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
const transferActions = read(
  "apps/web/app/(protected)/inventory/transfer-actions.ts",
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

test("cross-site transfer creation resolves remote warehouses without widening RLS", () => {
  const createStart = transferActions.indexOf(
    "export async function createStockTransfer",
  );
  assert.ok(createStart >= 0, "createStockTransfer not found");
  const createBody = transferActions.slice(
    createStart,
    transferActions.indexOf("export async function transferConfirmShip", createStart),
  );

  assert.match(transferActions, /supabase\/service/);
  assert.match(
    createBody,
    /supabase\.rpc\(\s*"stock_transfer_list_branches"[\s\S]*const locationClient = createServiceClient\(\)/,
    "privileged reads must use branch ids re-derived from the authorized RPC",
  );
  assert.match(createBody, /const locationClient = createServiceClient\(\)/);
  assert.match(
    createBody,
    /resolveDefaultInventoryLocation\(\s*locationClient,[\s\S]*?toBranch\.id,[\s\S]*?"receive"/,
  );
  assert.match(
    createBody,
    /locationClient\s*\.from\("inventory_locations"\)/,
  );
  assert.match(
    createBody,
    /supabase\.rpc\("create_stock_transfer_draft"/,
    "the authenticated RPC must remain the final authorization boundary",
  );
});
