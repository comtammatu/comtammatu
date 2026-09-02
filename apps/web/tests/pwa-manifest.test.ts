import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { GET as getOperatorManifest } from "../app/(protected)/br/[branchId]/(operator)/manifest.webmanifest/route";
import { GET as getKdsManifest } from "../app/(protected)/br/[branchId]/kds/manifest.webmanifest/route";
import { GET as getPosManifest } from "../app/(protected)/br/[branchId]/pos/manifest.webmanifest/route";
import { GET as getPickupManifest } from "../app/(protected)/br/[branchId]/pickup/manifest.webmanifest/route";
import { GET as getMeManifest } from "../app/(protected)/me/manifest.webmanifest/route";
import { PWA_LAUNCHER_APPS } from "../app/_lib/pwa-launcher-icons";
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
    shortcuts?: unknown;
    start_url?: unknown;
  };

  assert.equal(manifest.id, "/");
  assert.equal(manifest.name, "Cơm Tấm Má Tư - Cổng vận hành");
  assert.equal(manifest.orientation, "portrait");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.short_name, "Cổng Má Tư");
  assert.equal(manifest.start_url, "/");
  assert.deepEqual(manifest.categories, ["business", "productivity"]);
  assert.equal(manifest.shortcuts, undefined);
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
    icons?: Array<{ src?: unknown; sizes?: unknown; purpose?: unknown }>;
  };

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("Content-Type"),
    "application/manifest+json; charset=utf-8",
  );
  assert.equal(manifest.id, "/br/3");
  assert.equal(manifest.name, "Cơm Tấm Má Tư - Cổng vận hành");
  assert.equal(manifest.start_url, "/br/3");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.short_name, "Cổng Má Tư");
  assert.equal(manifest.orientation, "portrait");
  assert.ok(manifest.icons && manifest.icons.length >= 3);
  assert.ok(
    manifest.icons?.some(
      (icon) =>
        icon.sizes === "512x512" &&
        icon.purpose === "any" &&
        icon.src === "/icons/icon-cong-any-512.png",
    ),
  );
  assert.ok(
    manifest.icons?.some(
      (icon) =>
        icon.sizes === "512x512" &&
        icon.purpose === "maskable" &&
        icon.src === "/icons/icon-cong-maskable-512.png",
    ),
  );
});

