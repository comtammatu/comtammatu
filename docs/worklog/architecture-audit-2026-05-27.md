# Architecture Audit — App Router, Server Actions, Client Shells, Package Boundary

**Date:** 2026-05-27
**Tier:** T1 (audit-only, read-only; no code or migration changes in this artifact).
**Status:** DRAFT — for owner review alongside `docs/worklog/shell-helpers-refactor-plan-2026-05-27.md`.
**Working branch at audit time:** `codex/continue-ts`.
**Scope owner-confirmed in chat 2026-05-27:** Server Actions / RPC helpers · Client shells · `apps/web` ↔ `packages/*` boundary. **Out:** route-path / `(protected)`/`(public)` group restructure (route migration just closed `IF-002` on 2026-05-24, audit clean).

---

## 0. Executive summary

5 facts that decide what to do next.

1. **DRAFT plan's WS-0 has already shipped** as commit `f06c77cf feat(action-helpers): WS-0 — extend withAction + add rpc-error-map foundation`. `apps/web/app/_lib/with-action.ts` already exposes `withActionPositional`, `customAuth`, `afterSuccess`; `_lib/rpc-error-map.ts` (127 LoC) is live. **The plan's §9 acceptance gate is satisfied for WS-0** — but it never moved DRAFT → APPROVED, so subsequent workstreams are blocked on documentation, not code.
2. **The biggest unrealized leverage is the message dictionary.** `apps/web/lib/messages/*.ts` totals **2 342 LoC of structured error/state copy** across 11 modules — yet **only 1 of 73 action files** (`pos/order-actions.ts`) imports it. The other 94 importers are page-clients displaying messages, not server actions mapping errors. Mapping happens *after* the action returns instead of *inside* the action. This is the single fix that lets WS-1/WS-2 measure real LoC reduction.
3. **DRAFT plan undercounts file size pain.** DRAFT §1.1 lists 13 files >1000 LoC; audit found **17** (DRAFT missed 4 client shells: `stock-client.tsx` 1366, `pos-sessions-client.tsx` 1227, `new-po-client.tsx` 1221, `po-detail-client.tsx` 1067, plus `bill-receipt-sheet.tsx` 1349 which is in `_components/bill/` and may have been excluded as already-decomposed).
4. **`apps/web` ↔ `packages/*` boundary is healthy, not the problem.** Zero `"use client"` files import `@comtammatu/database` barrel. Zero relative imports across the packages boundary. Zero package → app imports. Zero inter-package cycles. The "Architecture" framing should NOT be sold as a package-boundary cleanup — it's a per-file decomposition problem inside `apps/web`.
5. **One genuinely dead file confirmed:** `apps/web/app/(protected)/br/[branchId]/pos/_lib/schemas.ts` — defines Zod schemas, zero importers anywhere in the repo. Likely failed extraction from a prior refactor attempt.

---

## 1. Methodology

Three read-only sweeps, evidence-first, no recommendations beyond what the owner asked.

- Re-verified DRAFT plan §1.1–§1.3 numbers against current `HEAD` (commit `e2d3a79e`, 2026-05-27).
- Cross-checked DRAFT plan's "Already exists" claims (`with-action.ts`, `lib/messages/*`, `_lib/` per-route convention) against actual import graph.
- For Layer C (package boundary), did a fresh scan — DRAFT plan does not cover it.
- All numbers reproduce with the commands in §10 Appendix.

Limit: this is a static read of the source tree. Runtime behavior (actual error paths exercised in pilot traffic) is not measured.

---

## 2. Layer A — Server Actions / RPC helpers

### 2.1 File size pain (verify DRAFT §1.1)

Files >1000 LoC in `apps/web/app/` (TS/TSX, excludes generated types):

| # | File | LoC | Kind | In DRAFT §1.1 |
|---|---|---:|---|:---:|
| 1 | `(protected)/br/[branchId]/pos/order-actions.ts` | 2149 | server actions | ✓ |
| 2 | `(protected)/br/[branchId]/pos/pos-desktop-shell.tsx` | 1650 | client shell | ✓ |
| 3 | `(protected)/br/[branchId]/pos/payment-actions.ts` | 1647 | server actions | ✓ |
| 4 | `(protected)/inventory/grn-actions.ts` | 1572 | server actions | ✓ |
| 5 | `(protected)/inventory/grn/[id]/grn-detail-client.tsx` | 1553 | client shell | ✓ |
| 6 | `(protected)/br/[branchId]/pos/order-detail-sheet.tsx` | 1510 | client shell | ✓ |
| 7 | `(protected)/inventory/production-actions.ts` | 1470 | server actions | ✓ |
| 8 | `(protected)/inventory/actions.ts` | 1429 | server actions | ✓ |
| 9 | `(protected)/menu/actions.ts` | 1397 | server actions | ✓ |
| 10 | `(protected)/inventory/stock/stock-client.tsx` | 1366 | client shell | **✗ missed** |
| 11 | `(protected)/br/[branchId]/pos/_components/bill/bill-receipt-sheet.tsx` | 1349 | client shell | **✗ missed** |
| 12 | `(protected)/br/[branchId]/settings/pos-sessions/pos-sessions-client.tsx` | 1227 | client shell | **✗ missed** |
| 13 | `(protected)/inventory/purchase-orders/new/new-po-client.tsx` | 1221 | client shell | **✗ missed** |
| 14 | `(protected)/finance/actions.ts` | 1106 | server actions | **✗ missed** |
| 15 | `(protected)/inventory/purchase-orders/[id]/po-detail-client.tsx` | 1067 | client shell | **✗ missed** |
| 16 | `(protected)/inventory/dashboard-client.tsx` | 1026 | client shell | **✗ missed** |
| 17 | `(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx` | 1008 | client shell | **✗ missed** |

