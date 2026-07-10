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

## Self-Order Rebuild (D075)

Contract: `docs/spec/self-order-guest-ui.md`. Owner decision: `docs/plan/decisions.md`
§ D075. The POS order is the only seating lifecycle; `self_order_sessions`,
`self_order_batches`, and `self_order_session_devices` are deleted.

Sequencing: S1 → S2 → S3 → S4 → S5 → S6 → S7. Each slice is one commit with the
full gate run fresh (`corepack pnpm typecheck && corepack pnpm lint && corepack
pnpm test`); a turbo-cached green is not evidence. Capture the exit code
directly — `pnpm lint | tail` swallows it. Runtime QA of every guest slice at
`390x844`. S1 and S6 carry migrations: the file lands in the commit, the owner
applies it to production.

### S1 T3 contract

Skill plan: repo rules = engineering + database + workflow; external skills =
supabase + supabase-postgres-best-practices; runtime tools = CodeGraph + Supabase
CLI + local static/SQL tests; skipped = browser/UI and production writes until
S4 and the owner-approved cutover.

- **PM:** Scope is contract correction plus the additive S1 migration only.
  Acceptance is one stored request model, deterministic 0/1/2+ open-order
  behavior, sessionless payment writes, pending-data backfill, and no drops or
  production apply.
- **BA:** Zero open orders creates `pending`; exactly one appends unless payment
  is live; two or more create `pending` and hide bill/payment. Replays return the
  original outcome, rejected carts require the matching `client_op_id`, and the
  current pending batch is backfilled without disappearing.
- **Senior Dev:** Reuse `self_order_canonicalize_cart`, `create_order`,
  `append_order_items`, payment snapshot helpers, and the existing order actor.
  Serialize self-order mutations with the table advisory lock, keep payment
  integrity on `order_id`, and leave old session objects in place for S6.
- **QA/QC:** Static SQL guards cover indexes, grants, `search_path`, branch
  ordering, payment decoupling, and backfill. The SQL acceptance case covers
  zero/one/two-open-order submit plus replay. Concurrency and generated DB types
  stay explicitly unverified until the migration is applied to a non-production
  schema or owner-approved cutover.

Agreements: the POS order is the only seating truth; multi-bill must fail safe;
payment cannot retain a required session foreign key. Resolved conflict: S1 is
schema-additive but snapshot-contract-breaking, so its production apply is held
for the S2-S5 cutover window rather than applied ahead of the runtime.

Attestation: covered the planned 0/1/2+ submit branches, replay, staff
accept/reject, pending backfill, multi-bill snapshot privacy, and sessionless
payment create/cancel in the migration plus both test harnesses. BA rules map to
`20260710113746_self_order_request_workflow.sql`; deterministic guards map to
`self-order-request-workflow-static.test.ts` and
`self_order_request_workflow_test.sql`. Production apply and generated DB types
are now verified under the cutover contract below. Still out of scope here:
concurrency proof, the remaining S4-S7 runtime/UI work, and live browser QA.

### Production cutover T3 contract

Skill plan: repo rules = engineering + database + workflow; external skills =
supabase + supabase-postgres-best-practices; runtime tools = CodeGraph +
org-scoped Supabase MCP + generated types; skipped = browser until the S4 guest
surface exists.

- **PM:** Apply only the surviving prerequisite chain and S1 to production,
  regenerate types from that schema, then continue S2. Acceptance is a verified
  migration ledger, verified request/payment objects, no production data loss,
  and an explicit distinction between DB apply and runtime deploy.
- **BA:** Preserve payment and HĐĐT behavior while moving request identity from
  session/batch to request/order. Skip the superseded seating-capability model;
  retain the cash invoice binding and fail closed on dirty active payment or
  pending-request duplicates.
- **Senior Dev:** Production is missing the payment-integrity substrate used by
  S1. Apply `self_order_payment_intent_integrity`,
  `self_order_cash_invoice_binding`, and `self_order_rpc_only_table_grants` in
  timestamp order before `self_order_request_workflow`; do not apply the
  session/device capability migrations that S6 removes.
- **QA/QC:** Verify ref, ledger, dirty-data preconditions, columns, indexes,
  grants, RLS, function signatures, and advisors. Run `db:types` only after the
  production schema is verified; then run focused and full repo gates while
  classifying unrelated dirty-tree failures separately.

