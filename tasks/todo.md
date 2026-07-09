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

Owner-facing parked ADR (Vietnamese): `docs/plan/adr/0010-motion-contract-gap-fill.md`.
Rewritten 2026-07-10 after Codex Outside Voice rejected the prior 7-item Phase 1.
**No UI implementation until Step 0 is owner-confirmed.**

### Step 0 — Motion Contract gate (blocked)

- [ ] Owner picks A / B / C in `docs/plan/adr/0010-motion-contract-gap-fill.md` (recommend **A**:
      allow one-shot content enter at `duration-150` + `motion-safe:` only; keep
      `duration-300` for overlay/dialog/sheet enter–exit per § G).
- [ ] If A or C: update `docs/spec/design-system.md` § G before or with the first
      implementation PR.

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