**Implication for DRAFT:** the WS-3 client shell decomposition list (3 shells) is incomplete; there are at least 7 more shells in the same pain band. WS-2 server-action list missed `finance/actions.ts` (1106 LoC) — that's a 6th high-density action file.

### 2.2 `withAction` adoption (new measurement)

| Metric | Count |
|---|---:|
| Action files (`actions.ts` + `*-actions.ts`) in `app/(protected)/` | 73 |
| Files using `withAction` / `withFormAction` | 32 |
| Files NOT using helper | 41 |
| Of the 41, files with explicit `// Skip withAction:` annotation | 15 |
| Of the 41, files with NO annotation (silent bypass) | **26** |

DRAFT plan §1.2 treated the 15 annotated skips as the universe. The audit shows **26 additional files** silently bypass the helper without explaining why — these are not "skip with reason," they are pre-helper holdouts that have never been touched. Coverage is **43.8 %**, not the implicit ~80 % the DRAFT framing suggests.

### 2.3 Skip-withAction annotation distribution (verify DRAFT §1.2)

15 annotations confirmed. Distribution:

| File | Annotations | Skip reason taxonomy |
|---|---:|---|
| `pos/order-actions.ts` | 9 | positional args (7), composite auth (1), idempotency (1) |
| `pos/session-actions.ts` | 2 | positional args |
| `inventory/purchase-order-actions.ts` | 2 | positional args |
| `inventory/supplier-actions.ts` | 1 | positional args |
| `pos/payment-actions.ts` | 0 | (none — uses other skip patterns, likely unannotated) |
| HR / `(protected)/hr/*` | 0 | DRAFT mentioned HR; no annotations found |

**Correction to DRAFT §1.2:** "15 annotations across POS + inventory + HR" → "15 across POS + inventory only." No HR action file carries a `// Skip withAction:` annotation. The HR mention can be dropped from the plan.

### 2.4 Boilerplate density per file (verify DRAFT §1.2)

Pattern counts per file (`safeParse(` + `getAuthContextWithPermission` / `getAuthContext` / `probePermission` + `includes("forbidden")` + `{ success: false`):

| File | safeParse | getAuth* | forbidden | failure-shape | Total |
|---|---:|---:|---:|---:|---:|
| `finance/actions.ts` | 32 | 18 | 0 | 61 | **111** |
| `pos/order-actions.ts` | 21 | 21 | 5 | 50 | **97** |
| `inventory/actions.ts` | 9 | 17 | 0 | 63 | **89** |
| `pos/payment-actions.ts` | 17 | 11 | 0 | 60 | **88** |
| `inventory/grn-actions.ts` | 7 | 16 | 0 | 55 | **78** |
| `inventory/production-actions.ts` | 6 | 10 | 0 | 45 | **61** |
| `inventory/purchase-order-actions.ts` | 3 | 6 | 0 | 27 | **36** |
| `menu/actions.ts` | 5 | 4 | 0 | 23 | **32** |
| `pos/session-actions.ts` | 7 | 9 | 0 | 14 | **30** |

**Correction to DRAFT §1.2:** DRAFT ranked `order-actions.ts` highest (188 signals). My grep produced 97 for the same file. The exact number depends on which regex variants are counted. The *order* matches DRAFT roughly — POS + inventory + finance dominate — but the gap with the next tier is narrower than DRAFT implies. `finance/actions.ts` (111 signals, 1106 LoC) is the densest file on a signals-per-LoC basis and is **not in DRAFT's WS-1/WS-2 plan**.

### 2.5 Message dictionary gap (the leverage point)

| Layer | LoC | Status |
|---|---:|---|
| Dictionary infrastructure (`apps/web/lib/messages/*.ts`) | **2 342** | Built, comprehensive |
| Action files importing the dictionary | **1 of 73** | `pos/order-actions.ts` only |
| Page-clients/components importing the dictionary | **94** | Mapping happens at the *display* boundary, not the *action* boundary |

```text
Current flow:
  RPC returns "forbidden: cannot void after close" → action returns raw → client matches via dictionary
Target flow per DRAFT:
  RPC returns "forbidden: ..." → action maps via rpc-error-map.ts + messages dictionary → client receives { errorCode, userMessage }
```