Attestation: the apply plan matches the D075 net-effect contract: the kept
payment/HĐĐT/RPC-only substrate is applied, the retired device capability is
not introduced, and no destructive S6 cleanup is included.

Production verification addendum: `db:types` exposed that the skipped device
capability migration had also been the only creator of
`self_order_rate_buckets`. Preserve only the D075-surviving `batch | payment`
and `token | ip` rate-limit contract in a small forward migration; do not apply
or recreate device/session capability state.

Production status: all six surviving cutover migrations are present in the
production ledger; `self_order_requests` and the net-effect rate bucket are
live with RLS/RPC-only grants, and `packages/database/src/types/database.types.ts`
was regenerated from production. This is a database apply, not a frontend
runtime deploy.

- [ ] **Q0 — `/q/*` navigation HTML is never cached.** Independent of D075 and
      still open. The production build already orders the `/q/` NetworkOnly
      matcher before generic page caching, and the static test is green. Live
      offline-browser proof remains unverified. Acceptance: no prior seating bill
      can render from a service-worker fallback; the generic public page cache
      stays intact for non-sensitive routes.

- [x] **S1 — additive migration: `self_order_requests` + the six RPCs.**
      Create the table, its two unique indexes, RLS (staff select only), and
      RPC-only grants exactly as specified in the contract's Data contract
      section. Rewrite `self_order_get_snapshot(token)` to derive guest state
      from the open order; add `self_order_submit`, `self_order_accept_request`,
      `self_order_reject_request`. `self_order_submit` appends through
      `append_order_items` when the table carries exactly one open order, and
      inserts a `pending` row otherwise (zero open orders, or two or more).
      `self_order_accept_request` calls `create_order` or `append_order_items`
      under the request's advisory lock and sets `order_id` + `decided_by` +
      `decided_at`. Every `SECURITY DEFINER` function keeps an explicit
      permission check, an empty `search_path`, and least-privilege grants.
      Make `self_order_payment_requests.session_id` nullable for the bridge,
      bind new payment requests directly to the only open `order_id`, enforce
      one live intent per order, and rewrite create/expire/cancel/order-close
      paths so new requests are sessionless. Backfill current
      `self_order_batches.status='pending_approval'` rows before enforcing the
      one-pending-per-table index. Nothing is dropped in this slice. Coverage, in the two harnesses that run
      without a database: a static SQL guard under `apps/web/tests/` asserting the
      one-pending-per-table partial unique index, the `client_op_id` unique index,
      the empty `search_path`, the `REVOKE INSERT, UPDATE, DELETE`, and the branch
      order inside `self_order_submit` (exactly one open order appends; zero or
      two-or-more insert `pending`); plus a `supabase/tests/*.sql` case for the
      same branches. Two concurrent first submits racing the partial index stay
      **runtime-unverified** until the owner applies the migration — say so, do
      not claim it passes. `corepack pnpm db:types` cannot run in this slice
      either; regenerate after the owner applies, before S2 consumes the new
      types.

### S2 T2 self-review

Skill plan: repo rules = engineering + workflow + UI; external skills = none;
runtime tools = CodeGraph + generated DB types + focused contract tests; skipped
= browser because S2 changes no rendered composition and S4 owns runtime UI.

UI Advisor Gate

- Surface: `/q/[token]`; route family: PUBLIC-WORKFLOW; plane: public; change:
  contract + copy only.
- Context: table guest; actor: guest; job: understand table availability, send
  the first request, then add to an open bill without device/session concepts.
- Journey: unavailable or menu -> cart decision -> `Gửi món` / `Gửi thêm món`
  -> awaiting, accepted, or rejected; recovery: retry or call staff.
- Information order: table/menu first, request state second, bill/payment only
  when unambiguous; exclude device, capability, session, and batch vocabulary.
- Pattern: PUBLIC-WORKFLOW; data display: derived snapshot contract. States:
  unavailable, unopened, awaiting, rejected, open, payment pending, ambiguous.
- Components: no component change in S2; copy anticipates `NoteCallout` and
  `Alert` compositions already locked by the guest spec.
- Responsive/accessibility: unchanged in S2; S4 verifies `390x844` touch flow.

- **PM:** Scope is the public TypeScript/Zod boundary and canonical Vietnamese
  copy only. Acceptance is one derived snapshot state model and no retained
  device/session/capability vocabulary in `contracts.ts`.
