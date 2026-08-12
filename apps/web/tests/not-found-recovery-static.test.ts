import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("root not-found resolves role-aware home and offers sign-in-again recovery", () => {
  const page = read("app/not-found.tsx");
  const panel = read("app/components/not-found-panel.tsx");

  assert.match(page, /getDefaultRedirect/);
  assert.match(page, /extractClaimsFromAccessToken/);
  assert.match(page, /preferLogin/);
  assert.match(panel, /action=["']\/api\/auth\/signout["']/);
  assert.match(panel, /ACTIONS_VI\.signInAgain/);
  assert.match(panel, /ACTIONS_VI\.goDefaultHome/);
  assert.match(panel, /const actionSize = isTouchLayout \? "touch" : "default"/);
  assert.match(panel, /size=\{actionSize\}/);
  assert.match(panel, /aria-live="polite"/);
});

test("access-denied home uses role default redirect instead of hard-coded owner root", () => {
  const accessDenied = read("app/(public)/access-denied/page.tsx");

  assert.match(accessDenied, /getDefaultRedirect/);
  assert.doesNotMatch(accessDenied, /href=["']\/["']/);
  assert.match(accessDenied, /ACTIONS_VI\.signInAgain/);
  assert.match(accessDenied, /ACTIONS_VI\.goDefaultHome/);
});
