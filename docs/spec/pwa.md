# PWA Contract

> Status: accepted product contract. Isolation (OQ-3): overlapping `scope: "/"`
> is intentional; `"Cổng"` uses per-branch `start_url`. Locked 2026-08-19:
> OQ-2 `/me` installable; OQ-4 distinct `any`/`maskable` icons + badges;
> OQ-5 no iOS splash — pickup primary device is Android TV. Visual chrome:
> `docs/spec/design-system.md`. Routes/ACL: `docs/modules/web-app.md`.

Cloud-first PWA in this monorepo. Native Android is a separate `app` repo
(ADR 0038). POS is not local-first (D012). `/me` stays an installable
personnel PWA until native `Má Tư Nhân Sự`.

## Installable surfaces

Product rule: **one launcher identity per operational role**. Do not install
the owner root app as the branch station.

| Surface | Path pattern | Installable? | Manifest identity | Notes |
| --- | --- | --- | --- | --- |
| Owner `control_surface` | `/` | Yes (root `public/manifest.webmanifest`) | `id` `/`, `start_url` `/` | L0 only |
| Branch operator portal (`Cổng`) | `/br/{id}` | Yes | `/br/{id}/manifest.webmanifest` | `id` / `start_url` `/br/{id}` |
| POS | `/br/{id}/pos` | Yes | per-branch station | portrait, cloud-first; URL stays nested |
| KDS | `/br/{id}/kds` | Yes | per-branch station | landscape; URL stays nested |
| Pickup display (`Gọi số`) | `/br/{id}/pickup` | Yes, stay PWA (ADR 0038: no native wrap) | per-branch station | landscape; **Android TV** primary |
| Staff `/me` (`Trang cá nhân`) | `/me` | Yes | `/me/manifest.webmanifest` | `id` / `start_url` `/me`; contained toolbar |
| Self-order `/q/` | `/q/` | **Not** installable | — | customer |
| print-agent | — | Not a PWA | — | Windows LAN service |

Launcher identity is `id` + `start_url` + `name` / `short_name`, not a
narrower manifest `scope`. Owner root, `"Cổng"`, POS, KDS, Pickup, and `/me`
all set `scope: "/"`. Overlap is intentional so auth redirects and
station-to-operator toolbar links stay inside the installed app. Do not
tighten scope. Do not move station URLs. Nested-scope, subdomain, or `/op`
prefix splits wait for a capturing incident. Window isolation is not a goal:
install the right app on the right device.

## Icons

Do not ship `"purpose": "any maskable"` on the round seal with rim type.

- `purpose: any` — full Má Tư seal (`icon-{app}-any-192.png` / `-512.png`).
- `purpose: maskable` — seal inside the 80% safe zone on `#fff6ee`
  (`icon-{app}-maskable-512.png`).
- Per-app badge (same seal family, DS cream / navy / terracotta): `"Cổng"`,
  POS, `"Bếp"`, `"Số"`, `"Tôi"` (`/me`). Root and operator share `"Cổng"`.

Unbadged `icon-192.png` / `icon-512.png` remain notification fallbacks, not
launcher identity.

## Offline / cache contract

Cloud-first. POS is **not** local-first (D012). Static assets may degrade the
shell; they never become transaction authority.

Service worker must be **NetworkOnly** (no HTML identity cache) for:

- Mutations (non-GET)
- RSC / Server Actions (`RSC`, `Next-Action`, `_rsc`)
- Supabase (REST, Auth, Realtime, Storage)
- `/login`
- `/q/`
- POS, KDS, pickup navigations
- Authenticated HTML including `/me`, `/settings`, `/promotions`, `/branches`,
  `/feedback`, `/work`, and other authed shells

Operator may serve a dedicated precached `/offline` shell (PWA-2) **only** for
failed navigations under non-station `/br/{id}` paths. That shell replaces the
browser error page; it must not replay live HTML or queued mutations.

Offline UX: a clear banner, and block non-cash payments (VietQR). **Never**
queue payments in the service-worker cache.

No closed-app Web Push, FCM, or APNs. In-app `Notification` only while the
installed PWA is open (`docs/spec/toast-notification-system.md`).

No TWA, Capacitor, or Play listing inside this monorepo (ADR 0038). Native
Android is a separate `app` repository when HyperOS or other ADR 0038 triggers
are met.

