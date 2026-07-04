# T3 Debate — Central sites (Kho Tổng / Bếp Trung Tâm) as first-class contexts + dedicated mobile surfaces (2026-07-04)

Owner directive 2026-07-04: the two central sites must be selectable at the
`/br` screen-selection step (owner sees Chi nhánh · Văn Phòng · Bếp Trung Tâm ·
Kho Tổng), each site gets its OWN mobile-first feature set (large touch
buttons, grid card lists, drawer number pads, stock list like the POS menu
screen), Kho Tổng and Bếp TT strictly separated, and NO hub/dashboard bloat.
Decision record: `docs/plan/decisions.md` → **D066**. Four lenses ran as
parallel subagents (PM / BA / Senior Dev / QA); this is the fan-in synthesis.

## Agreements (all four lenses)

- This executes already-ratified decisions (D059 §3 context picker, D055 §2
  central tile set) — zero migrations, zero new routes, zero new chrome.
- The picker card alone is NOT shippable: owner is blocked by two gates today —
  `selectOperatorBranchScope` filters owner to kind `branch`
  (branch-context.ts) and the proxy non-station surface gate requires kind
  `branch` for owner (proxy.ts). Both must widen with the picker in ONE PR,
  keeping POS/KDS/runner hard-locked to kind `branch` for everyone.
- Tile curation is the deliverable (today central sites get 13–14 stock tiles —
  the "12-tile pile" the prior UI-trinity T3 flagged). Mechanism: declarative
  `kinds` field in `nav-config.ts` (extends D058 §7 kind × role), single source.
- Stock grid = enhanced `embedded` presentation inside `StockPageContent` /
  `StockClient` (D059 §1 sanctioned mechanism). No new BOARD page, no
  PosMenuGrid extraction (POS-domain-typed, route-local; copy the pattern).
- D059 §4 extraction queue NOT triggered: every touched surface is already an
  extracted, registered EMBED-WRAPPER. Later number-pad upgrades to
  transfer/stocktake/production create-flows are enhancements to
  already-embedded surfaces; if one turns out to need a fresh extraction it
  re-enters the queue at its slot.

## Conflicts and resolutions

1. **Expiry tile at central sites** — BA: real (GRN-based, any GRN site); PM:
   out (D060 §3 put naive expiry alerts to sleep; owner named lean-first).
   → OUT at central kinds (tile and queue row); office plane keeps the surface.
   Flagged as owner-revisit item.
2. **Waste at Kho Tổng** — PM asked owner; BA: `warehouse_manager` holds
   `inventory:writeoff`. → IN at both central kinds (BA evidence wins; status
   quo already showed it).
3. **Trả NCC at Bếp TT** — BA: no grant evidence, noise. → OUT at
   central_kitchen, IN at central_supply.
4. **PO/GRN at Bếp TT with head_chef template gaps** — BA found the
   production_manager/head_chef role template lacks `grn_create/grn_confirm`,
   `stocktake_create/complete`, `writeoff` (docs/ref/inventory-rbac-matrix.md
   vs inventory-sop.md drift). Tiles stay (site semantics in
   docs/ref/inventory.md:47-50 say Bếp TT does PO/GRN; tiles already rendered
   pre-change, so no regression) — permission-key grant is an owner decision +
   tiny migration in a separate lane (D066 §7a). NOT smuggled into this program.
5. **Stock grid: central-only vs everywhere** — PM wanted central-first; Senior
   Dev: gate on `embedded`, no kind fork. → Gate on `embedded` (branch
   operators get the same mobile win per D059 §6; desktop office LIST
   untouched; kind fork inside StockClient rejected).

## Contract (scope + rules + plan + tests)

**PR "central-sites context + homes"** (this branch, commits 1–2):
- `apps/web/app/(protected)/br/page.tsx` — drop kind filter, cache keyPart
  `operator-branches-v2`, order branch → central_kitchen → central_supply →
  office card, per-kind icons.
- `apps/web/app/_lib/branch-context.ts` — owner operates all active kinds.
- `apps/web/proxy.ts` — non-station `requiredBranchKind = null` for owner;
  `branchSurfaceAllows` takes nullable kind, active-check always enforced.
- `packages/shared/src/auth/nav-config.ts` — `kinds` on OperatorTileConfig;
  per-kind whitelists (D066 §3); PO + production tiles folded in from
  operator-capabilities constants; transfer tile split request/dispatch labels.
- `packages/shared/src/auth/operator-capabilities.ts` — single kind filter
  replaces additive constants + BRANCH_ONLY_GROUPS.
- `(operator)/page.tsx` — KPI/management card gated to kind `branch`; expiry
  queue row gated to kind `branch`.
- Re-pinned static tests: branch-context-static, central-site-operator-static,
  auth-intermediate-scope-static, operator-shell-static,
  operator-stock-redirect-static, operator-capabilities-static (+ two new
  whitelist/label tests).

**PR "stock grid embedded"** (commit 3): new
`apps/web/app/(protected)/inventory/stock/stock-mobile-grid.tsx` + minimal
StockClient seam, per D066 §5. Zero-qty renders neutral (stock_levels is empty
until the owner's opening-balance GRN re-entry).

**Test plan / verification:**
- Full fresh gate in clean worktree: `typecheck && lint && build && test`.
- Allow/deny matrix pinned by tests: owner IN at central kinds (scope +
  requested-branch resolution), stations still kind-`branch` for all, cashier
  pin unchanged, wm/pm kind-lock unchanged (kept byte-identical), branch-kind
  `branch` tile set unchanged, per-kind whitelists exact-match, transfer label
  per POV.
- Manual phone QA (375px) required before merge — owner walkthrough: `/br` → 4
  groups; Kho Tổng card → its hub (site name in header, 8 tiles, no revenue
  KPI); Bếp TT → Sản xuất first; stock grid renders + empty state. 3-viewport
  screenshots per D058 §12. NOTE: no owner/central-manager e2e storageState
  exists (only cashier) — manual checklist is the coverage until an owner
  storageState project is added (QA lens ask, deferred with reason: e2e infra
  lane, not this program).

## Attestation (workflow.md §4, T3)

- Test-plan items covered: static allow/deny matrix, whitelist exact-match,
  label-per-POV, proxy expression pins, shared+web suites green fresh in the
  worktree. Deferred: 3-viewport screenshots + owner phone walkthrough
  (needs running app + auth; stock_levels empty on prod until GRN re-entry);
  owner/central-manager e2e storageState (infra lane).
- BA rules → implementation: per-kind job whitelists → `nav-config.ts`
  `kinds` entries; dispatch-vs-request label → transfer tile split
  (nav-config.ts); noise exclusions (consumption/issues/expiry/reports/
  count-assignments) → `kinds: ["branch"]`; production central_kitchen-only →
  `kinds: ["central_kitchen"]` + existing DB trigger/RLS; owner scope widen →
  branch-context.ts / proxy.ts; KPI+expiry-queue kind gate → (operator)/page.tsx.
- Known gaps (out of scope, recorded in D066 §7): head_chef/production_manager
  permission-key grants; office_bridge group at central homes kept as-is;
  office-plane stock grid; PWA manifest name says "Chi nhánh CN{id}" at central
  sites (cosmetic, flag to owner); warm-instance null-cache of
  `resolveCentralSiteHomeBranchId` after site reactivation (low priority).
