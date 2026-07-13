import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractClaimsFromAccessToken,
  extractClaimsFromJwtPayload,
} from "../scope";

test("extractClaimsFromJwtPayload normalizes verified hook claims", () => {
  assert.deepEqual(
    extractClaimsFromJwtPayload({
      sub: "00000000-0000-0000-0000-000000000001",
      app_metadata: {
        tenant_id: 7,
        branch_id: 11,
        user_role: "cashier",
        access_bucket: "cashier",
        position: "cashier_server",
        position_code: "cashier_server",
      },
    }),
    {
      tenant_id: 7,
      branch_id: 11,
      user_role: "cashier",
      access_bucket: "cashier",
      position: "cashier_server",
      position_code: "cashier_server",
    },
  );
});

test("extractClaimsFromJwtPayload accepts the app_metadata role fallback", () => {
  assert.deepEqual(
    extractClaimsFromJwtPayload({
      app_metadata: {
        tenant_id: 3,
        branch_id: null,
        role: "owner",
      },
    }),
    {
      tenant_id: 3,
      branch_id: null,
      user_role: "owner",
      access_bucket: undefined,
      position: undefined,
      position_code: undefined,
    },
  );
});

test("claim extraction fails closed for malformed payloads", () => {
  assert.equal(extractClaimsFromJwtPayload(null), null);
  assert.equal(extractClaimsFromJwtPayload([]), null);
  assert.equal(extractClaimsFromJwtPayload({ app_metadata: [] }), null);
  assert.equal(
    extractClaimsFromJwtPayload({ app_metadata: { tenant_id: "7" } }),
    null,
  );
});

test("access-token extraction preserves the canonical payload normalization", () => {
  const payload = Buffer.from(
    JSON.stringify({
      app_metadata: {
        tenant_id: 5,
        branch_id: 2,
        user_role: "branch_manager",
      },
    }),
  ).toString("base64url");

  assert.deepEqual(extractClaimsFromAccessToken(`header.${payload}.signature`), {
    tenant_id: 5,
    branch_id: 2,
    user_role: "branch_manager",
    access_bucket: undefined,
    position: undefined,
    position_code: undefined,
  });
});
