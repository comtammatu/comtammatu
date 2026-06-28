# Audit: Context Hardcode & i18n Externalization

Date: 2026-06-28
Scope: single-tenant multi-branch F&B suite (Next.js 16.2 App Router, supabase-js)
Method: 5 read-only lanes (2 context-hardcode, 3 i18n), synthesized here. Every finding cites `file:line`.

## Executive Verdict

The two owner concerns land very differently.

**Context hardcode is largely a false alarm.** The auth/scope architecture is correct and disciplined: tenant/branch/role are derived per-request from verified JWT claims, never hardcoded. There are **zero P0/P1 scope bugs in live code**. The headline `tenant_id:1` hits the owner may have counted (`notification-list.tsx`) are loading-state **skeleton fixtures**, not live scope — the prior audit flag is stale. The one genuine systemic issue is a **P2 silent-fallback anti-pattern** (`?? 0` / `?? "branch_manager"`) in 9 inventory pages that hand-roll auth instead of calling the canonical helper. It is latent, not exploitable today (the proxy guarantees claims before render), but it contradicts the throw-don't-mask contract and feeds a storage-upload path. Net: **1 real systemic scope issue (P2)** plus a separate cluster of **business-config hardcodes** (P1 invoice identity, P1 waste cap, P2 duplicated constants) that are config-management debt, not multi-branch leaks.

**i18n is the real, large, growing problem.** The copy contract (the "inside") is well-designed and has homes for almost every string type — but the **enforcement is narrow and the ratchet has no floor.** The eslint rule sees only JSXText + 4 attributes on raw literals, is blind to `.ts` files, ternary/template attr values, and all `toast()`/`throw` strings, and the baseline script can silently **grow** the grandfathered set. Result: ~341 baselined `.tsx` violations, ~2,375 affected lines across modules, with inventory and br/pos as twin epicenters.

### Severity Tally

| Severity | Context Hardcode | i18n | Total |
|---|---|---|---|
| P0 | 0 | 0 | 0 |
| P1 | 2 (HC-01, HC-02) + waste HC-03 | 4 (rule-blind .ts, expr-container, no-monotonicity, br/pos + kds surfaces) | ~9 |
| P2 | 4 (SCOPE-1, SCOPE-3, HC-04/05/06/07) | many module surfaces + infra gaps | — |
| P3 | several (intentional-ok + minor) | several | — |

**Real live-app scope bugs (excluding tests): 1** (SCOPE-1/3, one root pattern across 9 pages). Everything the owner may have over-counted as "context hardcode" — `tenant_id:1` in notification skeletons, `branch_id ?? 0` form sentinels, payroll legal constants, `tenant_id:1` in test fixtures — is **not a bug**.

---

## PART A — Context Hardcode

### A.1 Correct derivation (confirmed)

Server Actions → `withAction`/`withFormAction`/`withActionPositional` (`apps/web/app/_lib/with-action.ts`) → `getAuthContext` (`apps/web/app/_lib/auth.ts`), which calls `getUser()` + `getSession()` and `extractClaimsFromAccessToken(access_token)` (`packages/shared/src/auth/scope.ts`). Layouts/pages → `loadAuthState()`, which **throws** if claims are missing (trusting `proxy.ts` as the single auth gate; `proxy.ts:154` redirects on missing auth context). Claims = `{tenant_id, branch_id, user_role}`. Tenant-wide branch selection flows through URL `searchParams.branchId` → `resolveInventoryBranchScope` — never localStorage/Context. No hardcoded `tenant_id:1`, `branch_id`, UUID, or role-as-scope exists in live code.

### A.2 (a) Real scope bugs — live app