The `rpc-error-map.ts` foundation is in place (commit `f06c77cf`) but **no action has been migrated to use it.** This is the single highest-leverage missing slice — until one action wires the dictionary through, WS-1's "≥ 30 % LoC reduction" exit criterion can't be measured.

### 2.6 Schema co-location (verify DRAFT §3 target)

| Finding | State |
|---|---|
| Per-route `_lib/schemas.ts` files in `app/(protected)/` | **1 found, 0 imported** |
| The 1 found: `pos/_lib/schemas.ts` | **DEAD** — defines Zod schemas, zero importers |
| Inline `z.object(` in `pos/order-actions.ts` | 11 |
| Inline `z.object(` in `inventory/grn-actions.ts` | 8 |
| Inline `z.object(` in `inventory/production-actions.ts` | 6 |

DRAFT §3 named `_lib/schemas.ts` as a target artifact. The shape exists in POS but is orphaned. WS-1 should either (a) delete `pos/_lib/schemas.ts` and start fresh, or (b) audit whether the schemas in that file are stale duplicates of inline ones in `order-actions.ts` and wire whichever is canonical.

### 2.7 Version-suffixed naming (verify DRAFT §1.3)

| Hit | File | Status |
|---|---|---|
| Feature flag `inv_s12_dashboard_v2` / `S12_DASHBOARD_V2` | `inventory/_lib/feature-flags.ts:11` | **Dead enum entry** — zero callers |
| Feature flag `inv_s13a_stocktake_v2` / `S13A_STOCKTAKE_V2` | `inventory/_lib/feature-flags.ts` | Live — gates `stocktake/new`, `[id]/count`, `[id]` |
| Feature flag `S13A_WASTE_V2` claimed by DRAFT | not found | DRAFT wrong; actual flag is `S11_WASTE_TIER` |
| URL error code `stocktake_v2_not_enabled` | 2 page.tsx | Live |
| URL error code `waste_v2_not_enabled` | 1 page.tsx | Live, **mismatched** with flag `S11_WASTE_TIER` |
| Phase comments (`// Phase 1..5`) inside `saveMenuBulk` | `menu/actions.ts:882, 958, 1061, 1081, 1173` | Section dividers, leave as-is per DRAFT |
| Other `_v[0-9]` / `_V[0-9]` in runtime TypeScript | none | Clean outside the 3+2 above |

**Correction to DRAFT §1.3:** DRAFT lists `inv_s13a_waste_v2` as one of the 3 flags. That flag does not exist in the catalog. The actual waste flag is `S11_WASTE_TIER`. The URL parameter `waste_v2_not_enabled` is what bleeds the obsolete naming. WS-4's rename target needs adjusting: `waste_v2_not_enabled` → `waste_tier_not_enabled`, **and** the `s13a` prefix in `S13A_STOCKTAKE_V2` is a sprint label leaking into runtime — rename to something feature-described (e.g. `INVENTORY_STOCKTAKE_REDESIGN`).

---

## 3. Layer B — Client shells

### 3.1 Shells >500 LoC, full list (DRAFT lists 3)

27 files >500 LoC in `apps/web/app/`; 22 are `"use client"`:

| Path | LoC | Kind | use client | In DRAFT WS-3? |
|---|---:|---|:---:|:---:|
| `pos/pos-desktop-shell.tsx` | 1650 | shell | ✓ | ✓ |
| `inventory/grn/[id]/grn-detail-client.tsx` | 1553 | shell | ✓ | ✓ |
| `pos/order-detail-sheet.tsx` | 1510 | shell | ✓ | ✓ |
| `inventory/stock/stock-client.tsx` | 1366 | shell | ✓ | ✗ |
| `pos/_components/bill/bill-receipt-sheet.tsx` | 1349 | shell | ✓ | ✗ |
| `br/[branchId]/settings/pos-sessions/pos-sessions-client.tsx` | 1227 | shell | ✓ | ✗ |
| `inventory/purchase-orders/new/new-po-client.tsx` | 1221 | shell | ✓ | ✗ |
| `inventory/purchase-orders/[id]/po-detail-client.tsx` | 1067 | shell | ✓ | ✗ |
| `inventory/dashboard-client.tsx` | 1026 | shell | ✓ | ✗ |
| `inventory/supplier-invoices/supplier-invoices-client.tsx` | 1008 | shell | ✓ | ✗ |
| `finance/revenue/revenue-client.tsx` | 965 | shell | ✓ | ✗ |
| `inventory/production-recipe-panel.tsx` | 904 | shell | ✓ | ✗ |
| `finance/reconciliation/reconciliation-client.tsx` | 902 | shell | ✓ | ✗ |
| `inventory/issues/[id]/issue-detail-client.tsx` | 884 | shell | ✓ | ✗ |
| `inventory/stocktake/[id]/stocktake-detail-client.tsx` | 786 | shell | ✓ | ✗ |
| `inventory/transfers/create-transfer-dialog.tsx` | 779 | shell | ✓ | ✗ |
| `br/[branchId]/runner/page.tsx` | 726 | page | — | ✗ |
| `inventory/transfers/[id]/transfer-detail-client.tsx` | 698 | shell | ✓ | ✗ |
| `inventory/grn/new/[supplierId]/grn-create-client.tsx` | 698 | shell | ✓ | ✗ |
| `br/[branchId]/kds/components/focus-view.tsx` | 688 | shell | ✓ | ✗ |
| `finance/invoice-list.tsx` | 678 | shell | ✓ | ✗ |
| `app/components/surface.tsx` | 615 | primitive | ✓ | (base library) |
| `br/[branchId]/kds/components/order-grid.tsx` | 585 | shell | ✓ | ✗ |
| `br/[branchId]/kds/kds-board.tsx` | 581 | shell | ✓ | ✗ |
| `inventory/expiry/expiry-list-client.tsx` | 577 | shell | ✓ | ✗ |
| `orders/order-detail-sheet.tsx` | 572 | shell | ✓ | ✗ |
| `employee/clock/clock-client.tsx` | 567 | shell | ✓ | ✗ |

