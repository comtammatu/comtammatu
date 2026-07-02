# T3 Full Debate — IA Direction Lock (2026-07-02)

> Reconciled-through 1e43de67
> Status: ratified as D058 (`docs/plan/decisions.md`). W0-W2 merged; W3 lands
> alongside this banner update. W5/W6 and the perf lane remain open.
> Tier: T3 — architecture fork landing as a decision record (whole-app IA direction).
> Skill plan: repo rules = engineering + ui + workflow + team; external skills = t3-debate; runtime tools = 4× t3-lens subagents (parallel) + second-runtime consult; skipped = browser/db (direction decision, no behavior change yet).
> Second runtime: Codex CLI binary broken on this machine (ENOENT on vendored binary) — Antigravity (`agy` 1.0.13, `--print`) used as the independent second model instead; noted per `team.md` → Fallback.

## Question

Owner reports the app splits into "2 separate IA/Shell worlds" (Office/Management desktop plane vs Branch Operator mobile plane); pages jump between them; branch_manager worst hit. Lock ONE direction:

- A) Keep two-plane model (D050/D055), finish it (bridges, canonical URLs, nav pruning, header unification).
- B) One responsive shell/chrome for everything, role-adaptive nav.
- C) Operator-first single plane (`/br/[siteId]/…` for everything; tenant = pseudo-site).
- D) Two route planes + ALL chrome primitives unified; planes = route spaces, not UX worlds; first-class bridges.

## Verdicts (5 independent voices)

| Voice | Verdict |
| --- | --- |
| PM lens | Hybrid **A→D**: A = MVP milestone (days-to-weeks relief), D = done-state contract with ratchets |
| BA lens | Hybrid **D+A**: "Two scopes, one chrome, one door per job" |
| Senior Dev lens | **D, defined as A + mandatory Stage-0 chrome completion** ("Two route planes, one chrome system"), size M+ (3–4 wk) |
| QA/Sec/UI lens | Hybrid **A+D**: "Two Planes, One Chrome, One Route Table" — only direction lockable with existing gate machinery |
| Antigravity (2nd runtime) | **D** |

