import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  COMPACT_TOAST_PRESET,
  DESKTOP_TOAST_PRESET,
  GUEST_TOAST_PRESET,
  isGuestToastRoute,
  isOperationalToastRoute,
  selectToasterPreset,
} from "../app/_components/responsive-toaster-presets";

const uiGlobals = readFileSync(
  join(process.cwd(), "../../packages/ui/src/styles/globals.css"),
  "utf8",
);

test("isOperationalToastRoute matches only POS/KDS branch routes", () => {
  assert.equal(isOperationalToastRoute("/br/12/pos"), true);
  assert.equal(isOperationalToastRoute("/br/12/pos/orders"), true);
  assert.equal(isOperationalToastRoute("/br/7/kds"), true);
  assert.equal(isOperationalToastRoute("/br/7/kds/"), true);

  assert.equal(isOperationalToastRoute("/finance"), false);
  assert.equal(isOperationalToastRoute("/br/12/menu"), false);
  // "possible" starts with "pos" but is not the pos segment boundary.
  assert.equal(isOperationalToastRoute("/br/12/possible"), false);
  assert.equal(isOperationalToastRoute(null), false);
});

test("isGuestToastRoute matches public QR self-order paths", () => {
  assert.equal(isGuestToastRoute("/q/abc"), true);
  assert.equal(isGuestToastRoute("/q/abc/extra"), true);
  assert.equal(isGuestToastRoute("/q"), true);
  assert.equal(isGuestToastRoute("/qr/abc"), false);
  assert.equal(isGuestToastRoute("/br/1/pos"), false);
  assert.equal(isGuestToastRoute(null), false);
});

test("guest /q routes use the dark high-contrast guest toaster preset", () => {
  const preset = selectToasterPreset({
    isMobile: true,
    pathname: "/q/token-1",
  });
  assert.equal(preset, GUEST_TOAST_PRESET);
  assert.equal(preset.theme, "dark");
  assert.equal(preset.position, "top-center");
  assert.match(String(preset.toastOptions?.classNames?.toast), /cn-toast-guest/);
  assert.equal(preset.toastOptions?.classNames?.title, "cn-toast-guest-title");
});

test("POS and KDS routes use the compact operational toaster preset", () => {
  const preset = selectToasterPreset({
    isMobile: false,
    pathname: "/br/3/pos",
  });
  assert.equal(preset, COMPACT_TOAST_PRESET);
  assert.equal(preset.position, "top-center");
  assert.equal(preset.visibleToasts, 1);
  assert.equal(preset.closeButton, true);
  assert.equal(preset.duration, 1800);
  assert.equal(preset.expand, false);
  assert.deepEqual(preset.swipeDirections, ["top", "right", "left"]);
  assert.ok(preset.offset);
  assert.ok(preset.mobileOffset);
  assert.equal(
    preset.toastOptions?.closeButtonAriaLabel,
    "Đóng thông báo",
  );
  assert.equal(
    preset.toastOptions?.classNames?.closeButton,
    "cn-toast-close",
  );
});

test("mobile uses the compact operational toaster preset on any route", () => {
  const preset = selectToasterPreset({
    isMobile: true,
    pathname: "/finance",
  });
  assert.equal(preset, COMPACT_TOAST_PRESET);
  assert.equal(preset.position, "top-center");
  assert.equal(preset.expand, false);
});

test("non-operational desktop routes keep the desktop toaster preset", () => {
  const preset = selectToasterPreset({
    isMobile: false,
    pathname: "/finance",
  });
  assert.equal(preset, DESKTOP_TOAST_PRESET);
  assert.equal(preset.position, "top-right");
  assert.equal(preset.visibleToasts, 5);
  assert.equal(preset.expand, true);
});

test("shared toast close button stays inside the tappable toast surface", () => {
  assert.match(
    uiGlobals,
    /\[data-sonner-toast\]\[data-styled="true"\]\.cn-toast\s*\{[\s\S]*padding-inline-end: 2\.75rem;/,
  );
  assert.match(
    uiGlobals,
    /\[data-sonner-toast\]\[data-styled="true"\] \.cn-toast-close\s*\{[\s\S]*right: 0\.5rem;[\s\S]*left: auto;[\s\S]*width: 2rem;[\s\S]*height: 2rem;[\s\S]*transform: none;/,
  );
});

test("guest toast CSS bumps title and description above Sonner 13px default", () => {
  assert.match(uiGlobals, /\.cn-toast\.cn-toast-guest\s*\{[\s\S]*font-size: 1rem;/);
  assert.match(uiGlobals, /\.cn-toast-guest-title[\s\S]*font-size: 1rem;/);
  assert.match(
    uiGlobals,
    /\.cn-toast-guest-description[\s\S]*font-size: 0\.875rem;/,
  );
});
