import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { getThemeScriptHtml } from "@comtammatu/ui/components/theme-script";

const THEME_PROVIDER_SOURCE = readFileSync(
  join(
    import.meta.dirname,
    "../../../packages/ui/src/components/theme-provider.tsx",
  ),
  "utf8",
);
const ROOT_LAYOUT_SOURCE = readFileSync(
  join(import.meta.dirname, "../app/layout.tsx"),
  "utf8",
);

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

test("theme provider preserves the bootstrap class through hydration", () => {
  assert.match(THEME_PROVIDER_SOURCE, /if \(!mountedRef\.current\)/);
  assert.match(
    THEME_PROVIDER_SOURCE,
    /setThemeState\(readCookieTheme\(\) \?\? shiftAwareFallback\(\)\);\s+return;/,
  );
  assert.match(ROOT_LAYOUT_SOURCE, /defaultTheme=\{resolvedCookie\}/);
});

test("theme changes can disable transient color transitions", () => {
  assert.match(
    THEME_PROVIDER_SOURCE,
    /\*,\*::before,\*::after\{transition:none!important\}/,
  );
  assert.match(THEME_PROVIDER_SOURCE, /requestAnimationFrame/);
});
