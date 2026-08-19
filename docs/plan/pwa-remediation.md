# PWA remediation and rollout

> **Locked / executed for Phases 0–4 product decisions.** Do not implement
> product PWA work from this file. Canonical SSOT: `docs/spec/pwa.md`.
> Do not re-do H2, icons, or `/me`.

**Status:** Phases 0–4 product decisions are locked and executed in the
tree (2026-08-19). Remaining work is **Phase 5 only**: HyperOS ops
runbook and the native Android trigger named in ADR 0038 — not a PWA
code patch in this repo.

**Review tier:** T2 for remaining ops writing. T3 if native Android in
repository `app` is triggered (out of this monorepo).

**Decision owner:** Owner (`Bình`).

**Related:** ADR 0038 (PWA stays production here; native Android is a
separate `app` repo, not TWA); D012 (no local-first POS); D046 /
`docs/spec/toast-notification-system.md`; `docs/spec/architecture.md`.

Staleness allowlist keeps this file as a **pointer**. Git holds the
retired phase playbook. Do not delete product PWA/SW code.

---

## Canonical SSOT

`docs/spec/pwa.md` owns install identity, icons, SW/offline, OS matrix,
and `/me`. Do not reopen OQ-2, OQ-3 (overlapping `scope: "/"`), OQ-4, or
OQ-5. Do not tighten `scope`. Do not move station URLs.

## Executed (do not redo)

| Phase | Outcome |
| --- | --- |
| 0 | Spec SSOT in `docs/spec/pwa.md` |
| 1 | H5 NetworkOnly authed nav; H9 `sw.js` `no-cache`; H6 update banner |
| 2 | H2/H20 operator `/br/{id}` identity; H7/H8 `/me` PWA |
| 3 | Distinct `any` / `maskable` icons and per-app badges |
| 4 | H10 cancelled (OQ-5); Wake Lock on KDS/pickup |

Optional later polish (not a license to reopen identity): H11 station
`themeColor`, H12 screenshots.

## Remaining — Phase 5 (H1)

Vietnamese runbook under `docs/runbooks/pos-kds/` (pin Chrome, ignore
battery optimizations, do not expect a 12-hour PWA). Native work stays
in repository `app` when ADR 0038 triggers fire (HyperOS kill, USB/Sunmi
print, KDS without per-chef login). No Gradle/Android in `comtammatu`.
No TWA. No local-first POS.

## Non-goals

- Local-first POS, queued payments, or caching mutation POST/RSC
- Closed-app Web Push / FCM / APNs (D046)
- TWA, Capacitor, Play listing, or Android sources in this monorepo
- Native iOS; pickup stays PWA (ADR 0038)
- Re-doing H2, icons, `/me`, or tightening `scope: "/"`
- Editing dirty KDS touch-layout files

## Owner locks (pointer)

Recorded 2026-08-19; detail lives in `docs/spec/pwa.md`: OQ-2 `/me`
installable; OQ-3 per-branch `"Cổng"` `start_url` with overlapping
`scope: "/"`; OQ-4 distinct icons; OQ-5 no iOS splash (pickup = Android
TV).