| file:line | failure mode | correct derivation | severity | effort |
|---|---|---|---|---|
| `inventory/expiry/page.tsx:58`, `inventory/settings/expiry/page.tsx:64`, `inventory/grn/[id]/page.tsx:144` | `claims?.tenant_id ?? 0` masks a null scope; `0` is passed as `tenantId` into `PhotoUploadInput`, which builds storage key `${tenantId}/${folder}/...` (`inventory/_components/photo-upload-input.tsx:74`). A proxy regression would silently upload evidence photos under a bogus `0/` prefix (orphaned/mis-scoped writes, RLS-path mismatch) instead of failing loudly. **Not exploitable today** — proxy guarantees claims. (SCOPE-1) | Call `loadAuthState()` / `getAuthContext`; never default a scope id to `0`; let `tenant_id` be required and throw on missing. | P2 | M |
| 9 inventory `page.tsx` bypass `loadAuthState()` and call `extractClaimsFromAccessToken` directly: `settings/expiry`, `drafts`, `transfers/[id]`, `transfers/[id]/receive`, `stocktake`, `stocktake/new`, `grn/new`, `grn/new/[supplierId]`, `expiry` (SCOPE-3, **root cause**) | The canonical contract is to trust the proxy and **throw** when session/claims are missing (surfacing via `error.tsx`). These 9 pages re-implement `getSession()`+`extractClaims` inline and then degrade gracefully to bogus scope — this divergence is what allows the `?? 0` / `?? role` masks to exist. | Migrate the 9 pages to `loadAuthState()` (already `cache()`-wrapped; returns `{supabase, session, claims}`). Removes duplicated round-trips AND every silent-scope fallback in one pass. | P2 | M |
| `inventory/expiry/page.tsx:59`, `inventory/settings/expiry/page.tsx:65`, `inventory/transfers/[id]/page.tsx:156`, `inventory/stocktake/page.tsx:52` | `user_role ?? "branch_manager"` fabricates a role. Drives **client-side UI defaults only** (`ExpiryListClient.tsx:148/156` branchFilter lock/display); every real mutation is re-authorized server-side by `withAction → getAuthContext`, so it **cannot widen write scope**. Same masking anti-pattern as SCOPE-1. (SCOPE-2) | Drop `?? "branch_manager"`; read `user_role` from verified claims so a missing role surfaces an error instead of impersonating `branch_manager`. | P3 | S |

All three rows are the **same single root pattern** (hand-rolled auth in inventory pages) and are fixed by the one SCOPE-3 migration.

### A.2 (b) The silent-zero `?? 0` / `?? role` fallback pattern

Sites that mask a missing scope rather than failing loudly:
- `inventory/expiry/page.tsx:58` — `tenantId={claims?.tenant_id ?? 0}`
- `inventory/settings/expiry/page.tsx:64` — `tenantId={claims?.tenant_id ?? 0}`
- `inventory/grn/[id]/page.tsx:144` — `tenantId: ctx?.claims.tenant_id ?? 0`
- `inventory/expiry/page.tsx:59`, `settings/expiry/page.tsx:65`, `transfers/[id]/page.tsx:156`, `stocktake/page.tsx:52` — `user_role ?? "branch_manager"`

**One-line guard:** never coalesce a scope identifier to a literal — replace `claims?.tenant_id ?? 0` with `loadAuthState()`'s required `claims.tenant_id` (which throws on missing). A scope id must be derived-or-throw, never derived-or-default.

### A.2 (c) Scope-in-React-Context check — 4 providers, ALL CLEAN

The project rule (scope in URL params only, never localStorage/Context) is **not violated**:
- `surface.tsx` — stores layout nesting `{padded, constrained}`. Not scope.
- `pwa-runtime.tsx` — stores PWA install state. Not scope.
- `pos-desktop-provider.tsx` (`SessionContext`) — holds `branchId`, but it is the URL route param `/br/[branchId]/` threaded via props. **Mirrors** the URL, does not replace it.
- `use-kds-row-effects.tsx` — holds a UI tone map keyed by `scopeKey`. Not ambient scope.

None store ambient tenant/branch as a scope substitute.

### A.2 (d) Should-externalize business config vs intentional-ok identity

**Should externalize (config-hardcode debt):**

