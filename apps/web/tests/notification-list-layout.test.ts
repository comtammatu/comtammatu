import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const listSource = readFileSync(
  path.join(process.cwd(), "app/_components/notification-list.tsx"),
  "utf8",
);
const clientSource = readFileSync(
  path.join(process.cwd(), "app/(protected)/notifications/notifications-client.tsx"),
  "utf8",
);
const itemSource = readFileSync(
  path.join(process.cwd(), "app/_components/notification-item.tsx"),
  "utf8",
);

test("notification page feed uses normal page flow without ScrollArea", () => {
  assert.doesNotMatch(listSource, /ScrollArea/);
  assert.match(
    listSource,
    /nestedScroll \? "overflow-y-auto overscroll-contain" : null/,
  );
  assert.match(clientSource, /showPanelHeader=\{false\}/);
  assert.doesNotMatch(clientSource, /scrollClassName=/);
});

test("notification feed groups rows by day and demotes device settings", () => {
  assert.match(listSource, /groupNotificationsByDay/);
  assert.match(listSource, /messages\.notifications\.groups\.today/);
  assert.match(clientSource, /AppListFrame/);
  assert.match(clientSource, /NotificationFeedFilter/);
  assert.match(clientSource, /showFilterBar=\{false\}/);
  assert.match(clientSource, /messages\.notifications\.deviceToggle/);
  assert.match(clientSource, /Collapsible/);
  assert.match(clientSource, /NotificationPopupControl compact/);
  assert.doesNotMatch(clientSource, /DataTable/);
});

test("notification rows surface severity rail, kind badge, and CTA", () => {
  assert.match(itemSource, /border-l-\[3px\]/);
  assert.match(itemSource, /severityTone/);
  assert.match(itemSource, /ItemFooter/);
  assert.match(itemSource, /Badge variant="outline"/);
});
