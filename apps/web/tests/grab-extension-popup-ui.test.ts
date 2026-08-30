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
  assert.match(popupHtml, /id="relayStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(popupHtml, /Grab Merchant/);
  assert.match(popupHtml, /POS Má Tư/);
  assert.match(popupHtml, /id="recentOrderCount"/);
  assert.match(popupHtml, /id="orderList"[^>]*aria-live="polite"/);
  assert.match(popupSource, /function updateOperationalStatus/);
  assert.match(popupSource, /chrome\.tabs\.query/);
});

test("Grab extension popup keeps setup and recovery actions explicit", () => {
  assert.match(popupHtml, /<details[^>]*id="configPanel"/);
  assert.match(popupHtml, /id="configSummary"/);
  assert.match(popupHtml, /id="btnToggleSecret"/);
  assert.match(popupHtml, /Khôi phục đồng bộ/);
  assert.match(popupHtml, /Chỉ dùng khi trạng thái trên Grab không còn khớp với POS/);
  assert.match(popupSource, /function setButtonBusy/);
  assert.match(popupSource, /configPanel\.open = !isConfigured/);
  assert.match(popupSource, /btnToggleSecret\.setAttribute\('aria-pressed'/);
});

test("Grab extension popup renders provider data as text instead of HTML", () => {
  assert.doesNotMatch(popupSource, /el\.innerHTML/);
  assert.match(popupSource, /displayID\.textContent/);
  assert.match(popupSource, /description\.textContent/);
  assert.match(popupSource, /order\.time/);
});