- **BA:** First submit says `Gửi món`; an open order says `Gửi thêm món`.
  Awaiting disables duplicate submit, rejected restores the matching cart, and
  G0 has distinct copy for invalid QR, disabled table, and closed POS shift.
- **Senior Dev:** Match the applied S1 JSON exactly, keep cart/menu/payment
  schemas that survive, and retain client intent helpers only where retry
  identity still depends on them. Do not add a compatibility union for the
  retired contract.
- **QA/QC:** Add schema fixtures for every derived state and reject legacy
  capability/session fields. Recheck intent-key stability without the UI-only
  cart `key`; full runtime compilation resumes as S3/S4 migrate the callers.

Attestation: the public schema now accepts the six derived states and rejects
retired capability/session fields; copy covers the CTA split, awaiting,
rejection, invalid QR, disabled Self-Order, and closed POS shift. The server
classifies the transitional database code before display, intent identity
ignores the UI-only cart key, and the focused Self-Order suite is green 24/24.
Generated production types, web typecheck, web ESLint, and production build are
green. Full repo lint/test remain red only on the separate in-progress
design-system token guard and two stock footer call sites.

- [x] **S2 — contracts and copy.** Rewrite `apps/web/lib/self-order/contracts.ts`
      to the derived state model: one `status` enum, no session/batch/device/access
      unions, no capability flags. Update `packages/shared/src/messages/self-order.ts`
      (`SELF_ORDER_VI`) for the `Gửi món` / `Gửi thêm món` CTA split, the awaiting
      and rejected callouts, and the G0 descriptions for the three unavailable
      causes. Delete `apps/web/lib/self-order/client-intent.ts` helpers that only
      served batch idempotency if the new `client_op_id` path supersedes them.

- [x] **S3 — public API routes.** `GET /api/self-order/[token]` returns the new
      snapshot with no device cookie. Replace `batches/route.ts` with
      `submit/route.ts`. Keep `payment/route.ts`. Delete `join/route.ts`,
      `pairing-code/route.ts`, `cancel-pending-payment-and-add/route.ts`, and
      `apps/web/lib/self-order/device-capability.ts`. Remove the `device_token`
      cookie, the 428 `device_cookie_required` branch, and the client's
      one-shot 428 retry. Responses stay `private, no-store`. Rate limits
      survive on `token` and `ip` scopes.

### S4 T2 self-review

Skill plan: repo rules = engineering + UI + workflow; external skill =
frontend-testing-debugging; runtime tools = CodeGraph + in-app Browser; skipped
= design exploration because `docs/spec/self-order-guest-ui.md` already locks
the composition.

- **PM:** Finish only the four visible contract gaps: sticky categories,
  compact non-main rows, the pending round inside the bill, and hidden bill
  access for multi-bill ambiguity.
- **BA:** Main dishes keep photo cards; side dishes, drinks, and desserts use
  compact rows. Pending requests show submitted lines without a payable total.
  Multi-bill guests cannot read or pay a bill.
- **Senior Dev:** Reuse the existing item sheet, `Button`, `Item`, `Drawer`, and
  `OrderSummary`; no new state store, query, or menu abstraction.
- **QA/QC:** Re-run the focused static suite and verify the real public flow at
  `390x844`: page identity, first viewport, console, item sheet, cart, and bill
  drawer.

- [x] **S4 — guest UI.** Menu becomes the only page: header is `[table label]` +
      a `Hoá đơn` button with a `Badge` opening a `Drawer` that never auto-opens.
      Delete `self-order/status-pill.tsx`, `self-order/device-access-panel.tsx`,
      and `self-order/session-state-panel.tsx`; the awaiting and rejected states
      render as inline `NoteCallout` / `Alert` above the item list. Create
      `self-order/bill-drawer.tsx` holding the canonical order lines, the round
      history read from `kitchen_send_batches`, and `payment-panel.tsx`. Group
      the menu by `menu_categories.type`: `main_dish` as large photo cards, the
      rest as compact rows. Cart CTA reads `Gửi món` when the table is closed and
      `Gửi thêm món` when it is open. Replace realtime with adaptive polling in
      `self-order/hooks.ts`: 3s while awaiting confirmation or paying, 15s
      otherwise, refetch on focus and bfcache restore. G0 renders a static
      `BrandMascot animated={false}`.

### Featured main dishes T2 self-review

