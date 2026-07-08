import assert from "node:assert/strict";
import { test } from "node:test";
import { getThemeScriptHtml } from "@comtammatu/ui/components/theme-script";

test("theme bootstrap applies the resolved theme class before hydration", () => {
  const script = getThemeScriptHtml();

  // The script must still toggle classes + color-scheme via a single `t`.
  assert.match(script, /classList\.add\(cls\)/);
  assert.match(script, /colorScheme=cls/);
  // Shift-aware resolution must not depend on OS preference.
  assert.doesNotMatch(script, /prefers-color-scheme/);
  assert.doesNotMatch(script, /matchMedia/);
});

test("theme bootstrap reads the matu-theme cookie override", () => {
  const script = getThemeScriptHtml();

  // Cookie read path must be present and reference the documented key.
  assert.match(script, /matu-theme/);
  assert.match(script, /document\.cookie/);
});

test("theme bootstrap falls back to shift-aware hour logic", () => {
  const script = getThemeScriptHtml();

  // 18:00–06:00 local → night; the script computes this client-side.
  assert.match(script, /getHours/);
  assert.match(script, /h>=18\|\|h<6/);
});

test("theme bootstrap maps night to the .dark class", () => {
  const script = getThemeScriptHtml();

  // `night` is the public mode name; `.dark` is the CSS selector.
  assert.match(script, /t==='night'\?'dark':'light'/);
});
