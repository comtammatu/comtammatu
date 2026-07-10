# Current Tasks

> Active tracker for the Greenfield preparation cut.
> No historical backlog, deferred idea list, shipped history, or dated planning
> archive lives here. Shipped history lives in git; durable failure rules live
> in `tasks/regressions.md`; durable lessons live in `tasks/lessons.md`.
>
> Reconciled-through `23500913b` (2026-07-08). Before acting, verify the live
> checkout with `git status` and re-check production state for any migration or
> runtime claim.

## Operating Frame

- Production baseline remains the current `comtammatu` app and production
  Supabase ref `iexwsuaqqenyjiskawoj`. Agents do not mutate production by
  default.
- Greenfield is a separate preparation track. Do not copy old `docs/plan/*`,
  `docs/worklog/*`, external-skill plans, or memory decisions into it unless the
  owner promotes that fact again.
- Candidate Greenfield Supabase target remembered from prior owner context:
  `jmasiwuqiyedqvyfzhuq`. Treat it as unverified until the connector/dashboard
  confirms it and the Environment Registry is updated. No writes before then.
- Active work must be one of the gates below or a fresh owner-confirmed blocker.
  Everything else belongs in code, canonical docs, tests, runbooks, or nowhere.

## Active QR Self-Order Goal

- [ ] **Q0 — lock the operating contract and remove cached-seating leakage.**
  - Current status: written and static-green for the `/q/*` NetworkOnly service
    worker rule; the production build contains the `/q/` navigation matcher
    before generic page caching. Live offline-browser proof remains unverified.
  - Skill plan: repo rules = engineering + skills + workflow + database + UI;
    external skills = Supabase + Next.js best practices; runtime tools =
    CodeGraph + Supabase SELECT-only verification + local tests/browser;
    skipped = production writes because owner delegation is required in the
    apply session.
  - PM: pilot safety starts with session/order/payment integrity; visual polish
    follows only after behavioral gates are green. Preserve the intentional
    `PAYMENT-AUTO-COMPLETES-ORDER` and pay-before-ready POS contract.
  - BA: a seating session binds once to one canonical order; terminal states
    never reopen; retries are payload-aware; one active payment intent exists
    across cash/VietQR; the stable printed QR is not a perpetual active-bill
    capability.
  - Dev: use backward-compatible DB-first slices, then app cutovers. Public
    Route Handlers stay server-only service-role boundaries; every
    `SECURITY DEFINER` function keeps explicit auth/permission checks, empty
    `search_path`, and least-privilege grants.
  - QA: add real RPC and two-client concurrency coverage, lost-response/reload
    browser flows, managed Preview evidence, and a production-build service
    worker privacy test. Static source tests alone are insufficient.
  - Policy locks: POS payment still completes the order and releases the table
    without mutating KDS tickets. QR payment eligibility, guest confirmation,
    and next-seating privacy are the change surface; `finalize_paid_order` is
    out of scope.
  - Acceptance: `/q/*` navigation HTML is never cached; no prior seating bill
    can render from a service-worker fallback; the existing generic public page
    cache remains intact for non-sensitive routes.
- [ ] **Q1 — exactly-once ordering and immutable session/order binding.**
  - Current status: DB/app implementation written; focused static tests and web
    typecheck are green; the transfer guard now terminates stale seating access
    without silently resolving outstanding staff payment work. Real RPC
    compilation and two-client concurrency remain runtime-unverified; not
    applied to production.
  - DB-first: monotonic session/batch transitions, immutable non-null
    `session.order_id` and token snapshots, payload-aware operation conflicts,
    deterministic concurrent first-submit/approval behavior, and guarded QR
    rotation.
  - App cutover: reuse one intent ID across ambiguous retries, preserve the
    draft safely, reject same-ID/different-payload, and ignore stale snapshot
    responses.
- [ ] **Q2 — seating capability and bounded public access.**
  - Current status: additive versioned migration, device boundary, pairing flow,
    staff controls, rate limits, public allowlists, and guest denial states are
    written and static-green. The v1 submit path and the capability-version
    setter now share a lock and recheck the live version before mutation. Every
    table still defaults to version `1`; no table flip or production apply has
    occurred.
  - Treat the printed QR as table lookup context; require a seating-bound
    continuation capability for active bill reads/writes, define the
    second-device approval path, and add per-token/IP/session limits.
