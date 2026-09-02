import { readSql } from "./_lib/active-sql.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path: string) =>
  String(path).includes("supabase/migrations/")
    ? readSql(root, String(path).replace(/^.*?(supabase\/)/, "supabase/"))
    : readFileSync(join(root, path), "utf8");

test("public auth surfaces preserve responsive input density and a visible page heading", () => {
  const loginForm = read("app/(public)/(auth)/login/login-form.tsx");
  const loginPage = read("app/(public)/(auth)/login/page.tsx");
  const accessDenied = read("app/(public)/access-denied/page.tsx");
  const appSection = read("app/components/surface/app-section.tsx");
  const card = read("../../packages/ui/src/components/card.tsx");

  assert.match(loginForm, /useFormControlSize\(\)/);
  assert.equal(
    [...loginForm.matchAll(/<InputGroup size=\{controlSize\}>/g)].length,
    2,
  );
  assert.doesNotMatch(loginForm, /<InputGroup className="h-10">/);
  assert.match(loginForm, /placeholder=\{AUTH_VI\.passwordPlaceholder\}/);
  assert.match(loginPage, /<BrandMascot\s+animated/);
  assert.match(loginPage, /md:grid-cols-2/);
  assert.match(loginPage, /sm:landscape:grid-cols-2/);
  assert.match(loginPage, /md:grid-rows-2/);
  assert.match(loginPage, /md:justify-self-center/);
  assert.doesNotMatch(loginPage, /md:absolute md:bottom-6/);
  assert.match(accessDenied, /headingLevel="h1"/);
  assert.match(accessDenied, /TONE_BADGE_VARIANT/);
  assert.doesNotMatch(accessDenied, /TONE_BADGE_CLASS/);
  assert.match(appSection, /headingLevel\?: AppSectionHeadingLevel/);
  assert.match(appSection, /<CardTitle\s+as=\{headingLevel\}/);
  assert.match(card, /as\?: "div" \| "h1"/);
  assert.match(card, /as: Component = "div"/);
});
