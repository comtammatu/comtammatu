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
  - [ ] Continue replacing stock deep workflow EMBED-WRAPPER transition routes:
        on-hand detail, GRN create, stocktake, issue, supplier-return, and
        reports.
  - [ ] Run runtime QA across phone `390x844`, tablet portrait `768x1024`,
        tablet landscape `1024x768`, and Office desktop `1440x900` once local
        Supabase/Docker auth is available.

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