- [ ] **Q3 — one recoverable payment intent.**
  - Current status: one-intent recovery, staff cancellation, exact VietQR
    snapshot, stale-intent expiry before cash/HĐĐT binding, and ambiguity-safe
    late SePay recovery are written and static-green. Any manual-review webhook
    now excludes its whole payment from automatic Finance recovery. Database
    runtime and provider/browser proof remain unverified; not applied to
    production.
  - One active cash/VietQR intent, server-owned expiry/cancel/complete states,
    reloadable VietQR details, stale cash-call cleanup, safe method switching,
    and explicit QR payment eligibility while preserving POS auto-completion.
- [ ] **Q4 — payable truth and operator ownership.**
  - Current status: canonical bill-first guest UI, explicit staff target/payment
    actions, scoped rejection, device revocation, and queue recovery data are
    written and static-green; staff runtime smoke remains unverified.
  - Canonical order lines/total first, round history second; branch availability
    and precise recovery errors; safe target-order selection; notes propagated
    to fulfillment; queue age/realtime/fallback and scoped rejection.
- [ ] **Q5 — PUBLIC-WORKFLOW layout and UX.**
  - Current status: responsive header, 44–48px controls, safe-area spacing,
    recoverable pairing/payment states, bounded sheets, inline invoice errors,
    focus behavior, terminal fail-closed rendering, and seating-scoped privacy
    resets are written and focused-static-green. A submitted pending batch now
    locks cart mutations, and BFCache restore scrubs cached bill/PII before it
    can paint and requires a fresh snapshot. Real-device/browser visual proof
    remains unverified.
  - Preserve top Menu/Bill tabs and the sticky cart contract; fix dead states,
    44–48px targets, focus/safe-area behavior, bounded desktop sheets,
    same-phone payment details, and recoverable draft/reload behavior.
- [ ] **Q6 — evidence-led visual polish and rollout.**
  - Current status: rollout/canary/rollback runbook written; 164 focused
    QR/payment/HĐĐT tests, full typecheck, production build, package ESLint, UI
    contract, and SQL parser checks are green. Full-repo lint stops only on the
    separately-owned Inventory baseline marker; full-repo test has nine failures
    only in separately-owned Inventory/operator-stock static guards. Functional
    motion, managed Preview runtime, real PostgreSQL compile/concurrency proof,
    and owner-approved production canary remain pending.
  - Functional motion only after browser evidence; full repo gates, Preview
    Branch concurrency/E2E, one-table owner-approved production canary, and
    rollback by disabling the pilot QR rather than deleting live rows.

## Active Greenfield Gates

- [ ] **G1 — verify the Greenfield environment.** Confirm the active project ref,
      access posture, and connector visibility. Add the target to
      `docs/agent/rules/database.md` only after owner confirmation.
- [ ] **G2 — derive from the current schema baseline only.** Build Greenfield from
      the current schema/baseline contract, not from historical plans. Any
      `supabase/greenfield/` material is rehearsal-only unless promoted.
- [ ] **G3 — re-derive the product spine.** Freshly confirm the minimal spine:
      owner/auth, branch context, POS -> payment -> KDS/print -> HĐĐT, inventory
      receive/production/stocktake, and HR/payroll basics. Anything outside this
      spine needs a fresh owner decision.
- [ ] **G4 — define runtime smokes.** One real-auth smoke per spine flow, using
      current scopes and current routes. Keep the proof as tests or a runbook, not a
      backlog essay.
- [ ] **G5 — keep docs lean.** Use `docs/agent/rules/references.md` as the
      source-of-truth map. For Greenfield, promote only current facts into those
      owned docs; do not add dated plan/worklog archives or re-copy the map here.

## Owner-Confirmed UI Follow-ups

- [ ] **Route shell/header refactor.** Collapse route-local shell/header
      bypasses into approved chrome primitives after the primitive/guard cleanup
      is green.
