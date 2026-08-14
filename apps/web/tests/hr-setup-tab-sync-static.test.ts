import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../app/(protected)/hr/setup/page.tsx", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("../app/(protected)/hr/setup/setup-client.tsx", import.meta.url),
  "utf8",
);
const tabSyncSource = readFileSync(
  new URL("../app/(protected)/hr/setup/setup-tab-sync.tsx", import.meta.url),
  "utf8",
);

test("HR setup soft-nav keeps server panel in sync with ?tab=", () => {
  assert.match(pageSource, /key=\{tab\}/);
  assert.match(pageSource, /shiftsLoadFailed=\{tab === "shifts" && !shiftsResult\.success\}/);
  assert.match(clientSource, /SetupTabSync/);
  assert.match(clientSource, /serverTab=\{initialTab\}/);
  assert.match(tabSyncSource, /liveTab !== serverTab/);
  assert.match(clientSource, /shiftsLoadFailed \?/);
  assert.match(clientSource, /messages\.hr\.actions\.fetchShiftsFailed/);
});

test("HR setup still server-dispatches one panel per tab", () => {
  assert.match(clientSource, /initialTab === "leave"/);
  assert.match(clientSource, /initialTab === "shifts"/);
  assert.match(clientSource, /initialTab === "tasks"/);
  assert.match(clientSource, /defaultValue="leave"/);
});
