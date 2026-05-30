import assert from "node:assert/strict";
import { test } from "node:test";
import { getThemeScriptHtml } from "@comtammatu/ui/components/theme-script";

test("theme bootstrap can force light mode before hydration", () => {
  const script = getThemeScriptHtml({ forcedTheme: "light" });

  assert.match(script, /classList\.add\(t\)/);
  assert.match(script, /colorScheme=t/);
  assert.doesNotMatch(script, /prefers-color-scheme/);
  assert.doesNotMatch(script, /matchMedia/);
});
