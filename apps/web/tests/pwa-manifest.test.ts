import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GET as getHubManifest } from "../app/(protected)/br/[branchId]/(operator)/manifest.webmanifest/route";
import { GET as getKdsManifest } from "../app/(protected)/br/[branchId]/kds/manifest.webmanifest/route";
import { GET as getPosManifest } from "../app/(protected)/br/[branchId]/pos/manifest.webmanifest/route";

test("root PWA manifest requests portrait orientation", () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL("../public/manifest.webmanifest", import.meta.url),
      "utf8",
    ),
  ) as {
    categories?: unknown;
    name?: unknown;
    orientation?: unknown;
    scope?: unknown;
    short_name?: unknown;
    shortcuts?: Array<{ name?: unknown; url?: unknown }>;
    start_url?: unknown;
  };

  assert.equal(manifest.name, "Cơm Tấm Má Tư - Nhân viên");
  assert.equal(manifest.orientation, "portrait");
  assert.equal(manifest.scope, "/employee");
  assert.equal(manifest.short_name, "Má Tư NV");
  assert.equal(manifest.start_url, "/employee");
  assert.deepEqual(manifest.categories, ["business", "productivity"]);
  assert.deepEqual(
    manifest.shortcuts?.map((shortcut) => shortcut.url),
    ["/employee", "/employee/clock", "/employee/tasks", "/employee/schedule"],
  );
});

test("POS PWA manifest requests portrait orientation per branch", async () => {
  const response = await getPosManifest(
    new Request("https://app.test/br/3/pos/manifest.webmanifest") as Parameters<
      typeof getPosManifest
    >[0],
    { params: Promise.resolve({ branchId: "3" }) },
  );
  const manifest = (await response.json()) as {
    id?: unknown;
    orientation?: unknown;
    scope?: unknown;
    short_name?: unknown;
    start_url?: unknown;
  };

  assert.equal(response.status, 200);
  assert.equal(manifest.id, "/br/3/pos");
  assert.equal(manifest.start_url, "/br/3/pos");
  assert.equal(manifest.scope, "/br/3/pos");
  assert.equal(manifest.short_name, "Má Tư POS");
  assert.equal(manifest.orientation, "portrait");
});

test("KDS PWA manifest requests landscape orientation per branch", async () => {
  const response = await getKdsManifest(
    new Request("https://app.test/br/3/kds/manifest.webmanifest") as Parameters<
      typeof getKdsManifest
    >[0],
    { params: Promise.resolve({ branchId: "3" }) },
  );
  const manifest = (await response.json()) as {
    id?: unknown;
    orientation?: unknown;
    scope?: unknown;
    short_name?: unknown;
    start_url?: unknown;
  };

  assert.equal(response.status, 200);
  assert.equal(manifest.id, "/br/3/kds");
  assert.equal(manifest.start_url, "/br/3/kds");
  assert.equal(manifest.scope, "/br/3/kds");
  assert.equal(manifest.short_name, "Má Tư KDS");
  assert.equal(manifest.orientation, "landscape");
});

test("Operator Hub PWA manifest is installable per branch", async () => {
  const response = await getHubManifest(
    new Request(
      "https://app.test/br/3/manifest.webmanifest",
    ) as Parameters<typeof getHubManifest>[0],
    { params: Promise.resolve({ branchId: "3" }) },
  );
  const manifest = (await response.json()) as {
    id?: unknown;
    display?: unknown;
    orientation?: unknown;
    scope?: unknown;
    short_name?: unknown;
    start_url?: unknown;
    icons?: Array<{ src?: unknown; sizes?: unknown; purpose?: unknown }>;
  };

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/manifest+json; charset=utf-8");
  assert.equal(manifest.id, "/br/3");
  assert.equal(manifest.start_url, "/br/3");
  assert.equal(manifest.scope, "/br/3");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.short_name, "Má Tư Chi nhánh");
  assert.equal(manifest.orientation, "portrait");
  assert.ok(manifest.icons && manifest.icons.length >= 2);
  assert.ok(
    manifest.icons?.some(
      (icon) => icon.sizes === "512x512" && icon.purpose === "any maskable",
    ),
  );
});