WS-3 covers ≈ 4 700 LoC across 3 shells. The full inventory of "shells worth decomposing" is **~25 000 LoC across 25+ files**, mostly in `inventory/*` and KDS / runner.

### 3.2 Three primary shells — hook & complexity profile

| Shell | LoC | useState | useEffect | useMemo | useCallback | useTransition | Custom `use*` calls | Inline component fns | Inline event handlers | Realtime |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|
| `pos-desktop-shell.tsx` | 1650 | 7 | 6 | 7 | 29 | 1 | 17 | 5 | 35 | ✓ |
| `grn-detail-client.tsx` | 1553 | 10 | 0 | 2 | 0 | 3 | 2 (Next.js only) | 8 | 44 | ✗ |
| `order-detail-sheet.tsx` | 1510 | 10 | 8 | 1 | 2 | 2 | 0 | 4 | 46 | ✓ |

DRAFT's WS-3 thesis (`split state + realtime + actions + views`) is supported for `pos-desktop-shell` (17 custom hooks + 35 inline handlers) and `order-detail-sheet` (realtime + 46 handlers). `grn-detail-client` is different — 8 inline component functions and 44 inline handlers but only 2 custom hooks; the decomposition pattern there should be **subview extraction**, not the `_hooks/` extraction WS-3 prescribes for POS.

### 3.3 Existing decomposition patterns (where the convention already works)

POS already follows the per-shell subfolder pattern WS-3 proposes:

- `pos/_components/bill/` (6 files)
- `pos/_components/close-session/` (1 file)
- `pos/_components/order-detail/` (10 files)
- `pos/_components/pwa/` (4 files)

So WS-3 isn't inventing a pattern; it's extending POS's existing internal pattern to other shells. Same pattern exists in `inventory/_components/data-table/` and `inventory/_components/mobile/`. The bar to extend it elsewhere is conceptually low.

### 3.4 Parallel folder drift inside POS (verify DRAFT §1.3)

| Pair | Folder A | Folder B | Status |
|---|---|---|---|
| Hooks | `pos/hooks/` — 2 files (`use-daily-limit-sync.ts` 190 LoC, `use-order-sync.ts` 631 LoC) | `pos/_hooks/` — 6 files (use-cart, use-pos-append, use-active-table, use-append-target, use-archived-orders, use-swipe-reveal) | **Drift confirmed.** Zero overlap, `hooks/` looks like a leftover from before the underscore convention. `use-order-sync.ts` at 631 LoC is itself a candidate for further split. |

### 3.5 App-root folder pair (NOT in DRAFT — new finding)

`apps/web/app/` has BOTH `_components/` + `components/` and BOTH `_lib/` + `lib/`. Audit content:

| Folder | Files | Purpose-by-content |
|---|---:|---|
| `app/components/` | 11 (app-shell, brand, surface, period-close-card, audit-history-list, inventory-value-panel, surface-link-card, table-empty-state-row, empty-state-panel, app-page-tabs + data-table/ form/ subdirs) | "App-level UI primitives — what surface.tsx exports + composition wrappers" |
| `app/_components/` | 9 (notification-bell × 3, notification-item, notification-list, responsive-toaster, url-tabs, boneyard-registry, boneyard-skeleton) | "App-level live/notification widgets + skeletons" |
| `app/lib/` | 2 (utils.ts 4 LoC `cn()`, shell-primitives.ts 41 LoC `ShellNavItem`) | "Tiny UI helpers" |
| `app/_lib/` | 11 (auth, permissions, audit, with-action, rpc-error-map, branch-scope, format-datetime, download-file, use-keyboard-shortcut, spreadsheet, revalidate-surface) | "Server-side action infrastructure + cross-cutting helpers" |

