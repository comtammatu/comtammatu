import test from "node:test";
import assert from "node:assert/strict";

import {
  isPublicAppPath,
  rewriteRetiredRunnerPath,
} from "../route-resolution";

// Regression: the landing (`/br/{id}`) and pickup PWA manifests were gated, so the
// proxy 302'd the browser's uncredentialed manifest fetch to /login and the
// branch home PWA became uninstallable (Android Chrome, HTTPS). Only pos/kds
// were whitelisted. Landing + POS/KDS/pickup manifests must be public.
test("all operational PWA manifests are public", () => {
  assert.equal(isPublicAppPath("/br/3/manifest.webmanifest"), true);
  assert.equal(isPublicAppPath("/br/3/pos/manifest.webmanifest"), true);
  assert.equal(isPublicAppPath("/br/3/kds/manifest.webmanifest"), true);
  assert.equal(isPublicAppPath("/br/3/pickup/manifest.webmanifest"), true);
});

test("the precached offline fallback is public", () => {
  assert.equal(isPublicAppPath("/offline"), true);
});

test("manifest allowlist does not open arbitrary gated routes", () => {
  assert.equal(isPublicAppPath("/br/3/dashboard/manifest.webmanifest"), false);
  assert.equal(isPublicAppPath("/br/3/evil/manifest.webmanifest"), false);
  assert.equal(isPublicAppPath("/br/3"), false);
  assert.equal(isPublicAppPath("/br/3/pos"), false);
  assert.equal(isPublicAppPath("/br/3/runner"), false);
});

test("retired /runner URLs rewrite to the public pickup board", () => {
  assert.equal(rewriteRetiredRunnerPath("/br/3/runner"), "/br/3/pickup");
  assert.equal(rewriteRetiredRunnerPath("/br/3/runner/"), "/br/3/pickup");
  assert.equal(
    rewriteRetiredRunnerPath("/br/3/runner/history"),
    "/br/3/pickup",
  );
  assert.equal(rewriteRetiredRunnerPath("/br/3/pickup"), null);
  assert.equal(rewriteRetiredRunnerPath("/br/3/pos"), null);
  assert.equal(rewriteRetiredRunnerPath("/runner"), null);
});
