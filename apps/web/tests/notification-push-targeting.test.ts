import assert from "node:assert/strict";
import { test } from "node:test";
import { canReceiveNotification } from "../lib/notifications/push-targeting";

// target_roles carries access BUCKETS (matching the notifications_select RLS
// compare via auth_role()); push targeting must map position code → bucket
// before comparing.

const TENANT = 1;

function notif(overrides: Partial<{
  tenant_id: number;
  target_branch_id: number | null;
  target_roles: string[];
}> = {}) {
  return {
    tenant_id: TENANT,
    target_branch_id: 3,
    target_roles: ["branch_manager"],
    ...overrides,
  };
}

const sub = { tenant_id: TENANT };

function profileAt(branchId: number | null, active: boolean | null = true) {
  return { tenant_id: TENANT, branch_id: branchId, is_active: active };
}

function position(code: string) {
  return { tenant_id: TENANT, code };
}

test("quản lý chi nhánh nhận push target bucket branch_manager", () => {
  assert.equal(
    canReceiveNotification(notif(), sub, profileAt(3), position("branch_manager")),
    true,
  );
});

test("position code khác bucket vẫn nhận đúng theo bucket (head_chef → production_manager)", () => {
  assert.equal(
    canReceiveNotification(
      notif({ target_roles: ["production_manager"] }),
      sub,
      profileAt(3),
      position("head_chef"),
    ),
    true,
  );
});

test("mã đã loại khỏi bộ canonical → unassigned → không nhận", () => {
  for (const retired of ["warehouse_head", "quan_ly_CN", "ke_toan", "unknown_x"]) {
    assert.equal(
      canReceiveNotification(notif(), sub, profileAt(3), position(retired)),
      false,
      `retired code ${retired} must not receive push`,
    );
  }
});

test("bucket không nằm trong target_roles → không nhận", () => {
  assert.equal(
    canReceiveNotification(
      notif({ target_roles: ["cashier", "waiter"] }),
      sub,
      profileAt(3),
      position("branch_manager"),
    ),
    false,
  );
});

test("sai chi nhánh → không nhận, trừ owner/super_manager (tenant-wide)", () => {
  assert.equal(
    canReceiveNotification(notif(), sub, profileAt(99), position("branch_manager")),
    false,
  );
  assert.equal(
    canReceiveNotification(
      notif({ target_roles: ["owner"] }),
      sub,
      profileAt(99),
      position("owner"),
    ),
    true,
  );
});

test("notification toàn tenant (target_branch_id null) → nhận theo bucket", () => {
  assert.equal(
    canReceiveNotification(
      notif({ target_branch_id: null, target_roles: ["chef"] }),
      sub,
      profileAt(null),
      position("kitchen_helper"),
    ),
    true,
  );
});

test("profile inactive / thiếu profile / lệch tenant → không nhận", () => {
  assert.equal(
    canReceiveNotification(notif(), sub, profileAt(3, false), position("branch_manager")),
    false,
  );
  assert.equal(
    canReceiveNotification(notif(), sub, undefined, position("branch_manager")),
    false,
  );
  assert.equal(
    canReceiveNotification(
      notif(),
      sub,
      { tenant_id: 2, branch_id: 3, is_active: true },
      position("branch_manager"),
    ),
    false,
  );
});