**Reading:** the underscore prefix isn't random. `_components/` and `_lib/` follow the Next.js convention of "underscore = never routed." `components/` and `lib/` are pre-convention artifacts that survived earlier refactors. The split is principled enough at content level (`_lib/` = server-action infra, `lib/` = client UI helpers; `_components/` = stateful widgets, `components/` = primitive compositions). It's not what I'd recommend leaving in place forever, but **it's not the file-size emergency** — the user-side stated emergency. Including it in the DRAFT plan would dilute focus.

### 3.6 Scope-in-storage compliance (regression rule check)

Spot-checked 3 primary shells + tested `scripts/check-client-storage.mjs` allowlist:

| Shell | localStorage | sessionStorage | useContext for scope |
|---|:---:|:---:|:---:|
| `pos-desktop-shell.tsx` | — | — | — |
| `grn-detail-client.tsx` | — | — | — |
| `order-detail-sheet.tsx` | — | — | — |

**Compliant.** Allowlist contains only theme preference + PWA install hint dismissal (per `IF-010` closed in `tasks/todo.md`).

### 3.7 shadcn primitive coverage in shells

| Shell | shadcn imports | Raw HTML elements | Coverage |
|---|---:|---:|---:|
| `pos-desktop-shell.tsx` | 4 | 10 | 29 % |
| `grn-detail-client.tsx` | 11 | 45 | 20 % |
| `order-detail-sheet.tsx` | 8 | 20 | 29 % |

`grn-detail-client.tsx` is the worst — raw `<table>` markup dominates. This is a UI-contract gap (rule `PRESET-FIRST-UI`) layered on top of the size pain. WS-3's decomposition is an opportunity to fix it, but DRAFT plan doesn't make it an exit criterion.

---

## 4. Layer C — `apps/web` ↔ `packages/*` boundary

DRAFT plan does not cover this layer. Audit is net-new.

### 4.1 Package inventory

| Package | Role | LoC src | Files | Active sub-paths |
|---|---|---:|---:|---|
| `@comtammatu/shared` | Business logic, ACL, messages, format, types | 10 894 | 95 | `auth`, `format`, `settings`, `types`, `labels`, `menu`, `messages`, `runner`, `providers`, `hddt`, `kds`, `payroll`, `feedback`, `telegram`, `time`, `ai` |
| `@comtammatu/database` | Supabase clients, generated types | 10 140 | 8 | `supabase`, `supabase/server`, `supabase/client`, `supabase/service`, `supabase/middleware`, `types` |
| `@comtammatu/ui` | shadcn primitives, hooks, lib | 6 888 | 63 | `components/*`, `hooks/*`, `lib/*`, `globals.css` |
| `@comtammatu/security` | Rate limiting | 89 | 2 | (default) |

### 4.2 Boundary violations vs AGENTS.md import rules

| Rule | Audit result |
|---|---|
| `"use client"` + `@comtammatu/database` full barrel — forbidden | **Zero violations.** All 4 known client-side Supabase consumers (printer-status-badge, photo-upload-input, item-detail-dialog, menu-image-input) correctly import from `@comtammatu/database/supabase/client`. |
| Proxy / Edge → `@comtammatu/database/supabase/middleware` | **Compliant** (26 imports use the middleware sub-path; `apps/web/proxy.ts` confirmed). |
| Server Actions / RSC → `@comtammatu/database` full barrel | **Compliant.** |
| `packages/*` import from `apps/*` | **Zero violations.** |
| Inter-package import cycles | **None detected.** `packages/shared` does not import `packages/database` and vice versa. |
| Relative paths across the workspace boundary (`../../packages/`) | **Zero hits.** All imports use `@comtammatu/*` package names. |

This layer is healthier than the user's framing implies. There is no "package boundary cleanup" backlog at the file level. The next subsections look at *fine-grained* opportunities only.

### 4.3 App helper folders — categorization

`apps/web/lib/` (10 entries):

| File | LoC | Category | Why |
|---|---:|---|---|
| `hddt-archive.ts` | 447 | Data plane (app-local) | Calls Supabase RPCs + storage; HĐĐT-specific |
| `hddt-daily-summary.ts` | 238 | Data plane (app-local) | Supabase + state machine |
| `hddt-reconcile.ts` | 386 | Data plane (app-local) | Supabase + cron entrypoint |
| `invoice-provider-init.ts` | 39 | App-only | Env-based singleton wiring |
| `payment-providers-init.ts` | 37 | App-only | Env-based singleton wiring |
| `search.ts` | 24 | **Reusable shared** | Pure Vietnamese diacritic normalize; zero deps |
| `audio-signal.ts` | 155 | App-only | Web Audio API |
| `lib/actions/handle-action-result.ts` | 40 | App-only | Toast + ActionResult mapping |
| `lib/actions/use-action.ts` | 33 | UI hook (app-local) | useTransition wrapper |
| `lib/messages/*` (10 files) | 2 376 | App-local dictionary | Per-module copy; not reusable across apps |

`apps/web/app/_lib/` (11 entries):

