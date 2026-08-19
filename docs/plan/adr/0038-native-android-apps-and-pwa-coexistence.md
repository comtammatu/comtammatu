# ADR 0038 — Native Android apps alongside the PWA

**Status:** Accepted (2026-08-13)

**Decision owner:** Owner

**Review tier:** T3 — product delivery, client topology, module-to-app map

**Supersedes:** D062 (PWA-only operations client; native rewrite only when a
hardware constraint cannot be solved with PWA). That bar was a mistaken
constraint on branch devices.

**Amends:** D012 (drops the “PWA is the only operations client / no native
rewrite” clauses; local-first POS, non-consumer payment rail, floor `cashier`,
and ADR 0023 void-leader stay). ADR 0025 (native clients are no longer a
non-goal; `apps/web` still must not split into module micro-apps).

**Related:** ADR 0025 (web ERP evolve-in-place), D011 (this repo’s print-agent
remains LAN-only until a branch cuts over to native POS print), PWA contract
`docs/spec/pwa.md`.

## Context

`apps/web` PWA plus `apps/print-agent` already run the restaurant day. A
browser cannot drive USB printers, Sunmi inner printers, or raw LAN `:9100`.
HyperOS on current floor devices (Redmi Note 13, Redmi Pad 2 Pro) can kill
Chrome/PWA. Kitchen staff should not sign in per person on KDS. Other F&B POS
products install one counter app, configure branch printers in that app, and
do not ship a second Windows agent.

D062 forbade a native client unless PWA was proven unable to reach hardware.
The Owner reverses that: native Android is an accepted branch optimization,
not a last-resort rewrite of the web ERP.

## Decision

### 1. PWA and print-agent stay production in this repository

This monorepo keeps `apps/web` + `apps/print-agent`. Cloud-authoritative
Postgres/RPC stays. Local-first POS stays rejected (D012 remainder).

Native is optional per branch. A branch that still uses the PWA keeps the
Windows print-agent. Do not scaffold Android in this repo.

### 2. Native lives in a separate Git repository named `app`

When a branch needs native, create GitHub repository `app` (not inside
`comtammatu`). It consumes the same Supabase project, RPCs, ACL, and
`print_jobs` contracts. It must not fork payment, stock, or void rules.

No WebView wrap of `/br/…/pos` or `/kds`. Kotlin/Compose (or equivalent
native UI). Not Capacitor/TWA.

### 3. Product names and open order

Separate APKs. POS is not KDS.

| Open order | Product name | Job |
| --- | --- | --- |
| 1 (when a branch needs it) | Má Tư POS | Counter: sell, shift, cash drawer, USB/Sunmi/LAN print and branch printer setup in-app. Waiter phones use the same APK as PDA: serve only — no shift, no 86, not the print host. Account grants x device role. |
| 1 (when a branch needs it) | Má Tư KDS | Kitchen board. Branch/station pairing code, not per-chef login. Does not print. |
| Later, one at a time | Má Tư Kho Hàng | Inventory floor work (count, requests, waste) when PWA is not enough. |
| Later, one at a time | Má Tư Nhân Sự | Roster, punch, approvals on a phone when `/me` PWA is not enough. |
| Later, one at a time | Má Tư Quản Lý | Owner/BM phone. Does not replace control-surface `xwide` web. |

Do not ship empty APKs to fill the catalog. CRM has no native name yet.
Pickup display stays PWA. No iOS native in this ADR.

### 4. Print on native POS — no extra agent install

On a native POS counter, the APK prints (USB, Sunmi inner, LAN) and owns
branch printer setup. Staff do not install print-agent. `print_jobs` may
remain an internal queue (PDA/KDS enqueue; counter prints). After that
branch is stable, uninstall the Windows agent there only.

D011 still describes `apps/print-agent` in this repo (LAN-only).

### 5. `apps/web` is not split by module

Finance, Inventory, HRM, CRM capabilities stay in `apps/web` (ADR 0025). A
named native APK is a second *client* for a device job, not a second web
package.

## Trigger to open repository `app`

Any one is enough: USB/Sunmi print without a PC agent; HyperOS killing the
PWA; KDS without per-chef login; waiter PDA without shift/86.

Until then: this ADR is the map. No APK work in `comtammatu`.

## Consequences

- Agents must not refuse native Android by citing D062 or “D012 native
  rewrite”. Cite this ADR. Still refuse local-first POS and splitting
  `apps/web`.
- Compatibility index: D062 deleted; D012 net effect no longer bans native
  clients.

## Verification

- No Android/Gradle tree in `comtammatu` until repository `app` exists.
- `apps/` in this repo remains `web` and `print-agent`.
- Inbound D062 references retarget this ADR or the PWA implementation
  comment only.
