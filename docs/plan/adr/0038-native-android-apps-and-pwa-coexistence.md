# ADR 0038 — Native Android apps alongside the PWA

**Status:** Accepted (2026-08-13)

**Decision owner:** Owner

**Supersedes:** D062 (PWA-only operations client). That bar was a mistaken
constraint on branch devices.

**Amends:** D012 (drops the “PWA is the only operations client / no native
rewrite” clauses; local-first POS, non-consumer payment rail, floor `cashier`,
and ADR 0023 void-leader stay). ADR 0025 (native clients are no longer a
non-goal; `apps/web` still must not split into module micro-apps).

Runtime PWA contract: [`docs/spec/pwa.md`](../../spec/pwa.md). Monorepo
topology: [`docs/spec/architecture.md`](../../spec/architecture.md). This ADR
owns the native-client map; do not scaffold Android in `comtammatu`.

## Decision

### 1. PWA and print-agent stay production in this repository

This monorepo keeps `apps/web` + `apps/print-agent`. Cloud-authoritative
Postgres/RPC stays. Local-first POS stays rejected (D012 remainder). Native is
optional per branch. A branch that still uses the PWA keeps the Windows
print-agent.

### 2. Native lives in a separate Git repository named `app`

When a branch needs native, create GitHub repository `app` (not inside
`comtammatu`). It consumes the same Supabase project, RPCs, ACL, and
`print_jobs` contracts. It must not fork payment, stock, or void rules.

No WebView wrap of `/br/…/pos` or `/kds`. Kotlin/Compose (or equivalent
native UI). Not Capacitor/TWA.

### 3. Product names and open order

Separate APKs. POS is not KDS. Do not ship empty APKs to fill the catalog.
CRM has no native name yet. Pickup display stays PWA. No iOS native in this
ADR.

| Open order | Product name | Job |
| --- | --- | --- |
| 1 (when a branch needs it) | Má Tư POS | Counter: sell, shift, cash drawer, USB/Sunmi/LAN print and branch printer setup in-app. Waiter phones use the same APK as PDA: serve only — no shift, no 86, not the print host. |
| 1 (when a branch needs it) | Má Tư KDS | Kitchen board. Branch/station pairing code, not per-chef login. Does not print. |
| Later, one at a time | Má Tư Kho Hàng | Inventory floor work when PWA is not enough. |
| Later, one at a time | Má Tư Nhân Sự | Roster, punch, approvals when `/me` PWA is not enough. |
| Later, one at a time | Má Tư Quản Lý | Owner/BM phone. Does not replace control-surface `xwide` web. |

### 4. Print on native POS — no extra agent install

On a native POS counter, the APK prints (USB, Sunmi inner, LAN) and owns
branch printer setup. Staff do not install print-agent. After that branch is
stable, uninstall the Windows agent there only. D011 still describes
`apps/print-agent` in this repo (LAN-only).

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