| File | LoC | Category |
|---|---:|---|
| `auth.ts` | 201 | App-only (Server Action ctx) |
| `permissions.ts` | 130 | App-only |
| `audit.ts` | 60 | App-only |
| `with-action.ts` | 361 | Reusable shared (framework) |
| `rpc-error-map.ts` | 127 | Reusable shared |
| `branch-scope.ts` | 41 | Reusable shared |
| `format-datetime.ts` | 27 | **Re-export bridge** to `@comtammatu/shared/time` |
| `download-file.ts` | 41 | App-only (browser API) |
| `use-keyboard-shortcut.ts` | 74 | Reusable UI hook |
| `spreadsheet.ts` | 225 | Reusable shared |
| `revalidate-surface.ts` | 37 | App-only (Next routing) |

`apps/web/app/lib/` (2 entries):

| File | LoC | Category |
|---|---:|---|
| `utils.ts` | 4 | **Duplicate** of `@comtammatu/ui` `cn()` |
| `shell-primitives.ts` | 41 | Reusable UI |

### 4.4 Move-candidates (listed, NOT executed)

Each row = a file that *could* live in a different package; trade-off in comment column.

| File | Current | Suggested | LoC | Trade-off |
|---|---|---|---:|---|
| `apps/web/lib/search.ts` | app | `packages/shared/search` | 24 | Pure logic; +1 package edge but zero coupling. Low-stakes move. |
| `apps/web/app/_lib/spreadsheet.ts` | app | `packages/shared/spreadsheet` | 225 | Reusable for any export need; depends on `fflate`. Move only if a 2nd consumer appears. |
| `apps/web/app/_lib/use-keyboard-shortcut.ts` | app | `packages/ui/hooks` | 74 | Pure React; aligns with where `useToast`-style hooks live. |
| `apps/web/app/lib/utils.ts` (`cn()`) | app | delete; use `@comtammatu/ui/lib/utils` | 4 | Duplicate. Mechanical 1-line removal per call site — but call-site list needs counting first. |
| `apps/web/app/lib/shell-primitives.ts` | app | `packages/ui/lib` | 41 | Nav helper types; reusable if another app surfaces. |
| `apps/web/app/_lib/format-datetime.ts` | app | delete; consume `@comtammatu/shared/time` directly | 27 | Already a re-export bridge. Inlining removes hop. |

**None of these moves cracks 250 LoC. The total potential move is ~400 LoC across 6 files.** This is housekeeping, not architecture. The DRAFT plan rightly does not include it.

### 4.5 Dead / underused package exports

| Symbol | Defined in | Importers | Status |
|---|---|---:|---|
| `INVENTORY_FEATURE_FLAGS.S12_DASHBOARD_V2` | `inventory/_lib/feature-flags.ts` | 0 | Dead — same item as §2.7 row 1 |
| All other `@comtammatu/database` exports | — | many | Active |
| All `@comtammatu/security` exports (4) | — | 1–4 each | Active |
| `@comtammatu/shared` low-frequency sub-paths (`hddt`, `telegram`, `runner`, `payroll`, `kds`, `ai`) | — | 1–5 each | Active but narrow; consolidation not worth it |

### 4.6 Top-20 import frequency from `apps/web` into packages

```text
@comtammatu/shared/auth                    145
@comtammatu/shared/messages                135
@comtammatu/shared/types                    67
@comtammatu/shared/time                     67
@comtammatu/shared/format                   45
@comtammatu/shared/labels                   28
@comtammatu/shared/feedback                 22
@comtammatu/shared/providers                21
@comtammatu/shared/settings                  9
@comtammatu/shared/hddt                      5
@comtammatu/shared/telegram                  3
@comtammatu/shared/ai                        3
@comtammatu/shared/menu                      2
@comtammatu/shared/runner                    1
@comtammatu/shared/payroll                   1
@comtammatu/shared/kds                       1
@comtammatu/database/supabase/server        32
@comtammatu/database/supabase/client        26
@comtammatu/database/supabase/middleware    26
@comtammatu/ui/components/button           205
```

`auth` / `messages` / `types` / `time` carry the bulk. The barrel design (re-export high-frequency at root, leave low-frequency on sub-paths) matches usage. No refactor needed here.

---

## 5. Cross-cutting findings (drift not covered by DRAFT plan)

Things the DRAFT plan doesn't mention or undercounts. Listed once; do not duplicate elsewhere.

