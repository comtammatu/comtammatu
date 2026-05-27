# Shell & Helpers Refactor — Plan

**Status:** APPROVED — 2026-05-27.
**Date:** 2026-05-27
**Tier:** T3 (touches POS RPC paths, RLS-gated server actions, multi-row writes — needs 4-perspective debate per `docs/agent/rules/workflow.md`).
**Scope:** `apps/web/app/(protected)/**` server actions + client shells. No DB migrations. No RLS changes. No public API changes.

## Approval log

- 2026-05-27 — owner approved the plan; §8 open-question answers folded into §4 and §8 below.

---

## 1. Why this plan exists

User report (2026-05-27): "Files đang rất lớn và bộ khung không chịu nổi, chồng chất dead code và dồn vào cùng một file thay vì có các base, shell, helper, formatter để hỗ trợ xử lý và đồng bộ. Tại sao trong code còn đặt tên và biến theo version?"

### 1.1 Hard evidence

13 files in `apps/web` exceed 1000 lines of TS/TSX (excluding generated `database.types.ts`). The 9 worst:

| File | LoC | Kind |
|---|---:|---|
| `apps/web/app/(protected)/br/[branchId]/pos/order-actions.ts` | 2149 | server actions |
| `apps/web/app/(protected)/br/[branchId]/pos/pos-desktop-shell.tsx` | 1650 | client shell |
| `apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts` | 1647 | server actions |
| `apps/web/app/(protected)/inventory/grn-actions.ts` | 1572 | server actions |
| `apps/web/app/(protected)/inventory/grn/[id]/grn-detail-client.tsx` | 1553 | client shell |
| `apps/web/app/(protected)/br/[branchId]/pos/order-detail-sheet.tsx` | 1510 | client shell |
| `apps/web/app/(protected)/inventory/production-actions.ts` | 1470 | server actions |
| `apps/web/app/(protected)/inventory/actions.ts` | 1429 | server actions |
| `apps/web/app/(protected)/menu/actions.ts` | 1397 | server actions |

### 1.2 Root cause (identified, not speculative)

The base helper **already exists** at [`apps/web/app/_lib/with-action.ts`](../../apps/web/app/_lib/with-action.ts) (`withAction` / `withFormAction`). It is **bypassed** by **15 explicit `// Skip withAction:` annotations** across POS + inventory + HR actions, each citing one of four reasons:

1. Server Action takes **positional args** (`(branchId, cart, sessionId)`) — helper only accepts a single object input.
2. **Composite auth** (e.g. `POS_VOID_ROLES` × `PERMISSION_KEYS.POS_VOID_ORDER` × branch scope) — helper supports one permission OR one anyPermission, not chained custom resolvers.
3. **Multi-step side effects** (main RPC + downstream `enqueue_cancel_ticket_print` + warning mapping) — helper has no slot for post-RPC steps.
4. **Optional `idempotencyKey`** + post-success revalidation patterns not covered.

Boilerplate repetition signal counts (`safeParse` + `getAuthContextWithPermission` + `probePermission` + `errorCode:` + `return {` in one file):

| File | Repetition signals |
|---|---:|
| `order-actions.ts` | 188 |
| `payment-actions.ts` | 130 |
| `grn-actions.ts` | 121 |
| `production-actions.ts` | 101 |

Each "Skip withAction" handler currently re-implements: parse → return `{ success:false, error, errorCode }` → resolve auth context → null check → call RPC → `error.message.toLowerCase().includes("forbidden")` mapping → reshape result. **30–60 duplicated lines per handler.**

### 1.3 Adjacent smells confirmed by audit

