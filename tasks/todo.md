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

- [ ] **S0 — lock the operating contract and remove cached-seating leakage.**
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
- [ ] **S1 — exactly-once ordering and immutable session/order binding.**
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
- [ ] **S2 — seating capability and bounded public access.**
  - Current status: additive versioned migration, device boundary, pairing flow,
    staff controls, rate limits, public allowlists, and guest denial states are
    written and static-green. The v1 submit path and the capability-version
    setter now share a lock and recheck the live version before mutation. Every
    table still defaults to version `1`; no table flip or production apply has
    occurred.
  - Treat the printed QR as table lookup context; require a seating-bound
    continuation capability for active bill reads/writes, define the
    second-device approval path, and add per-token/IP/session limits.
- [ ] **S3 — one recoverable payment intent.**
  - Current status: one-intent recovery, staff cancellation, exact VietQR
    snapshot, stale-intent expiry before cash/HĐĐT binding, and ambiguity-safe
    late SePay recovery are written and static-green. Any manual-review webhook
    now excludes its whole payment from automatic Finance recovery. Database
    runtime and provider/browser proof remain unverified; not applied to
    production.
  - One active cash/VietQR intent, server-owned expiry/cancel/complete states,
    reloadable VietQR details, stale cash-call cleanup, safe method switching,
    and explicit QR payment eligibility while preserving POS auto-completion.
- [ ] **S4 — payable truth and operator ownership.**
  - Current status: canonical bill-first guest UI, explicit staff target/payment
    actions, scoped rejection, device revocation, and queue recovery data are
    written and static-green; staff runtime smoke remains unverified.
  - Canonical order lines/total first, round history second; branch availability
    and precise recovery errors; safe target-order selection; notes propagated
    to fulfillment; queue age/realtime/fallback and scoped rejection.
- [ ] **S5 — PUBLIC-WORKFLOW layout and UX.**
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
- [ ] **S6 — evidence-led visual polish and rollout.**
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

- [ ] **G0 — classify the dirty working tree.** For every changed file and new
      migration, decide `keep for production`, `port to Greenfield`, or `drop`.
      Do not start a schema copy while mixed production WIP is unresolved.
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

## Design-system contrast wave (branch `ds-a11y-upgrade`)

Status: implemented, gates green, owner approved the palette change on 2026-07-10.
Not committed yet.

```
Skill plan: repo rules = engineering + ui + workflow + skills; external skills = none;
            runtime tools = node (OKLCH→sRGB→WCAG checker); skipped = none.
PM:   scope = close the contrast defects the 111 className gates structurally cannot see
      (they check class patterns, not token values). Acceptance = every shipped status
      pair clears its WCAG floor in BOTH themes, no call-site regressions, gates green.
      Priority = P0: the failures land on operator surfaces during the 18:00–06:00 shift.
BA:   rules = `--{status}` is ink (page + its own /10 /15 tints); `--{status}-foreground`
      is text on the SOLID fill only. Edge case found: light-mode tokens had these two
      roles inverted, so every tinted callout using `-foreground` reads in light and
      collapses at night. Data flow = globals.css tokens → primitive cva → route class.
Dev:  approach = fix at the token layer where one value covers many call sites; migrate
      call sites only where the token cannot be split (warning ink vs solid fill had no
      single satisfying L — verified numerically). Files = globals.css, badge/button/
      avatar/accordion + 6 form primitives, 13 tint call sites, 2 tone maps, 4 form
      wrappers, check-ui-contract + guard-reporting, design-system.md, regressions.md.
      Risk = `--warning` and `--success` shift visibly darker; `text-primary` (94 sites)
      would have broken under the naive "darken the fill" fix, so the dark CTAs were
      fixed by flipping their foreground instead.
QA:   tests = new `apps/web/tests/design-token-contrast-static.test.ts` reads the shipped
      OKLCH from globals.css and asserts 22 pairs; negative-tested by reverting --warning
      (3 suites fail). Regressions rechecked = RUNNER-BOARD-LARGE-SCAN-TOKENS (runner
      copy tests still green), DESIGN-SYSTEM-ONE-SOURCE-ONLY (contract updated first).
Attestation: diff matches this block. Guards `status-focus-ring-contrast` and
      `status-foreground-on-tint` land at baseline 0 with positive+negative regex checks.
```

- [x] **Palette change approved (owner, 2026-07-10).** Light `--warning` moved off
      the brand gold (`#f2a100` → `#8e5400`, ink was 1.99:1 on kem gạo) and light
      `--success` deepened (`#6a8f5b` → `#446935`). The gold stays the accent on
      `--ring` / `--chart-2`.
- [x] **Night browser-chrome color** realigned to the dark `--background` token
      (`#1f1812` → `#120a06`). The `browser-chrome-theme-color-source` gate
      single-sources the hex string but cannot check it against the token, so the
      equality (plus the out-of-scope static `manifest.webmanifest`) is asserted in
      `design-token-contrast-static.test.ts`.
- [ ] **Browser smoke in both themes** once local Supabase/Docker auth is available:
      NoteCallout warning, Badge status set, POS/KDS operator surfaces, KPI sparklines,
      night-mode primary/destructive CTAs, keyboard focus on a destructive Button.
      This is the only unverified surface of the wave — the numbers are proven, the
      perceived weight of the new ochre/green is not.

### Second pass — debt burn, adapters, doc truth

