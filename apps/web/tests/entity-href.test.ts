import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { JwtClaims, StaffRole } from "@comtammatu/shared/auth";
import {
  normalizeEntityType,
  resolveEntityHref,
} from "@lib/entity-href";
import {
  resolveNotificationActionUrl,
  resolveNotificationHistoryUrl,
} from "@lib/notifications/action-url";

function claims(role: StaffRole, branchId: number | null): JwtClaims {
  return {
    tenant_id: 1,
    branch_id: branchId,
    user_role: role,
    position_code: role === "branch_staff" ? "cleaner" : role,
  };
}

test("normalizeEntityType maps notification grn alias to audit entity", () => {
  assert.equal(normalizeEntityType("grn"), "goods_received_note");
  assert.equal(
    normalizeEntityType("goods_received_note"),
    "goods_received_note",
  );
  assert.equal(normalizeEntityType(null), null);
});

test("path parity: control-plane gold entity paths are stable", () => {
  const cases = [
    ["goods_received_note", "44", "/inventory/grn/44"],
    ["grn", "44", "/inventory/grn/44"],
    ["stock_transfer", "34", "/inventory/transfers/34"],
    ["stock_request", "9", "/inventory/stock-requests/9"],
  ] as const;

  for (const [entityType, entityId, expected] of cases) {
    assert.equal(
      resolveEntityHref({ entityType, entityId, plane: "control" }),
      expected,
    );
    assert.equal(
      resolveEntityHref({
        entityType,
        entityId,
        claims: claims("owner", null),
      }),
      expected,
    );
  }
});

test("audit helper delegates to shared entity href map", () => {
  const audit = readFileSync(
    join(import.meta.dirname, "../app/_lib/audit.ts"),
    "utf8",
  );
  assert.match(audit, /from "@lib\/entity-href"/);
  assert.match(audit, /resolveEntityHref\(/);
  assert.match(audit, /plane: "control"/);
});

test("path parity: branch plane keeps operator stock routes", () => {
  assert.equal(
    resolveEntityHref({
      entityType: "stock_transfer",
      entityId: 34,
      plane: "branch",
      branchId: 20,
    }),
    "/br/20/stock/receive/34",
  );
  assert.equal(
    resolveEntityHref({
      entityType: "stock_request",
      entityId: 9,
      claims: claims("branch_manager", 20),
      branchId: 20,
    }),
    "/br/20/stock/requests/9",
  );
  assert.equal(
    resolveEntityHref({
      entityType: "grn",
      entityId: 44,
      claims: claims("branch_manager", 20),
      branchId: 20,
    }),
    "/br/20/stock/transfer",
  );
});

test("notification resolve fills missing action_url from entity map", () => {
  assert.equal(
    resolveNotificationActionUrl(claims("owner", null), {
      actionUrl: null,
      entityId: 44,
      entityType: "goods_received_note",
      kind: "workflow.grn_pending",
      targetBranchId: 3,
    }),
    "/inventory/grn/44",
  );
});

test("notification history URL prefers document DETAIL for L0 roles", () => {
  assert.equal(
    resolveNotificationHistoryUrl(claims("owner", null), {
      entityType: "stock_request",
      entityId: 9,
      kind: "inventory.stock_request_submitted",
      targetBranchId: 20,
    }),
    "/inventory/stock-requests/9",
  );
  assert.equal(
    resolveNotificationHistoryUrl(claims("owner", null), {
      entityType: "grn",
      entityId: 44,
      kind: "workflow.grn_pending",
      targetBranchId: 20,
    }),
    "/inventory/grn/44",
  );
  assert.equal(
    resolveNotificationHistoryUrl(claims("owner", null), {
      entityType: "expense",
      entityId: 12,
      kind: "finance.expense",
      targetBranchId: null,
    }),
    null,
  );
});