| id | file:line | issue | sev | effort |
|---|---|---|---|---|
| HC-01 | `finance/actions.ts:307`, `finance/replace-invoice-actions.ts:294`, `lib/hddt-daily-summary.ts:142` | `sellerName: ""` on every issued HĐĐT/S-invoice. `tenants.legal_name` already stores the value (read in `admin/settings/general/page.tsx`) but is never plumbed in. NĐ 123/2020 requires a non-empty seller name → legally invalid document. **Single most urgent gap.** | P1 | S |
| HC-02 | `finance/actions.ts:308`, `finance/replace-invoice-actions.ts:295`, `lib/hddt-daily-summary.ts:143`, `lib/invoice-provider-init.ts:19`, `br/[branchId]/dashboard/data.ts:59` | Seller tax code read from `process.env["COMPANY_TAX_CODE"]` while `tenants.tax_code` is the admin-managed SoT (placeholder `077200004194` shown in `settings-form.tsx:88`). Dual-source split → stale/empty MST risk. (HKD identity itself is intentional — see below; the *split* is the issue.) | P1 | M |
| HC-03 | `inventory/waste-actions.ts:377` (`shiftCap: 1_500_000`, `:379` branchCap fallback `500_000`), `waste/new/page.tsx:107/109`, `waste/new/waste-create-client.tsx`, `_components/shift-cap-meter.tsx:35` | 1.5M VND shift cap copy-pasted across 4 files / 7 occurrences. `branch_daily_waste_cap.cap_vnd` is correctly DB-read for the branch cap, but shift cap is always 1.5M regardless of branch; a stale client fallback can override the server value. | P1 | M |
| HC-04 | `admin/dashboard/actions.ts:15`, `br/[branchId]/dashboard/data.ts:12`, `br/[branchId]/pos/print-actions.ts:21`, `br/[branchId]/pos/printer-status-badge.tsx:24` | `AGENT_OFFLINE_THRESHOLD_MS` (60s) defined 4×; tightly coupled to 30s heartbeat (2× relationship invisible per-file). | P2 | S |
| HC-05 | `inventory/supplier-invoice-actions.ts:23` (`.default(8)`), `supplier-invoices/supplier-invoices-client.tsx:170` (`vatRate: "8"`) | Default input VAT 8% hardcoded in schema + form. Reverts to 10% after 31/12/2026 → silently wrong rate; 2 files to sync. | P2 | S |
| HC-06 | `proxy.ts:304` (`30 * 60_000`), `branches/network-config-dialog.tsx:50` (`GRACE_MS`) | 30-min trust-IP grace window duplicated; security gate and UI staleness can drift apart. | P2 | S |
| HC-07 | `packages/shared/src/providers/impl/momo.ts:29-30` | MoMo prod URL has no env override (selected by boolean `MOMO_SANDBOX`), unlike Sinvoice which accepts `baseUrl`. No staging path without a deploy. | P2 | S |
| HC-10 | `inventory/waste-actions.ts:411` (`15*60*1000`), `bill/invoice-form-section.tsx:17` (`ADVISORY_THRESHOLD_VND = 200_000`) | Anti-split window + invoice advisory threshold are inline magic numbers (one named, one not). | P3 | S |

**Intentional-OK (do not change):**
- HKD identity (MST `077200004194`, pháp danh) — intentional per project context; the fix is to *unify the source* (DB row) not remove the identity.
- `notification-list.tsx:38/55/72` — `tenant_id:1` / `target_branch_id:1` inside `NOTIFICATION_SKELETON_ITEMS` (lines 35-87), used only as the `fixture` prop of `<AppBoneyardSkeleton>`. **Never reaches a query/action/storage path.** Stale prior-audit flag → mark intentional-ok. (SCOPE-4)
- `branch-settings/.../printers/printers-client.tsx:287` — `branch_id ?? 0` is **form initial state** (0 = "no branch picked"), a user-selected field not request scope; guarded by `if (!form.branch_id)` at `:331` before `upsertPrinter` at `:337`. 0 can never be submitted. (SCOPE-5)
- HC-08 Sinvoice `DEFAULT_BASE_URL` — has `SINVOICE_BASE_URL` env override. Correct pattern.
- HC-09 Payroll legal constants (`packages/shared/src/payroll/legal-versions.ts:64-138`) — versioned statutory constants with source citations and `getLegalVersionFor(effectiveDate)`. Correct pattern for audit-trailed legal data.
- All `tenant_id:1` in `__tests__/`, `*.test.ts`, `e2e/`, `*.spec.ts` — **test fixtures, not bugs.** Do not flag.

### A.2 (e) Guard/lint recommendation to stop new hardcodes

Add a lint rule (or `no-restricted-syntax`) that **bans literal `tenant_id` / `branch_id` scope assignment in app code outside the auth layer** (`apps/web/app/_lib/auth.ts`, `with-action.ts`, `packages/shared/src/auth/*`). Pair with a ban on coalescing a scope id to a numeric/string literal (`?? 0`, `?? "branch_manager"`). This freezes the SCOPE-1/2/3 class permanently after the migration.

---

