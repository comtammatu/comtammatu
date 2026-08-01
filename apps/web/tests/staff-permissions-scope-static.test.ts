import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const CLIENT_SOURCE = readFileSync(
  new URL(
    "../app/(protected)/hr/staff/[id]/permissions/role-bindings-client.tsx",
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

test("role binding UI derives scope from the selected role", () => {
  assert.match(CLIENT_SOURCE, /allowedScope === "branch"/);
  assert.match(
    CLIENT_SOURCE,
    /role\.allowedScope === "branch" \? Number\(values\.branchId\) : null/,
  );
  assert.match(CLIENT_SOURCE, /name="branchId"/);
  assert.match(CLIENT_SOURCE, /name="roleCode"/);
});

test("role binding writes require the security capability and RPC", () => {
  assert.match(ACTION_SOURCE, /PERMISSION_KEYS\.AUTH_BINDING_MANAGE/);
  assert.match(ACTION_SOURCE, /"set_auth_role_binding"/);
  assert.doesNotMatch(ACTION_SOURCE, /grant_permission|revoke_permission/);
});