Skill plan: repo rules = engineering + UI + workflow; external skills =
frontend-design; runtime tools = CodeGraph + browser smoke; skipped = new menu
metadata because the existing `main_dish` type and menu order select the three
items.

UI Advisor Gate

- Surface: `/q/[token]`; route family: PUBLIC-WORKFLOW; plane: public; change:
  visual menu hierarchy.
- Context: table guest; actor: guest; job: recognize the three core dishes,
  customize one, and add it to the cart.
- Journey: menu -> featured main dish or category -> item sheet -> cart -> send;
  recovery: return to the menu or choose another category.
- Information order: three main dishes first, category rail second, remaining
  menu third; exclude bill, payment, branch, and staff data.
- Pattern: PUBLIC-WORKFLOW; exemplar: `apps/web/app/q/[token]/self-order-client.tsx`;
  data display: photo-card menu plus compact non-main rows.
- States: available menu, empty menu, awaiting, rejected, and payment-locked.
- Components: existing `Button`, `Badge`, `ScrollArea`, `MenuItemCard`, and item
  sheet; fallback: none.
- Responsive/accessibility: same mobile IA at `390x844`; touch targets and
  accessible item names stay unchanged.
- Verification: focused Self-Order tests, typecheck/lint/build, and browser
  smoke of the public menu at `390x844`.

- **PM:** Scope is only the menu's first visual decision. Acceptance is three
  main dishes before the full menu with no change to cart, request, or payment.
- **BA:** The first three items in the current `main_dish` order are promoted;
  every item remains selectable through the same customizer and appears once in
  the all-menu view.
- **Senior Dev:** Reuse the current item grid/card and item sheet; add no
  `is_featured` field, server query, or client state.
- **QA/QC:** Verify the featured section at phone width, category switching,
  an item sheet, cart add, empty menu, and payment-locked state.

Attestation: the diff matches this T2 contract. The featured section reuses the
existing photo-card and item-sheet path, derives only from the snapshot's
`main_dish` order, and excludes the promoted IDs from the all-menu remainder.
The focused static suite, targeted web typecheck/lint, and production build are
green. Browser QA at `390x844` remains unverified because the available local
server is wired to production Supabase credentials.

- [x] **Featured main dishes.** The all-menu view leads with the first three
      `main_dish` items from the existing menu order; the lead card spans the
      row and the remaining two retain large photo cards. No item is duplicated,
      and category-specific views retain their complete category.

### S5 T3 contract

Skill plan: repo rules = engineering + database + UI + workflow +
notifications; external skill = frontend-testing-debugging; runtime tools =
CodeGraph + focused tests + in-app Browser; skipped = new notification or audio
infrastructure because ADR 0008 requires a device-local signal only.

- **PM:** POS exposes one table-level pending-request badge, one small decision
  sheet, and cancellation of the exact Self-Order payment request from the
  existing bill sheet. No device/session queue survives this slice.
- **BA:** A pending request opens before the normal table action. Zero or one
  open bill delegates create/append selection to the canonical RPC; two or more
  open bills require staff to pick an existing destination or a new bill.
  Reject is confirmed without collecting a reason. Cancellation affects only
  the live payment request attached to the displayed bill.
- **Senior Dev:** Read pending rows through the staff RLS path; mutate only via
  `self_order_accept_request`, `self_order_reject_request`, and
  `self_order_cancel_payment_request`. Lift the minimal pending state into the
  POS client, poll it, reuse `playAppSignal("pos")`, and delete device,
  capability, pairing, batch, and queue abstractions from the runtime surface.
- **QA/QC:** Static guards prove the old RPC/device vocabulary is gone and the
  new badge, destination guard, audio signal, and bill cancellation are wired.
  Run focused tests, web typecheck, and targeted lint. Runtime POS QA remains a
  separate gate if the concurrent shared-auth refactor still prevents the app
  from compiling.

Agreements: canonical orders remain POS-owned; multi-bill routing must be an
explicit staff choice; audio is local and creates no notification or Telegram
side effect. Resolved conflict: polling is retained as the smallest reliable
request signal because this cutover deliberately removes the old realtime
session/device capability path.

