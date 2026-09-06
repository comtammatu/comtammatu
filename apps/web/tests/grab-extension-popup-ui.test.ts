import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const popupHtml = readFileSync(
  `${repositoryRoot}/tools/grab-pos-relay-extension/popup.html`,
  "utf8",
);
const popupSource = readFileSync(
  `${repositoryRoot}/tools/grab-pos-relay-extension/popup.js`,
  "utf8",
);

test("Grab extension popup prioritizes relay health and recent orders", () => {
  assert.match(popupHtml, /<main[^>]*class="popup-main"/);
  assert.match(
    popupHtml,
    /id="relayStatus"[^>]*role="status"[^>]*aria-live="polite"/,
  );
  assert.match(popupHtml, /id="grabRoutePoint"/);
  assert.match(popupHtml, /id="posRoutePoint"/);
  assert.match(popupHtml, /id="kitchenRoutePoint"/);
  assert.match(popupHtml, /id="recentOrderCount"/);
  assert.match(popupHtml, /id="orderList"[^>]*aria-live="polite"/);
  assert.match(popupSource, /function updateOperationalStatus/);
  assert.match(popupSource, /GET_RELAY_DIAGNOSTICS/);
  assert.doesNotMatch(popupSource, /chrome\.tabs\.query/);
});

test("Grab extension popup keeps setup and recovery actions explicit", () => {
  assert.match(popupHtml, /<details[^>]*id="configPanel"/);
  assert.match(popupHtml, /id="configSummary"/);
  assert.match(popupHtml, /id="btnToggleSecret"/);
  assert.match(popupHtml, /Khóa kết nối/);
  assert.match(popupHtml, /Khôi phục đồng bộ/);
  assert.match(
    popupHtml,
    /Chỉ dùng khi trạng thái trên Grab không còn khớp với POS/,
  );
  assert.match(popupSource, /function setButtonBusy/);
  assert.match(popupSource, /configPanel\.open = !isConfigured/);
  assert.match(
    popupSource,
    /btnToggleSecret\.setAttribute\(["']aria-pressed["']/,
  );
});

test("Grab extension popup renders provider data as text instead of HTML", () => {
  assert.doesNotMatch(popupSource, /el\.innerHTML/);
  assert.match(popupSource, /displayID\.textContent/);
  assert.match(popupSource, /description\.textContent/);
  assert.match(popupSource, /order\.time/);
});

test("Grab extension popup surfaces queue health and recover actions", () => {
  assert.match(popupHtml, /id="queueMetric"/);
  assert.match(popupHtml, /id="itemSyncHealthMetric"/);
  assert.match(popupHtml, /id="btnRecoverOrders"/);
  assert.match(popupHtml, /Khôi phục đơn/);
  assert.match(popupHtml, /Thử lại/);
  assert.match(popupSource, /grabRelayQueue/);
  assert.match(popupSource, /grabItemSyncHealth/);
  assert.match(popupSource, /RETRY_QUEUE_ITEM/);
  assert.match(popupSource, /RECOVER_MISSED_ORDERS/);
  assert.match(popupSource, /permissions\.request/);
});

test("Grab extension popup exposes tab recovery and redacted local diagnostics", () => {
  assert.match(popupHtml, /id="btnGrabTab"/);
  assert.match(popupHtml, /id="tabMetric"/);
  assert.match(popupHtml, /id="logPanel"/);
  assert.match(popupHtml, /Xuất báo cáo/);
  assert.match(popupSource, /OPEN_OR_FOCUS_GRAB_TAB/);
  assert.match(popupSource, /GET_LOCAL_LOGS/);
  assert.match(popupSource, /CLEAR_LOCAL_LOGS/);
  assert.match(popupSource, /Blob/);
});