Frozen UI-contract debt `158 -> 132`, `delta = 0` on every ratchet:
`inline-chrome 60 -> 45`, `tint-opacity 71 -> 62`, `raw-padding 27 -> 25`.
`orders/order-detail-sheet.tsx` went `17 -> 1` hit (the one status-tinted list row
is deliberate); `inventory/supplier-invoices/supplier-invoices-client.tsx` went
`10 -> 0`. New: `AppBackLink` adapter (8 duplicated call sites collapsed), the
`operator-no-stat-metric` gate, and the two `chrome-tap` / `.theme-light-only`
utilities finally documented.

**Concurrency hazard, for the next agent that burns debt in parallel:** two agents
each ran `node scripts/check-ui-contract.mjs --write` against the same script. The
second one's whole-file write clobbered the first one's lowered baselines. Only a
re-run of `--write` after all edits had landed produced correct counts. Burn debt in
parallel if you like, but ratchet ONCE, at the end, from the lead thread.

### Third pass — the four deferred items, owner-approved directions (2026-07-10)

- [x] **`ItemTitle`**: contract amended, not the default. `ItemTitle` now has a
      `size` cva (`default` = dense list-row title, byte-identical for the ~232
      existing call sites; `heading` = the § Rhythm B sub-section role). The 23
      hand-patched call sites migrated to `size="heading"`; § Rhythm B points at
      the variant.
- [x] **Field-trigger grammar unified.** `packages/ui/src/lib/field-trigger.ts`
      exports `fieldTriggerChrome` + `fieldTriggerSize`; `SelectTrigger` composes
      it (effective class set proven unchanged, 41 tokens set-equal). The ui
      `Combobox`/`TagInput` primitives adopted it — and since the ui `Combobox`
      has ZERO app consumers, the user-visible fix landed in the real ones:
      `form/combobox.tsx` and `form/multi-select-combobox.tsx` (field fill/focus/
      invalid grammar + ChevronDown in muted, replacing outline-button chrome).
- [x] **POS/KDS touch targets**: split-bill steppers and KDS focus prev/next →
      `icon-touch` (48px); reason chips → `size="touch"` (the raw `h-8` had to be
      removed — it silently clobbered `min-h-12` via tailwind-merge order);
      clear-search keeps the 24px glyph but gains a 44px hit area via
      `after:-inset-2.5` (checkbox/radio pattern; InputGroup does not clip).