Attestation: S5 is written, review-clean, and read-only runtime-verified. The POS now
reads only pending request/payment rows, mutates through the three canonical
RPCs, opens the request from the table tile, requires a destination for 2+ open
bills, signals new requests through the existing POS audio preference, and
cancels the exact guest payment request from the bill. Targeted lint, web
typecheck, the 25-test focused Self-Order suite, and the production build are
green. Local runtime shows `QR ⏳` on tables 20 and 21, opens the submitted
lines/provisional total sheet, and has no console errors. The guest menu and
item sheets are verified for `Sườn Cốt Lết`, `Sườn Cây`, and
`Sườn Một Gang`; live approve/reject was deliberately not triggered. Full repo
lint remains independently blocked by the concurrent
`docs/spec/design-system.md` removal of the documented `chrome-safe-bottom`
token.

- [x] **S5 — POS.** Add one badge tone to `pos-table-gate.tsx` for a table with a
      `pending` request. Replace `_components/self-order-approval-sheet.tsx` with
      a small approval sheet: submitted lines, customer note, provisional total,
      `Duyệt` / `Từ chối`, plus a destination picker when the table carries two or
      more open bills. Move `cancelSelfOrderPaymentRequest` into the table's bill
      sheet. Rewrite `pos/self-order-actions.ts` down to accept, reject, and
      cancel-payment. Fire `playAppSignal` on a new request: device-local, no
      `public.notifications` row, no Telegram (ADR 0008).

- [ ] **S6 — destructive migration and test re-anchor.** Drop
      `self_order_sessions`, `self_order_batches`, `self_order_session_devices`,
      `self_order_payment_requests.session_id` and its legacy foreign key/index,
      `tables.self_order_capability_version`, `tables.realtime_topic_token`, every
      `self_order_*_v2` function, the `session_changed` broadcast trigger and its
      realtime policies, and the `origin` / `join` values of
      `self_order_rate_buckets.purpose`. Delete the ten obsolete test files under
      `apps/web/tests/` covering seating capability, device capability, session
      integrity, and v2 phases; re-anchor the payment, cash-invoice-binding, and
      public-contract tests to the new snapshot shape.

- [ ] **S7 — documentation truth sweep.** `docs/spec/self-order-motion-design.md`
      still references the Menu/Bill tabs and the old cart contract; rewrite it
      against the drawer IA. Delete
      `docs/runbooks/pos-kds/qr-self-order-capability-rollout.md` and its entry in
      `docs/runbooks/README.md` — it rolls out a capability that no longer exists.
      Re-check `docs/plan/adr/0011-database-auth-realtime-hardening.md` for
      findings that named the deleted tables.

### Known gap, out of scope

No admin surface exists for toggling `tables.self_order_enabled` or printing a
table QR. It never did. Do not grow one inside this rebuild.

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
- [x] **Branch Hub touch-plane cutover.** Core Branch stock and leave-review
      workflows own touch-native presenters; Office keeps separate responsive
      management presenters. Supplier returns retired through S12; PO retired
      through S13. Cross-branch transfer retirement remains independently
      sequenced in S11.
  - [x] Consumption now separates posted ledger sources from manual documents,
        with a Branch-native list and typed detail; no Office presenter reuse.
  - [x] Count assignment/review now owns the correct manager destinations and
        no longer opens the signed-in manager's personal count surface.
  - [x] Reconcile stocktake role documentation with current permission seeds:
        moot — `production_manager`/`warehouse_manager` buckets and their
        `role_templates` rows are retired (D076); stocktake create/complete
        is `owner`/`branch_manager` only now.
  - [x] Run runtime QA across phone `390x844`, tablet portrait `768x1024`,
        tablet landscape `1024x768`, and Office desktop `1440x900`, in both
        Branch/Office shells with local Supabase E2E auth. The theme contrast
        contract remains covered by the design-system guard suite.

## Branch Stock Cutover (D073 — supersedes the D067 round-2 scope)

> `docs/plan/decisions.md` D073 (2026-07-10): the Central Kitchen site (branch 16) is being decommissioned — stock transfers to Phước Hải (branch 3), then
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
      since D068 §4. Remove the operator recipe surface entirely — the tile AND the
      `stock/production/recipes/**` route family (list, editor, new — the
      clients still expose create/edit/delete today); recipe administration
      stays in Office `/inventory` (D073 §3). Guard entries for the removed
      routes: `scripts/page-archetypes.mjs` + the route-manifest arrays in
      `scripts/check-ui-contract.mjs`.