- **Two parallel hook folders inside POS**: `pos/hooks/` *and* `pos/_hooks/`. Convention drift across refactor waves — pick one, retire the other.
- **Message dictionary layer already exists** at [`apps/web/lib/messages/inventory.ts`](../../apps/web/lib/messages/inventory.ts) (879 LoC) and [`apps/web/lib/messages/finance.ts`](../../apps/web/lib/messages/finance.ts) (766 LoC), but action files still do ad-hoc `String(error.message).toLowerCase().includes("forbidden")` instead of routing through the dictionary.
- **Client shells (1500–1650 LoC)** hold cart state + dialog state + realtime subscription + form logic + view JSX in one file with no `use-*-state` / `use-*-realtime` / `views/` decomposition — even though `_hooks/` + `_components/<subfolder>/` convention is already established for `bill/`, `close-session/`, `order-detail/`.
- **Version-suffixed names leaking into runtime** (narrow):
  - 3 feature-flag keys: `inv_s12_dashboard_v2`, `inv_s13a_stocktake_v2`, `inv_s13a_waste_v2` ([`inventory/_lib/feature-flags.ts`](../../apps/web/app/(protected)/inventory/_lib/feature-flags.ts)).
  - 2 user-facing error codes leak migration history into URL params: `?error=stocktake_v2_not_enabled` and `?error=waste_v2_not_enabled`.
  - "Phase 1..5" comments inside `menu/actions.ts:saveMenuBulk` and `finance/actions.ts` are **section dividers in one function**, not version names — leave as-is.

---

## 2. T3 four-perspective debate

### 2.1 PM perspective — does this serve the operator?

Refactor is invisible to operators **by design**. Value lands when (a) next feature ships faster because new RPC wrappers are 1 helper call not 50 boilerplate lines, (b) error message regressions stop slipping through because mapping flows through one dictionary, (c) reviewer load on PR diffs drops. Risk to operators: any behavior drift introduced by the move. **Therefore**: the migration approach must be slice-by-slice with a green build and full action-level smoke at each slice — no big-bang.

### 2.2 BA perspective — what business rules must survive untouched?

- `POS_VOID_ROLES` ≠ `POS_ROLES` for cancel/void flows. Helper extension must let callers pass an **explicit role allowlist per action**, not assume `MODULE_ACL.pos.allowedRoles`.
- `requireBranchScope` (branch_manager / cashier with `claims.branch_id == null` → reject) is a **financial-grade guard** (refund, payment). The new helper MUST preserve this opt-in flag with identical semantics. Regression in `tasks/regressions.md`: branch-scope hardening contract.
- Multi-row writes via RPC keep their atomicity. The wrapper does NOT replace RPCs with sequenced PostgREST calls — that would violate `AGENTS.md` "Multi-item atomic writes MUST use a Postgres RPC function."
- Print-warning chaining (`enqueue_cancel_ticket_print` after `void_order_item`) is **non-fatal** — the new helper's post-RPC slot MUST surface the warning without flipping the outer success flag.
- Idempotency keys must keep behavior: same key + same payload → same response.

### 2.3 Senior Dev perspective — does the proposed shape hold up?

Yes if and only if:

- `withAction` v2 stays **additive** — existing object-input callers compile unchanged. New positional + composite-auth callers opt in via overload, not a breaking signature change.
- The `_lib/` per-route folder pattern is already idiomatic (POS has `_lib/`, `_utils/`, `_hooks/`, `_components/`; inventory `_lib/` has 19 files). No new top-level directory is needed.
- We must NOT introduce a "framework" or DSL for actions. The bar is: one helper call should replace ~40 lines of hand-rolled boilerplate, while the **handler body remains plain async code** any contributor can read.
- Type inference must be preserved end-to-end. `withAction(opts, handler)` already returns the right function type; positional-adapter variant must do the same.
- Tests: each migrated action keeps its existing e2e behavior; add unit tests for the helper itself.

### 2.4 QA perspective — how do we know we didn't break anything?

Per-slice acceptance:

1. **Full completion gate before merge**: `pnpm typecheck && pnpm lint && pnpm build` clean.
2. **Action-level smoke** — for each migrated server action, run a happy-path + at least one failure-mode call (invalid input, forbidden, RPC error). For POS slice: end-to-end smoke `POS → payment → stock → KDS/print → HĐĐT` against approved dev/test (already an open item in `tasks/todo.md`).
3. **Diff hygiene**: each slice ships in one PR whose diff is "extract + delete duplicates," not "extract + rewrite logic." Reviewer must be able to verify no logic change by reading the diff.
4. **Line-count proof** — slice PR description includes before/after LoC for each touched file. Slice approved only if reduction ≥ 30% on the targeted file(s).
5. **No `// Skip withAction` annotations added** in slice PR. Removal count tracked.

