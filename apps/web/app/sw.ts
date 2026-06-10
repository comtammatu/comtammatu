import type {
  PrecacheEntry,
  RuntimeCaching,
  SerwistGlobalConfig,
} from "serwist";
import {
  CacheFirst,
  NetworkFirst,
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

// POS PWA cache policy — explicit allowlist.
//
// HARD RULE: anything that mutates state, carries auth, or returns RSC payload
// MUST hit the network. A cached payment POST is the worst-possible failure
// (silent double-charge). See regressions: POS-PAYMENT-REUSE-UNIQUE-SLOT,
// HDDT-PAYMENT-FIRST-FAILSOFT-ORPHAN.
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
  // 7. HTML navigation: network-first with short timeout, cached fallback.
  {
    matcher: ({ request }) => request.mode === "navigate",
    handler: new NetworkFirst({
      cacheName: "pages",
      networkTimeoutSeconds: 3,
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
});

type PushPayload = {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    url?: string;
    notificationId?: number;
    kind?: string;
    severity?: string;
    createdAt?: string;
  };
};

function parsePushPayload(event: PushEvent): PushPayload {
  if (!event.data) return {};
  try {
    return event.data.json() as PushPayload;
  } catch {
    return { body: event.data.text() };
  }
}

self.addEventListener("push", (event: PushEvent) => {
  const payload = parsePushPayload(event);
  const title = payload.title || "Cơm Tấm Má Tư";
  const options: NotificationOptions = {
    body: payload.body,
    icon: payload.icon || "/icons/icon-192.png",
    badge: payload.badge || "/icons/favicon-32x32.png",
    tag: payload.tag,
    data: {
      url: payload.data?.url || "/notifications",
      notificationId: payload.data?.notificationId,
      kind: payload.data?.kind,
      severity: payload.data?.severity,
      createdAt: payload.data?.createdAt,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

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

serwist.addEventListeners();
