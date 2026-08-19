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
  assert.doesNotMatch(source, /useForegroundNotifications/);
});

test("PWA service worker bypasses the session proxy", () => {
  const source = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

  assert.equal(source.includes("favicon.ico|sw\\\\.js|"), true);
});

test("Vercel observability intakes bypass the session proxy", () => {
  const source = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

  assert.match(source, /_vercel\(\?:\/\|\$\)/);
  assert.match(source, /\[a-f0-9\]\{16\}\/\(\?:script\\\\\.js\|vitals\)\$/);
});

test("PWA reloads once per session on a stale chunk after a service-worker swap", () => {
  const source = readFileSync(
    new URL("../app/components/pwa-runtime.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /CHUNK_RELOAD_STORAGE_KEY = "matu-pwa-chunk-reload"/);
  assert.match(source, /function isChunkLoadFailure/);
  assert.match(source, /ChunkLoadError/);
  assert.match(source, /sessionStorage\.getItem\(CHUNK_RELOAD_STORAGE_KEY\)/);
  assert.match(source, /addEventListener\("error", handleWindowError\)/);
  assert.match(
    source,
    /addEventListener\("unhandledrejection", handleUnhandledRejection\)/,
  );
  assert.match(source, /window\.location\.reload\(\)/);
});