- [ ] **S9 — densify the on-hand list.**
      `stock/on-hand/branch-stock-on-hand-client.tsx:148` renders `min-h-20` (80px)
      rows inside an `ItemGroup` at `gap-3`, so 105 active ingredients produce roughly
      8,400px of scroll. Move to 44px rows with `gap-0` plus `ItemSeparator`, already
      exported from `packages/ui/src/components/item.tsx`. Add no toolbar: "Kiểm kê",
      "Báo hao hụt", and "Nhập kho" are hub tiles, and repeating them here would give
      one workflow two visual sources of truth. Per-ingredient actions belong in the
      row's detail sheet.

- [ ] **S10 — delete the central forks (D073 §1/§5); ops steps done 2026-07-10.**
      Steps 1–2 are EXECUTED and verified on PROD (owner-delegated in-session):
      transfer `CK-CLOSE-20260710` moved all 29 stock rows 16 → 3 through the
      standard draft→ship→transit→confirm→receive RPC chain (29 `transfer_out` + 29 `transfer_in` movements, WAC preserved, site 16 now 0 rows / 0
      value, Phước Hải 97→109 rows), and `branches.is_active = false` for 16.
      `production_manager` staff accounts are deleted, not reassigned (D076 —
      no auto-remap; see migration
      `20260710201500_retire_central_and_office_buckets.sql`). Remaining:
      (3) delete the central forks; also retire the matu-platform import
      toolchain (`import:*` scripts in root `package.json`,
      `scripts/inventory-matu-platform-*.mjs`) — its referent sites are gone.
      Step 3 detail: delete the central forks
      from the operator UI — `CENTRAL_HOME_TILE_SUFFIXES` and the central home
      CTA in `(operator)/page.tsx` + `operator-home-contract.ts`, the
      `isCentralKitchen`/`isCentralSupply` branches in
      `(operator)/dashboard/data.ts`, and the `central_supply`/
      `central_kitchen` `kinds` entries in `nav-config.ts`. The docs half of
      this step landed 2026-07-10 (`4b478eb84`): archetype exceptions and the
      screen-context central rows are already gone, and the GENERATED
      role-route-matrix block regenerates itself once the code forks delete.
      Clean deletes, no tombstones. The DB enum keeps all three kinds for
      history.

- [ ] **S11 — one-step Kho ↔ Bếp move, both directions (D073 §5). UNBLOCKED:
      the site-16 transfer-out ran 2026-07-10; cross-branch flow is no longer
      needed by any active pair of sites.**
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
      `/inventory/transfers` stays read-only for history. Guard entries to
      retire with the routes: `stock/receive/**` rows in
      `scripts/page-archetypes.mjs` (the route-manifest gate in
      `scripts/check-ui-contract.mjs` rejects dead entries).

- [x] **S12 — retire supplier returns end-to-end (D073 §4).** Delete the
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
      supplier-return expectations removed). Guard entries: supplier-return
      rows in `scripts/page-archetypes.mjs` and the supplier-return arrays in
      `scripts/check-ui-contract.mjs`.

- [x] **S13 — retire purchase orders from daily use (D073 §4).** Delete the
      operator wrappers (`stock/purchase-orders/**`, 3 files) and the PO nav
      tile; remove the Office PO nav entry and routes from daily navigation;
      remove the PO door from the GRN source picker
      (`fetchOpenPurchaseOrdersForReceiving` / `openPurchaseOrders` in
      `apps/web/lib/inventory/grn-source-data.ts`) and the
      `openPurchaseOrders` hub-queue count. Delete the Office PO routes and the PO server actions
      (`purchase-order-actions.ts` mutators) with the navigation — D073 §4
      retires both planes, not nav alone. Guard entries: PO rows in
      `scripts/page-archetypes.mjs` and the PO arrays in
      `scripts/check-ui-contract.mjs`. DB tables, RPCs, and the 15 historical
      POs stay. The old "Convert the Branch purchase-order family" follow-up
      item is already removed (2026-07-10 consolidation); this slice is its
      replacement.

### Defects found while scoping the cutover — separate slices, not D073

Skill plan (2026-07-10 implement): repo rules = engineering + workflow + database;
external = none; runtime = migration files only (no PROD apply without owner
delegation). T2 for guard; T3 condensed for money/schema slices below.