`sw.js` is served with `Cache-Control: no-cache` from
`apps/web/next.config.ts` (`source: "/sw.js"`). Preview and development
must not register a service worker.

One Serwist worker (`apps/web/app/sw.ts`). Do not add Workbox. Do not cache
Next HTML incorrectly.

## OS / browser support

| Role | Minimum | Browser | Tier |
| --- | --- | --- | --- |
| POS / KDS (required floor) | Android 13+ | Chrome 120+ (Chromium) | Primary |
| Pickup / `Gọi số` | Android TV + Chrome | Chrome (leanback) | Primary display |
| Older branch devices | Android 12 + Chrome 108+ | Chrome | Secondary |
| Staff `/me`, branch managers on phone | iOS 17+ / iPadOS 17+ | Safari (Add to Home Screen) | Primary iOS |
| iOS technical floor | iOS 16.4 | Safari installed PWA | Hard floor (SW + Notification API for Home Screen apps). This project does **not** use closed-app push. |
| Current iOS (2026) | iOS 26 | Safari 26 | Verify (Add to Home Screen opens as a web app by default) |
| Owner backoffice desktop | Windows 11 / macOS 14+ | Chrome 120+, Edge 120+, Safari 17+ (Add to Dock) | Primary desktop — convenience, not a sale shift |
| Explicitly unsupported for operations | iOS ≤ 16.3; Android 11 / Chrome < 108; Zalo/Facebook WebView; Firefox as POS; iPad as pickup | — | Wontfix |

iOS is **staff-phone floor** (`/me`, BM). It is not a counter or TV device.
Pickup is not an iPad job. Do not treat Samsung Internet or Firefox as the
operational floor.

HyperOS (Redmi Note 13, Redmi Pad 2 Pro) can kill Chrome/PWA. That is a known
platform limit (ADR 0038). Mitigation is the ops runbook plus the native
Android trigger, not PWA "optimization".

## Android TV (`Gọi số`)

Pickup already uses landscape and the existing public 10-foot board (large
type, light mode). Do **not** invent a TV-specific design system.

Honest limits (Chrome / Android TV, 2026): WebAPK / `beforeinstallprompt` is
a phone/tablet Chrome flow. Android TV launchers often have no equivalent
home-screen install. Treat the board as a kiosk URL in Chrome (pinned tab,
device kiosk/launcher wrapping the pickup URL) — not a promised Play-style
install. Leanback remote focus is the existing board; no extra TV chrome.

Screen Wake Lock is requested while KDS and pickup are visible, fail-soft,
so the TV/board is less likely to sleep. That is not a new product surface.

Phase 4 iOS `apple-touch-startup-image` is **cancelled** (OQ-5). Do not build
an iPhone/iPad splash matrix for `Gọi số`.

## Chrome / Safari quality bar

- Distinct `any` vs `maskable` icons; maskable safe zone 80%; per-app badge
- Per-surface `id` / `start_url`; overlapping `scope: "/"` stays
- Update banner on operator, stations, and `/me`
- iOS: `apple-touch-icon` 180 only — no startup-image matrix
- KDS + pickup: Screen Wake Lock when visible (fail soft)
- No second Workbox; do not cache Next HTML incorrectly

## Follow-on implementation

In the tree: Phase 1, Phase 2 (H2/H20 + H7/H8 `/me`), Phase 3 icons,
cancelled H10, Wake Lock on KDS/pickup.

Remaining later: optional station `themeColor` vs ForceLightMode (H11);
H12 screenshots; Phase 5 HyperOS ops runbook (H1). Not this contract's
blockers.

## Pointers

- ADR 0038: `docs/plan/adr/0038-native-android-apps-and-pwa-coexistence.md`
- Cloud-first / D012: `docs/spec/architecture.md`, `docs/plan/decisions.md`
- Foreground notifications: `docs/spec/toast-notification-system.md`
- Verification: `apps/web/tests/pwa-manifest.test.ts`; regressions
  `PWA-SW-NETWORKONLY-MUTATIONS`, `PWA-SELF-ORDER-NAV-NETWORKONLY`,
  `PWA-OFFLINE-GATE-CASH-ONLY` in `tasks/regressions.md`