---

## 3. Target architecture (4 layers)

No new top-level directories. We extend conventions that already exist.

```
apps/web/app/_lib/                          ← cross-route foundation (already exists)
  with-action.ts                            ← EXTEND: add positional variant + composite-auth resolver
  with-action-positional.ts                 ← NEW: adapter for (a, b, c?) → { a, b, c? } object
  rpc-error-map.ts                          ← NEW: typed error-message → { errorCode, userMessage } table
  with-rpc.ts                               ← NEW (optional): RPC wrapper combining auth + RPC + error map

apps/web/app/(protected)/<route>/_lib/      ← per-route shared (already exists; expand)
  schemas.ts                                ← Zod schemas, currently inline in actions
  rpc-clients.ts                            ← typed wrappers around supabase.rpc(name, args)
  messages.ts                               ← bridge to apps/web/lib/messages/<module>.ts

apps/web/app/(protected)/<route>/_components/<shell>/   ← shell decomposition
  index.tsx                                 ← compose only (~200 LoC ceiling)
  use-<shell>-state.ts                      ← reducer / state machine
  use-<shell>-realtime.ts                   ← Supabase subscription + dedup
  use-<shell>-actions.ts                    ← server-action callers + toast plumbing
  views/                                    ← presentational subviews (no state)
```

**Non-goals:**
- No new "framework" abstractions or DSLs.
- No replacement of `supabase.rpc()` with a custom client.
- No change to URL structure, JWT shape, or RLS.
- No `SELECT *` → explicit-column refactor — see `tasks/regressions.md` SELECT-STAR-ACCEPTABLE-FOR-NON-AUDIT-TABLES; that pattern is intentional.

---

## 4. Workstreams (approved order)

### WS-0 — Foundation only, no caller migration (1 PR)

Extend `_lib/with-action.ts`:

- Add `withActionPositional` overload for `(arg1, arg2, ...) → object` adapter via `argsToInput`.
- Add `customAuth?: (input) => Promise<ActionContext | null>` slot for `POS_VOID_ROLES`-style composite auth.
- Add `afterSuccess?: (input, result, ctx) => Promise<{ warning?: string } | void>` slot for non-fatal post-RPC steps (print enqueue). Returned `warning` is merged into `result.meta.warning`.
- Make `roles` optional (only required when `customAuth` is absent).
- Generic `<TData>` threaded through handler return + action return so callers preserve typed data.

Create `_lib/rpc-error-map.ts`:

- `RpcErrorMapping = { match: (msg: string) => boolean; errorCode?: string; userMessage: string }`
- `mapRpcError<TData>(error, mappings, fallback) → ActionResult<TData>` — runs lowercased message against mappings, returns first hit; falls back to `{ success: false, error: fallback, errorCode?: "rpc_unknown" }`.
- Module-agnostic. Per-route mapping arrays live in `<route>/_lib/messages.ts`.

**Exit criteria:** `pnpm typecheck && pnpm lint && pnpm build` clean. Zero callers touched. Unit tests for `withAction` (regression), `withActionPositional`, `customAuth` precedence, `afterSuccess` warning merge, and `mapRpcError` matching.

### WS-1a — POS proving slice: `voidOrderItem` only (1 PR)

Migrate exactly one action — [`voidOrderItem`](../../apps/web/app/(protected)/br/[branchId]/pos/order-actions.ts) — to the extended helper. Chosen because it exercises **4/4** of the new helper features in one ~100-line block:

- Positional args `(orderItemId, reason)` → `argsToInput`.
- Composite auth `POS_VOID_ROLES × PERMISSION_KEYS.POS_VOID_ORDER` → `customAuth`.
- Non-fatal post-RPC `enqueue_cancel_ticket_print` → `afterSuccess`.
- RPC error mapping (`includes("forbidden")` / `includes("voidable")`) → `_lib/rpc-error-map.ts` + new `pos/_lib/messages.ts`.

Side effect of WS-1a: introduces `pos/_lib/messages.ts` and the first per-route error map. **Sets the template** for WS-1b. If helper has design gaps, surface them here and amend before WS-1b.

