import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("public auth surfaces preserve responsive input density and a visible page heading", () => {
  const loginForm = read("app/(public)/(auth)/login/login-form.tsx");
  const loginPage = read("app/(public)/(auth)/login/page.tsx");
  const accessDenied = read("app/(public)/access-denied/page.tsx");
  const appSection = read("app/components/surface.tsx");
  const card = read("../../packages/ui/src/components/card.tsx");

  assert.match(loginForm, /useFormControlSize\(\)/);
  assert.equal(
    [...loginForm.matchAll(/<InputGroup size=\{controlSize\}>/g)].length,
    2,
  );
  assert.doesNotMatch(loginForm, /<InputGroup className="h-10">/);
  assert.doesNotMatch(loginPage, /\banimated\b/);
  assert.match(accessDenied, /headingLevel="h1"/);
  assert.match(accessDenied, /TONE_BADGE_VARIANT/);
  assert.doesNotMatch(accessDenied, /TONE_BADGE_CLASS/);
  assert.match(appSection, /headingLevel\?: AppSectionHeadingLevel/);
  assert.match(appSection, /<CardTitle\s+as=\{headingLevel\}/);
  assert.match(card, /as\?: "div" \| "h1"/);
  assert.match(card, /as: Component = "div"/);
});
