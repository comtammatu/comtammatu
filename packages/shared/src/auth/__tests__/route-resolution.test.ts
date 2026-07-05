import test from "node:test";
import assert from "node:assert/strict";

import { isPublicAppPath } from "../route-resolution";

// Regression: the hub (`/br/{id}`) and runner PWA manifests were gated, so the
// proxy 302'd the browser's uncredentialed manifest fetch to /login and the
// operator hub PWA became uninstallable (Android Chrome, HTTPS). Only pos/kds
// were whitelisted. All four operational manifests must be public.
test("all operational PWA manifests are public", () => {
  assert.equal(isPublicAppPath("/br/3/manifest.webmanifest"), true);
  assert.equal(isPublicAppPath("/br/3/pos/manifest.webmanifest"), true);
  assert.equal(isPublicAppPath("/br/3/kds/manifest.webmanifest"), true);
  assert.equal(isPublicAppPath("/br/3/runner/manifest.webmanifest"), true);
});

test("manifest allowlist does not open arbitrary gated routes", () => {
  assert.equal(isPublicAppPath("/br/3/dashboard/manifest.webmanifest"), false);
  assert.equal(isPublicAppPath("/br/3/evil/manifest.webmanifest"), false);
  assert.equal(isPublicAppPath("/br/3"), false);
  assert.equal(isPublicAppPath("/br/3/pos"), false);
});