**Exit criteria:** `voidOrderItem` LoC reduced ≥ 50%. `// Skip withAction: positional (orderItemId, reason) args + POS_VOID_ROLES` annotation removed. Behavior preserved against:

- happy-path void of pending item
- happy-path void of kitchen-sent item (cancel-ticket warning paths: `no_printer` / `no_slot` / `feature_disabled` / RLS denied)
- forbidden role (cashier without POS_VOID_ORDER perm)
- voidable failure (already served)

Full completion gate (`pnpm typecheck && pnpm lint && pnpm build`) clean. POS smoke against approved dev/test.

### WS-1b — Remaining POS actions (1 PR)

Targets: rest of [`order-actions.ts`](../../apps/web/app/(protected)/br/[branchId]/pos/order-actions.ts) + all of [`payment-actions.ts`](../../apps/web/app/(protected)/br/[branchId]/pos/payment-actions.ts). 14 remaining `// Skip withAction` sites, ~3600 LoC of action code.

Steps:

1. Move all Zod schemas to `pos/_lib/schemas.ts`. Pure mechanical move.
2. Extend `pos/_lib/messages.ts` with mappings for each remaining RPC's error vocabulary.
3. Migrate each action to extended helper. Branch-scope-sensitive actions (refund, payment) keep `requireBranchScope: true`.
4. Delete every `// Skip withAction:` annotation in POS.

**Exit criteria:** POS action files ≤ 800 LoC each. Zero `// Skip withAction` left in POS. End-to-end POS smoke `POS → payment → stock → KDS/print → HĐĐT` against approved dev/test green (closes the open smoke item in `tasks/todo.md`).

### WS-2 — Inventory slice (1 PR)

Targets: `grn-actions.ts`, `production-actions.ts`, `actions.ts` (~4500 LoC combined). Message dictionary already exists at `lib/messages/inventory.ts` (879 LoC) — wire it through `rpc-error-map.ts` rather than rewriting.

**Exit criteria:** ≥ 30% LoC reduction on each touched action file. All inventory `// Skip withAction` removed.

### WS-3 — Client shell decomposition (3 PRs, one per shell)

Order:
1. `pos-desktop-shell.tsx` (1650) — split state + realtime + actions + views.
2. `grn-detail-client.tsx` (1553).
3. `order-detail-sheet.tsx` (1510).

Risk: client shells already use realtime + reducer patterns; mis-splitting breaks subscribe/unsubscribe ordering. One PR per shell so any subscription regression has a small revert window.

**Exit criteria:** each top-level shell ≤ 400 LoC. Hooks per shell live under `_hooks/` (retire the parallel `hooks/`).

### WS-4 — Version-naming cleanup (1 PR)

Decided per-flag based on live status verified 2026-05-27:

| Flag / token | Live status | Action |
|---|---|---|
| `INVENTORY_FEATURE_FLAGS.S12_DASHBOARD_V2` (`inv_s12_dashboard_v2`) | **Dead enum entry — zero caller** | Delete from `inventory/_lib/feature-flags.ts`. If `branch_feature_flags` table has rows for this key, add a migration to delete them. |
| `INVENTORY_FEATURE_FLAGS.S13A_STOCKTAKE_V2` (`inv_s13a_stocktake_v2`) | **Alive — gates `stocktake/new`, `[id]/count`, `[id]` pages** | Rename to `INVENTORY_STOCKTAKE_REDESIGNED` (key `inventory_stocktake_redesigned`) — describes WHAT, not WHEN. Add migration to update `branch_feature_flags.flag_key`. URL error code `stocktake_v2_not_enabled` → `stocktake_redesigned_not_enabled`. **v1 path is NOT removed** in this refactor — pilot rollback escape hatch stays. |
| `waste_v2_not_enabled` URL token | **Orphan string** — `S*_WASTE_V2` entry not in catalog (only `S11_WASTE_TIER` exists) | Locate the actual gate in `waste/new/page.tsx`, change the URL string to match the real flag (`waste_tier_not_enabled` or `waste_disabled`). |
| `pos/hooks/` parallel folder | Convention drift | Move contents into `pos/_hooks/`, delete `pos/hooks/`. |

