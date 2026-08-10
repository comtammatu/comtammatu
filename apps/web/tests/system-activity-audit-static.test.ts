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
  assert.match(page, /entity_id/);
  assert.match(page, /\/hr\/staff\/audit/);
  assert.match(page, /Nhật ký quyền hạn|permissionAuditLink/);

  const audit = readFileSync(
    join(root, "apps/web/app/_lib/audit.ts"),
    "utf8",
  );
  assert.match(
    audit,
    /\/\/ List stays narrow[\s\S]*select\("id, action, entity_type, entity_id, user_id, created_at"\)/,
  );
  assert.match(audit, /fetchTenantAuditLogDetail/);
  assert.match(
    audit,
    /fetchTenantAuditLogDetail[\s\S]*old_data, new_data, ip_address/,
  );
  assert.match(audit, /auditEntityHref/);
});

test("system activity table opens evidence sheet without list JSON blobs", () => {
  const table = readFileSync(
    join(
      root,
      "apps/web/app/(protected)/settings/activity/system-activity-table.tsx",
    ),
    "utf8",
  );
  assert.match(table, /onRowClick/);
  assert.match(table, /SheetContent/);
  assert.match(table, /side="right"/);
  assert.match(table, /size="md"/);
  assert.match(table, /getSystemActivityDetail/);
  assert.match(table, /summarizeAuditDiff/);
  assert.match(table, /filterSameDocument|Lọc cùng chứng từ/);
  assert.doesNotMatch(table, /old_data|new_data/);
});

test("permission audit table follows shared column contract order", () => {
  const table = readFileSync(
    join(
      root,
      "apps/web/app/(protected)/hr/staff/audit/permission-audit-table.tsx",
    ),
    "utf8",
  );
  const timeIdx = table.indexOf('key: "time"');
  const actionIdx = table.indexOf('key: "action"');
  const targetIdx = table.indexOf('key: "target"');
  const actorIdx = table.indexOf('key: "actor"');
  assert.ok(timeIdx > 0 && actionIdx > timeIdx);
  assert.ok(targetIdx > actionIdx);
  assert.ok(actorIdx > targetIdx);
  assert.match(table, /\{copy\.target\}:[\s\S]*\{copy\.actor\}:/);
});

test("permission audit table opens evidence sheet from list rows", () => {
  const table = readFileSync(
    join(
      root,
      "apps/web/app/(protected)/hr/staff/audit/permission-audit-table.tsx",
    ),
    "utf8",
  );
  assert.match(table, /onRowClick/);
  assert.match(table, /<Sheet[\s\S]*side="right"/);
  assert.match(table, /size="md"/);
  assert.match(table, /openPermissions|Mở hồ sơ quyền/);
  assert.match(table, /filterSameTarget|Lọc cùng đối tượng/);
  assert.match(table, /sameTargetHref/);
  assert.doesNotMatch(table, /JSON\.stringify|\.metadata\b/);
});

test("activity and permission audit toolbars support CSV export and q search", () => {
  const activityClient = readFileSync(
    join(
      root,
      "apps/web/app/(protected)/settings/activity/system-activity-client.tsx",
    ),
    "utf8",
  );
  const activityFilters = readFileSync(
    join(
      root,
      "apps/web/app/(protected)/settings/activity/system-activity-filters.tsx",
    ),
    "utf8",
  );
  const permClient = readFileSync(
    join(
      root,
      "apps/web/app/(protected)/hr/staff/audit/permission-audit-client.tsx",
    ),
    "utf8",
  );
  const exportHelper = readFileSync(
    join(root, "apps/web/app/_lib/export-csv.ts"),
    "utf8",
  );

  assert.match(activityClient, /AuditExportButton/);
  assert.match(activityClient, /matchesSearch/);
  assert.match(activityFilters, /usp\.set\("q"/);
  assert.match(permClient, /AuditExportButton/);
  assert.match(permClient, /matchesSearch/);
  assert.match(exportHelper, /CSV_BOM|\\uFEFF/);
  assert.match(exportHelper, /CSV_SEP\s*=\s*";"/);
  assert.doesNotMatch(activityClient, /old_data|new_data/);
  assert.doesNotMatch(permClient, /metadata/);
});

test("notification item exposes clickable document history and owner audit menu", () => {
  const item = readFileSync(
    join(root, "apps/web/app/_components/notification-item.tsx"),
    "utf8",
  );
  const actions = readFileSync(
    join(root, "apps/web/app/(protected)/notifications/actions.ts"),
    "utf8",
  );
  assert.match(item, /handleHistory/);
  assert.match(item, /handleAudit/);
  assert.match(item, /viewSystemActivity/);
  assert.match(item, /Button[\s\S]*viewDocumentHistory|viewDocumentHistory[\s\S]*Button/);
  assert.match(actions, /resolveNotificationAuditUrl/);
  assert.match(actions, /audit_url:/);
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

  const messages = readFileSync(
    join(root, "apps/web/lib/messages/settings.ts"),
    "utf8",
  );
  assert.match(
    messages,
    /Thời gian → Hành động → Đối tượng → Người thao tác/,
  );
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