PM: close sellerName as non-bug; ship guard + four migrations + app rewires;
acceptance = fixtures green, typecheck clean on touched files, migrations
idempotent and ordered after self-order stamps.
BA: seller = Viettel; notif links /br; WAC only on stock_levels; correction
uses production_runs; lot/expiry never populated → drop.
Dev: guard WRITE_SQL + fixtures; 4 SQL files 193000–193300; correction +
stock-on-hand + types + cleanup scripts.
QA: guard-sync 29 fixtures; stock-on-hand-detail-model tests; no tsc errors in
touched files; PROD apply is owner-gated (migration-before-deploy for
destructive lot/expiry + production_orders drops).

- [x] **The operator hub counts the wrong table.** Fixed: the hub queue counts
      `production_runs` in `draft`/`in_progress`, matching the production page's
      work-queue definition. `production_orders` holds zero rows tenant-wide and
      has no writer anywhere in the app.

- [x] **Every HĐĐT issues with an empty seller name.** Closed 2026-07-10:
      not a bug. Viettel fills seller from the registered MST
      (`COMPANY_TAX_CODE` / `createInvoice/{supplierTaxCode}`); the app does
      not send `sellerInfo`. Call-site `sellerName: ""` is unused by the
      provider. Matches D031 + owner confirm. Buyer path is separate
      (`BUYER_NOT_GET_INVOICE_NAME` when khách không lấy HĐ).

- [x] **`guard-prod-db.mjs` misses write SQL wrapped in `DO $$…$$` blocks.**
      Fixed 2026-07-10: root gap was `DO $$ … PERFORM rpc() $$` (and bare
      `PERFORM`), not `UPDATE` inside DO (already blocked). Added `do|perform`
      to `WRITE_SQL` plus replay fixtures in `scripts/check-guard-sync.mjs`.
      Residual: bare `SELECT mutating_fn()` still text-match opaque.

- [x] **Three PROD RPCs deep-link notifications to the retired `/employee/*`
      routes.** Migration ready (not applied — needs owner-delegated apply):
      `supabase/migrations/20260710193000_fix_notification_employee_deep_links.sql`
      recreates `reject_leave_request`, `approve_inventory_count_slip`,
      `request_inventory_count_recount` from baseline `/br/...` links and
      backfills historical `/employee/*` notification rows (incl. checkout).

- [x] **Retire the dead `production_orders` entity.** Correction source
      repointed to `production_runs` in `document-correction-actions.ts`;
      stock-on-hand detail reads `production_run_id`. Migration ready (not
      applied): `20260710193200_retire_production_orders.sql` drops RPCs,
      `stock_movements.production_order_id`, and both tables.

- [x] **`confirm_production_run` overwrites a tenant-wide cost column.**
      Migration ready (not applied):
      `20260710193100_confirm_production_run_stop_unit_cost_overwrite.sql`
      removes the `UPDATE ingredients SET unit_cost` on the live 3-arg
      overload AND drops the stale 2-arg overload
      `confirm_production_run(bigint, numeric)` that still overwrote
      `ingredients.unit_cost` (Codex review 2026-07-10). WAC stays on
      `stock_levels.avg_unit_cost` only.

- [x] **Retire the dead lot/expiry columns — owner-confirmed (D073 §5).**
      Migration ready (not applied):
      `20260710193300_retire_lot_expiry_columns.sql` rewrites write-off / GRN
      recreate / upsert / bulk_import / scan_inventory_alerts (also fixes
      stale `ing.unit` in low-stock alerts), rebuilds
      `mv_inventory_stock_current`, drops the three columns. App +
      `database.types.ts` updated.

### Apply sequencing (Codex review 2026-07-10 — do not half-apply)

PROD deploy `ca865e69` still reads `production_orders` /
`production_order_id` / `p_shelf_life_days`. Applying `193200`/`193300`
before the cutover code is live breaks that deploy.

1. Deploy the cutover app code first (no more those reads).
2. Re-run precheck (retired tables/columns still 0 non-null).
3. Apply in order: `193000` → `193100` → `193200` → `193300`.
   Keep the chain atomic — do not apply `193000` alone and leave the rest.

`193000`/`193100` are safer alone, but owner/Codex chose full-chain apply
after code deploy to avoid a half-applied ledger.

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
- Order: S11 waits on S10 (the site-16 transfer-out uses the cross-branch
  flow one last time). S12 and S13 are independent of S10/S11 and may run any
  time (D073 §4 has no ops dependency).
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