## PART B — i18n

### B.1 (a) Copy-contract map (where each string TYPE belongs)

The contract is **more complete than the brief implied** — the problem is enforcement, not missing homes.

| String type | Canonical home |
|---|---|
| Domain nouns (ORDER/BRANCH/STAFF/TABLE/PRODUCT/CUSTOMER) | `packages/shared/src/messages/domain.ts` |
| Action verbs / buttons | `packages/shared/src/messages/actions.ts` (`ACTIONS_VI`) |
| Loading/empty/success/toast states | `packages/shared/src/messages/states.ts` (`STATES_VI`) |
| Generic errors | `packages/shared/src/messages/errors.ts` (`ERRORS_VI`) |
| Table headers / column captions / placeholders | `packages/shared/src/messages/form.ts` (`FORM_VI`) |
| Status-enum → label maps (orders/payments/KDS/payroll/inventory/tax) | `packages/shared/src/labels/vi.ts` |
| Templating | `packages/shared/src/messages/interpolate.ts` |
| Module-specific copy | `apps/web/lib/messages/{pos,inventory,finance,hr,...}.ts` |

**Missing categories** (no destination slot exists → files have nowhere to point):
- `TOAST_VI` — success/error toast templates (~76 inline lines in inventory alone).
- `VALIDATION_VI` — Zod error messages (~47 inline lines in inventory; same strings duplicated 3–4×).
- `COLUMNS_VI` / shared cross-module table headers (`"Trạng thái"`, `"Ngày tạo"`, `"Ghi chú"` recur).
- `EMPTY_STATE_VI` typed helper.
- No dedicated **aria** home (acceptable — aria reuses other dicts; 0 non-aria-label VN aria attrs found).

### B.1 (b) Baseline count, ratchet status, and WHY strings keep landing inline

**Baseline = 341 entries** (`apps/web/eslint-i18n-baseline.json`, `generatedAt 2026-06-28`, all `.tsx`; verified `count: 341`, `entries.length: 341`). Full sweep with baseline active = **0 current violations** — every detectable string is grandfathered (parity). Trend: grew `57→205` (May), then ratcheted **down to 341** today via 2026-06-11..28 commits. The ratchet works **for the narrow surface it can see** — but that surface is small, and the baseline can re-grow.

**The enforcement gap — why strings keep landing inline.** The rule (`apps/web/eslint.config.mjs:68-106`) fires only on (a) `JSXText` nodes and (b) 4 attributes (`VI_TARGET_ATTRS = /^(title|placeholder|aria-label|alt)$/`, line 31) **and only when the attr value is a raw `Literal`** (line 92 + `value.type === "Literal"` guard). It is BLIND to:

| id | gap | evidence | sev |
|---|---|---|---|
| I18N-01 | JSX-expression-container attr values (ternary/template/call) even on the 4 whitelisted attrs. A literal→ternary refactor silently escapes the ratchet. | `eslint.config.mjs:90-101`; leaks at `branch-settings/_shared/kds/station-form-dialog.tsx:79,81,87`, `components/surface.tsx:307` | P1 |
| I18N-02 | **All `.ts` files** — rule scoped to `**/*.tsx` (`eslint.config.mjs:147`). 120 non-test `.ts` files carry VN. | `app/_lib/with-action.ts:148-150` hardcodes `"Dữ liệu không hợp lệ"`, `"Không có quyền"`, `"Tài khoản chưa được gán chi nhánh"` (verified) | P1 |
| I18N-03 | `toast()` / `throw new Error()` string args — no `CallExpression` visitor. ~190 toast VN lines unreached. | `eslint.config.mjs:84-101` (only JSXText+JSXAttribute) | P2 |
| I18N-06 | Guarded-attr allowlist too narrow (4 attrs). Copy-bearing props `successMessage`, `label`, `heading`, `emptyText` uncovered. | `station-form-dialog.tsx:87` `successMessage="Đã ... trạm KDS"` | P2 |
| I18N-04 | **No monotonicity guard** — `update-i18n-baseline.mjs:50` writes `count: entries.length` regenerated from scratch with no comparison to prior; `check-baseline-hygiene.mjs` only scans legacy markers. A dev can re-baseline new inline strings and CI stays green. The ratchet has **no floor**. | `scripts/update-i18n-baseline.mjs` (verified) | P1 |
| I18N-05 | No pre-commit hook (verified: only `*.sample` git hooks; no husky/lefthook/lint-staged). First gate is CI (`.github/workflows/ci.yml` `pnpm lint`). Late feedback invites baseline churn. | repo scan | P3 |