**Exit criteria:** `grep -rnE "\\b(v\|V)[0-9]+_\|_(v\|V)[0-9]+\\b" apps packages --include='*.ts' --include='*.tsx'` returns zero matches outside test files and `lib/messages/inventory.ts` known-historical references. POS hook folder count == 1.

---

## 5. Migration template (per action)

For one action file, the diff pattern is:

```text
Before
──────
"use server"
import …
const inputSchema = z.object({…})
// Skip withAction: positional args + composite auth
export async function someAction(branchId: number, cart: CartState, …) {
  const p1 = branchIdSchema.safeParse(branchId);          // ← gone
  if (!p1.success) return { success: false, error: … };   // ← gone
  const p2 = cartStateSchema.safeParse(cart);             // ← gone
  if (!p2.success) return { success: false, error: … };   // ← gone
  const ctx = await getAuthContextWithPermission(POS_VOID_ROLES, …);  // ← into customAuth
  if (!ctx) return { success: false, error: … };          // ← gone
  // 30–60 more lines of RPC + error.message.includes() …
}

After
─────
"use server"
import { withActionPositional } from "@/app/_lib/with-action";
import { someActionSchema } from "./_lib/schemas";
import { posVoidAuth } from "./_lib/auth";
import { mapPosRpcError } from "./_lib/messages";

export const someAction = withActionPositional(
  { argsToInput: (branchId, cart, idempotencyKey) => ({ branchId, cart, idempotencyKey }),
    schema: someActionSchema,
    customAuth: posVoidAuth,
    afterSuccess: enqueueCancelTicketPrint },     // optional
  async ({ branchId, cart, idempotencyKey }, ctx) => {
    const { data, error } = await ctx.supabase.rpc("some_rpc", {…});
    if (error) return mapPosRpcError(error);
    return { success: true, data: shape(data) };
  },
);
```

Public signature `someAction(branchId, cart, idempotencyKey?)` stays identical via `argsToInput` — **no caller site changes**.

---

## 6. Rollback

Each slice is one PR, atomic, reversible by revert. The helper extensions in WS-0 are additive — reverting after later slices ship would only break callers that opted in, so revert order is reverse-chronological: WS-3 → WS-2 → WS-1 → WS-0.

Per-slice safety net:
- VERSION bump per PR claimed via `/landing-report` flow (already standard).
- POS slice cannot land mid-shift; land on staging first, wait 24h, then prod.

---

## 7. Out of scope (explicit)

- DB migrations of any kind.
- RLS changes.
- RPC signature changes (function names + arg shapes stay).
- `SELECT *` → explicit columns (see SELECT-STAR-ACCEPTABLE rule in regressions).
- Auth v2 → v3 (no such migration exists; `auth_v2` references are all in DB migration files, none in runtime TypeScript).
- Tailwind / design-system changes (separate UI-contract track).
- `apps/print-agent/` files (`escpos.ts` 1477, `escpos-bitmap.ts` 1299) — different runtime, different concerns, separate review.

---

## 8. Owner decisions (recorded 2026-05-27)

1. **Slice order** — `WS-0 → WS-1a (voidOrderItem only) → WS-1b → WS-2 → WS-3 → WS-4`. WS-1a chosen as proving slice because `voidOrderItem` exercises all 4 helper extensions; surfaces design gaps before propagating.
2. **WS-4 feature-flag retirement** — handled per-flag based on verified live status (see WS-4 table). v1 path of `stocktake_v2` is NOT removed in this refactor — pilot escape hatch retained.
3. **Print-agent files** — confirmed out of scope. Separate plan if/when needed; different runtime + different concerns.
4. **PR granularity** — one PR per workstream; WS-3 splits to one PR per shell. WS-1b stays as a single PR (diff is mechanical extract + delete).

---

## 9. Acceptance gate before WS-0 starts

- [x] Owner approves §2 four-perspective trade-offs. — 2026-05-27
- [x] Owner answers §8 open questions. — recorded in §8
- [x] Document moves from DRAFT to APPROVED. — header updated
- [x] One-line pointer added to `tasks/todo.md` under a new "Shell helpers refactor" section.
