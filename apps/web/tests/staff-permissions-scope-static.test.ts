import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const CLIENT_SOURCE = readFileSync(
  new URL(
    "../app/(protected)/hr/staff/[id]/permissions/permissions-client.tsx",
    import.meta.url,
  ),
  "utf8",
);

const ACTION_SOURCE = readFileSync(
  new URL(
    "../app/(protected)/hr/staff/[id]/permissions/actions.ts",
    import.meta.url,
  ),
  "utf8",
);

test("staff permission UI can submit tenant-wide grants", () => {
  assert.match(CLIENT_SOURCE, /TENANT_SCOPE_VALUE = "__tenant__"/);
  assert.match(CLIENT_SOURCE, /branchIdFromValue/);
  assert.match(
    CLIENT_SOURCE,
    /\{ value: TENANT_SCOPE_VALUE, label: copy\.tenantWide \}/,
  );
  assert.match(CLIENT_SOURCE, /branch_id: branchIdFromValue\(values\.scope\)/);
  assert.match(CLIENT_SOURCE, /branch_id: branchIdFromValue\(templateBranch\)/);
});

test("staff permission actions do not reject null branch before RPC scope checks", () => {
  assert.doesNotMatch(ACTION_SOURCE, /parsed\.data\.branch_id === null/);
  assert.match(ACTION_SOURCE, /permission_scope_requires_branch/);
  assert.match(ACTION_SOURCE, /permission_scope_requires_tenant/);
});
