import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GET as getOperatorManifest } from "../app/(protected)/br/[branchId]/(operator)/manifest.webmanifest/route";
import { GET as getKdsManifest } from "../app/(protected)/br/[branchId]/kds/manifest.webmanifest/route";
import { GET as getPosManifest } from "../app/(protected)/br/[branchId]/pos/manifest.webmanifest/route";
import { GET as getPickupManifest } from "../app/(protected)/br/[branchId]/pickup/manifest.webmanifest/route";
import { normalizeEol } from "./static-source";

test("protected Vercel previews do not register a service worker", () => {
  const rootLayoutSource = readFileSync(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    rootLayoutSource,
    /disable=\{\s*process\.env\.NODE_ENV === "development"\s*\|\|\s*process\.env\.VERCEL_ENV === "preview"\s*\}/,
  );
});

test("dynamic viewport preserves device sizing and safe-area coverage", () => {
  const rootLayoutSource = readFileSync(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(rootLayoutSource, /export const viewport/);
  assert.match(
    rootLayoutSource,
    /generateViewport\(\)[\s\S]*width: "device-width",[\s\S]*initialScale: 1,[\s\S]*viewportFit: "cover",[\s\S]*themeColor:/,
  );
});

test("root PWA manifest opens the operator entry instead of the retired employee app", () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL("../public/manifest.webmanifest", import.meta.url),
      "utf8",
    ),
  ) as {
    categories?: unknown;
    id?: unknown;
    name?: unknown;
    orientation?: unknown;
    scope?: unknown;
    short_name?: unknown;
    shortcuts?: Array<{ name?: unknown; url?: unknown }>;
    start_url?: unknown;
    launch_handler?: { client_mode?: unknown };
    icons?: Array<{ src?: unknown; sizes?: unknown; purpose?: unknown }>;
  };

  assert.equal(manifest.id, "/");
  assert.equal(manifest.name, "Cơm Tấm Má Tư - Cổng vận hành");
  assert.equal(manifest.orientation, "portrait");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.short_name, "Cổng Má Tư");
  assert.equal(manifest.start_url, "/");
  assert.deepEqual(manifest.categories, ["business", "productivity"]);
  assert.equal(manifest.shortcuts, undefined);
  assert.equal(manifest.launch_handler?.client_mode, "focus-existing");
  assert.ok(
    manifest.icons?.some(
      (icon) => icon.sizes === "512x512" && icon.purpose === "any",
    ),
  );
  assert.ok(
    manifest.icons?.some(
      (icon) => icon.sizes === "512x512" && icon.purpose === "maskable",
    ),
  );
  assert.ok(
    !manifest.icons?.some((icon) => icon.purpose === "any maskable"),
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
  assert.equal(manifest.scope, "/");
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
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.short_name, "Má Tư KDS");
  assert.equal(manifest.orientation, "landscape");
});

test("Pickup PWA manifest keeps its station identity and landscape orientation", async () => {
  const response = await getPickupManifest(
    new Request(
      "https://app.test/br/3/pickup/manifest.webmanifest",
    ) as Parameters<typeof getPickupManifest>[0],
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
  assert.equal(manifest.id, "/br/3/pickup");
  assert.equal(manifest.start_url, "/br/3/pickup");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.short_name, "Má Tư Gọi số");
  assert.equal(manifest.orientation, "landscape");
});

test("operator PWA manifest keeps branch identity in its start route", async () => {
  const response = await getOperatorManifest(
    new Request("https://app.test/br/3/manifest.webmanifest") as Parameters<
      typeof getOperatorManifest
    >[0],
    { params: Promise.resolve({ branchId: "3" }) },
  );
  const manifest = (await response.json()) as {
    id?: unknown;
    display?: unknown;
    name?: unknown;
    orientation?: unknown;
    scope?: unknown;
    short_name?: unknown;
    start_url?: unknown;
    launch_handler?: { client_mode?: unknown };
    icons?: Array<{ src?: unknown; sizes?: unknown; purpose?: unknown }>;
  };

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("Content-Type"),
    "application/manifest+json; charset=utf-8",
  );
  assert.match(
    response.headers.get("Cache-Control") ?? "",
    /must-revalidate/,
  );
  assert.equal(manifest.id, "/br/3");
  assert.equal(manifest.name, "Cơm Tấm Má Tư - Cổng vận hành");
  assert.equal(manifest.start_url, "/br/3");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.short_name, "Cổng Má Tư");
  assert.equal(manifest.orientation, "portrait");
  assert.equal(manifest.launch_handler?.client_mode, "focus-existing");
  assert.ok(manifest.icons && manifest.icons.length >= 4);
  assert.ok(
    manifest.icons?.some(
      (icon) => icon.sizes === "512x512" && icon.purpose === "any",
    ),
  );
  assert.ok(
    manifest.icons?.some(
      (icon) => icon.sizes === "512x512" && icon.purpose === "maskable",
    ),
  );
  assert.ok(
    !manifest.icons?.some((icon) => icon.purpose === "any maskable"),
  );
});

