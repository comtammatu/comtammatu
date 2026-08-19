import type {
  PrecacheEntry,
  RuntimeCaching,
  SerwistGlobalConfig,
  SerwistPlugin,
} from "serwist";
import {
  CacheFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// POS PWA cache policy.
//
// HARD RULE: anything that mutates state, carries auth, or returns RSC payload
// MUST hit the network. A cached payment POST is the worst-possible failure
// (silent double-charge). See regressions: POS-PAYMENT-REUSE-UNIQUE-SLOT,
// HDDT-PAYMENT-FIRST-FAILSOFT-ORPHAN.
//
// Navigation HTML is NetworkOnly by default. Do not add a NetworkFirst `pages`
// cache for App Router documents — identity HTML used to leak through an
// incomplete prefix list.
//
// Branch shell only (PWA-2) — branch-scoped routes under
// `/br/{branchId}` (dashboard/orders/profile/settings/shift/
// stock/team), excluding the POS/KDS/pickup station apps. Stations keep their
// existing offline handling untouched.
const BRANCH_STATION_SEGMENTS = ["pos", "kds", "pickup"];
const isOperatorShellPath = (pathname: string) => {
  if (!pathname.startsWith("/br/")) return false;
  const segments = pathname.split("/").filter(Boolean);
  const stationSegment = segments[2];
  return (
    stationSegment == null || !BRANCH_STATION_SEGMENTS.includes(stationSegment)
  );
};

// Assigned once below, after `runtimeCaching` is built. `operatorOfflineFallback`
// only reads it lazily inside handlerDidError (called on an actual failed
// navigation, always after module init finishes), so the forward reference
// is safe.
// eslint-disable-next-line prefer-const -- assigned once, after declaration, by design (forward reference)
let serwist: Serwist;

// Serves the precached offline shell when an operator navigation fails offline.
// Equivalent to serwist's PrecacheFallbackPlugin, written inline because that
// plugin resolves its `serwist` reference eagerly at construction time — too
// early here, since this plugin is built while assembling the `runtimeCaching`
// array that `new Serwist(...)` itself consumes.
const operatorOfflineFallback: SerwistPlugin = {
  handlerDidError: async () => serwist.matchPrecache("/offline"),
};

const runtimeCaching: RuntimeCaching[] = [
  // 1. Mutations: never cache.
  {
    matcher: ({ request }) => request.method !== "GET",
    handler: new NetworkOnly(),
  },
  // 2. Server Actions / RSC payloads: never cache.
  //    Server Actions = POST + Next-Action header (already covered by #1, but
  //    Next 16 also issues GET for prefetch with RSC=1 — block both).
  {
    matcher: ({ request, url }) =>
      request.headers.get("RSC") === "1" ||
      request.headers.get("Next-Action") !== null ||
      url.searchParams.has("_rsc"),
    handler: new NetworkOnly(),
  },
  // 3. Supabase: never cache (REST + Auth + Realtime + Storage).
  {
    matcher: ({ url }) =>
      url.hostname.endsWith(".supabase.co") ||
      url.pathname.startsWith("/auth/v1/") ||
      url.pathname.startsWith("/rest/v1/"),
    handler: new NetworkOnly(),
  },
  // 4. Hashed Next static assets: cache forever (immutable).
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && url.pathname.startsWith("/_next/static/"),
    handler: new CacheFirst({ cacheName: "next-static" }),
  },
  // 5. Next image optimizer: stale-while-revalidate.
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && url.pathname.startsWith("/_next/image"),
    handler: new StaleWhileRevalidate({ cacheName: "next-image" }),
  },
  // 6. Static public assets (icons, manifests, fonts).
  {
    matcher: ({ url, sameOrigin }) =>
      sameOrigin &&
      (url.pathname.startsWith("/icons/") ||
        url.pathname.endsWith(".webmanifest") ||
        url.pathname.endsWith(".woff2") ||
        url.pathname.endsWith(".woff")),
    handler: new StaleWhileRevalidate({ cacheName: "static-assets" }),
  },
  // 7. Public authentication navigation: always load fresh UI after a deploy.
  {
    matcher: ({ request, url }) =>
      request.mode === "navigate" && url.pathname === "/login",
    handler: new NetworkOnly(),
  },
  // 8. Public self-order navigations: never cache SSR HTML. The stable table
  //    URL can outlive a seating while its response embeds the current session,
  //    batches, and bill.
  {
    matcher: ({ request, url }) =>
      request.mode === "navigate" && url.pathname.startsWith("/q/"),
    handler: new NetworkOnly(),
  },
  // 9. Operator entry/shell navigations: never cache the response (same
  //    identity-leak rule as remaining navigations), but on network failure
  //    serve the precached offline shell instead of the browser's default
  //    error page. Data stays correct — this only replaces the error page,
  //    never the live HTML.
  {
    matcher: ({ request, url }) =>
      request.mode === "navigate" && isOperatorShellPath(url.pathname),
    handler: new NetworkOnly({ plugins: [operatorOfflineFallback] }),
  },
  // 10. Remaining navigations (POS/KDS/pickup, /me, /settings, /promotions,
  //    /branches, /feedback, /work, control_surface HTML, /access-denied,
  //    and any new App Router shell): never cache. Do not maintain an
  //    authed-prefix allowlist — a missing prefix used to fall through to a
  //    NetworkFirst `pages` cache of identity HTML.
  {
    matcher: ({ request }) => request.mode === "navigate",
    handler: new NetworkOnly(),
  },
];

serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
});

// Notifications are shown from the foreground (Notification API via the page);
// this handler routes a tap to the notification's target URL.
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const rawUrl =
    event.notification.data &&
    typeof event.notification.data === "object" &&
    "url" in event.notification.data &&
    typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/notifications";
  const targetUrl = new URL(rawUrl, self.location.origin);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windows) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === targetUrl.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(targetUrl.href);
          return;
        }
      }

      await self.clients.openWindow(targetUrl.href);
    })(),
  );
});

// Purge any identity-bearing navigation HTML cached by a prior SW version
// before authed routes were excluded from the "pages" cache.
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete("pages"));
});

serwist.addEventListeners();