~240 JSX expression-container VN literals sit fully unguarded.

### B.1 (c) Per-module inline inventory (inventory is the epicenter)

| Module | Files | Lines (approx) | Dominant categories | Priority |
|---|---|---|---|---|
| **inventory** | 75 | 1,011 | static_label (61%), section_title_prop (10%), toast_error, table_header, form_validation | **1 (epicenter)** |
| **br/pos** | 32/48 | 407 | toast/notify (66), JSX render (41), aria/title (15), confirm dialogs (10) | **2 (cashier-facing)** |
| hr | 16/32 | 251 | table headers/labels (63), toast (23), aria (21) | 3 |
| employee | 9/26 | 136 | status labels, confirm dialogs, toast (checkout-approvals hotspot) | 4 |
| finance | 9/26 | 125 | invoice sync outcomes, button labels, sr-only (invoice-list hotspot) | 4 |
| menu | 9/13 | 99 | zod errors, confirm dialogs, column headers | 5 |
| br/kds | 11/21 | 82 | local `LABELS` object (`order-grid.tsx:49-56`), confirm dialogs | **3 (kitchen-facing)** |
| orders | 3/7 | 75 | field labels, refund workflow (refunds-client hotspot) | 5 |
| branch-settings | 3/11 | 48 | zod + form labels + success messages | 6 |
| shared chrome | — | 42 | `surface.tsx:599-705` empty-state defaults; `office-module-shell.tsx:71-116` nav labels | **high-leverage** |
| admin | 3/26 | 34 | printer template type/block label maps | 6 |
| br/settings | 8/14 | 31 | form-dialog inline | 7 |
| br/runner | 2/7 | 15 | loading/status copy | 7 |
| branches | 2 | 7 | 3 zod messages + relative-time util | low |
| notifications | 1 | 1 | page title | low (clean) |

Note the brief said br/pos/kds were "not yet counted" — they are now the **second and third epicenters** (489 lines combined) and are the highest-visibility surfaces (real-time cashier + kitchen).

**Inventory deep-dive (the epicenter):** module-local contract exists (`_lib/dictionary.ts` nav/status/terms + `_lib/labels.ts`) but covers only ~110 nav/status tokens. **34 of 75 files import neither the module dictionary nor any shared token.** High duplication confirms re-typing per file: `"Kho hàng"` 19× (despite `tTerm('inventoryModule')` existing), `"Đơn vị"`/`"Chi nhánh"` 6× each (despite `BRANCH_VI.long`), `"Nguyên liệu"` 5× (despite `PRODUCT_VI.rawIngredient`), `"Số lượng phải > 0"` / `"Đơn vị không được trống"` 4× each. Two files hide private copy objects inline (`grn/new/[supplierId]/grn-create-client.tsx:73-99`, `transfer-receive-client.tsx:54-78`) — an un-lintable "private dictionary" anti-pattern. ROOT production cluster (265 lines, 10 files) is the densest single area.

### B.1 (d) Extraction plan ordered by value (highest-traffic / most-duplicated first)

| Wave | Target | Why first | Effort |
|---|---|---|---|
| W0 (infra) | Add `TOAST_VI`, `VALIDATION_VI`, `COLUMNS_VI`, `EMPTY_STATE_VI` to `packages/shared/src/messages/` | Missing destination slots block all downstream extraction | M |
| W1 | Wire `ACTIONS_VI`/`STATES_VI`/`PRODUCT_VI`/`BRANCH_VI` into the 34 unwired inventory files; replace 19× `"Kho hàng"`, 5× `"Nguyên liệu"`, 6× `"Chi nhánh"` with existing contract keys | Pure win — homes already exist; immediate consistency | S |
| W2 | **br/pos toast/notify** (66 strings → `pos-feedback.ts`) | Highest-visibility cashier path; one file per action group | M |
| W3 | **br/kds** `order-grid.tsx:49-56` `LABELS` object → `messages/kds.ts`; confirm dialogs | Self-contained block, kitchen-facing, maps 1:1 to contract | M |
| W4 | Inventory Zod errors (47 lines) → `VALIDATION_VI`; table `header:` strings (52 lines, fully static) → `COLUMNS_VI` | Short, static, highly duplicated → cheapest extraction | S |
| W5 | Inventory ROOT production cluster (dashboard card configs `dashboard-client.tsx:130-277`, `production-recipe-panel.tsx`) → `_lib/production-copy.ts` | Densest single cluster, every-login traffic | M |
| W6 | Shared chrome (`surface.tsx` empty-state defaults → `states.ts`; `office-module-shell.tsx` nav → `labels/vi.ts`) | Fixing defaults cleans up every downstream consumer at once | S |
| W7 | hr / finance / employee / menu / orders / branch-settings form-dialog + toast clusters | Manager-facing, lower urgency | M–L |