Unanimous rejections: **B** (reverses D050 §1 after a landed 5-phase cutover; stations can't join so "one shell" is false; re-opens the *empty* `responsive-double-render` ratchet; ships desktop sidebar machinery into phone hydration; XL) and **C** (pseudo-site breaks the URL-segment-scope invariant, the `/br/\d+` ACL grammar, and `branch_kind` gating; forces tenant jobs into a scope that lies; XL+, highest auth risk).

## Agreements

1. The two planes encode a real business boundary (site-scoped execution vs tenant-scoped administration) — route topology already converged (28/38 operator pages are thin wrappers of office PageContents). The "two worlds" feel is ~80% chrome discontinuity (5 header lockups, 2 PWA toolbars) + missing bridges + duplicate doors.
2. Chrome unification is already mandated by `docs/spec/design-system.md` § Structural Governance (Stage-0 `AppHeader` extraction — never done). D is a completion of A, not an alternative; `AppBottomNav` half is already unified.
3. Every job needs exactly one advertised door per role; losing doors become redirects (`resolveLegacyRouteRedirectPath` pattern).
4. branch_manager needs an explicit hub bridge ("Văn phòng" tile group); the old bridge was demolished on a dead assumption (`employee/profile/page.tsx:125` returns `[]`).
5. Route-metadata drift is live and must be fixed before further migration: `route-map.ts:196-218` declares operator-shift/profile `employee` while `route-resolution.ts:141-142` enforces `operator_home`; a consistency test would fail today.
6. Governance breach found: shipped operator nav uses cutover-spec labels ("Hôm nay", `packages/shared/src/labels/vi.ts:51,84`, enforced by `operator-shell-static.test.ts:82-83`) while D050 §6 + status note say D050's "Trang chủ · Ca · Thông báo · Hồ sơ" is still authority. Owner must ratify or revert.
7. The `office`/accountant gap (no reachable workspace; `/finance` owner-only) is an ACL/owner decision orthogonal to IA direction — no direction fixes it; it blocks Phase 6.

## Conflicts → resolutions

1. **Order of first slice** — PM wants user-visible bridge fixes first; QA demands guard tightening before any migration; Dev puts chrome primitives P1. **Resolution:** nav-only additions (bridge tiles, hrHref, tile fixes) carry no route-move risk and may land in Wave 1 alongside Wave 0 guards; anything that MOVES or RETIRES a route (canonical-URL pruning) waits for Wave 0's consistency test. Chrome extraction runs as its own wave (zero route/ACL change).
2. **Cashier `/orders` mismatch** — keep the office door canonical (rare job, per BA); it dissolves visually once chrome primitives unify. No operator duplicate.
3. **Scope-read rule wording** — Antigravity proposed "back-office reads only `?branchId=`"; BA/Dev require one scope engine. **Resolution:** one engine (`resolveBranchContext`/`selectBranchScope`); `?branchId=` survives only as a display filter feeding that engine, never as write authority; operator plane reads the URL segment.
4. **Naming** — one name for the locked direction: **"Hai plane — Một chrome — Một cửa mỗi việc"** (Two planes, one chrome, one door per job).

## Unified task contract (for owner ratification as D0xx amending/extending D019+D050)

**Direction locked:** Keep the two route planes as scope encoding + Operations chrome for stations. Unify ALL chrome primitives (one `AppHeader`, the existing one `AppBottomNav`, one `PwaToolbar`). One canonical advertised door per job per role, losers redirect. First-class bidirectional bridges (hub "Văn phòng" group ≤6 capability-gated tiles; office shell keeps per-branch "Vận hành" entry). Tiles derive from `branch_kind × role`, not role alone.

**Business rules encoded:**
- Site-scoped execution → `/br/{siteId}/*`, URL segment = scope SSoT; tenant-scoped administration → workspace routes; one scope engine, `?branchId=` = display filter only.
- Catalog = tenant/office; sellability/daily limits = per-branch operator (D053). HR master/payroll = office; shift execution = operator. Procurement excludes branch_manager (request via transfer, wm fulfills).
- Canonical approval door = the plane where the approver homes; any office door is labeled cross-branch oversight, never a second work queue (two queues with different scoping = missed approvals).
- Migrated operator paths regain per-module ACL keys (start: `/br/*/shift/checkout-approvals` → `employee_checkout_approvals`; today cashier/chef pass the route gate with RLS as sole backstop).
- Stations stay locked to `branch_kind='branch'`; POS/KDS/Runner internals untouched.
- `/employee` stays while `office` homes there (D055 §3); retirement is a separate owner decision.

**Implementation waves (each independently landable):**
- **W0 — guards first:** one-route-table consistency test (materialize `ROUTE_FAMILY_CONTRACTS` paths → assert `resolveModuleFromPath` membership; fails today → fix operator-shift/profile drift in favor of enforcement); re-key checkout-approvals; extend `module-acl-matrix.test.ts` to all 7 roles (`Record<StaffRole, …>`); generate `role-route-matrix.md` from code + drift lint.
- **W1 — branch_manager relief (nav-only):** "Văn phòng" hub tile group; delete the dead `[]` special-case in `employee/profile/page.tsx`; pass `hrHref` into `buildReadinessItems`; production tile for `central_kitchen`, procurement entries for `central_supply` (site-kind-aware `resolveOperatorTiles`).
- **W2 — chrome primitives:** extract `AppHeader` (5→1), merge PWA toolbars (2→1), classify `/notifications` + `/br` picker into a chrome family; header/bottom-nav registry ratchets in `check-ui-contract.mjs`.
- **W3 — one door per job:** canonical-URL table + redirects (stock-movement 3→1, food-cost 2→1 + `fetchFoodCost` dedupe, checkout/waste approvals); prune migrated floor items from `inventory-nav.ts`; unify scope-read (retire `resolveInventoryBranchScope` duality); dedup home resolvers (`branch-hub.ts` ≡ `scope.ts`); delete dead shim + settle 3 orphan inventory routes.
- **W4 — deferred:** `/employee` retirement after the office-home decision (Phase 6).

**Owner decisions required before/with ratification:**
1. Ratify shipped bottom-nav labels ("Hôm nay · Ca · Lịch · Tôi") by amending D050, or revert code to D050 labels.
2. `office`/accountant workspace + home (unblocks Phase 6). Recommendation: grant `office` read access to `/finance`; keep `/employee` home until a workspace exists.
3. Reports home. Recommendation: `/finance` is the reporting home; `/admin/reports` hub deleted; operator keeps at most one read-only branch wrapper.
4. Canonical approval doors per rule above (recommendation: `/br/*` versions canonical; office = oversight).
5. Bridge-group contents cap (≤6 tiles; which office doors branch_manager gets).
6. `/br/[id]/stock/purchase-orders` + `/stock/reports` floor-slice leak: pull back to office or gate to central-site managers.

**Test/guard plan (QA):** W0 tests above; canonical-redirect static tests; dead-end detector (every visible nav/tile per role resolves to an accessible module + existing page; orphan routes → 0); role-journey smoke matrix (7 roles × home → top jobs, branch_manager = acceptance bar); existing operational smokes (POS sell, KDS bump, clock, stock flows, approvals, payments/HĐĐT) stay green; brand-usage gate (ban direct `/brand/mascot/*` refs — fails today on runner). Final gates run fresh in a clean worktree.

**Acceptance criteria ("no more fragmentation," measurable):**
- Every `MODULE_ACL` capability granted to a role reachable ≤2 taps from that role's home; dead-end roles = 0.
- Duplicate advertised doors = 0 (stock-movement 3→1, food-cost 2→1, checkout-approvals 2→1, waste 2→1-plus-labeled-oversight).
- Header lockups 5→1; PWA toolbars 2→1; SidebarProvider stays 1; AppBottomNav stays 1; chrome-less protected pages = 0.
- Exactly one bottom-nav spec in `decisions.md`, matching shipped code.
- POS/KDS/Runner internals untouched; MODULE_ACL→proxy→RLS semantics unchanged (route-gate strictness may only increase).

**Known gaps flagged, not resolved here:** cross-branch double-assigned staff cannot deep-link to their second branch (`scope.ts:190-196`); cover-ca checklist must key off scheduled position, not access bucket (D052 interaction).

## Addendum 2026-07-03 — evidence extension (3-lane workflow)

Owner refined the pain: (1) branch plane lacks needed capabilities (not just bridges); (2) hand-rolled pages/components leave agents unable to determine what a page should use. Three lanes ran; full outputs in the session task files; condensed results:

- **Capability parity matrix** (feeds W1): chef = full parity already. Quick-win S wrappers: GRN list (`GRNListPageContent` already wrap-ready) → `/br/[id]/stock/grn`; consumption view via `IssuesPageContent scope="consumption"`. Tile-only gaps: `/br/[id]/stock/purchase-orders` exists but has NO hub tile; production tile missing for central_kitchen. REFACTOR-FIRST (needs `*PageContent` extraction): orders lookup+refunds (BM+cashier, M), count-assignments (M), supplier-returns (M), GRN create (M), HR attendance/leave approvals (L — `hr-client.tsx` monolith), production surface (L). Bridge-only: menu catalog, HR roster/setup, supplier invoices, inventory catalogs/settings. `OPERATOR_TILE_ITEMS` must become `branch_kind × role`-aware (D055 §2).
- **Hand-rolled inventory** (feeds W5): ~237 route-local component files (inventory 78, pos 47, hr 21, kds 16, finance 15) but only ~20 genuine re-implementations; sanctioned kit = 14 surface.tsx adapters + DataTable/KpiCard/StatusBadge/form layer (13 files) + transition frames, each already locked by a DS section. Missing: a component→role→rule registry doc and an agent rule to answer "where used" via codegraph / `pnpm audit:ui-components` (exists, unwired).
- **Page Archetype Standard** (new W5): 134 pages classify into 12 archetypes; largest = LIST (34) and **EMBED-WRAPPER (30)** — the thin-wrapper pattern promoted to a first-class archetype; universal shell rule = exported `*PageContent({ searchParams?, routeBranchId?, basePath?, embedded? })`. Recipes grounded in exemplars (PO list/detail, transfers/new DocumentFormFrame, admin/dashboard, finance/revenue, KDS board). Enforcement: extend the existing route-manifest walker in `check-ui-contract.mjs` with a per-page archetype map + shrink-only baselines; spec lands as `docs/spec/page-archetypes` (not yet created — W5) subordinate to design-system.md (new Structural Governance § F pointer). 8 named exceptions (portal-home hybrids, stock master-detail, finance/summary, notifications feed, printers/jobs). FORM-PAGE folds into DOC-WORKFLOW/SETTINGS-PANEL.
- **Claude Design integration**: claude.ai/design project "Má Tư Design System" (11820df7…, type DESIGN_SYSTEM, owner Bình, updated 2026-06-28) is a deliberate parallel design kit (35 components, 26 foundation previews, mockups, 3 templates, but only 2 recipes). Role locked as ONE-WAY mirror repo→design (ui.md: external scaffold never overrides the Custom Theme). Planned push after spec lands: refresh tokens to contract v14.12, add the adapter-layer cards (AppPage/AppSection/AppToolbar/DataTable/KpiCard/StatusBadge/form layer), and 12 archetype recipe cards.

## Attestation

- Test-plan items: defined, not yet implemented (contract stage). Deferred: e2e role-journey matrix needs a seeded local stack (preview branches limited; prod SELECT-only).
- BA rules each map to a wave above; file/line evidence embedded throughout.
- Out of scope: visual re-theme (D032-B), performance lane, DS burn-down — tracked separately in the redesign assessment.
