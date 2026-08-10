import assert from "node:assert/strict";
import test from "node:test";
import { groupNotificationsByDay } from "../app/_components/notification-list";
import type { NotificationItem } from "../app/(protected)/notifications/actions";

function stubItem(
  id: number,
  createdAt: string,
): NotificationItem {
  return {
    id,
    tenant_id: 1,
    target_branch_id: null,
    target_roles: ["owner"],
    kind: "system.test",
    severity: "info",
    title: `Item ${id}`,
    body: null,
    entity_type: null,
    entity_id: null,
    action_url: null,
    history_url: null,
    audit_url: null,
    meta: {},
    created_at: createdAt,
    expires_at: null,
    read_at: null,
  };
}

test("groupNotificationsByDay keeps newest-first order under today/yesterday/date labels", () => {
  const now = new Date("2026-08-08T10:00:00+07:00");
  const groups = groupNotificationsByDay(
    [
      stubItem(1, "2026-08-08T09:00:00+07:00"),
      stubItem(2, "2026-08-08T08:00:00+07:00"),
      stubItem(3, "2026-08-07T18:00:00+07:00"),
      stubItem(4, "2026-08-05T12:00:00+07:00"),
    ],
    now,
  );

  assert.equal(groups.length, 3);
  assert.equal(groups[0]?.label, "Hôm nay");
  assert.deepEqual(
    groups[0]?.items.map((item) => item.id),
    [1, 2],
  );
  assert.equal(groups[1]?.label, "Hôm qua");
  assert.deepEqual(
    groups[1]?.items.map((item) => item.id),
    [3],
  );
  assert.equal(groups[2]?.label, "05/08/2026");
  assert.deepEqual(
    groups[2]?.items.map((item) => item.id),
    [4],
  );
});