- [ ] **Branch Hub touch-plane cutover — remaining scope.** The core stock
      routes (hub, transfer, receive, on-hand, GRN list/new/detail, stocktake,
      issues, supplier returns, reports, waste entry, waste approvals) own
      native Branch presentation; shipped history lives in git. Still open:
  - [ ] Resolve the consumption Branch contract before rebuilding its two
        wrappers: distinguish POS sale-consumption ledger visibility from manual
        consumption issue review, then choose whether the Branch route is a
        read-only signal list, an issue detail, or both. Do not copy the Office
        `IssuesClient` into Branch without that decision.
  - [ ] Correct the count-assignment “Open count screen” CTA: it currently
        opens the signed-in manager's own `/stock/count` assignment surface,
        not the selected employee's work. Keep employee count discovery under
        `/br/[branchId]/shift`; replace the manager CTA with the relevant
        assignment/review destination after confirming the intended job.
  - [ ] Reconcile stocktake role documentation with current permission seeds:
        the local template grants `production_manager` stocktake
        create/complete while `docs/ref/inventory.md` names only branch and
        warehouse managers. Confirm the business policy before changing ACL or
        navigation membership.
  - [ ] Run runtime QA across phone `390x844`, tablet portrait `768x1024`,
        tablet landscape `1024x768`, and Office desktop `1440x900`, in both
        `light` and `night` themes (covers the design-system contrast wave
        smoke), once local Supabase/Docker auth is available.


## Branch Stock Cutover (D073 — supersedes the D067 round-2 scope)

> `docs/plan/decisions.md` D073 (2026-07-10): the Central Kitchen site (branch
> 16) is being decommissioned — stock transfers to Phước Hải (branch 3), then
> `is_active = false`. Every stock upgrade prepared for the kitchen round now
> targets the SHARED `/br/[branchId]/(operator)/stock/*` surface for kind
> `branch`. D067 §1 still governs the layering: share the server action and
> data loader; fork only presentation.
>
> Owner-approved mockup (3 screens; the build must match it, re-anchored to a
> branch): `https://claude.ai/code/artifact/778026d5-8d60-4dfe-acc7-296efe75a30c`
> One mockup deviation is expected: Phước Hải has TWO active locations
> (`Kho CN`/`Bếp CN`), so the GRN receiving-location card RENDERS there — the
> rule stays conditional (hide only when `branchLocations.length <= 1`).
>
> Production facts verified 2026-07-10, SELECT-only; re-verify before acting.
> Active sites: Phước Hải (3, `branch`, 2 locations, 97 stock rows) and Bếp TT
> (16, `central_kitchen`, 1 location, 29 stock rows — pending transfer-out).
> Kho Tổng (15) was already re-kinded to `branch` and deactivated.
> `role_templates.production_manager` has two duplicate rows; investigate
> separately.

- [ ] **S0 — clear the nine red wave tests so the gate means something again.**
      Pre-existing failures landed with the 2026-07-10 wave (bisect-confirmed at
      `5b5e8d037`); every later slice's "full gate fresh" requirement is void
      while they stay red. Clusters: waste form (explicit cancel fallback +
      photo-upload gate) in `branch-waste-create-client`; Office inventory
      dashboard (pending count slips for Branch Manager + four owner entrypoint
      groups); operator stock statics (PO/GRN/issue/report actions in the branch
      shell, GRN source presentation, consumption-vs-issue role split); form
      barrel import; `resolveInventoryListScope` routing (D058 W3b). Fix code to
      contract where the contract is right; fix the test only where the wave
      legitimately changed the contract, and say which in the commit message.

- [ ] **S1 — extend the operator/Office import boundary guard before converting
      anything.** Widen `operator-office-shell-boundary` in
      `scripts/check-ui-contract.mjs` so `(operator)/**` may not import
      `@/(protected)/inventory/**` except `*-actions.ts`; allowlist `_lib/**`
      until S7 lands. Freeze current offenders as the baseline and burn one line
      down per slice. Six presentation imports crossed the plane boundary under
      human review alone; a seventh will too.