1. **`pos/_lib/schemas.ts` is dead.** Defines Zod schemas, zero importers anywhere. Likely a stale extraction from an earlier WS-1 attempt. Either delete or reconcile against current inline schemas in `order-actions.ts` before WS-1a starts.
2. **Message dictionary is built but unwired in actions.** 2 342 LoC of `apps/web/lib/messages/*.ts`, 94 page-client importers, **1** action-file importer. The plan must make wiring the dictionary into actions an explicit step of WS-1a/1b, otherwise LoC reduction won't show up in the diff.
3. **WS-0 has shipped but the plan is still DRAFT.** Commit `f06c77cf` landed the helper extensions and `rpc-error-map.ts`. Plan §9 acceptance gate items 3 + 4 (DRAFT→APPROVED record, pointer in `tasks/todo.md`) are unchecked. Either approve the plan or revert WS-0 — current state is "code ahead of doc."
4. **WS-1/WS-2 file list is incomplete.** DRAFT names POS + 3 inventory actions. Missing high-density files: `finance/actions.ts` (1106 LoC, 111 signals — denser than 3 of the named files). WS-1 PR template should either (a) name finance explicitly, or (b) state finance is out-of-scope with a reason.
5. **WS-3 shell list is incomplete.** DRAFT names 3 shells (pos-desktop, grn-detail, order-detail-sheet). Audit found 22 more shells >500 LoC including 7 more >1000 LoC. Plan should explicitly state: "WS-3 ships 3 shells. Remaining 22 shells are a known-debt list, tracked but not blocked." Otherwise the plan reads as if it solves a 25-shell problem with 3 PRs.
6. **WS-4 version-naming list has factual errors.** `S13A_WASTE_V2` does not exist; the live flag is `S11_WASTE_TIER` and the orphan URL code is `waste_v2_not_enabled`. WS-4's rename column should be corrected before any caller is touched.
7. **HR was named in DRAFT §1.2 as a skip-annotation host. It isn't.** All 15 `// Skip withAction:` annotations are in POS + Inventory. HR can be dropped from the WS-1/WS-2 scope statement.
8. **`pos/hooks/` (legacy) vs `pos/_hooks/` (current) is a 2-file delete, not a "WS" thing.** `use-order-sync.ts` (631 LoC inside `pos/hooks/`) is the only reason it looks big — but it's also a candidate for its own further split. Track as a 1-PR cleanup that can ship alongside WS-3 POS.
9. **App-root folder pair (`_components` vs `components`, `_lib` vs `lib`) is principled at content level.** Even though the names look like drift, the underscore prefix is Next.js's "private folder" convention. Recommend NOT including in scope. If owner insists on consolidation, do it as a separate housekeeping PR after WS-1 lands — but it's a sleeper risk to fold into the refactor scope.
10. **`apps/web/lib/utils.ts` `cn()` duplicates `@comtammatu/ui/lib/utils`.** 4-line file. Either delete and update call sites or accept as documented mini-bridge. Not architecture; trivia.

---

## 6. What DRAFT plan covers vs what this audit adds

