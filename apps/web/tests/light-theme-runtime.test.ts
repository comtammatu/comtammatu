import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { getThemeScriptHtml } from "@comtammatu/ui/components/theme-script";
import {
  NIGHT_SHIFT_END_HOUR,
  NIGHT_SHIFT_START_HOUR,
  readThemeCookie,
  resolveThemeMode,
  shiftAwareThemeMode,
  themeClassName,
} from "@comtammatu/ui/lib/theme-cookie";

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
  // The provider must resolve through the same reader the bootstrap script
  // uses; a second local copy is how the two drift apart.
  assert.match(THEME_PROVIDER_SOURCE, /setThemeState\(resolveClientThemeMode\(\)\);/);
  assert.match(ROOT_LAYOUT_SOURCE, /defaultTheme=\{resolvedCookie\}/);
});

test("theme mode resolution lives in one shared module", () => {
  assert.equal(resolveThemeMode("night"), "night");
  assert.equal(resolveThemeMode("dark"), null);
  assert.equal(resolveThemeMode(undefined), null);

  assert.equal(shiftAwareThemeMode(NIGHT_SHIFT_START_HOUR), "night");
  assert.equal(shiftAwareThemeMode(NIGHT_SHIFT_END_HOUR - 1), "night");
  assert.equal(shiftAwareThemeMode(NIGHT_SHIFT_END_HOUR), "light");
  assert.equal(shiftAwareThemeMode(NIGHT_SHIFT_START_HOUR - 1), "light");

  assert.equal(readThemeCookie("a=1; matu-theme=night; b=2"), "night");
  assert.equal(readThemeCookie("matu-theme=sepia"), null);
  assert.equal(readThemeCookie(""), null);

  assert.equal(themeClassName("night"), "dark");
  assert.equal(themeClassName("light"), "light");
});

test("browser chrome follows the shift-aware fallback, not just the cookie", () => {
  // generateViewport only sees the cookie, so a first visit during the night
  // shift would keep light chrome unless the bootstrap corrects the meta tag.
  const script = getThemeScriptHtml({
    chromeColors: { light: "#fff6ee", night: "#120a06" },
  });
  assert.match(script, /meta\[name="theme-color"\]/);
  assert.match(script, /setAttribute\('content',colors\[t\]\)/);
});

test("theme changes can disable transient color transitions", () => {
  assert.match(
    THEME_PROVIDER_SOURCE,
    /\*,\*::before,\*::after\{transition:none!important\}/,
  );
  assert.match(THEME_PROVIDER_SOURCE, /requestAnimationFrame/);
});