- [ ] **S2 — fix the app-shell scroll defects.** App-wide, own PR, not
      Central-Kitchen-only. Two independent causes, both cheap.
  - `apps/web/app/components/surface.tsx` gives `AppDetailFooter sticky` the
    class `chrome-safe-bottom` (`bottom: max(1rem, env(safe-area-inset-bottom))`)
    on a full-width bar, so the bar pins 16px above the scrollport and content
    scrolls through the gap, while `bg-background/95` leaks another 5%.
    `packages/ui/src/styles/globals.css` documents that utility as the offset for
    floating buttons. Use `sticky bottom-0 ... bg-background chrome-safe-pb` and
    drop `backdrop-blur`, which is wasted paint on an opaque bar. Twelve operator
    stock screens pass `<AppDetailFooter sticky>`.
  - `apps/web/app/layout.tsx` sets `body` to `min-h-screen` (`100vh`) while the
    operator shell is `h-dvh overflow-hidden`, so a mobile browser scrolls the
    document by the toolbar height on top of the inner scroller. Use `min-h-dvh`.
  - `apps/web/tests/operator-stock-redirect-static.test.ts` asserts the literal
    `sticky chrome-safe-bottom` in three places and currently locks the defect
    in. Update it in the same change.
  - Do not replace `#main-content` with the Radix `ScrollArea` primitive. The
    shell already owns exactly one native scroller with `overscroll-contain`;
    `ScrollArea` would trade native touch momentum for a JS scroller.
  - Verify empirically, not analytically: `AppPage` applies `p-3`, so confirm on
    a running dev server that `bottom-0` seats flush against the scrollport edge
    rather than 12px above it. Scroll to the end of all twelve screens at
    `390x844`, `768x1024`, and `1024x768` before claiming green.

- [ ] **S3 — GRN never prefills a purchase price.** Owner rule: the market price
      changes every trip, and a carried-over price poisons the weighted average
      cost silently until month-end review.
  - `apps/web/lib/inventory/use-grn-create-controller.ts:162` resolves `unitCost`
    as `existing?.unitCost ?? referenceCost?.value ?? Number(ingredient.unit_cost
    ?? 0)`. Reduce it to `existing?.unitCost ?? ""`.
  - Keep the prior price as reference text, and show the deviation percentage
    once a price is typed; `grn-line-editor.tsx:95` already computes it. Add no
    one-tap "use last price" control.
  - Block the confirm step while any selected line lacks a price.
    `grn_items.unit_cost` is `NOT NULL`, so client-side blocking suffices and no
    migration is required.
  - Reorder-from-history prefills the ingredient list and quantities only, read
    from the most recent GRN for that `(supplier_id, branch_id)`. Do not read
    `supplier_price_list`: `production_manager` lacks
    `procurement:price_list_read`.

- [ ] **S4 — record a production run on one screen.** Owner rule: cooking happens
      first and the app records it afterwards, so the draft-then-confirm split
      asks for two already-known numbers across two screens.
  - One screen carries planned output ("Định làm") and actual output ("Thực ra").
    Planned drives the consumption prefill; actual output drives only unit cost.
    `confirm_production_run` already computes it that way: `v_raw_need_measure`
    scales from `v_planned_output_base`, and `v_out_unit_cost = v_cost_total /
    v_out_base`. Do not rescale consumption by actual output.
  - Process loss raises the finished-good unit cost and generates no waste line.
  - Consumption lines prefill at recipe rate behind a single "Đúng định mức"
    control. `Sườn Cốt Lết` carries 20 recipe lines, so a nominal batch must cost
    zero number-pad taps.
  - Replace every `QuantityInput` on `production/new` and `production/[id]` with
    `NumberPadSheet`. The base `Input` is `h-7` (28px) and `QuantityInput` adds no
    height, so four call sites render a 28px touch target today.
  - Insufficient stock surfaces as a Sheet listing `{needed, on_hand, missing}`
    with a "Sửa Thực chi" action rather than a red toast. Shortage is evaluated
    after `v_effective_ingredients`, so correcting a consumption line to what was
    truly used is a legitimate recording path, not a workaround. No migration.

- [ ] **S5 — fork the GRN line sheet out of the shared component tree.**
      `GrnLineEditSheet` (`apps/web/app/components/inventory/grn-line-editor.tsx`)
      is imported by both the operator create flow and Office
      `inventory/grn/new/[supplierId]`. It is presentation, and D067 §1 requires
      presentation to fork.
  - Build `(operator)/stock/grn/_components/grn-line-sheet.tsx` as the single
    operator-side line editor for both create and review, entering numbers through
    `NumberPadSheet`.
  - Move `grn-line-editor.tsx` under `(protected)/inventory/_components/` once the
    operator consumer is gone.
  - This deletes `branch-grn-review-line-sheet.tsx`, whose five `QuantityInput` and
    `MoneyVndInput` call sites render at 28px because that fork never restyled them.
  - Do not merge the operator sheet into the shared component. That is the opposite
    direction and the owner rejected it.