test("Operator Hub PWA manifest keeps rejecting invalid branch ids", async () => {
  const response = await getHubManifest(
    new Request(
      "https://app.test/br/abc/manifest.webmanifest",
    ) as Parameters<typeof getHubManifest>[0],
    { params: Promise.resolve({ branchId: "abc" }) },
  );

  assert.equal(response.status, 400);
});

test("POS PWA manifest keeps rejecting invalid branch ids", async () => {
  const response = await getPosManifest(
    new Request(
      "https://app.test/br/abc/pos/manifest.webmanifest",
    ) as Parameters<typeof getPosManifest>[0],
    { params: Promise.resolve({ branchId: "abc" }) },
  );

  assert.equal(response.status, 400);
});

test("KDS PWA manifest keeps rejecting invalid branch ids", async () => {
  const response = await getKdsManifest(
    new Request(
      "https://app.test/br/abc/kds/manifest.webmanifest",
    ) as Parameters<typeof getKdsManifest>[0],
    { params: Promise.resolve({ branchId: "abc" }) },
  );

  assert.equal(response.status, 400);
});

test("operational PWA install dismissal is isolated by app and branch", () => {
  const toolbarSource = readFileSync(
    new URL(
      "../app/(protected)/br/[branchId]/_components/operational-pwa/toolbar.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(toolbarSource, /function getDismissStorageKey/);
  assert.match(
    toolbarSource,
    /operational-pwa-install-dismissed:\$\{surface\}:\$\{branchId\}/,
  );
  assert.doesNotMatch(toolbarSource, /LEGACY_POS_DISMISS_STORAGE_KEY/);
  assert.doesNotMatch(toolbarSource, /pos-pwa-install-dismissed/);
});

test("POS and KDS toolbars render a return-to-hub link; runner never does", () => {
  const toolbarSource = readFileSync(
    new URL(
      "../app/(protected)/br/[branchId]/_components/operational-pwa/toolbar.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const pwaToolbarSource = readFileSync(
    new URL("../app/components/pwa-toolbar.tsx", import.meta.url),
    "utf8",
  );

  // Runner is a guest-facing display: staff navigation is excluded there.
  assert.match(toolbarSource, /surface !== "runner"/);
  assert.match(toolbarSource, /<PwaToolbarHubLink/);
  assert.match(toolbarSource, /surface="pos"/);
  assert.match(toolbarSource, /surface="kds"/);
  assert.match(toolbarSource, /surface="runner"/);

  // The link targets the operator hub home for the current branch, carries an
  // accessible label from the copy catalog, and uses the 48px touch size.
  assert.match(
    toolbarSource,
    /<PwaToolbarHubLink\s+href=\{`\/br\/\$\{branchId\}`\}\s+label=\{copy\.hubLinkLabel\}/,
  );
  assert.match(toolbarSource, /hubLinkLabel: "Về màn hình chính chi nhánh"/);
  assert.match(
    pwaToolbarSource,
    /<Link href=\{href\} aria-label=\{label\}>/,
  );
  assert.match(
    pwaToolbarSource,
    /asChild\s+variant="ghost"\s+size="icon-touch"/,
  );

  // Quiet POS/KDS state should not reserve a hub-link-only toolbar row over the
  // operational surface; real offline/update/install banners still carry it.
  assert.match(pwaToolbarSource, /if \(!showInstallRow\) \{\s*return null;\s*\}/);
  assert.doesNotMatch(pwaToolbarSource, /if \(hubLink == null\) return null;/);
});

test("station layouts mount the branch-scoped PWA toolbars", () => {
  const layoutSource = (station: string) =>
    readFileSync(
      new URL(
        `../app/(protected)/br/[branchId]/${station}/layout.tsx`,
        import.meta.url,
      ),
      "utf8",
    );

  assert.match(layoutSource("pos"), /<PosPwaToolbar branchId=\{branchId\} \/>/);
  assert.match(layoutSource("kds"), /<KdsPwaToolbar branchId=\{branchId\} \/>/);
  assert.match(
    layoutSource("runner"),
    /<RunnerPwaToolbar branchId=\{branchId\} \/>/,
  );
});

test("Operator Hub layout mounts its manifest link and install toolbar", () => {
  const layoutSource = readFileSync(
    new URL(
      "../app/(protected)/br/[branchId]/(operator)/layout.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    layoutSource,
    /manifest: `\/br\/\$\{branchId\}\/manifest\.webmanifest`/,
  );
  assert.match(layoutSource, /<OperatorPwaToolbar \/>/);
});

test("SW offline fallback (PWA-2) only precaches/serves the Hub shell, never station or authed data", () => {
  const swSource = readFileSync(
    new URL("../app/sw.ts", import.meta.url),
    "utf8",
  );

  // Hub navigations get a fallback plugin; POS/KDS/Runner stay plain NetworkOnly.
  assert.match(swSource, /isHubPath\(url\.pathname\)/);
  assert.match(
    swSource,
    /handler: new NetworkOnly\(\{ plugins: \[hubOfflineFallback\] \}\)/,
  );
  assert.match(swSource, /BRANCH_STATION_SEGMENTS = \["pos", "kds", "runner"\]/);

  // The fallback only fires on handlerDidError (network failure), and only
  // returns the precached shell — no data/mutation caching is introduced.
  assert.match(
    swSource,
    /handlerDidError: async \(\) => serwist\.matchPrecache\("\/offline"\)/,
  );

  // Remaining authed navigations (stations + admin/employee/etc.) are
  // unchanged: still NetworkOnly with no fallback plugin.
  assert.match(
    swSource,
    /request\.mode === "navigate" && isAuthedPath\(url\.pathname\),\s*\n\s*handler: new NetworkOnly\(\),/,
  );
});

// Mirrors app/sw.ts's isHubPath — sw.ts runs in the SW global scope and can't
// be imported directly from a Node test.
const BRANCH_STATION_SEGMENTS = ["pos", "kds", "runner"];
function isHubPath(pathname: string) {
  if (!pathname.startsWith("/br/")) return false;
  const segments = pathname.split("/").filter(Boolean);
  const stationSegment = segments[2];
  return (
    stationSegment == null || !BRANCH_STATION_SEGMENTS.includes(stationSegment)
  );
}

test("isHubPath matches the Hub root and its sub-routes but excludes POS/KDS/Runner", () => {
  assert.equal(isHubPath("/br/3"), true);
  assert.equal(isHubPath("/br/3/dashboard"), true);
  assert.equal(isHubPath("/br/3/stock/on-hand"), true);
  assert.equal(isHubPath("/br/3/pos"), false);
  assert.equal(isHubPath("/br/3/kds"), false);
  assert.equal(isHubPath("/br/3/runner"), false);
  assert.equal(isHubPath("/admin"), false);
  assert.equal(isHubPath("/employee"), false);
});

test("offline page precaches statically and reuses the shared error copy", () => {
  const offlinePageSource = readFileSync(
    new URL("../app/offline/page.tsx", import.meta.url),
    "utf8",
  );

  // Static (no dynamic data), so it's swept into the precache manifest by
  // Serwist's `precachePrerendered` glob and reachable while fully offline.
  assert.doesNotMatch(offlinePageSource, /force-dynamic/);
  assert.match(offlinePageSource, /ERRORS_VI\.networkError/);
  assert.match(offlinePageSource, /ACTIONS_VI\.retry/);
  assert.match(offlinePageSource, /AppEmptyState/);
});
