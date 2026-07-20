import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("PWA checks for a new service worker when the app returns to foreground", () => {
  const source = readFileSync(
    new URL("../app/components/pwa-runtime.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const checkForUpdate = async \(\) =>/);
  assert.match(source, /await registration\.update\(\)/);
  assert.match(
    source,
    /document\.visibilityState === "visible"\) void checkForUpdate\(\)/,
  );
  assert.match(
    source,
    /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/,
  );
});