- [ ] **S6 — chrome parity across the branch stock document flows.**
  - `stock/receive/[id]/transfer-receive-client.tsx:124` and `:167` hand-roll a
    back-button header twice instead of using `BranchOperatorControlBar`, and the
    route renders no `BranchOperatorPage`, so it shows no title at any width.
  - `stock/grn/new/branch-grn-source-picker-client.tsx:173` and
    `stock/grn/new/[supplierId]/branch-grn-create-client.tsx:71` pass
    `hideHeaderOnMobile` without a `BranchOperatorControlBar`, losing the title and
    back affordance on a phone.
  - `stock/transfer/[id]/branch-transfer-detail-client.tsx:149` and the transfer
    create client split their two-pane grid at `md:`, while every sibling stock
    module splits at `lg:`, so tablet portrait squeezes one module and not the rest.
  - Hide the GRN receiving-location card when `branchLocations.length <= 1` and
    resolve the location server-side.

- [ ] **S7 — relocate shared pure logic out of the Office route tree.** Move
      `_lib/format`, `_lib/purchase-units`, `_lib/reference-cost`, `_lib/grn-draft`,
      and `_lib/types` to `apps/web/lib/inventory/` and import from there on both
      planes. This is a move, not a fork: the sharing was correct and the location
      was not. Tighten the S1 allowlist to `*-actions.ts` afterwards.

- [ ] **S8 — open the catalog to kind `branch` and retire the recipes tile
      (D073 §3/§4).** Extend the "Danh mục" tile `kinds` in `nav-config.ts` to
      `branch`, reusing the native `stock/catalog/**` surfaces built in the Kho
      Tổng round. No permission grants are required: categories/units/
      ingredients actions carry no `PERMISSION_KEYS` gate (RLS/module only) and
      suppliers use `procurement:supplier_manage`, which `branch_manager` holds
      since D068 §4. Remove the `production/recipes` tile from the operator;
      recipe administration stays in Office `/inventory`.

- [ ] **S9 — densify the on-hand list.**
      `stock/on-hand/branch-stock-on-hand-client.tsx:148` renders `min-h-20` (80px)
      rows inside an `ItemGroup` at `gap-3`, so 105 active ingredients produce roughly
      8,400px of scroll. Move to 44px rows with `gap-0` plus `ItemSeparator`, already
      exported from `packages/ui/src/components/item.tsx`. Add no toolbar: "Kiểm kê",
      "Báo hao hụt", and "Nhập kho" are hub tiles, and repeating them here would give
      one workflow two visual sources of truth. Per-ingredient actions belong in the
      row's detail sheet.

- [ ] **S10 — decommission site 16 and delete the central forks (D073 §1/§5).**
      Ordered: (1) owner transfers the 29 remaining stock rows 16 → 3 through the
      existing transfer flow (`central_kitchen → branch` is legal in the D000
      matrix) and reassigns the `production_manager` staff; (2) owner flips
      `branches.is_active = false` for 16; (3) only then delete the central forks
      from the operator UI — `CENTRAL_HOME_TILE_SUFFIXES` and the central home
      CTA in `(operator)/page.tsx` + `operator-home-contract.ts`, the
      `isCentralKitchen`/`isCentralSupply` branches in
      `(operator)/dashboard/data.ts`, the `central_supply`/`central_kitchen`
      `kinds` entries in `nav-config.ts`, archetype exceptions #19–#23 in
      `docs/spec/page-archetypes.md`, and the central rows of
      `docs/ref/screen-context-map.md` §2.5. Clean deletes, no tombstones. The
      DB enum keeps all three kinds for history. Code deletion must not land
      before step 2, or an active site loses its UI.

