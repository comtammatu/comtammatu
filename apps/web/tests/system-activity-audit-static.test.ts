import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  AUDIT_ACTION_LABELS_VI,
  INVENTORY_AUDIT_ACTION_CODES,
} from "@comtammatu/shared/messages";

const root = join(import.meta.dirname, "../../..");

test("settings activity page is owner-only and uses explicit audit_logs columns", () => {
  const page = readFileSync(
    join(root, "apps/web/app/(protected)/settings/activity/page.tsx"),
    "utf8",
  );
  assert.match(page, /claims\.user_role !== "owner"/);
  assert.match(page, /fetchTenantAuditLogs/);
  assert.match(page, /\/hr\/staff\/audit/);
  assert.match(page, /Nhật ký quyền hạn|permissionAuditLink/);

  const audit = readFileSync(
    join(root, "apps/web/app/_lib/audit.ts"),
    "utf8",
  );
  assert.match(
    audit,
    /select\("id, action, entity_type, entity_id, user_id, created_at"\)/,
  );
  assert.doesNotMatch(audit, /old_data|new_data|ip_address/);
  assert.match(audit, /formatAuditActionLabel|auditEntityHref/);
});

test("settings home links to ops tracking hub for owners", () => {
  const home = readFileSync(
    join(root, "apps/web/app/(protected)/settings/page.tsx"),
    "utf8",
  );
  assert.match(home, /\/settings\/tracking/);
  assert.match(home, /trackingTitle/);
  assert.doesNotMatch(home, /href="\/settings\/activity"/);
});

test("settings tracking hub keeps three store boundaries", () => {
  const page = readFileSync(
    join(root, "apps/web/app/(protected)/settings/tracking/page.tsx"),
    "utf8",
  );
  assert.match(page, /claims\.user_role !== "owner"/);
  assert.match(page, /\/notifications/);
  assert.match(page, /\/settings\/activity/);
  assert.match(page, /\/hr\/staff\/audit/);
});

test("inventory lifecycle audit migration writes issue/stocktake/transfer actions", () => {
  const migration = readFileSync(
    join(
      root,
      "supabase/migrations/20260810101500_inventory_lifecycle_audit_logs.sql",
    ),
    "utf8",
  );
  for (const action of [
    "inventory.issue.confirmed",
    "inventory.stocktake.created",
    "inventory.stocktake.completed",
    "inventory.transfer.shipped",
    "inventory.transfer.received",
  ] as const) {
    assert.match(migration, new RegExp(action.replace(/\./g, "\\.")));
    assert.ok(action in AUDIT_ACTION_LABELS_VI);
    assert.ok(
      (INVENTORY_AUDIT_ACTION_CODES as readonly string[]).includes(action),
    );
  }
});