| Concern | In DRAFT plan? | Audit finding |
|---|:---:|---|
| Files >1000 LoC | partial | DRAFT lists 13; actual 17 |
| `// Skip withAction:` annotations (15) | ✓ | Verified; HR mention is wrong |
| Boilerplate signal density | ✓ | Numbers differ but ranking matches; finance/actions.ts missed |
| Message dictionary exists | ✓ | Confirmed (2 342 LoC); **gap: not wired into actions** |
| `withAction` helper extensions (WS-0) | ✓ | Already shipped (commit `f06c77cf`) |
| `_lib/schemas.ts` target | ✓ | One exists in POS but is **dead** — orphan, not progress |
| 3 client shells to decompose | ✓ | Verified; 22 more shells in the same band not listed |
| `pos/hooks/` vs `pos/_hooks/` drift | ✓ | Confirmed |
| Version-named flags (3) + URL codes (2) | ✓ | One flag name is wrong (`S13A_WASTE_V2` doesn't exist) |
| `apps/web` ↔ `packages/*` boundary | ✗ | Audit confirms it is healthy — not in scope |
| App-root `_components` vs `components` | ✗ | Principled split; do NOT add to scope |
| `apps/web/lib/utils.ts` cn() duplicate | ✗ | Trivia; do NOT add to scope |
| `finance/actions.ts` (1106 LoC, 111 signals) | ✗ | Should be added or explicitly deferred |
| HR `// Skip withAction:` | ✗ (DRAFT mis-claims) | None exist; drop from scope statement |
| `pos/_lib/schemas.ts` dead | ✗ | Address in WS-1a setup |
| `INVENTORY_FEATURE_FLAGS.S12_DASHBOARD_V2` dead enum entry | ✓ (implicit in WS-4) | Confirmed; safe-delete in WS-4 |

---

## 7. Open questions for owner

These do not assume action — they are the questions that change *what's in scope* if answered.

1. **Approve the DRAFT plan or revert WS-0?** Code is ahead of doc. Either move `shell-helpers-refactor-plan-2026-05-27.md` to APPROVED and add a `tasks/todo.md` pointer, or revert `f06c77cf` until the plan is approved. Current state breaks the regression rule "doc must match runtime."
2. **Is `finance/actions.ts` in WS-2 or out?** 1106 LoC, 111 boilerplate signals (densest file on signals-per-LoC). Adding it expands WS-2 by one large file but improves the LoC-reduction story.
3. **WS-3: 3 shells in this slice, or set a different rule?** If "3 then re-evaluate" is the rule, write it down. Otherwise WS-3 reads as solving a 25-shell problem in 1 PR.
4. **`pos/_lib/schemas.ts` — delete or rebuild?** It's dead. Pre-WS-1a decision needed.
5. **Move-candidates from §4.4 (search.ts, spreadsheet.ts, use-keyboard-shortcut.ts, shell-primitives.ts, format-datetime bridge, cn() duplicate) — defer or include?** Total ~400 LoC across 6 files. Recommend defer to a separate housekeeping PR; including in shell-helpers refactor would dilute the "≥ 30 % LoC reduction" exit criterion.
6. **App-root `_components`/`components` and `_lib`/`lib` pairs — keep as-is, or rename?** Audit recommends keep (underscore is principled, not drift). Confirm so the question doesn't reopen later.

---

## 8. Owner decision needed before any code change

Pick one path forward. Audit takes no action regardless.

- **(A) Approve DRAFT plan as-is, with audit corrections folded in.** I'll patch `shell-helpers-refactor-plan-2026-05-27.md` to fix (i) "13 files" → "17 files", (ii) drop HR mention, (iii) correct `S13A_WASTE_V2` to `S11_WASTE_TIER` / `waste_v2_not_enabled` rename, (iv) acknowledge `pos/_lib/schemas.ts` orphan, (v) explicitly call out message dictionary wiring as a WS-1a exit criterion. Then move DRAFT → APPROVED with date + commit.
- **(B) Approve DRAFT, but expand WS-2 to include `finance/actions.ts`.** Same patches as (A) plus finance in WS-2 file list.
- **(C) Hold DRAFT, broaden plan first.** Re-open scope to cover WS-5 (additional 14 shells >800 LoC) and WS-6 (move-candidates housekeeping). This adds 4–6 PRs but lets us claim "refactor done" at the end.
- **(D) Audit-only, no plan approval.** Owner reads this, decides at a later date.

---

## 9. Appendix — reproduce commands

```bash
# Files >1000 LoC in apps/web/app (TS/TSX, excludes test/generated)
find apps/web/app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -path "*test*" ! -path "*generated*" \
  -exec sh -c 'lines=$(wc -l < "$1"); if [ "$lines" -gt 1000 ]; then echo "$lines: $1"; fi' _ {} \; \
  | sort -rn

# All `// Skip withAction:` annotations + reasons
grep -rn "// Skip withAction" apps/web/app --include="*.ts" --include="*.tsx"

# withAction adoption
find apps/web/app/\(protected\) -type f \( -name "actions.ts" -o -name "*-actions.ts" \) | wc -l
grep -rln "withAction\|withFormAction" \
  $(find apps/web/app/\(protected\) -type f \( -name "actions.ts" -o -name "*-actions.ts" \)) | wc -l

# Boilerplate signal density per file
grep -c "safeParse(" <file>
grep -c "getAuthContextWithPermission\|getAuthContext\|probePermission" <file>
grep -c "{ success: false" <file>
grep -c 'includes("forbidden")' <file>

# Message dictionary wiring
find apps/web/lib/messages -type f -name "*.ts" -exec wc -l {} +
grep -rln "from.*lib/messages" apps/web --include="*.ts" --include="*.tsx" | wc -l
grep -rln "from.*lib/messages" apps/web --include="actions.ts" --include="*-actions.ts"

# Dead schemas.ts in POS
grep -rn "pos/_lib/schemas" apps/web --include="*.ts" --include="*.tsx"

# Version-suffix sweep
grep -rn "_v[0-9]\|_V[0-9]" apps/web/app/\(protected\) --include="*.ts" --include="*.tsx"

# Parallel hook folders in POS
ls apps/web/app/\(protected\)/br/\[branchId\]/pos/hooks
ls apps/web/app/\(protected\)/br/\[branchId\]/pos/_hooks

# Boundary: "use client" + database barrel
for f in $(grep -rl '"use client"' apps/web --include="*.tsx"); do
  grep -H '@comtammatu/database[^/]' "$f" || true
done

# Package import frequency
grep -rh "from \"@comtammatu/" apps/web --include="*.ts" --include="*.tsx" \
  | sed 's/.*from "\(@comtammatu\/[^"]*\)".*/\1/' \
  | sort | uniq -c | sort -rn | head -25

# Package LoC
for d in packages/*/src; do
  echo "$(basename $(dirname $d)): $(find $d -type f \( -name "*.ts" -o -name "*.tsx" \) -exec wc -l {} + | tail -1 | awk '{print $1}')"
done
```

---

## 10. Audit metadata

- Auditor: Claude (Opus 4.7) under user direction "audit-only", scope confirmed via AskUserQuestion at session start.
- Three Explore subagents ran in parallel (server-action audit, client-shell audit, package-boundary audit). All read-only, all results independently spot-checked before inclusion.
- Source-of-truth tree: working dir `/Users/luongthebinh/Downloads/comtammatu`, branch `codex/continue-ts`, HEAD `e2d3a79e`, no uncommitted production code at audit time (only this file + the existing `shell-helpers-refactor-plan-2026-05-27.md`).
- No code touched. No file moved. No migration applied. No package added or removed.