test("operational manifests keep overlapping origin scope", () => {
  const operationalSource = readFileSync(
    new URL(
      "../app/(protected)/br/[branchId]/_lib/operational-manifest.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const meManifestSource = readFileSync(
    new URL(
      "../app/(protected)/me/manifest.webmanifest/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const rootManifest = JSON.parse(
    readFileSync(
      new URL("../public/manifest.webmanifest", import.meta.url),
      "utf8",
    ),
  ) as { scope?: unknown };

  assert.match(operationalSource, /scope: "\/"/);
  assert.doesNotMatch(operationalSource, /scope: `\/br/);
  assert.match(meManifestSource, /scope: "\/"/);
  assert.equal(rootManifest.scope, "/");
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

test("root layout keeps the owner control_surface manifest", () => {
  const rootLayoutSource = readFileSync(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  );

  assert.match(rootLayoutSource, /manifest: "\/manifest\.webmanifest"/);
});

test("operator layout mounts its per-branch manifest link and install toolbar", () => {
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
  assert.doesNotMatch(layoutSource, /manifest: "\/manifest\.webmanifest"/);
  assert.match(layoutSource, /title: "Cổng Má Tư"/);
  assert.match(layoutSource, /<OperatorPwaToolbar \/>/);
});

test("/me layout mounts its personnel manifest and contained install toolbar", () => {
  const layoutSource = readFileSync(
    new URL("../app/(protected)/me/layout.tsx", import.meta.url),
    "utf8",
  );

  assert.match(layoutSource, /manifest: "\/me\/manifest\.webmanifest"/);
  assert.match(layoutSource, /title: "Trang cá nhân"/);
  assert.match(layoutSource, /<PwaRuntimeProvider>/);
  assert.match(layoutSource, /<MePwaToolbar \/>/);
  assert.equal(
    layoutSource.match(/<PwaRuntimeProvider>/g)?.length,
    1,
    "/me must not double-wrap PwaRuntimeProvider",
  );
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

  // Remaining navigations (stations, /me, control_surface) stay NetworkOnly
  // with no fallback plugin. Do not restore a NetworkFirst `pages` HTML cache.
  assert.match(
    swSource,
    /matcher: \(\{ request \}\) => request\.mode === "navigate",\s*\n\s*handler: new NetworkOnly\(\),/,
  );
  assert.doesNotMatch(swSource, /AUTHED_NAV_PREFIXES/);
  assert.doesNotMatch(swSource, /new NetworkFirst/);
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
  const remainingNav = swSource.indexOf(
    'matcher: ({ request }) => request.mode === "navigate",\n    handler: new NetworkOnly()',
  );
  assert.ok(selfOrderGuard >= 0, "expected a self-order navigation guard");
  assert.ok(remainingNav >= 0, "expected the remaining-navigation NetworkOnly");
  assert.ok(
    selfOrderGuard < remainingNav,
    "self-order NetworkOnly must precede the remaining-navigation NetworkOnly",
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
  const remainingNav = swSource.indexOf(
    'matcher: ({ request }) => request.mode === "navigate",\n    handler: new NetworkOnly()',
  );
  assert.ok(loginGuard >= 0, "expected a login navigation guard");
  assert.ok(remainingNav >= 0, "expected the remaining-navigation NetworkOnly");
  assert.ok(
    loginGuard < remainingNav,
    "login NetworkOnly must precede the remaining-navigation NetworkOnly",
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
  assert.match(
    serwistConfigSource,
    /url !== "\/offline"/,
    "the transform must remove Next's generated /offline entry before adding the canonical one",
  );
  assert.match(offlinePageSource, /ERRORS_VI\.networkError/);
  assert.match(offlinePageSource, /ACTIONS_VI\.retry/);
  assert.match(offlinePageSource, /AppEmptyState/);
  assert.match(offlinePageSource, /size="touch"/);
});

test("authenticated HTML navigations never match a NetworkFirst pages cache", () => {
  const swSource = normalizeEol(
    readFileSync(new URL("../app/sw.ts", import.meta.url), "utf8"),
  );

  const operatorFallback = swSource.indexOf(
    "request.mode === \"navigate\" && isOperatorShellPath(url.pathname)",
  );
  const remainingNav = swSource.indexOf(
    'matcher: ({ request }) => request.mode === "navigate",\n    handler: new NetworkOnly()',
  );
  assert.ok(operatorFallback >= 0, "expected operator NetworkOnly + offline fallback");
  assert.ok(remainingNav >= 0, "expected remaining-navigation NetworkOnly");
  assert.ok(
    operatorFallback < remainingNav,
    "operator offline fallback must precede remaining-navigation NetworkOnly",
  );

  assert.match(swSource, /\/me/);
  assert.match(swSource, /\/settings/);
  assert.match(swSource, /\/promotions/);
  assert.match(swSource, /\/branches/);
  assert.match(swSource, /\/feedback/);
  assert.match(swSource, /\/work/);
  assert.match(swSource, /control_surface HTML/);
  assert.doesNotMatch(swSource, /cacheName: "pages"/);
  assert.doesNotMatch(swSource, /networkTimeoutSeconds/);
});

test("contained operator toolbar shows the undismissable update banner", () => {
  const pwaToolbarSource = readFileSync(
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
  const operatorMessagesSource = readFileSync(
    new URL("../lib/messages/operator.ts", import.meta.url),
    "utf8",
  );
  const stationToolbarSource = readFileSync(
    new URL(
      "../app/(protected)/br/[branchId]/_components/operational-pwa/toolbar.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const meToolbarSource = readFileSync(
    new URL("../app/(protected)/me/me-pwa-toolbar.tsx", import.meta.url),
    "utf8",
  );
  const employeeMessagesSource = readFileSync(
    new URL("../lib/messages/employee.ts", import.meta.url),
    "utf8",
  );

  const containedLayout = pwaToolbarSource.slice(
    pwaToolbarSource.indexOf("// Contained (operator portal)."),
  );
  const hideStandalone = containedLayout.indexOf(
    "if (isStandalone && isOnline) return null;",
  );
  const updateBanner = containedLayout.indexOf(
    "hasNewVersion && copy.updateHint && copy.updateButton",
  );
  assert.ok(updateBanner >= 0, "contained layout must render the update row");
  assert.ok(hideStandalone >= 0, "contained layout still hides when quiet");
  assert.ok(
    updateBanner < hideStandalone,
    "update banner must precede the standalone+online hide",
  );
  assert.match(containedLayout, /window\.location\.reload\(\)/);
  assert.match(containedLayout, /role="alert"/);
  assert.doesNotMatch(
    containedLayout.slice(0, hideStandalone),
    /handleDismiss/,
  );

  assert.match(operatorToolbarSource, /updateHint: copy\.updateHint/);
  assert.match(operatorToolbarSource, /updateButton: copy\.updateButton/);
  assert.match(
    operatorMessagesSource,
    /updateHint: "Có phiên bản mới của ứng dụng\."/,
  );
  assert.match(operatorMessagesSource, /updateButton: "Tải lại"/);
  assert.match(
    stationToolbarSource,
    /updateHint: "Có phiên bản mới của ứng dụng\."/,
  );
  assert.match(stationToolbarSource, /updateButton: "Tải lại"/);
  assert.match(meToolbarSource, /updateHint: copy\.updateHint/);
  assert.match(meToolbarSource, /updateButton: copy\.updateButton/);
  assert.match(
    employeeMessagesSource,
    /updateHint: "Có phiên bản mới của ứng dụng\."/,
  );
  assert.match(employeeMessagesSource, /updateButton: "Tải lại"/);
  assert.doesNotMatch(employeeMessagesSource, /Má Tư NV/);
});

type ManifestIcons = Array<{ src?: unknown; purpose?: unknown }>;

function meManifestRequest() {
  return new Request(
    "https://app.test/me/manifest.webmanifest",
  ) as Parameters<typeof getMeManifest>[0];
}

test("/me PWA manifest uses personnel identity and overlapping origin scope", async () => {
  const response = await getMeManifest(meManifestRequest());
  const manifest = (await response.json()) as {
    id?: unknown;
    name?: unknown;
    orientation?: unknown;
    scope?: unknown;
    short_name?: unknown;
    start_url?: unknown;
    icons?: ManifestIcons;
  };

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("Content-Type"),
    "application/manifest+json; charset=utf-8",
  );
  assert.equal(manifest.id, "/me");
  assert.equal(manifest.start_url, "/me");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.short_name, "Trang cá nhân");
  assert.equal(manifest.name, "Cơm Tấm Má Tư - Trang cá nhân");
  assert.equal(manifest.orientation, "portrait");
  assert.ok(
    manifest.icons?.some(
      (icon) =>
        icon.purpose === "any" && icon.src === "/icons/icon-me-any-512.png",
    ),
  );
  assert.ok(
    manifest.icons?.some(
      (icon) =>
        icon.purpose === "maskable" &&
        icon.src === "/icons/icon-me-maskable-512.png",
    ),
  );
});

test("launcher icons split any vs maskable and stay distinct per app", async () => {
  const operationalSource = readFileSync(
    new URL(
      "../app/(protected)/br/[branchId]/_lib/operational-manifest.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const rootManifest = readFileSync(
    new URL("../public/manifest.webmanifest", import.meta.url),
    "utf8",
  );
  const iconsDir = new URL("../public/icons/", import.meta.url);

  assert.doesNotMatch(operationalSource, /any maskable/);
  assert.doesNotMatch(rootManifest, /any maskable/);

  for (const app of PWA_LAUNCHER_APPS) {
    for (const file of [
      `icon-${app}-any-192.png`,
      `icon-${app}-any-512.png`,
      `icon-${app}-maskable-512.png`,
    ]) {
      assert.equal(
        existsSync(new URL(file, iconsDir)),
        true,
        `missing ${file}`,
      );
    }
  }

  const pos = (await (
    await getPosManifest(
      new Request("https://app.test/br/3/pos/manifest.webmanifest") as Parameters<
        typeof getPosManifest
      >[0],
      { params: Promise.resolve({ branchId: "3" }) },
    )
  ).json()) as { icons?: ManifestIcons };
  const kds = (await (
    await getKdsManifest(
      new Request("https://app.test/br/3/kds/manifest.webmanifest") as Parameters<
        typeof getKdsManifest
      >[0],
      { params: Promise.resolve({ branchId: "3" }) },
    )
  ).json()) as { icons?: ManifestIcons };
  const pickup = (await (
    await getPickupManifest(
      new Request(
        "https://app.test/br/3/pickup/manifest.webmanifest",
      ) as Parameters<typeof getPickupManifest>[0],
      { params: Promise.resolve({ branchId: "3" }) },
    )
  ).json()) as { icons?: ManifestIcons };
  const operator = (await (
    await getOperatorManifest(
      new Request("https://app.test/br/3/manifest.webmanifest") as Parameters<
        typeof getOperatorManifest
      >[0],
      { params: Promise.resolve({ branchId: "3" }) },
    )
  ).json()) as { icons?: ManifestIcons };
  const me = (await (
    await getMeManifest(meManifestRequest())
  ).json()) as { icons?: ManifestIcons };
  const root = JSON.parse(rootManifest) as { icons?: ManifestIcons };

  const srcs = (icons: ManifestIcons | undefined) =>
    (icons ?? []).map((icon) => String(icon.src)).sort();

  assert.deepEqual(srcs(pos.icons), [
    "/icons/icon-pos-any-192.png",
    "/icons/icon-pos-any-512.png",
    "/icons/icon-pos-maskable-512.png",
  ]);
  assert.deepEqual(srcs(kds.icons), [
    "/icons/icon-kds-any-192.png",
    "/icons/icon-kds-any-512.png",
    "/icons/icon-kds-maskable-512.png",
  ]);
  assert.deepEqual(srcs(pickup.icons), [
    "/icons/icon-pickup-any-192.png",
    "/icons/icon-pickup-any-512.png",
    "/icons/icon-pickup-maskable-512.png",
  ]);
  assert.deepEqual(srcs(operator.icons), [
    "/icons/icon-cong-any-192.png",
    "/icons/icon-cong-any-512.png",
    "/icons/icon-cong-maskable-512.png",
  ]);
  assert.deepEqual(srcs(me.icons), [
    "/icons/icon-me-any-192.png",
    "/icons/icon-me-any-512.png",
    "/icons/icon-me-maskable-512.png",
  ]);
  assert.deepEqual(srcs(root.icons), srcs(operator.icons));

  const uniqueAny512 = new Set(
    [pos, kds, pickup, operator, me].map(
      (manifest) =>
        manifest.icons?.find(
          (icon) =>
            icon.purpose === "any" && String(icon.src).endsWith("-512.png"),
        )?.src,
    ),
  );
  assert.equal(uniqueAny512.size, 5);
});

test("pickup is not given an iOS splash matrix; KDS and pickup request Wake Lock", () => {
  const pickupLayout = readFileSync(
    new URL(
      "../app/(protected)/br/[branchId]/pickup/layout.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const kdsLayout = readFileSync(
    new URL("../app/(protected)/br/[branchId]/kds/layout.tsx", import.meta.url),
    "utf8",
  );
  const rootLayout = readFileSync(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  );
  const meLayout = readFileSync(
    new URL("../app/(protected)/me/layout.tsx", import.meta.url),
    "utf8",
  );

  for (const source of [pickupLayout, kdsLayout, rootLayout, meLayout]) {
    assert.doesNotMatch(source, /apple-touch-startup-image/);
    assert.doesNotMatch(source, /startupImage/);
  }
  assert.match(kdsLayout, /<ScreenWakeLock \/>/);
  assert.match(pickupLayout, /<ScreenWakeLock \/>/);
});