- [x] **`DataTable` pagination (#4a)**: the adapter now owns client-side paging —
      when `pageSize` is set without `totalCount` it slices internally with an
      uncontrolled page state, derives the page clamped (a shrinking filter result
      can never strand an empty page), and passes the ABSOLUTE row index to
      `render`/`mobileCardRender` so inline line-edit sheets stay correct across
      pages. `totalCount` still signals server paging (no slice; controlled props
      honored). Opted in at `pageSize={50}`: orders, refunds, GRN list, supplier
      invoices, print jobs, permission audit. Locked by
      `apps/web/tests/data-table-pagination-static.test.ts`.

### Fourth pass — mechanical sweep, Motion Phase 1, brand W4 (2026-07-10, D071)

- [x] **Mechanical debt sweep**: 29 files; every in-scope `tint-opacity` hit
      resolved; 21/30 inline-chrome hits migrated (Frame/NoteCallout/Item/
      AppEmptyState). Frozen totals `132 -> 88` (75 real debt + 13 permanent).
      9 chrome hits left with named reasons (radio-label semantics, card-tier
      frame needs a new adapter decision, status-row exemption, login branding).
- [x] **Raw-padding floor reclassified**: 5 POS Operations-chrome files (7 hits)
      are permanent exceptions — station surfaces do not mount `AppPage`, no
      density prop can absorb their frame spacing.
- [x] **Motion Phase 1 (ADR 0010, Step 0-A per D071)**: `§ G` gained the
      one-shot content-enter clause; `use-kds-new-ticket-signal` classifies
      genuinely new tickets by draining ids filled ONLY in the realtime INSERT
      branch of `use-kds-realtime` (snapshot/reconnect/poll provably never fill
      it); POS cart line one-shot enter via `_lib/cart-line-enter.ts`; operator
      `loading.tsx` for root/shift/team/orders. 16 new unit tests.
- [x] **Brand W4 (partial by census reality)**: 10 top-level empty states gained
      `BrandSymbol` (riceGrain/roundPlate/roof) + the Runner footer carries the
      sanctioned `brand-strip brand-pattern-hat-gao` trim (`vong-to` is banned
      by runner-copy.test.ts). Census: most bare empties are `compact` — the
      skip-compact rule caps this sweep at ~12 candidates, not the audit's 76.
      Lever if owner wants more: allow symbols on compact empties that are
      full-page early returns (~15-20 sites).

### Still deferred (product decisions)

- **`DataTable` sorting + sticky header (#4b)**: new feature — needs the UI
  Advisor Gate and one exemplar route (GRN list) before rollout. Client-side
  sort, `aria-sort`, no new libraries. Virtualization stays rejected (YAGNI at
  single-tenant scale).

### Browser-smoke checklist (one session covers all three waves)

Both themes (light + night 18:00–06:00), phone 390×844 + tablet 1024×768 +
desktop 1440×900:

1. Palette: `NoteCallout tone="warning"`, Badge status set, KPI sparklines
   (success=green not terracotta at night), solid primary/destructive CTAs at
   night, keyboard focus on a destructive Button (visible keyline).
2. Field grammar: any Inventory form with Select + Combobox side by side — same
   fill, border, focus ring, chevron; invalid state reads on both; multi-select
   trigger matches.
3. Touch: POS split-bill steppers (48px, no overflow at 390px), KDS focus
   prev/next, void/discount reason chips (taller pills), search-clear halo taps.
4. Pagination: orders + GRN lists >50 rows — pager appears, mobile card list
   pages too, filters never strand an empty page, row actions on page 2+ hit the
   right row.
5. `AppLinkCard` badges on the operator production hub (counts as badges, no
   mono stat block).

## Owner-Confirmed UI Follow-ups

- [ ] **Route shell/header refactor.** Collapse route-local shell/header
      bypasses into approved chrome primitives after the primitive/guard cleanup is
      green.
- [ ] **Branch Hub touch-plane cutover.** Keep moving `/br/[branchId]/*` away
      from Office presentation while preserving Office as the desktop management
      plane.
  - [x] Document the durable Branch-vs-Office presentation contract in
        `docs/modules/ui.md`.
  - [x] Convert `/br/[branchId]/stock` landing to a Branch-native stock hub.
  - [x] Convert `/br/[branchId]/stock/transfer` list to a Branch-native
        touch list over the shared transfer data/action model.
  - [x] Convert `/br/[branchId]/stock/transfer/[id]` to a Branch-native
        touch detail and route receiving actions into the native receive flow.
  - [x] Merge `/br/[branchId]/stock/receive` into the native transfer receive
        queue while preserving the deep receive route for number-pad entry.
  - [x] Convert `/br/[branchId]/stock/transfer/new` to a Branch-native
        progressive touch workflow while keeping the Office create route in
        `DocumentFormFrame`; share only the server loader, pure rules, client
        controller, and mutation authority.
  - [x] Convert `/br/[branchId]/stock/on-hand` to a Branch-native touch list at
        phone/tablet widths; share `loadStockOnHandPageData` and the pure
        filter/status model while keeping Office `StockClient` management-only.
  - [x] Convert `/br/[branchId]/stock/grn` to a Branch-native touch list;
        share `loadGrnListPageData` and the pure list model while keeping Office
        `GrnListClient` management-only.
  - [x] Convert `/br/[branchId]/stock/grn/new` to a native Branch source step
        before extracting the detail-form controller.
    - T2 plan: Skill plan: repo rules = engineering + skills + ui + workflow;
      external skill = next-best-practices; runtime tools = CodeGraph + local
      browser smoke; skipped = external design review because the locked Branch
      touch LIST recipe resolves the hierarchy and interaction model.
      PM: source selection is the bounded MVP; BA: the route branch is fixed
      and supplier/PO actions retain their existing server authority; Dev:
      shared loader/model plus Branch-only client; QA: route canonicalization,
      permission, error, touch target, and Office-regression coverage.
    - UI Advisor Gate: Surface: `/br/[branchId]/stock/grn/new`; route family:
      Branch stock GRN; plane: Branch; change: visual + flow. Context: Inventory
      receiving; actor: branch procurement operator; job: choose supplier or
      open PO then start a GRN. Journey: queue -> source choice -> Branch detail
      form; recovery: back to queue/retry. Information order: source action,
      supplier search, open POs; exclude: Office totals/branch switching.
      Pattern: LIST Branch source step; exemplar:
      `branch-grn-list-client.tsx`; data display: touch list. States:
      loading, empty, error, permission. Components: `BranchOperatorPage`,
      `BranchOperatorPanel`, `ItemGroup`; input: touch + keyboard; risks:
      target size, disabled state, scoped navigation.
  - [x] Convert `/br/[branchId]/stock/grn/new/[supplierId]` to a native Branch
        receipt-detail workflow and remove its dependency on the Office page
        presentation.
    - T2 plan: Skill plan: repo rules = engineering + skills + ui + workflow;
      external skill = next-best-practices; runtime tools = CodeGraph + local
      browser smoke; parallel review = controller-boundary and Branch-form
      pattern audits. PM: finish one safe receipt-entry journey before expanding
      to other deep stock workflows; BA: the branch path fixes receiving scope,
      drafts remain server-owned, and confirmation stays permission-gated; Dev:
      shared create loader + typed client controller, separate Office and Branch
      presentations, no mutation rewrite; QA: route/permission/static-import
      guards, unit controller coverage, and phone/tablet/Office viewport checks.
    - UI Advisor Gate: Surface: `/br/[branchId]/stock/grn/new/[supplierId]`;
      route family: Branch stock GRN; plane: Branch; change: visual + flow.
      Context: receiving a supplier delivery; actor: branch procurement
      operator; job: add, correct, and submit receipt lines in a fixed branch.
      Journey: source choice -> receipt detail -> review/confirm; recovery:
      discard draft or return to source choice. Information order: supplier and
      receiving location, added lines, ingredient search, then sticky next
      action; exclude: Office document frame, desktop side editor, and
      cross-branch switching. Pattern: DOC-WORKFLOW; exemplar:
      `branch-transfer-create-client.tsx`; data display: editable touch list
      plus bottom sheet. States: empty, line edit, save error, loading,
      permission. Components: `BranchOperatorPage`, `BranchOperatorPanel`,
      `AppDetailFooter`, `Sheet`; input: touch + keyboard; responsive: one
      column on phone, two content columns only from tablet landscape; risks:
      lost draft state, confirmation scope, touch target size, and sticky
      action obscuring fields.
    - T2 attestation: the implemented shared loader/controller/action boundary
      and separate Branch/Office presentations match this contract; static,
      unit, typecheck, lint, build, and repository test coverage are green.
  - [x] Convert `/br/[branchId]/stock/grn/[id]` to native Branch draft review
        and confirmed-receipt presentations without importing Office detail
        components.
    - T2 plan: Skill plan: repo rules = engineering + skills + ui + workflow;
      external advisory = Gemini `agy` plan, constrained by the repository UI
      contract; runtime tools = CodeGraph + local browser smoke. PM: complete
      the receiving journey from line entry through review and receipt without
      expanding Branch into an audit workspace; BA: route branch remains fixed,
      draft mutations and confirmation retain existing server authority, and
      confirmed receipts are read-only; Dev: extract shared detail loader/model/
      controller then provide distinct Branch draft and receipt clients; QA:
      scope mismatch, import boundary, confirmation navigation, touch targets,
      and Office regression coverage.
    - UI Advisor Gate: Surface: `/br/[branchId]/stock/grn/[id]`; route family:
      Branch stock GRN; plane: Branch; change: visual + flow. Context: review a
      supplier receipt before posting, then retrieve the posted receipt. Actor:
      branch procurement operator; job: correct line receipt facts, save,
      confirm, or inspect the final receipt. Journey: receipt entry -> review ->
      confirmation -> Branch receipt; recovery: back to queue, save corrections,
      or explicit line removal confirmation. Information order: document context,
      receipt lines, exceptions, then sticky action; exclude: audit history,
      post-confirm correction, stock correction, invoice linkage, cross-branch
      navigation, and Office desktop grid. Pattern: DETAIL; exemplar:
      `branch-grn-create-client.tsx`; data display: touch list + bottom sheet
      for draft, read-only touch list for confirmed. States: loading, empty,
      unsaved draft, validation error, confirmation pending, permission, and
      not found. Components: `BranchOperatorPage`, `BranchOperatorPanel`,
      `ItemGroup`, `Sheet`, `AppDetailFooter`; input: touch + keyboard;
      responsive: one column on phone, two panels only from tablet landscape;
      risks: scope leak, duplicate confirmation, unsaved lines, destructive
      removal, and sticky action obscuring the final line.
    - T2 verification: shared loader/model/action hooks and distinct Branch
      draft/receipt presentations match this contract; model unit tests, GRN and
      Branch static tests, typecheck, web ESLint, full repository test, build,
      CodeGraph re-index, and unauthenticated phone/tablet route smoke are
      green. Root `pnpm lint` is pending the unrelated baseline finding in
      `apps/web/tests/inventory-location-labels.test.ts`.
  - [x] Convert `/br/[branchId]/stock/on-hand/[ingredientId]` from the Office
        `StockIngredientDetailPageContent` embed to a Branch-native touch
        detail while preserving the Office detail as the management presentation.
    - T2 self-review:
      - Skill plan: use `next-best-practices` to keep the server loader and
        presentation boundary serializable; run one `web-design-guidelines`
        review after implementation, subordinate to the local UI contract.
      - PM: scope is the ingredient lookup/detail only; done means a branch
        operator can see current quantity, locations, recent movement, and
        permitted next actions without Office data density or extra workflow
        steps.
      - BA: route scope must reject a bad branch/id; supplier receiving opens
        the GRN source flow, while transfer, count, issue, and write-off retain
        their existing Branch routes and permission gates; WAC/value stay out
        of the Branch payload and presentation.
      - Dev: move query/scope/permission logic and pure movement/status rules
        into `lib/inventory`, retain the Office presenter, and give Branch its
        own `BranchOperator*` composition with route-scoped links.
      - QA: cover pure status/reference rules plus the no-Office-import route
        boundary; recheck source route/action semantics, empty/no-location and
        no-movement states, touch targets, phone/tablet layout, and Office
        detail regression.
    - UI Advisor Gate
      - Surface: `/br/[branchId]/stock/on-hand/[ingredientId]`; route family:
        `operator-stock`; plane: Branch; change: visual + route presentation.
      - Context: inventory workspace in `screen-context-map` §2.5; actor:
        branch stock operator; job: inspect one ingredient before the next safe
        stock workflow action.
      - Journey: on-hand lookup -> ingredient detail -> inspect quantity and
        location -> permitted action -> canonical Branch workflow; recovery:
        return to the filtered lookup list or keep read-only context on denied
        permissions.
      - Information order: 1) ingredient/status/current quantity 2) location
        balance and recent movements 3) thresholds and secondary actions;
        exclude: WAC, stock value, audit/correction tools, Office table chrome,
        and cross-branch navigation.
      - Pattern: DETAIL; exemplar: Branch GRN receipt; data display: touch
        `ItemGroup` lists plus `BranchOperatorDetailList`.
      - States: loading, no location stock, no movement, invalid/out-of-scope,
        and permission-limited actions.
      - Components: `BranchOperatorPage`, `BranchOperatorControlBar`,
        `BranchOperatorPanel`, `BranchOperatorActionSection`, `ItemGroup`,
        `AppDetailFooter`; fallback: none.
      - Responsive/accessibility: same information architecture at phone and
        tablet landscape; touch-first actions and icon back control retain
        labels/targets; no DataTable or horizontal scrolling.
      - Verification: static route-boundary checks, model tests, typecheck,
        web ESLint, UI contract, build/test, and authenticated viewport smoke
        when local auth is available.
    - T2 verification: branch/Office scope boundary, status/reference model,
      and operator stock static tests are green; root typecheck, web ESLint,
      UI contract, route matrix, doc/i18n gates, full test, and build are green.
      Unauthenticated route smoke is green at `390x844`, `768x1024`, and
      `1024x768`; authenticated visual evidence still needs local auth. Root
      `pnpm lint` remains blocked only by the unrelated baseline finding in
      `apps/web/tests/inventory-location-labels.test.ts`.
  - [x] Continue replacing stock deep workflow EMBED-WRAPPER transition routes:
        stocktake, issue, supplier-return, and reports.
  - [x] Convert `/br/[branchId]/stock/stocktake` list, start, count, and
        review routes to a native Branch touch workflow while retaining Office
        stocktake management presentation.
    - T2 self-review:
      - Skill plan: repo rules = engineering + skills + ui + workflow;
        external skills = next-best-practices + web-design-guidelines;
        runtime tools = CodeGraph + local browser smoke; independent route and
        UI boundary reviews = temporary read-only agents.
      - PM: scope is the branch-manager stocktake session journey only; done
        means a manager can start, continue blind counting, review, complete,
        or cancel a fixed-branch session without a desktop management layout.
        `/stock/count` remains the separately assigned employee count-slip
        workflow.
      - BA: branch path is authoritative; new sessions cannot switch branch;
        blind counting must never receive or reveal system quantity before the
        session completes; drafts, zone locks, count rounds, server permission,
        completion, and cancellation rules retain their existing authority.
        Create/cancel UI uses `inventory:stocktake_create`; complete UI uses
        `inventory:stocktake_complete`, while RPC remains authoritative.
      - Dev: add serializable shared stocktake data/model helpers, leave Office
        pages and clients as their management presenters, and give Branch list,
        start, count, and detail routes dedicated `BranchOperator*` touch
        composition with Branch-only navigation.
      - QA: cover status/progress model rules and Branch no-Office-presenter
        imports; recheck count-vs-session routing, branch-scope mismatches,
        blind/results information boundaries, cancellation/complete blocking,
        touch targets, and Office regression paths.
    - UI Advisor Gate
      - Surface: `/br/[branchId]/stock/stocktake/**`; route family:
        `operator-stock`; plane: Branch; change: visual + flow + route
        presentation.
      - Context: inventory workspace in `screen-context-map` §2.5; actor:
        branch stock manager; job: run a bounded stocktake session through
        blind count and reconciliation.
      - Journey: session queue -> fixed-branch setup -> blind count -> review
        -> complete or cancel; recovery: resume count, safely cancel an
        in-progress session, or return to the session queue.
      - Information order: 1) next safe action/current session 2) fixed
        location and count progress 3) variance after completion; exclude:
        Office branch picker, audit history, desktop `DataTable`, long-press
        menus, report CTA, and system quantity before result state.
      - Pattern: LIST -> DOC-WORKFLOW -> DOC-WORKFLOW -> DETAIL; exemplar:
        Branch GRN and transfer touch workflows; data display: full-row touch
        list, mode/location controls, number-pad count, and result item list.
      - States: loading, empty, permission, no active location, lock lost,
        draft saving, in-progress, incomplete/recount blocked, completed,
        cancelled, invalid/out-of-scope.
      - Components: `BranchOperatorPage`, `BranchOperatorControlBar`,
        `BranchOperatorPanel`, `BranchOperatorStatusStrip`, `ItemGroup`,
        `AppDetailFooter`, `Select`, `Sheet` only where a focused edit needs
        one; fallback: none.
      - Responsive/accessibility: one touch IA on phone and tablet; tablet
        may form two content columns but never turns into an Office table;
        actions are at least touch-sized and icon controls keep labels.
      - Verification: static route/import/model coverage, typecheck, web
        ESLint, UI contract, full test/build, then phone/tablet Branch and
        desktop Office smoke when local auth is available.
  - [x] Convert `/br/[branchId]/stock/issues` list and detail routes to a
        native Branch touch workflow while retaining Office issue management
        presentation.
    - T2 self-review:
      - Skill plan: repo rules = engineering + skills + ui + workflow;
        external skills = next-best-practices + web-design-guidelines;
        runtime tools = CodeGraph + local browser smoke; skipped = no schema,
        action, or ACL rewrite because existing Server Actions and RPC remain
        authoritative.
      - PM: scope is the branch operator's internal write-off / other issue
        journey; done means a fixed-branch operator can scan the queue, create
        a draft, add or remove required-reason lines, then confirm or cancel
        without a desktop management layout.
      - BA: Branch accepts only `writeoff` and `other`; URL scope is
        authoritative; the source location and entry-unit conversion remain
        server-owned; quantity cannot exceed current stock; confirmed and
        cancelled documents are read-only; all write/confirm/cancel actions
        retain current server scope and state validation.
      - Dev: add serializable issue data/model helpers, leave Office list and
        detail clients untouched, and give Branch dedicated list/detail
        composition with a focused touch sheet for draft and line entry.
      - QA: cover list/detail model rules and the no-Office-presenter route
        boundary; recheck branch/id mismatch, type isolation, required reason,
        unit-aware quantity limits, empty-draft confirmation blocking, and
        confirmed/cancelled recovery states.
    - UI Advisor Gate
      - Surface: `/br/[branchId]/stock/issues/**`; route family:
        `operator-stock`; plane: Branch; change: visual + flow + route
        presentation.
      - Context: inventory workspace in `screen-context-map` §2.5; actor:
        branch stock operator; job: document a real internal write-off or
        other stock issue before stock is posted.
      - Journey: issue queue -> fixed-branch draft -> add/edit line -> review
        -> confirm or cancel; recovery: close the focused entry sheet, remove
        a draft line, correct quantity/reason, or retain a read-only final
        record.
      - Information order: 1) next safe action/draft status 2) ingredient,
        entry unit, quantity, and reason 3) document reference and final
        state; exclude: Office branch selector, `DataTable`, audit history,
        WAC/value, report/export, and correction controls.
      - Pattern: LIST -> DETAIL; exemplar: Branch GRN receipt and stocktake
        touch workflows; data display: full-row `ItemGroup` list plus focused
        `Sheet` input.
      - States: loading, empty, draft, pending action, quantity/stock error,
        confirmed, cancelled, invalid/out-of-scope, and permission-limited.
      - Components: `BranchOperatorPage`, `BranchOperatorControlBar`,
        `BranchOperatorPanel`, `BranchOperatorDetailList`, `ItemGroup`,
        `AppDetailFooter`, `Select`, `Sheet`, and `ConfirmDialog`; fallback:
        none.
      - Responsive/accessibility: one touch IA on phone and tablet; tablet
        may form two content columns but never becomes an Office table; inputs
        and actions remain touch-sized with explicit labels.
      - Verification: static route/import/model coverage, typecheck, web
        ESLint, UI contract, full test/build, then phone/tablet Branch and
        desktop Office smoke when local auth is available.
  - [x] Convert `/br/[branchId]/stock/supplier-returns` list, create, and
        detail routes to a native Branch touch workflow while retaining Office
        supplier-return management presentation.
    - T2 self-review:
      - Skill plan: repo rules = engineering + skills + ui + workflow;
        external skills = next-best-practices + web-design-guidelines;
        runtime tools = CodeGraph + local browser smoke; skipped = no schema,
        action, or ACL rewrite because the existing Server Actions and RPCs
        remain authoritative.
      - PM: scope is the branch manager's rejected-receipt return journey;
        done means a fixed-branch operator can find a return, create one from
        an eligible GRN, inspect its lines, send it, and record the existing
        resolution without a desktop management layout.
      - BA: Branch scope is authoritative; a return can only begin from a GRN
        with rejected lines in that branch; create/confirm permissions stay
        server-enforced; draft -> sent -> credited/refunded/cancelled follows
        the existing RPC state machine; duplicate-GRN, missing stock, and
        terminal records retain their current server recovery behavior.
      - Dev: add serializable supplier-return data/model helpers, leave Office
        list/create/detail presenters untouched, and give Branch three
        dedicated `BranchOperator*` compositions with route-local navigation.
      - QA: cover status/reference model rules and no-Office-presenter route
        boundaries; recheck branch/id mismatch, no eligible GRN, duplicate
        return, permission-limited action, terminal read-only state, touch
        targets, and Office regression paths.
    - UI Advisor Gate
      - Surface: `/br/[branchId]/stock/supplier-returns/**`; route family:
        `operator-stock`; plane: Branch; change: visual + flow + route
        presentation.
      - Context: inventory workspace in `screen-context-map` §2.5; actor:
        branch stock manager; job: return rejected received goods to the
        supplier and keep the operational resolution current.
      - Journey: return queue -> fixed-branch eligible GRN -> reason and
        resolution -> draft review -> send -> credit/refund or cancel;
        recovery: return to the queue, correct the draft input, or retain a
        final record as read-only.
      - Information order: 1) next safe action/status 2) GRN, supplier,
        reason, resolution, and item quantities 3) document reference and
        final outcome; exclude: Office branch picker, `DataTable`, audit
        history, total value, accounting/credit-note detail, export, and
        cross-branch navigation.
      - Pattern: LIST -> DOC-WORKFLOW -> DETAIL; exemplar: Branch GRN receipt
        and stock issue touch workflows; data display: full-row `ItemGroup`
        list plus focused form fields and sticky action footer.
      - States: loading, empty, no eligible GRN, draft, sent, credited,
        refunded, cancelled, duplicate/error, invalid/out-of-scope, and
        permission-limited.
      - Components: `BranchOperatorPage`, `BranchOperatorControlBar`,
        `BranchOperatorPanel`, `BranchOperatorStatusStrip`,
        `BranchOperatorDetailList`, `ItemGroup`, `AppDetailFooter`,
        `Combobox`, `Select`, and `ConfirmDialog`; fallback: none.
      - Responsive/accessibility: one touch IA on phone and tablet; tablet may
        form two content columns but never becomes an Office table; inputs and
        actions remain touch-sized with explicit labels.
      - Verification: static route/import/model coverage, typecheck, web
        ESLint, UI contract, full test/build, then phone/tablet Branch and
        desktop Office smoke when local auth is available.
  - [x] Convert `/br/[branchId]/stock/reports` to a native Branch touch report
        while retaining Office inventory analytics.
    - T2 self-review:
      - Skill plan: repo rules = engineering + skills + ui + workflow;
        external skills = next-best-practices + web-design-guidelines;
        runtime tools = CodeGraph + local browser smoke; skipped = no report
        action, RPC, schema, or ACL rewrite because existing report sources
        remain authoritative.
      - PM: scope is the branch operator's current-month inventory signal;
        done means they can see exception-worthy consumption variance and
        per-ingredient movement context, then open the concrete on-hand item
        without a management analytics dashboard.
      - BA: URL branch scope is authoritative; the period is current month to
        date; variance remains recipe theoretical versus sale-consumption
        actual; every displayed quantity retains its ingredient unit and no
        quantities from heterogeneous units are summed. Financial AP aging,
        food cost, supplier debt, cross-branch controls, and exports remain
        Office-only.
      - Dev: add serializable Branch report model/data helpers and a dedicated
        `BranchOperator*` presentation; reuse `fetchConsumptionVariance` and
        `fetchStockMovementReport`, retain the Office management presenter,
        and remove its obsolete `embedded` compatibility after the Branch route
        is native.
      - QA: cover exception filtering, per-unit movement ranking, empty data,
        fixed-branch scope, no Office presenter import, and no aggregate
        cross-unit KPI; recheck phone/tablet touch rows and Office regression.
    - UI Advisor Gate
      - Surface: `/br/[branchId]/stock/reports`; route family:
        `operator-stock`; plane: Branch; change: visual + route presentation.
      - Context: inventory workspace in `screen-context-map` §2.5; actor:
        branch stock manager; job: identify current-month stock deviations and
        inspect the affected ingredient before acting.
      - Journey: stock hub -> report -> exception or movement item -> on-hand
        detail; recovery: understand an empty signal and return to the stock
        hub without a dead-end chart/dashboard.
      - Information order: 1) exception-worthy variance 2) per-ingredient
        movement context 3) fixed period label; exclude: financial cost/AP,
        supplier debt, cross-branch controls, quantity totals without units,
        charts, desktop dashboard, `DataTable`, export, and audit history.
      - Pattern: REPORT; exemplar: native on-hand detail and stock issue
        touch lists; data display: `ItemGroup` rows with explicit unit and
        full-row drill-in.
      - States: loading, no variance exception, no movement, unavailable
        source, invalid/out-of-scope, and permission-limited.
      - Components: `BranchOperatorPage`, `BranchOperatorControlBar`,
        `BranchOperatorPanel`, `ItemGroup`, `Badge`, and `AppEmptyState`; no
        chart, table, or Office wrapper.
      - Responsive/accessibility: one touch IA on phone and tablet; tablet may
        use a two-column content band but never becomes an Office report;
        full rows remain touch-sized and each quantity has its unit visible.
      - Verification: static route/import/model coverage, typecheck, web
        ESLint, UI contract, full test/build, then phone/tablet Branch and
        desktop Office smoke when local auth is available.
    - T2 verification: Branch report model/static tests, focused web ESLint,
      root typecheck, root build, route matrix, doc-staleness, and i18n gates
      pass. Unauthenticated smoke redirects to `/login` at `390x844`,
      `768x1024`, and `1024x768`; authenticated visual QA remains pending.
      Current root lint is blocked outside this slice by Self-order runbook copy
      findings and a POS spinner UI-contract finding. Current root test is
      blocked by `packages/shared/src/hddt/__tests__/pos-mandatory-invoice.test.ts`;
      Turbo interrupts the remaining web suite after that failure.
  - [x] Convert `/br/[branchId]/stock/waste` to a native Branch touch
        `DOC-WORKFLOW`, then remove the Office embed compatibility from the
        waste-create presenter.
    - T2 plan: Skill plan: repo rules = engineering + skills + ui + workflow +
      database; external skills = next-best-practices + post-change
      web-design-guidelines review; runtime tools = CodeGraph + local browser
      smoke; skipped = external design scaffold because the locked Branch
      `DOC-WORKFLOW` recipe and existing GRN line-sheet resolve the interaction
      model. PM: shorten a manager's loss-recording flow without hiding
      evidence/approval consequences. BA: branch stays URL-scoped, item units
      and stock limits remain unchanged, and the existing server action/RPC is
      authoritative. Dev: new Branch loader/client plus shared pure tier model;
      Office retains its desktop form after embedded compatibility is removed.
      QA: permission gate before reads, line-level photo/tier/stock constraints,
      touch sheet focus and submit states, Branch routing, and Office regression.
    - UI Advisor Gate
      - Surface: `/br/[branchId]/stock/waste`; route family:
        `operator-stock`; plane: Branch; change: visual + route presentation.
      - Context: inventory workspace in `screen-context-map` §2.5; actor:
        branch manager or delegated inventory operator; job: record a
        location-scoped manual loss with adequate reason/evidence before stock
        is decremented or held for approval.
      - Journey: stock hub -> waste form -> choose location -> add/edit each
        ingredient line -> review capped total -> submit -> return to stock;
        recovery: close a line sheet without saving, remove a line, or cancel
        back to the stock hub without an Office redirect.
      - Information order: 1) branch/stock location and current cap signal 2) concise selected-line list 3) one line editor at a time 4) sticky
        submit; exclude: branch picker, Office toolbar/header, audit history,
        exports, cross-branch data, desktop table, and financial dashboards.
      - Pattern: DOC-WORKFLOW Branch touch variant; exemplar:
        `branch-grn-create-client.tsx` plus `GrnLineEditSheet`; data display:
        `ItemGroup` summaries and a bottom sheet for each editable line.
      - States: no permission, unavailable source data, no location, empty
        draft, incomplete line, photo-required, submit error, pending approval,
        and success.
      - Components: `BranchOperatorPage`, `BranchOperatorControlBar`,
        `BranchOperatorPanel`, `ItemGroup`, existing waste tier/evidence/cap
        primitives, `Sheet`, and sticky `AppDetailFooter`; no Office presenter,
        `DocumentFormFrame`, or `DataTable`.
      - Responsive/accessibility: phone keeps one decision per sheet; tablet
        may form a two-panel band but preserves the same order and touch targets;
        controls are labeled, unit/available quantity remain visible, and close
        or delete never submits a line.
      - Verification: branch loader/model/static tests, focused lint/typecheck,
        UI guideline review, route/doc/i18n gates, browser smoke at
        `390x844`, `768x1024`, and `1024x768`, then full gates and authenticated
        Branch/Office checks when credentials are available.
    - T2 verification: waste model/static tests, focused web ESLint, web and
      root typecheck, root build, UI contract, route matrix, doc-staleness, and
      i18n gates pass. Public smoke redirects to `/login` without horizontal
      overflow at `390x844`, `768x1024`, and `1024x768`; authenticated visual
      QA remains pending. Current root lint is blocked outside this slice by a
      retired marker in `apps/web/tests/inventory-location-labels.test.ts`.
      Current root test is blocked outside this slice by two concurrent static
      expectations in `apps/web/tests/operator-stock-redirect-static.test.ts`
      for the PO unit picker and GRN `SelectTrigger` API.
  - [x] Convert `/br/[branchId]/stock/waste-approvals` to a native Branch
        touch `LIST` with a per-issue review sheet, then remove the Office
        embedded compatibility from the approval presenter.
    - T2 plan: reuse the existing approval action and four-eye invariant;
      extract a server-only scoped loader plus shared row contract; make Branch
      own a queue/list and bottom-sheet review flow while Office retains its
      desktop page. PM: reduce time from pending loss to defensible review.
      BA: a manager can review only the current branch, never self-approve, and
      retains reason/evidence, value, quantities, and approval/rejection note.
      Dev: no mutation or schema changes; keep `approveWaste` authoritative.
      QA: permission before reads, self-created state, pending state, evidence
      links, refresh/error recovery, native routing, and Office regression.
    - UI Advisor Gate
      - Surface: `/br/[branchId]/stock/waste-approvals`; route family:
        `operator-stock`; plane: Branch; change: visual + route presentation.
      - Context: Branch queue for a manager/delegated approver; job: decide a
        pending manual loss with enough context to apply four-eye control.
      - Journey: stock hub -> pending queue -> open one issue -> inspect lines
        and evidence -> add review note -> approve/reject -> return to queue;
        recovery: close the sheet without mutation or reload after an error.
      - Information order: 1) pending count and issue value 2) issue identity,
        creator, time, and line count 3) line reason/evidence 4) review note
        and decision; exclude Office toolbar, branch picker, cross-branch queue,
        audit/export, table, and dashboard KPIs.
      - Pattern: Branch LIST with touch rows and bottom Sheet detail; data
        display: `ItemGroup` summaries plus existing tier badges and evidence
        links; no `DataTable` or Office presenter.
      - States: no permission, unavailable data, empty queue, self-created
        non-actionable issue, action pending/error, and resolved issue.
      - Components: `BranchOperatorPage`, `BranchOperatorControlBar`,
        `BranchOperatorPanel`, `ItemGroup`, `Sheet`, and touch buttons; full
        row hit targets, labeled note control, and a destructive reject action.
      - Verification: loader/model/static tests, focused lint/typecheck, UI
        guideline review, route/doc/i18n gates, public viewport smoke at
        `390x844`, `768x1024`, and `1024x768`, then full gates and authenticated
        Branch/Office checks when credentials are available.
    - T2 verification: approval model/static tests, focused web ESLint, web and
      root typecheck, root build, UI contract, route matrix, doc-staleness, and
      i18n gates pass. Public smoke redirects to `/login` without horizontal
      overflow at `390x844`, `768x1024`, and `1024x768`; authenticated visual
      QA remains pending. Current root lint is blocked outside this slice by a
      retired marker in `apps/web/tests/inventory-location-labels.test.ts`.
      Current root test is blocked outside this slice by two concurrent static
      expectations in `apps/web/tests/operator-stock-redirect-static.test.ts`
      for the PO unit picker and GRN `SelectTrigger` API.
  - Core-stock cutover status: the listed on-hand detail, GRN review/receipt,
    stocktake, issues, supplier returns, reports, waste entry, and waste
    approval routes now own native Branch presentation. Remaining
    `EMBED-WRAPPER` routes such as purchase orders, count assignment/slips,
    and consumption remain separate
    follow-up scope; this does not claim the full `/br/[branchId]/*` family is
    Office-free yet.
  - [ ] Convert the Branch purchase-order family (`/stock/purchase-orders`,
        `/new`, and `/[id]`) as one T3 native touch slice; do not split the list
        from create/detail because their fixed-branch navigation and GRN handoff
        are one procurement journey.
    - T3 discovery: Branch procurement is for the central-supply/central-kitchen
      roles curated by the existing tile contract, not a branch-manager shortcut.
      Preserve the current PO action/RPC authority, supplier/ingredient unit
      semantics, price-deviation checks, PO -> GRN handoff, and own-branch
      equality. First extract reusable server loaders and pure view models from
      Office clients; then own separate Branch list, document, and detail
      presenters. Do not pass `embedded`, Office `basePath`, or Office form
      chrome across the boundary.
    - UI direction: list = full-row pending/status queue; create = one supplier
      plus one touch line sheet at a time with sticky submit; detail = status,
      compact line summaries, and only actionable transitions. Phone keeps one
      decision per sheet; tablet uses two panels without turning into a table.
      Exclude branch switcher, cross-branch batch controls, export, audit, AP,
      supplier debt, and desktop data-grid/filter chrome.
    - Required review: PM/BA/Senior Dev/QA T3 debate plus a second runtime
      review before mutations; verify unauthenticated and authenticated Branch
      phone/tablet plus Office desktop after implementation.
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
        tablet landscape `1024x768`, and Office desktop `1440x900` once local
        Supabase/Docker auth is available.

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
      historical POs stay. This supersedes the old "Convert the Branch
      purchase-order family as one T3 native touch slice" item under
      "Owner-Confirmed UI Follow-ups" — remove that item in the same commit.

### Defects found while scoping the cutover — separate slices, not D073

- [x] **The operator hub counts the wrong table.** Fixed: the hub queue counts
      `production_runs` in `draft`/`in_progress`, matching the production page's
      work-queue definition. `production_orders` holds zero rows tenant-wide and
      has no writer anywhere in the app.

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

## Removed From The Board

- Historical production backlog, `Deferred Post-Pilot`, `Post-v1.0` ideas,
  dated plans, worklog transcripts, and external-skill execution plans were
  removed on 2026-07-08. Git history is the record.