- [ ] **S11 — one-step Kho ↔ Bếp move, both directions (D073 §5). AFTER S10:
      the site-16 stock transfer needs the cross-branch flow one last time.**
      The carrier already exists: `commit_intra_branch_transfer`
      (`20260708103000_inventory_unit_closure.sql`, used by
      `quickInternalTransfer`) posts `transfer_out`+`transfer_in` and lands on
      `received` in one shot — but only warehouse → kitchen. One migration
      generalizes it to both directions. Operator UI: one "Điều chuyển" tile →
      direction toggle + ingredient picker + `NumberPadSheet`, committing
      through the quick RPC; the draft → confirm intra path retires from the
      operator. Known live hazard the sweep confirmed on PROD: the wave's
      create-model already offers kitchen → warehouse, but
      `20260710010833_allow_kitchen_return_transfers.sql` is unapplied AND
      `stock_transfer_confirm_ship` (baseline) still hard-rejects that
      direction (`intra_branch_location_invalid`) — do not deploy the wave
      before either this slice's migration or 010833 + a confirm_ship fix
      lands. Then retire the cross-branch lifecycle from the operator: tiles
      "Yêu cầu hàng" / "Nhận hàng" / "Chuyển hàng", the `stock/receive/**`
      queue, and the `inboundTransfers` hub-queue row; Office
      `/inventory/transfers` stays read-only for history.

- [ ] **S12 — retire supplier returns end-to-end (D073 §4).** Delete the
      operator routes (`stock/supplier-returns/**`, 3 pages + 3 clients), the
      Office routes (`/inventory/supplier-returns/**`, 3 pages + 4 clients),
      the shared loaders/model (`branch-supplier-return-data.ts`,
      `supplier-return-model.ts`), the actions file
      (`supplier-return-actions.ts`), the nav tile and Office nav item, and the
      copy catalog. Keep the DB tables, RPCs, and the
      `has_active_supplier_return` GRN integrity gates — history stays, and the
      gate is inert without new returns. Rejected GRN goods route through Báo
      hao hụt instead. Seven test files assert on this feature
      (`supplier-return-model.test.ts` dies; the six others need their
      supplier-return expectations removed).

- [ ] **S13 — retire purchase orders from daily use (D073 §4).** Delete the
      operator wrappers (`stock/purchase-orders/**`, 3 files) and the PO nav
      tile; remove the Office PO nav entry and routes from daily navigation;
      remove the PO door from the GRN source picker
      (`fetchOpenPurchaseOrdersForReceiving` / `openPurchaseOrders` in
      `apps/web/lib/inventory/grn-source-data.ts`) and the
      `openPurchaseOrders` hub-queue count. DB tables, RPCs, and the 15
      historical POs stay. The old "Convert the Branch purchase-order family"
      follow-up item is already removed (2026-07-10 consolidation); this slice
      is its replacement.

### Defects found while scoping the cutover — separate slices, not D073

- [x] **The operator hub counts the wrong table.** Fixed: the hub queue counts
      `production_runs` in `draft`/`in_progress`, matching the production page's
      work-queue definition. `production_orders` holds zero rows tenant-wide and
      has no writer anywhere in the app.

- [ ] **Three PROD RPCs deep-link notifications to the retired `/employee/*`
      routes.** `reject_leave_request`, `approve_inventory_count_slip`, and
      `request_inventory_count_recount` on PROD still emit notification links
      like `/employee/count`; the route family no longer exists, so tapping
      those notifications 404s. The repo's baseline already carries the correct
      `/br/{branchId}/...` links — PROD was never re-applied. One migration
      recreating the three functions from the repo baseline; owner-delegated
      apply.

- [ ] **Retire the dead `production_orders` entity.** `document-correction-actions.ts`
      still loads correction sources from `production_orders`/`production_order_items`,
      so a correction request for a production document always resolves "not found"
      even though completed `production_runs` exist. The RPC family
      (`create/confirm/cancel_production_order`,
      `ensure_production_order_central_kitchen`) has zero callers. Decide with the
      owner: repoint the correction source to `production_runs` (the output check
      becomes `run.finished_good_id`), then drop the table and RPCs in one migration.

- [ ] **`confirm_production_run` overwrites a tenant-wide cost column.** The RPC ends
      with `UPDATE ingredients SET unit_cost = v_out_unit_cost WHERE id =
      v_run.finished_good_id`. `ingredients.unit_cost` is scoped by neither branch nor
      location, so the last batch's cost overwrites it while `stock_levels.avg_unit_cost`
      holds the real weighted average — and that column is then the fallback in
      `COALESCE(sl.avg_unit_cost, ing.unit_cost, 0)`. Money path; related to the
      food-cost deviation recorded in ADR 0011. Confirm the intended semantics with the
      owner before changing anything.