After each wave, re-baseline to **shrink** the grandfathered count.

### B.1 (e) Enforcement change to freeze the surface

Three changes, cheapest first:
1. **Monotonicity guard (I18N-04, P1, effort S):** add a CI check that **fails if the committed baseline count exceeds `origin/main`** (allow shrink, forbid growth). Wire into `pnpm lint` and `ci.yml`. This alone stops the surface from growing while green — the single highest-leverage fix.
2. **Widen the rule (I18N-01/02/06):** make `VI_TARGET_ATTRS` a configurable allowlist + walk `JSXExpressionContainer` expressions for string/template literals; add a second config block enabling the rule on `**/*.ts` (excluding tests); add a `CallExpression` visitor for `toast`/`throw` args. Re-baseline once to grandfather the newly-visible `.ts`/expr/toast surface, then ratchet down.
3. **Pre-commit (I18N-05, P3):** lefthook/husky+lint-staged running the i18n rule on staged `.tsx`/`.ts`, pointing to the contract files. CI stays as backstop.

---

## Top Recommendations (highest value, cheapest-unblock first)

1. **[i18n, S] Add the no-grow baseline monotonicity guard** (I18N-04). One CI check freezes the entire inline surface from expanding. Nothing else stops the bleed; do this first.
2. **[context, S] Fix `sellerName: ""` (HC-01)** — plumb `tenants.legal_name` into the 3 invoice-issue sites. Legally-required field currently empty on every issued HĐĐT. Same tenant row is already fetched nearby.
3. **[context, M] Migrate the 9 inventory pages to `loadAuthState()` (SCOPE-3)** — eliminates the entire `?? 0` / `?? role` silent-fallback class (SCOPE-1/2) in one pass and removes duplicated `getSession()` round-trips.
4. **[i18n, M] Widen the eslint rule** to cover `.ts`, JSX expression-container attr values, a prop allowlist, and `toast`/`throw` args (I18N-01/02/03/06); re-baseline once. Without this the ratchet guards a fraction of the real surface.
5. **[context, M] Unify the invoice tax-code source (HC-02)** — read `tenants.tax_code` at runtime; deprecate `COMPANY_TAX_CODE` to a documented first-run bootstrap fallback only.
6. **[context, M] Externalize the waste shift cap (HC-03)** — add `shift_cap_vnd` to `branch_daily_waste_cap`; read in `getWasteCapStatus()`; delete the `1_500_000` literal from 4 files.
7. **[i18n, S+M] Run extraction W1+W2** — wire the 34 unwired inventory files to existing contract keys (kills 19× `"Kho hàng"` etc.), then extract br/pos toast/notify. Highest consistency payoff and highest-traffic surface respectively.
8. **[context, S] Add the literal-scope lint ban** — forbid `tenant_id`/`branch_id` literal assignment and scope-id coalescing (`?? 0`) outside the auth layer. Permanently closes the SCOPE-1/2/3 class after #3.

---

### Appendix — Items explicitly NOT bugs (owner over-count guard)

- `notification-list.tsx:38/55/72` `tenant_id:1` → skeleton fixture (SCOPE-4).
- `printers-client.tsx:287` `branch_id ?? 0` → guarded form sentinel (SCOPE-5).
- `bill-receipt-sheet.tsx:354-358` real branch name/address → static **preview fixture** (I18N P3, cosmetic, no scope/leak risk).
- All `tenant_id:1` under `__tests__/`, `*.test.ts`, `e2e/`, `*.spec.ts` → **test fixtures, fine.**
- Payroll legal constants, Sinvoice base-URL override → correct patterns (HC-08/09).