test("operator PWA manifest keeps rejecting invalid branch ids", async () => {
  const response = await getOperatorManifest(
    new Request("https://app.test/br/abc/manifest.webmanifest") as Parameters<
      typeof getOperatorManifest
    >[0],
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

test("Pickup PWA manifest keeps rejecting invalid branch ids", async () => {
  const response = await getPickupManifest(
    new Request(
      "https://app.test/br/abc/pickup/manifest.webmanifest",
    ) as Parameters<typeof getPickupManifest>[0],
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

test("POS and KDS toolbars render a return-to-entry link; pickup never does", () => {
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

  // Pickup is a guest-facing display: staff navigation is excluded there.
  assert.match(toolbarSource, /surface !== "pickup"/);
  assert.match(toolbarSource, /<PwaToolbarEntryLink/);
  assert.match(toolbarSource, /surface="pos"/);
  assert.match(toolbarSource, /surface="kds"/);
  assert.match(toolbarSource, /surface="pickup"/);

  // The link targets the operator entry for the current branch, carries an
  // accessible label from the copy catalog, and uses the 48px touch size.
  assert.match(
    toolbarSource,
    /<PwaToolbarEntryLink\s+href=\{`\/br\/\$\{branchId\}`\}\s+label=\{copy\.entryLinkLabel\}/,
  );
  assert.match(toolbarSource, /entryLinkLabel: "Về Cổng vận hành"/);
  assert.match(
    pwaToolbarSource,
    /render=\{<Link href=\{href\} aria-label=\{label\} \/>\}/,
  );
  assert.match(
    pwaToolbarSource,
    /<Button\s+variant="ghost"\s+size="icon-touch"/,
  );

  // Quiet POS/KDS state should not reserve an entry-link-only toolbar row over the
  // operational surface; real offline/update/install banners still carry it.
  assert.match(
    pwaToolbarSource,
    /if \(!showInstallRow\) \{\s*return null;\s*\}/,
  );
  assert.doesNotMatch(
    pwaToolbarSource,
    /if \(entryLink == null\) return null;/,
  );
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
    layoutSource("pickup"),
    /<PickupPwaToolbar branchId=\{branchId\} \/>/,
  );
});

test("authenticated shell roots own top safe-area padding", () => {
  const sources = [
    "../app/components/app-shell.tsx",
    "../app/(protected)/br/[branchId]/(operator)/layout.tsx",
    "../app/(protected)/br/[branchId]/pos/layout.tsx",
    "../app/(protected)/br/[branchId]/kds/layout.tsx",
    "../app/(protected)/br/[branchId]/pickup/layout.tsx",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
  const uiStyles = readFileSync(
    new URL("../../../packages/ui/src/styles/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(
    uiStyles,
    /@utility chrome-safe-pt \{\s*padding-top: env\(safe-area-inset-top\);\s*\}/,
  );
  for (const source of sources) {
    assert.match(source, /chrome-safe-pt/);
  }
});

test("operator layout mounts its manifest link and install toolbar", () => {
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

test("SW offline fallback (PWA-2) only precaches/serves the operator shell, never station or authed data", () => {
  const swSource = readFileSync(
    new URL("../app/sw.ts", import.meta.url),
    "utf8",
  );

  // Operator navigations get a fallback plugin; POS/KDS/Pickup stay plain NetworkOnly.
  assert.match(swSource, /isOperatorShellPath\(url\.pathname\)/);
  assert.match(
    swSource,
    /handler: new NetworkOnly\(\{ plugins: \[operatorOfflineFallback\] \}\)/,
  );
  assert.match(
    swSource,
    /BRANCH_STATION_SEGMENTS = \["pos", "kds", "pickup"\]/,
  );

  // The fallback only fires on handlerDidError (network failure), and only
  // returns the precached shell — no data/mutation caching is introduced.
  assert.match(
    swSource,
    /handlerDidError: async \(\) => serwist\.matchPrecache\("\/offline"\)/,
  );

  // Remaining authed navigations (stations + admin/domain workspaces) stay
  // NetworkOnly with no fallback plugin.
  assert.match(
    swSource,
    /request\.mode === "navigate" && isAuthedPath\(url\.pathname\),\s*\n\s*handler: new NetworkOnly\(\),/,
  );
});

test("self-order navigations never cache seating-specific SSR HTML", () => {
  const swSource = normalizeEol(
    readFileSync(new URL("../app/sw.ts", import.meta.url), "utf8"),
  );

  assert.match(
    swSource,
    /request\.mode === "navigate" && url\.pathname\.startsWith\("\/q\/"\),\s*\n\s*handler: new NetworkOnly\(\),/,
  );

  const selfOrderGuard = swSource.indexOf('url.pathname.startsWith("/q/")');
  const publicPageCache = swSource.indexOf(
    'handler: new NetworkFirst({\n      cacheName: "pages"',
  );
  assert.ok(selfOrderGuard >= 0, "expected a self-order navigation guard");
  assert.ok(publicPageCache >= 0, "expected the generic public page cache");
  assert.ok(
    selfOrderGuard < publicPageCache,
    "self-order NetworkOnly must precede the generic navigation cache",
  );
});

test("login navigation never serves a cached page shell", () => {
  const swSource = normalizeEol(
    readFileSync(new URL("../app/sw.ts", import.meta.url), "utf8"),
  );

  assert.match(
    swSource,
    /request\.mode === "navigate" && url\.pathname === "\/login",\s*\n\s*handler: new NetworkOnly\(\),/,
  );

  const loginGuard = swSource.indexOf('url.pathname === "/login"');
  const publicPageCache = swSource.indexOf(
    'handler: new NetworkFirst({\n      cacheName: "pages"',
  );
  assert.ok(loginGuard >= 0, "expected a login navigation guard");
  assert.ok(publicPageCache >= 0, "expected the generic public page cache");
  assert.ok(
    loginGuard < publicPageCache,
    "login NetworkOnly must precede the generic navigation cache",
  );
});

test("Serwist precache keeps install assets but skips mascot art", () => {
  const configSource = readFileSync(
    new URL("../serwist.config.js", import.meta.url),
    "utf8",
  );

  assert.match(configSource, /manifestTransforms/);
  assert.match(configSource, /public\/brand\/mascot\//);
  assert.match(configSource, /\/brand\/mascot\//);
  assert.doesNotMatch(configSource, /globPublicPatterns/);
});

// Mirrors app/sw.ts's isOperatorShellPath — sw.ts runs in the SW global scope
// and can't be imported directly from a Node test.
const BRANCH_STATION_SEGMENTS = ["pos", "kds", "pickup"];
function isOperatorShellPath(pathname: string) {
  if (!pathname.startsWith("/br/")) return false;
  const segments = pathname.split("/").filter(Boolean);
  const stationSegment = segments[2];
  return (
    stationSegment == null || !BRANCH_STATION_SEGMENTS.includes(stationSegment)
  );
}

test("isOperatorShellPath matches the operator entry/root and excludes POS/KDS/Pickup", () => {
  assert.equal(isOperatorShellPath("/br/3"), true);
  assert.equal(isOperatorShellPath("/br/3/dashboard"), true);
  assert.equal(isOperatorShellPath("/br/3/stock/on-hand"), true);
  assert.equal(isOperatorShellPath("/br/3/pos"), false);
  assert.equal(isOperatorShellPath("/br/3/kds"), false);
  assert.equal(isOperatorShellPath("/br/3/pickup"), false);
  assert.equal(isOperatorShellPath("/"), false);
  assert.equal(isOperatorShellPath("/employee"), false);
});

test("self-order QR preview keeps staff inside the PWA scope", () => {
  const tableSettingsSource = readFileSync(
    new URL(
      "../app/(protected)/br/_shared/settings/tables/table-table.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    tableSettingsSource,
    /buildSelfOrderUrl\(table\.token, origin\)/,
  );
  assert.match(
    tableSettingsSource,
    /const previewHref = table \? `\/q\/\$\{table\.token\}` : "";/,
  );
  assert.match(
    tableSettingsSource,
    /render=\{<a href=\{previewHref\} \/>\}/,
  );
  assert.doesNotMatch(tableSettingsSource, /target="_blank"/);
});

test("offline page is explicitly precached and reuses the shared error copy", () => {
  const offlinePageSource = readFileSync(
    new URL("../app/offline/page.tsx", import.meta.url),
    "utf8",
  );
  const serwistConfigSource = readFileSync(
    new URL("../serwist.config.js", import.meta.url),
    "utf8",
  );

  assert.match(serwistConfigSource, /url: "\/offline"/);
  assert.match(serwistConfigSource, /size: 0/);
  assert.match(serwistConfigSource, /url\.endsWith\("\/_buildManifest\.js"\)/);
  assert.match(offlinePageSource, /ERRORS_VI\.networkError/);
  assert.match(offlinePageSource, /ACTIONS_VI\.retry/);
  assert.match(offlinePageSource, /AppEmptyState/);
  assert.match(offlinePageSource, /size="touch"/);
});

test("operator contained toolbar still shows an update row in standalone", () => {
  const toolbarSource = readFileSync(
    new URL("../app/components/pwa-toolbar.tsx", import.meta.url),
    "utf8",
  );
  const operatorToolbarSource = readFileSync(
    new URL(
      "../app/(protected)/br/[branchId]/(operator)/operator-pwa-toolbar.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const operatorCopySource = readFileSync(
    new URL("../lib/messages/operator.ts", import.meta.url),
    "utf8",
  );

  const updateGate = toolbarSource.indexOf(
    "hasNewVersion && copy.updateHint && copy.updateButton",
  );
  const standaloneHide = toolbarSource.indexOf(
    "if (isStandalone && isOnline) return null;",
  );
  assert.ok(updateGate >= 0, "expected an update-banner gate");
  assert.ok(standaloneHide >= 0, "expected standalone hide for install chrome");
  assert.ok(
    updateGate < standaloneHide,
    "update banner must run before contained standalone hide",
  );
  assert.match(operatorToolbarSource, /updateHint: copy\.updateHint/);
  assert.match(operatorToolbarSource, /updateButton: copy\.updateButton/);
  assert.match(operatorCopySource, /updateHint: "Có phiên bản mới của ứng dụng\."/);
  assert.match(operatorCopySource, /updateButton: "Tải lại"/);
});

test("full-bleed install falls back to browser help when no native prompt exists", () => {
  const toolbarSource = readFileSync(
    new URL("../app/components/pwa-toolbar.tsx", import.meta.url),
    "utf8",
  );
  const operationalToolbarSource = readFileSync(
    new URL(
      "../app/(protected)/br/[branchId]/_components/operational-pwa/toolbar.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    toolbarSource,
    /setHelpMode\(isIosPwaInstall \? "ios" : "browser"\)/,
  );
  assert.doesNotMatch(
    toolbarSource,
    /disabled=\{!installAvailable \|\| installPending\}/,
  );
  assert.match(operationalToolbarSource, /browserDialogTitle:/);
  assert.match(operationalToolbarSource, /browserSteps:/);
});

test("KDS and Pickup show a landscape rotate hint; POS keeps dvh height", () => {
  const kdsLayout = readFileSync(
    new URL("../app/(protected)/br/[branchId]/kds/layout.tsx", import.meta.url),
    "utf8",
  );
  const pickupLayout = readFileSync(
    new URL(
      "../app/(protected)/br/[branchId]/pickup/layout.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const posLayout = readFileSync(
    new URL("../app/(protected)/br/[branchId]/pos/layout.tsx", import.meta.url),
    "utf8",
  );
  const hintSource = readFileSync(
    new URL(
      "../app/(protected)/br/[branchId]/_components/operational-pwa/landscape-hint.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(kdsLayout, /<StationLandscapeHint \/>/);
  assert.match(pickupLayout, /<StationLandscapeHint \/>/);
  assert.doesNotMatch(posLayout, /StationLandscapeHint/);
  assert.doesNotMatch(posLayout, /md:min-h-screen/);
  assert.match(hintSource, /orientation\.lock\("landscape"\)/);
  assert.match(hintSource, /messages\.common\.stationRotateLandscape/);
});

test("bottom chrome prefers Chrome 135 max safe-area inset", () => {
  const uiStyles = readFileSync(
    new URL("../../../packages/ui/src/styles/globals.css", import.meta.url),
    "utf8",
  );
  const dock = readFileSync(
    new URL(
      "../app/(protected)/br/[branchId]/pos/_components/pos-mobile-action-bar.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    uiStyles,
    /@utility chrome-safe-pb \{[\s\S]*safe-area-max-inset-bottom/,
  );
  assert.match(
    uiStyles,
    /@utility pos-safe-bottom \{[\s\S]*safe-area-max-inset-bottom/,
  );
  assert.match(uiStyles, /@utility pos-keyboard-lift/);
  assert.match(dock, /pos-keyboard-lift/);
  assert.match(dock, /useVisualViewportKeyboardInset/);
});