- [ ] **Retire the dead lot/expiry columns — owner-confirmed (D073 §5), full plumbing scope, not a drive-by.**
      `grn_items.batch_number`, `grn_items.expiry_date`, and
      `ingredients.shelf_life_days` hold zero non-null values and no UI reads or
      writes them, but they remain wired through live RPC plumbing: the waste
      write-off RPC (`20260709131500_fix_waste_writeoff_rpc_unit_drop.sql`), the
      expiry alert scanner (baseline `scan_inventory_alerts` family — can never fire
      on all-null data), the GRN receiving-site recreate
      (`20260709125638_grn_recreate_receiving_site.sql`), plus
      `upsert_ingredient_catalog` (dropping `p_shelf_life_days` changes the
      signature — DROP FUNCTION the old overload before CREATE) and
      `bulk_import_ingredients`. One migration rewriting those RPCs and dropping the
      three columns; then `ingredient-actions.ts` (the `null as never` dies),
      `scripts/inventory-csv-reseed.ts`, and `db:types` after apply. The apply must
      land before any deploy of the code side (migration-before-deploy lesson).

### Owner decisions still open

- [ ] Timing for the site-16 stock transfer and deactivation (S10 steps 1–2 are
      owner-executed operations on real goods; code deletion and S11 wait on
      them).

### Sequencing and gates

- Owner decree 2026-07-10: a single local agent works directly on `main`; no PRs.
  The 2026-07-10 working-tree wave is landed; each slice below is one commit.
- One route family per slice commit. T2 front-end. Zero schema migrations across
  S0–S9, S12, and S13. S10 carries owner-executed stock/ops steps before any
  code deletion; S11 carries the intra-transfer RPC migration (owner-delegated
  apply, and it must land before any deploy of the wave's transfer create
  model); the lot/expiry retirement below carries its own migration.
- Hard order: S10 (site-16 transfer-out uses the cross-branch flow one last
  time) → S11 (one-step move + cross-branch retirement) → S12/S13 (feature
  retirements, any order).
- Run the full gate fresh before each slice commit. A green result served from
  the turbo cache is not evidence.
- Runtime QA per slice at `390x844`, `768x1024`, and `1024x768` (D067 §7).

## Motion gap-fill (Codex rewrite)

Owner-facing ADR (Vietnamese): `docs/plan/adr/0010-motion-contract-gap-fill.md`.
Rewritten 2026-07-10 after Codex Outside Voice rejected the prior 7-item Phase 1.

### Step 0 — Motion Contract gate (cleared)

- [x] Owner picked **A** (2026-07-10, D071): one-shot content enter at
      `duration-150` + `motion-safe:` only; `duration-300` stays overlay-only.
- [x] `docs/spec/design-system.md` § G amended (One-shot content enter, D071).

### Phase 1 — 3 items only (after Step 0)

- [ ] **POS cart line enter** on add-item — one-shot keys; `motion-safe:`; prefer
      `duration-150` per Step 0. File: `pos/_components/cart-pane.tsx` (+ optional
      helper).
- [ ] **KDS genuine new-ticket signal** — testable hook that classifies realtime
      INSERT vs snapshot refresh / filter / station / mode / ready removal. Do **not**
      animate all `displayOrders` by key. Narrow ring/fade; avoid decorative
      slide-from-top-300 unless contract explicitly allows.
- [ ] **Operator route loading skeletons** — `(operator)/loading.tsx` +
      shift/team/orders as needed with `PageSkeleton` compact.

### Explicitly cut from Phase 1

- POS category/search grid fade (later: category-only, never on search typing)
- KDS Focus↔Overview crossfade
- POS order sidebar status pulse (later: toast/badge/ring; reorder is separate)
- List press scale on orders/dashboard
- Self-order decorative — blocked until browser QA evidence
- Page transitions / decorative ERP — needs explicit policy override

### Verification (when implementing)

`corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build` **plus**
browser smoke: KDS multi-ticket / reconnect / filter / reduced-motion; POS cart
one-shot enter; operator skeleton on bottom-nav.
