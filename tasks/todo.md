# Current Tasks

> Active tracker for the Greenfield preparation cut.
> No historical backlog, deferred idea list, shipped history, or dated planning
> archive lives here. Shipped history lives in git; durable failure rules live
> in `tasks/regressions.md`; durable lessons live in `tasks/lessons.md`.
>
> Reconciled-through `23500913b` (2026-07-08). Before acting, verify the live
> checkout with `git status` and re-check production state for any migration or
> runtime claim.

## Branch Hub Shell Slice From PR #284 (2026-07-15)

Skill plan: repo rules = engineering + skills + UI + workflow + orchestration;
external = Ponytail; runtime = focused static tests, UI contract lint, and full
repository gates. Skipped = database work, Finance, Admin Dashboard, Design
System changes, and external design review because the current UI contract
already fixes the Branch pattern.

UI Advisor Gate: `/br/[branchId]` Branch Manager/Staff shell and home on phone
and tablet; hierarchy/navigation change only. Preserve compact headers on detail
workflows and keep POS/KDS/Runner as separate station apps.

- **PM:** Ship only the Branch shell and home hierarchy that remains valid on
  current `main`; do not carry the 704-file PR #284 bundle.
- **BA:** Keep daily Branch work in Branch, keep Owner Finance/Admin authority
  unchanged, and preserve every existing route/permission boundary.
- **Senior Dev:** Reuse the existing `BranchOperator*` adapter and copy registry;
  retain `hideHeaderOnMobile` for detail screens and add no new abstraction.
- **QA/QC:** Lock shell navigation, visible home identity, station grouping,
  install-hint persistence, and route smoke before opening the replacement PR.

- [x] Apply the current-main-compatible Branch shell/home subset.
- [x] Pass focused tests, UI contract lint, typecheck, lint, build, and review-tier.
- [x] Commit, push, and open the first replacement PR without closing PR #284.

## Admin Dashboard Owner Boundary And Branch Containment (2026-07-15)

### T3 contract

Skill plan: repo rules = engineering + skills + UI + workflow + orchestration;
external skills = `ponytail:ponytail` full mode + `web-design-guidelines`;
runtime tools = focused auth/static UI tests, generated route-matrix check, UI
contract lint, full repository gates, and phone/tablet/desktop browser QA;
skipped = database/schema skills, Finance workflow skills, KPI/data design,
route moves, PR #284, and production changes.

UI Advisor Gate

- Surface: `/admin`, `/menu`, `/orders`, `/inventory`, `/finance`, `/branches`,
  `/hr`; route family: `admin_dashboard`; plane: Admin Dashboard; change:
  hierarchy + navigation + route authority.
- Context: Owner moves between branch operation and tenant oversight. Branch
  Manager/Staff operate one assigned branch. Actor/job: Owner opens chain-wide
  control modules; non-Owners complete daily work without discovering tenant
  administration.
- Journey: login/root → Branch Hub or location picker → one Admin Dashboard
  entry → `/admin` launcher → a tenant module. Recovery: disallowed direct URLs
  and `returnTo` fall back to the assigned Branch; wrong-branch URLs remain
  fail-closed.
- Information order: Admin Dashboard identity → owner control modules → system
  settings. Exclude KPI/stat cards until a canonical owner-summary data
  contract exists; exclude daily Branch jobs from the launcher.
- Archetype/exemplar/data display: `/admin` = `HUB`; reuse the current Settings
  hub and inventory hub card-grid rhythm. Use link cards only, no fabricated
  metric data.
- States: Owner with one/many branches, Branch Manager/Cashier direct URL,
  missing branch context, unknown Admin Dashboard child route, empty branch
  list, and long labels.
- Components/fallback: existing `AppPage`, `AppPageHeader`, `AppSection`,
  `LinkCardGrid`, and `AppLinkCard`; existing Branch Hub action section; no new
  primitive. Navigation links preserve keyboard and open-in-new-tab behavior.
- Responsive/accessibility/input: 1 column phone, 2 columns tablet portrait,
  3 columns desktop; inherited visible focus and 44px touch targets; no hover-
  only affordance, no motion addition, URL remains scope/state authority.
- Verification: role/route unit matrix, proxy/static guards, launcher archetype,
  no visible `Văn phòng`, UI-contract lint, full T3 gate, and browser smoke at
  phone, tablet portrait, and desktop.

- **PM:** Remove the third Office/workspace product plane now. Done means Owner
  can choose Branch or Admin Dashboard, while every non-Owner starts and stays
  in Branch for daily work.
- **BA:** Route-surface authority is Owner-only for `/admin`, `/menu`, `/orders`,
  `/inventory`, `/finance`, `/branches`, and `/hr`. Capability ACL stays intact
  for Branch-native orders, stock, menu limits, approvals, and setup routes.
- **Senior Dev:** Add one shared Admin Dashboard path classifier, enforce it in
  proxy and `returnTo`, collapse discovery/nav into Admin Dashboard + Branch,
  and rename current Office shell symbols without creating a parallel shell.
- **QA/QC:** Prove direct URLs and `returnTo` fail closed for Manager/Cashier,
  Branch-native capabilities still pass, Owner discovery is complete, no
  visible `Văn phòng` remains, and the launcher uses existing responsive card
  primitives with keyboard/focus behavior inherited from links.

Synthesis

- Agreement: Admin Dashboard and Branch are the only product planes; public and
  utility routes are not product planes.
- Resolved conflict — access versus capability: `module-acl.ts` owns the
  Owner-only `admin_dashboard` surface key. The path classifier identifies the
  surface, while proxy and `returnTo` consume that ACL key. Existing capability
  keys remain available to Branch-native stock, orders, approvals, and setup.
- Resolved conflict — Owner default: preserve D077 Branch-first login behavior;
  Owner reaches Admin Dashboard through one truthful Hub/picker entry.
- Resolved conflict — route parity: block non-Owner access to `/admin`, `/menu`,
  `/orders`, `/inventory`, `/finance`, `/branches`, and `/hr`; preserve
  `/br/[branchId]/orders`, `/stock`, `/menu-limits`, `/team`, `/settings`, and
  approval routes according to existing capability and branch-scope gates.
- Scope/implementation: route classification, ACL consumption, discovery/nav,
  shell/copy taxonomy, `/admin` launcher, Branch Hub/picker, tests, and owning
  product contracts only.
- Tests/recovery: assert Owner admission and complete discovery; Manager/Cashier
  fallback; Branch-native parity; unknown admin-family fail-close; responsive
  launcher and no Office copy. Revert the isolated branch if any full gate or
  branch-runtime parity test fails; there is no DB or production rollback.
- Out of scope: Finance behavior, SePay/MoMo, KPI invention, database/schema/
  generated types, route moves, PR #284, and production.

- [x] **A1 — authority boundary.** Gate all Admin Dashboard route families in
      proxy and post-login return routing while preserving Branch-native paths.
- [x] **A2 — discovery and shell taxonomy.** Remove the workspace surface,
      expose Admin Dashboard navigation only to Owner, and rename Office shell
      symbols to Admin Dashboard terminology.
- [x] **A3 — truthful launchers.** Build `/admin` from existing `AppPage`,
      `LinkCardGrid`, and `AppLinkCard`; reduce Branch Hub Owner links to one
      Admin Dashboard entry; keep Manager Branch links branch-local.
- [x] **A4 — contracts and verification.** Update the decision, Design System,
      role-route matrix, static regressions, full gates, and responsive browser
      evidence before delivery.
- [x] **A5 — notification deep-link containment.** Resolve notification action
      URLs at hydration so legacy Admin paths reach the recipient's authorized
      Branch workflow, retain Owner access, and fail closed for unknown,
      unsafe, unscoped, or cross-branch targets. Accept both purchase-order URL
      forms used by current main and the queued PR #284 migration.

### T3 attestation

- `REVIEW_TIER=T3 corepack pnpm verify` passed on 2026-07-15: dependency audit,
  baseline, typecheck, lint, production build, and all repository tests.
- Focused Admin Dashboard/Branch regressions passed: 61 shared auth tests and
  70 web static tests. Runtime browser suite passed 11/11 with Manager and
  Cashier Admin-family rejection, Branch-native Orders parity, Owner launcher,
  and Branch shell checks across phone, tablet portrait/landscape, and desktop.
- Notification deep-link regressions passed 4/4. The final resolver also passed
  monorepo typecheck (7/7), T3 lint (7/7), production build (2/2), and the full
  repository test suite with no failures.
- No database migration, generated database type change, production write, or
  deployment occurred. Finance/SePay behavior, KPI invention, route moves, and
  PR #284 remain intentionally outside this slice.

## POS Item Customizer Mobile Scroll (2026-07-11)

Skill plan: repo rules = engineering + skills + workflow + ui; external skills =
none; runtime tools = CodeGraph + static Node test; skipped = browser (no live
POS session in this turn) and design-review (layout bug, not design question).

UI Advisor Gate

- Surface: `/br/[branchId]/pos`; route family: POS station; plane: station; change: behavior
- Context: POS order-taking → customize item before add/edit; actor: cashier/service; job: reach all options + CTA on phone
- Journey: tap menu item → customizer sheet → pick options/note → confirm; recovery: close sheet
- Information order: 1) item name 2) variants/modifiers/sides/note/discount 3) qty + total CTA; exclude: redesign
- Pattern: existing bottom Sheet customizer (not a new page archetype)
- States: long option lists on short viewports
- Components: Sheet + ScrollArea (Má Tư DS)
- Responsive: mobile phone; touch; risk = body scroll lock + non-scrolling sheet
- Verification: static layout contract test; owner phone smoke after deploy

T2

- PM: fix unblock cashier on phone when customizing long items; done = can scroll to CTA
- BA: no business-rule change; only layout scroll contract
- Dev: override bottom sheet `h-auto`, constrain flex column, `ScrollArea min-h-0 flex-1`
- QA: static test `pos-item-customizer-mobile-scroll.test.ts`; regression `POS-CUSTOMIZER-MOBILE-SCROLL`

Follow-up (same surface): `QuickReasonChips` note/discount presets use one-row
horizontal `overflow-x-auto` + `no-scrollbar` (design-system chrome-rail pattern)
instead of `flex-wrap`, to reclaim vertical space in the customizer. Action bar
uses `SheetFooter` outside a plain `overflow-y-auto` body so qty/confirm stay
pinned to the viewport.

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

## Owner Predicate RLS Repair

### T3 contract

Skill plan: repo rules = engineering + skills + database + workflow +
orchestration; external skills = Supabase + Supabase Postgres RLS guidance;
runtime tools = catalog-only production reads, an isolated source Preview Branch,
targeted tests, and full repo gates. Skipped = production apply, a new auth
helper, broader refund access, and authenticated execution of
`public.auth_is_owner(uuid)`.

- **PM:** Restore the Owner refund evidence path blocked by SQLSTATE `42501`;
  add no new role, permission, route, or Finance behavior.
- **BA:** The active tenant Owner can read and operate on refund rows. Every
  non-Owner remains denied, and the service-only owner predicate remains hidden
  from browser roles.
- **Senior Dev:** Recreate the three `refunds_*` policies with the existing
  `has_permission(branch_id, key)` boundary and semantic refund keys. Restore
  the existing service-only ACL on `auth_is_owner`; do not grant browser
  execution or add another helper.
- **QA/QC:** Prove policy definitions, function privileges, Owner access, and
  non-Owner denial on a source Preview Branch. Inspect advisors for a
  refund-boundary regression and report unrelated project-wide findings
  separately. Publishing this draft is only a verification trigger, never a
  production apply.

Synthesis: the direct RLS call crossed an invoker privilege boundary. Reusing
the existing browser-callable permission helper fixes that boundary while
preserving the Owner-only contract and least privilege.

- [x] **R1 — forward policy repair.** Add ordered migrations that restore the
      semantic refund permission gates and the service-only owner-predicate ACL.
- [x] **R2 — verification.** Targeted regression, full repo gates, source
      Preview migration execution, and Owner/non-Owner smoke are green. Advisors
      contain no `auth_is_owner` finding; unrelated project-wide findings are
      recorded in the attestation.
- [x] **R3 — delivery.** Commit and publish the DB-first draft without applying
      or merging it to production.

Attestation: the forward migrations and static regression are written, and
`REVIEW_TIER=T3 corepack pnpm verify` is green. Source Preview
`yxbejsfflgcliuxfkhin` reached `FUNCTIONS_DEPLOYED` with both forward versions
in its ledger. The first source run exposed bootstrap grants that made
`auth_is_owner` browser-callable; an immutable follow-up delta removed them,
leaving only `service_role` executable. Synthetic, rolled-back smoke proved
Owner create/read/reject RPCs, denied Owner direct refund DML, and denied a
Branch Manager (including one stale refund grant) access to the predicate,
rows, and both RPCs with SQLSTATE `42501`. Security and performance advisors
contain 434 and 512 project-wide findings respectively, but no
`auth_is_owner` finding; refund executor and index notices are reported by the
existing advisor inventory and are outside this policy/ACL-only diff. A
dashboard-created Preview stopped before this delta at the parent historical
`20260630130407_canonicalize_branch_manager_template` replay, so it was deleted
without applying the refund change. The source Preview proof does not claim a
green Production-history replay. Production remains untouched.

## Self-Order Type-Source Reconciliation

### T3 contract

Skill plan: repo rules = engineering + skills + database + workflow; external
skill = Supabase; runtime tools = Production catalog and ledger reads, generated
types, focused static tests, baseline replay, and full repo gates. Skipped =
Production writes, payment-method canonicalization, Finance UI changes, merging
PR #284, and changing the Self-Order product workflow.

- **PM:** Make the Self-Order source chain and generated database contract
  describe the current request workflow before PR #284. Done means no retired
  V2 session/batch types while current request/payment RPCs remain available.
- **BA:** Retired `self_order_sessions`, `self_order_batches`, their payment
  session FK, and five legacy batch RPCs stay absent. Payment completion requires
  both `completed_at` and a bound `payment_id`; table QR rotation is sessionless.
- **Senior Dev:** Repair the existing retirement migration for fresh replay, add
  the exact forward hardening payload for already-retired schemas, and scope the
  generated-type delta to Self-Order only. Do not import payment canonicalization
  or the surrounding PR #284.
- **QA/QC:** Prove Production catalog-to-file mapping, generated-type shape,
  sessionless function bodies, focused Self-Order regressions, baseline replay,
  and the full TypeScript/lint/build gates. Production remains read-only.

Synthesis: the Self-Order retirement source on `main` is weaker than the payload
already applied to Production. Repair that immutable file for fresh replay and
restore the forward hardening migration for already-retired schemas. Production
also contains payment canonicalization from PR #284, but current `main` still
owns the legacy MoMo runtime; this lane deliberately keeps all four
`momo_revenue` type fields and defers that separate product migration to #284.

- [x] **TS1 — source repair.** Restore the Production-equivalent
      `20260711140000_retire_self_order_v2.sql` payload and the exact
      `20260712071537_harden_self_order_payment_evidence.sql` forward repair.
- [x] **TS2 — type/runtime alignment.** Remove only retired Self-Order types,
      add the current QR-rotation/payment-status RPCs, and retain all four
      `momo_revenue` compatibility fields for PR #284.
- [x] **TS3 — verification.** Run focused tests, baseline replay, full gates,
      and independent review with no Production mutation.
- [x] **TS4 — delivery.** Publish the dedicated pre-PR #284 pull request as
      PR #289.

## Branch Hub Single-Branch Entry (D077)

### T3 contract

Skill plan: repo rules = engineering + skills + workflow + UI; external skills
= Supabase for production truth; runtime tools = refreshed CodeGraph, read-only
production SQL, focused Node tests, full repo gates, and browser verification.
Skipped = schema changes, production writes, Office-shell deletion, and moving
Owner workspace routes.

- **PM:** Make Branch Hub the promoted home for every active role while keeping
  Owner-only workspaces reachable. Acceptance is one operable-branch entry,
  no central-site advertisement, and no duplicate new shell.
- **BA:** Only `branch_kind = branch` is operable. One allowed branch opens
  directly; multiple allowed branches retain the picker. Owner can cross into
  Finance/HR/Payroll/Settings, but those shortcuts do not widen action ACL.
- **Senior Dev:** Reuse `selectOperatorBranchScope`, `resolveBranchContext`,
  `MODULE_ACL`, and existing Branch action sections. Resolve from DB, never
  hardcode branch 3, and return null for a requested branch outside the allowed
  set instead of silently substituting another branch.
- **QA/QC:** Unit-test owner fallback, owner home links, branch-kind filtering,
  and wrong-route rejection. Static-test sole-branch redirect, picker gating,
  the management/Owner Hub groups, and route-boundary compliance; then run
  typecheck, lint, build, tests, and desktop/mobile Hub smoke.

Agreement: this slice changes entry and presentation only. It does not mutate
production rows or remove Owner workspaces. Route visibility remains separate
from Server Action/RLS authorization.

- [x] **B1 — single-branch entry contract.** Owner falls back to `/`; the root
      resolver auto-opens one allowed operating branch and retains the picker
      only for real multi-branch scope.
- [x] **B2 — fail-closed Branch scope.** Central kinds are excluded for every
      role and a mismatched `/br/[branchId]` does not render another branch.
- [x] **B3 — self-operating Hub presentation.** Add Branch management and
      Owner-only workspace shortcuts with existing ACL labels/primitives; hide
      the branch switcher when `canSwitchBranch` is false.
- [x] **B4 — automated verification.** Focused auth/Hub tests and the full repo
      typecheck, lint, build, and test gates are green.
- [x] **B5 — authenticated visual smoke.** Cashier, Manager, and Owner auth plus
      the Branch Hub phone, tablet, and desktop route smoke are green against
      local Supabase. Manager setup now resolves an active `branch` and the
      `branch_manager` position instead of pinning a retired central site.

## Branch Stock Hub Viewport

### T2 contract

Skill plan: repo rules = engineering + skills + workflow + UI; external skills
= none; runtime tools = refreshed CodeGraph, in-app browser, focused Node tests,
and full repo gates. Skipped = new navigation primitives, inventory queries,
and workflow changes below the Hub.

- **PM:** Keep the Branch Stock Hub as a fast launcher, but fit daily work into
  the first viewport. Done means no duplicate transfer entry, two concise job
  groups, and a bottom-nav label that names the whole module.
- **BA:** The transfer screen already owns `Cần nhận`, `Cần giao`, and `Lịch sử`,
  so Hub exposes one `Điều chuyển` entry. `Kho` opens the full stock workspace;
  `Tồn kho` remains the narrower on-hand lookup.
- **Senior Dev:** Remove the duplicate at shared `nav-config`, reuse
  `BranchOperatorActionSection`, and regroup the existing role-filtered links.
  Do not add a second tab model or fetch queue data only for presentation.
- **QA/QC:** Static-test the canonical transfer link, compact two-column groups,
  and `Kho` bottom-nav copy. Smoke `/br/3/stock` at `390x844` and `622x837`,
  checking overflow, tap targets, labels, and the transfer destination.

UI Advisor Gate: surface = `/br/[branchId]/stock`; route family =
`operator-stock`; plane = Branch; change = visual + copy. Context = Inventory
Workspace; actor = owner/branch manager; job = open the correct stock workflow
without scanning duplicate entries. Journey = Branch bottom nav -> choose one
job -> open its native workflow -> return to Stock Hub. Information order = four
daily stock actions first, then lookup/production/counting/consumption/catalog;
exclude = Office metrics and repeated queue facets. Pattern = Branch touch HUB;
components = `BranchOperatorPage` + `BranchOperatorActionSection`; states =
permission-filtered links or existing empty state. Responsive = same two groups
on phone/tablet with two-column touch tiles; verification = authenticated
browser evidence at both target viewports plus repo gates.

- [x] **S1 — canonical navigation.** Remove the duplicate receive-only transfer
      tile and label the remaining route `Điều chuyển`; rename bottom tab `Kho`.
- [x] **S2 — compact Hub.** Render two two-column groups without repeated
      explanatory copy while preserving role-filtered fallback links.
- [x] **S3 — verification.** Focused tests, typecheck, lint, build, and
      phone/tablet browser smoke are green.

Attestation: the diff matches the T2 contract; canonical navigation owns one
transfer entry, Stock Hub owns two compact groups, and no inventory data flow or
authorization boundary changed. No new regression rule was needed.

## Branch Today Hub Viewport

### T2 contract

Skill plan: repo rules = engineering + skills + workflow + UI; external skills
= none; runtime tools = CodeGraph, in-app browser, focused Node tests, and repo
gates. Skipped = new queue queries, components, routes, and permission changes.

- **PM:** `Nay` must surface real pending work before daily station entry. Done
  means zero-count rows and bottom-nav duplicates no longer consume viewport.
- **BA:** `Ca`, `Đội`, and `Kho` own their workflows in bottom nav. The Today Hub
  keeps sales/kitchen/order entry plus management shortcuts; the header already
  owns the Branch command link.
- **Senior Dev:** Filter the existing queue model, narrow the existing home href
  contract, and delete duplicate presentation. Keep ACL-resolved tiles intact.
- **QA/QC:** Lock positive-only queue rows and manager Today suffixes with static
  tests; smoke owner `/br/3` at phone and desktop, including the nonzero queue.

UI Advisor Gate: surface = `/br/[branchId]`; family = `operator-home`; plane =
Branch; change = visual + flow. Context = Branch day-flow home; actor =
owner/branch manager; job = act on pending work, then enter the relevant station.
Information order = positive pending queue, sales/kitchen/order tiles, management
shortcuts; exclude = repeated Team/Stock directories and duplicate Branch command.
Pattern = Branch touch HUB; components = existing `BranchOperatorPage`, queue
panel, and action sections; responsive = same IA at phone/desktop with 2-column
touch tiles; verification = route DOM/screenshot plus full repo gates.

- [x] **N1 — positive queue.** Hide zero-count queue rows and suppress the panel
      when no work is pending.
- [x] **N2 — one owner per workflow.** Keep sales/kitchen/order tiles on `Nay`;
      remove repeated Team/Stock groups and the duplicate command control bar.
- [x] **N3 — verification.** Focused tests, repo gates, and phone/desktop browser
      smoke are green.

Attestation: the diff matches the T2 contract; `Nay` now renders only positive
work signals and station/management entry, with no data query, ACL, or action
change. No new regression rule was needed.

## Branch Shift Tab Semantics

### T2 contract

Skill plan: repo rules = engineering + skills + workflow + UI; external skills
= none; runtime tools = CodeGraph, in-app browser, focused tests, and repo gates.
Skipped = attendance data/model changes and a new manager shift dashboard.

- **PM/BA:** `Ca` is personal attendance/workday, so it is useful to scheduled
  staff and Branch Manager but not Owner. Owner shift oversight stays in `Nay`
  queues and `Đội`; a direct old `/shift` link safely returns to `Đội`.
- **Senior Dev:** Gate only the bottom-nav membership and root route. Keep all
  approval/detail routes, ACL, attendance actions, and staff presentation intact.
- **QA/QC:** Static-test Owner tab exclusion and redirect while preserving the
  Branch Manager `manager-dashboard` and employee `full` modes.

UI Advisor Gate: surface = `/br/[branchId]/shift`; family = `operator-shift`;
plane = Branch; change = navigation behavior. Actor/job = scheduled staff manage
their workday; Owner monitors through Team/Today. Pattern and components remain
the existing Branch workday surface; verification = Owner runtime redirect plus
static and full repo gates.

- [x] **C1 — truthful membership.** Hide `Ca` for Owner and redirect the Owner
      shift root to `Đội`; leave staff/manager workday flows unchanged.
- [x] **C2 — verification.** Focused tests, repo gates, and Owner browser smoke
      are green.

Attestation: the diff matches the T2 contract; only Owner tab membership and the
Owner root redirect changed. Attendance data, approval routes, actions, and ACL
remain intact. No new regression rule was needed.

## Branch Team Tab Viewport

### T2 contract

Skill plan: repo rules = engineering + skills + workflow + UI; external skills
= none; runtime tools = CodeGraph, in-app browser, focused tests, and repo gates.
Skipped = new team data, routes, filters, and approval workflows.

- **PM/BA:** `Đội` opens the actual workspace tabs immediately. Approval entry
  cards repeat `Nay`, while People/Assignments cards repeat their tabs. The first
  tab is shift monitoring, not a generic `Ca & Kho` directory.
- **Senior Dev:** Delete the duplicate entry composition, reuse existing tabs,
  select the highest-signal existing filter (`Cần xử lý` -> `Đang làm` -> all),
  and omit zero-count filters.
- **QA/QC:** Lock the three tab labels, initial-filter priority, zero-filter
  suppression, and absence of the old manager-entry action sections.

UI Advisor Gate: surface = `/br/[branchId]/team`; family = `branch-team`; plane
= Branch; change = visual + filter behavior. Actor/job = manager or Owner scans
active/exception shifts, then opens people or assignments. Information order =
tablist, high-signal shift filter, rows; exclude = repeated approval/entry cards.
Pattern = Branch touch LIST workspace; responsive = sticky three-tab strip and
existing touch rows; verification = phone/desktop browser plus repo gates.

- [x] **T1 — direct workspace.** Remove the five repeated entry cards and rename
      the board tab `Theo dõi ca`.
- [x] **T2 — signal-first list.** Default to action/working rows before all rows
      and hide filters whose result count is zero.
- [x] **T3 — child screens.** Hide zero-result roster chips and place employees
      with count assignments before unassigned employees without removing anyone.
- [x] **T4 — verification.** Focused tests, repo gates, and browser smoke are
      green.

Attestation: the diff matches the T2 contract; `Đội` now opens the direct
three-tab workspace, prioritizes real signals, and preserves every roster and
assignment row. No data loader, mutation, or authorization boundary changed. No
new regression rule was needed.

## Branch Team Shift Drill-Down

### T2 contract

Skill plan: repo rules = engineering + skills + workflow + UI; external skills
= none; runtime tools = CodeGraph, local browser, focused tests, and repo gates.
Skipped = new approval actions, duplicate detail components, and data-model
changes.

- **PM/BA:** A shift row first opens the selected employee/shift detail. From
  there, each real pending job has its own command; the manager never searches
  the same person again in a generic approval list.
- **Senior Dev:** Remove hidden long-press/direct-navigation behavior. Reuse the
  existing checkout and count-review screens with validated query focus; keep
  their existing actions, confirmations, permissions, and audit behavior.
- **QA/QC:** Lock one-tap detail, separate checkout/count CTAs, exact attendance
  focus, employee-scoped count loading, and the absence of the duplicate count
  assignment shortcut.

UI Advisor Gate: surface = `/br/[branchId]/team?tab=board` plus focused checkout
and count-review targets; family = `branch-team`; plane = Branch; change = flow.
Actor/job = manager selects one shift, understands its state, then completes one
pending review. Information order = employee/shift, statuses, time/checklist,
contextual commands. Pattern = touch LIST -> detail drawer -> focused review
drawer/sheet; no new primitive. Verification = phone runtime smoke, focused
tests, and full repo gates.

- [x] **D1 — predictable row action.** A tap opens the shift drawer; keyboard
      activation is native through a real button. Long press and direct jumps
      are removed.
- [x] **D2 — contextual commands.** Checkout and submitted count reviews render
      as independent drawer commands; an unsubmitted count remains a follow-up
      signal rather than a false review action.
- [x] **D3 — focused targets.** Checkout opens the exact attendance request;
      count review loads only the selected employee and opens the newest pending
      slip. The duplicate count-assignment shortcut is removed.
- [x] **D4 — verification.** Runtime smoke, focused tests, repo gates, and final
      diff review are green.

Attestation: the Team shift drill-down is written and runtime-verified at the
phone viewport. Focused tests (45/45), web typecheck, web lint, and production
build are green. Full repo verification is green after the Self-Order UI
baseline check and the retired Stock Hub transfer-tile expectation were
reconciled.

## Branch Orders Focused Queue

### T2 contract

UI Advisor Gate: surface = `/br/[branchId]/orders`; route family =
`operator-orders`; plane = Branch; change = flow. Context = POS order follow-up;
actor = branch manager; job = see actionable orders before recent history.
Journey = Branch -> Orders -> select active/recent order -> detail sheet;
recovery = switch back to recent history. Information order = active orders,
recent orders, then order detail. Pattern = Branch touch LIST with one Tabs
facet; components = `Tabs`, `ItemGroup`, `OrderDetailSheet`; states = active
empty, recent list, loader error. Responsive = one touch IA on phone/tablet.

- **PM/BA:** Prioritize non-terminal orders without removing recent lookup.
- **Senior Dev:** Reuse the existing 50-row loader and detail sheet; no POS
  mutation, new query, or second history surface.
- **QA/QC:** Lock terminal-status filtering, one active/recent tab axis, and
  the detail sheet accessibility description.

- [x] **O1 - active queue first.** The default tab shows only non-terminal
      orders and carries the aggregate in-progress count.
- [x] **O2 - history remains available.** The existing latest-order list stays
      behind `Gần đây`; no additional history query or POS mutation is added.
- [x] **O3 - detail accessibility.** `OrderDetailSheet` has a screen-reader
      description and opens the selected order from either list.

Attestation: Chrome runtime smoke on `/br/3/orders` confirmed the active-first
tab, recent-history tab, and item detail sheet after hot reload. The focused
static test, web typecheck, UI contract check, and full repo verification are
green.

## Self-Order Rebuild (D075)

Contract: `docs/spec/self-order-guest-ui.md`. Owner decision: `docs/plan/decisions.md`
§ D075. The POS order is the only seating lifecycle; `self_order_sessions`,
`self_order_batches`, and `self_order_session_devices` are deleted.

### Same-device VietQR handoff T3 contract

Skill plan: repo rules = engineering + skills + database + UI + workflow;
external skills = Ponytail + Next.js best practices + Supabase; runtime tools =
CodeGraph + production SELECT-only check + VietQR official docs + focused tests;
skipped = DB writes and private bank deeplinks because the payment facts are
already correct and undocumented private bank schemes are not a stable contract.

- **PM:** Replace the misleading bare app jump with a same-phone flow that hands
  off the exact QR image. Done means the guest can share it into an installed
  bank app, use a documented autofill deeplink, or save it as fallback.
- **BA:** The stored QR payload, amount, payment code, bank snapshot, and expiry
  remain unchanged. Saving the image never marks payment complete; SePay remains
  the payment source of truth.
- **Senior Dev:** Reuse `QrCodeImage`'s existing rendered data URL and native
  file share/download actions. Native file share hands the exact generated QR
  image to installed apps; documented VietQR URLs remain only for the four bank
  apps whose parameter autofill support is published.
- **QA/QC:** Keep QR render/retry behavior, assert exact PNG share, download,
  documented autofill parameters, and cancellation/error fallback; then run the
  focused Self-Order tests and full gates.

Agreements: this is a client-only recovery-path correction, not a payment-state
or schema change. Resolved conflict: after owner clarification, documented
autofill deeplinks stay available for ACB, BIDV, VietinBank, and OCB; native PNG
share follows Zalo's QR-scan handoff for MB and other share targets; saving the
QR remains the universal fallback. Unified acceptance: supported deeplinks
receive account, amount, content, and account name; every guest can hand off or
save the exact active QR.

Attestation: native share and download use the exact `QrCodeImage` source; the
four documented deeplinks carry account, bank, amount, payment content, and
account name. Payment state, SePay confirmation, and bank snapshots are
untouched. The BA rules map to `qr-code-image.tsx`, `bank-app-link.ts`,
`payment-panel.tsx`, and `self-order.ts`; 75 focused tests plus typecheck, lint,
and build are green. A physical-phone handoff into MB remains unverified because
the local environment has no active-payment fixture or installed bank app.

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
  compact non-main rows, the pending round inside the bill, and safe bill
  access for every table state.
- **BA:** Main dishes keep photo cards; side dishes, drinks, and desserts use
  compact rows. Pending requests show submitted lines without a payable total.
  Multi-bill guests cannot read or pay a bill.
- **Senior Dev:** Reuse the existing item sheet, `Button`, `Item`, `Drawer`, and
  `OrderSummary`; no new state store, query, or menu abstraction.
- **QA/QC:** Re-run the focused static suite and verify the real public flow at
  `390x844`: page identity, first viewport, console, item sheet, cart, and bill
  drawer.

- [x] **S4 — guest UI.** Menu becomes the only page: header is `[table label]`;
      `Hoá đơn` is always a lower-right button with a `Badge` opening a `Drawer`
      that never auto-opens.
      Delete `self-order/status-pill.tsx`, `self-order/device-access-panel.tsx`,
      and `self-order/session-state-panel.tsx`; the awaiting and rejected states
      render in `Dialog`, while refresh failures use toast rather than header
      copy. Create
      `self-order/bill-drawer.tsx` holding the canonical order lines, the round
      history read from `kitchen_send_batches`, and `payment-panel.tsx`. Group
      the menu by `menu_categories.type`: `main_dish` as large photo cards, the
      rest as compact rows. Cart CTA reads `Gửi món` when the table is closed and
      `Gửi thêm món` when it is open. Replace realtime with adaptive polling in
      `self-order/hooks.ts`: 3s while awaiting confirmation or paying, 15s
      otherwise, refetch on focus and bfcache restore. G0 renders a static
      `BrandMascot animated={false}`.

### Guest chrome correction T2 self-review

Skill plan: repo rules = engineering + UI + workflow; external skill =
frontend-testing-debugging; runtime tools = CodeGraph + Browser; skipped = new
workflow/data state because the owner changed only the guest presentation.

UI Advisor Gate

- Surface: `/q/[token]`; route family: PUBLIC-WORKFLOW; actor: guest; job:
  browse the menu and inspect the bill at any point.
- Information order: table label -> menu -> cart; `Hoá đơn` is an always-visible
  fixed lower-right action. An unopened or multi-bill table shows no order data.
- States: awaiting and rejected use a dismissible `Dialog`; refresh failure and
  successful add-more use `toast`; bill and payment remain in the existing
  `Drawer`.
- Components: existing `Button`, `Badge`, `AppDialog`, `Drawer`, and Sonner toast;
  mobile keeps touch targets and avoids overlap with the sticky cart bar.

- **PM:** Scope is only bill placement/visibility and guest notification chrome.
  Acceptance is no header notification copy, bill visible before a first request,
  and no change to ordering or payment authority.
- **BA:** Pending/rejected requests still need a visible recovery path; unopened
  and multi-bill states show no order data, and payment fields remain drawer-only.
- **Senior Dev:** Reuse the current snapshot state, bill drawer, and primitives;
  add no new persistence, fetch, or state store.
- **QA/QC:** Lock the source contract with focused static tests; smoke the menu,
  first submit, dialog, bill launcher, and cart overlap at `390x844`.

Attestation: the diff matches this T2 contract. The bill launcher is always
available, while multi-bill privacy remains fail-closed and the existing
drawer/payment path is unchanged. Focused Web tests, typecheck, lint, and build
pass; browser smoke is deliberately unverified because local dev uses production
Supabase credentials.

- [x] **Guest chrome correction.** Keep `Hoá đơn` as an always-visible
      lower-right fixed action, replace header callouts with dialog/toast
      feedback, and update the Self-Order UI and feedback contracts.

### Guest bill state T2 self-review

Skill plan: repo rules = engineering + UI + workflow; external skills = none;
runtime tools = CodeGraph + focused static tests; skipped = browser smoke
because local dev uses production Supabase credentials.

- **PM:** Bill starts with only the ordered lines and one payment CTA.
- **BA:** No order or multi-bill keeps the safe empty state and cannot enter
  payment; Back from payment returns to the bill without changing the order.
- **Senior Dev:** Reuse `BillDrawer` and `PaymentPanel`; add one local
  drawer-view state, no route, query, or payment-contract change.
- **QA/QC:** Assert payment is absent from the bill view and rerun the focused
  suite plus full gates.

Attestation: the diff matches this T2 contract. Bill and payment remain one
Drawer with explicit local state; the active order and payment intent stay the
only payment authorities.

### Guest cart edit + layout cleanup T2 self-review

Skill plan: repo rules = engineering + UI + workflow; external skills = none;
runtime tools = focused tests.

UI Advisor Gate

- Surface: `/q/[token]` G3 cart; change: visual cleanup + edit cart line.
- Journey: open cart -> Sửa -> item sheet hydrated from draft -> Cập nhật
  replaces same key; recovery: close sheet keeps prior line.
- Components: extracted `item-sheet.tsx`, quiet Item list + separators.
- Verification: static guards for edit/replace; ui-contract.

Attestation: the diff matches this T2 contract.

- [x] **Guest cart edit + layout cleanup.** Quieter list layout; **Sửa** reopens
      customizer and replaces the cart line in place.

### Guest cart sheet redesign T2 self-review

Skill plan: repo rules = engineering + UI + workflow; external skills = none;
runtime tools = focused tests; skipped = Three.js / new commerce flow.

UI Advisor Gate

- Surface: `/q/[token]` cart sheet; route family: PUBLIC-WORKFLOW; plane: public;
  change: visual composition of G3.
- Context: seated guest; job: review cart lines, adjust qty, send.
- Journey: sticky launcher -> full-height sheet -> edit lines/note -> Gửi món;
  recovery: close sheet, keep cart.
- Information order: lines -> note -> subtotal + CTA; exclude bill/payment.
- Pattern: PUBLIC-WORKFLOW; exemplar: `cart-sheet.tsx`; data display: review list.
- States: empty, editable, submitting, CTA-disabled (awaiting/payment lock).
- Components: Sheet, ScrollArea, Badge, Button, AppEmptyState, Alert, Spinner.
- Responsive/accessibility: touch targets, closeCartAria, quantity aria labels.
- Verification: focused static tests + typecheck/lint.

- **PM:** Visual/review composition only; send paths unchanged.
- **BA:** Same cart payload and CTA state rules; tags display-only.
- **Senior Dev:** Reuse menu-display split helper; no schema change.
- **QA/QC:** Guard full-height sheet, large total, no direct sticky submit.

Attestation: the diff matches this T2 contract.

- [x] **Guest cart sheet redesign.** Full-height review sheet with larger line
      typography, single footer total, and press-scale controls.

### Guest menu visual scale T2 self-review

Skill plan: repo rules = engineering + UI + workflow; external skills = none;
runtime tools = focused tests; skipped = Three.js / framer-motion because the
Motion Contract forbids animation libraries.

- **PM:** Bigger type + thumb + press feedback only; no new commerce flow.
- **BA:** Display-only; cart/KDS names unchanged.
- **Senior Dev:** CSS `duration-150` + `active:scale-[0.97]` only.
- **QA/QC:** Static guards for scale classes; lint/ui-contract.

Attestation: the diff matches this T2 contract.

- [x] **Guest menu visual scale.** Larger title/price/thumbs; CSS press motion
      only (no Three.js).

### Guest menu row layout T2 self-review

Skill plan: repo rules = engineering + UI + workflow; external skills = none;
runtime tools = focused tests; skipped = design-review plugin because the owner
locked the row composition and badge treatment.

UI Advisor Gate

- Surface: `/q/[token]`; route family: PUBLIC-WORKFLOW; plane: public; change:
  visual menu composition + default category.
- Context: seated guest; actor: guest; job: land on Cơm, scan dish rows, open
  the item sheet, add to cart.
- Journey: default Cơm filter -> row tap -> item sheet -> cart -> send;
  recovery: switch category pill or open Tất cả.
- Information order: category rail -> image + category eyebrow + title + price;
  exclude bill/payment from the row.
- Pattern: PUBLIC-WORKFLOW; exemplar: `apps/web/app/q/[token]/self-order/menu-panel.tsx`;
  data display: horizontal menu rows (larger thumb for main_dish).
- States: available menu, empty menu, awaiting, rejected, payment-locked.
- Components: `Button`, `Badge`, `ScrollArea`, existing item sheet; fallback:
  span with SectionLabel dense classes inside the button (no nested `div`).
- Responsive/accessibility: same mobile IA; aria-label keeps the raw item name;
  touch targets stay `size="touch"`.
- Verification: focused Self-Order static + menu-display unit tests,
  typecheck/lint/build.

- **PM:** Scope is browse composition only. Acceptance is default Cơm, row
  layout, and parenthetical tags as image badges.
- **BA:** Cart/customizer/KDS keep raw `menu_items.name`; only the menu row
  splits a trailing `(tag)`.
- **Senior Dev:** Pure helpers in `menu-display.ts`; no schema or RPC change.
- **QA/QC:** Guard default category, row markers, and tag split; no browser
  smoke against production credentials.

Attestation: the diff matches this T2 contract.

- [x] **Guest menu row layout.** Default category is Cơm; menu rows are
      image-left / title-right; trailing `(tag)` notes render as image badges.

### Guest menu and cart layout T2 self-review

Skill plan: repo rules = engineering + UI + workflow; external skill =
frontend-testing-debugging; runtime tools = CodeGraph + Browser; skipped = new
menu data, images, state, and payment changes because this is a composition-only
correction.

UI Advisor Gate

- Surface: `/q/[token]`; route family: PUBLIC-WORKFLOW; actor: a seated guest;
  job: recognize the restaurant, choose a meal, review the cart, then submit.
- Information order: Má Tư + table -> "Hôm nay ăn gì?" -> category rail ->
  main-dish photo menu / compact secondary rows -> one cart action.
- Primary action: the sticky cart opens the cart sheet; **Gửi món** and **Gửi
  thêm món** stay inside that review sheet only.
- Responsive/accessibility: image is a visual aid only; names/prices remain
  regular text, each menu item and bottom action remain touch-sized, and the
  bill launcher sits above the compact cart bar.

- **PM:** Scope is the visible guest composition, not a new commerce flow.
  Acceptance is a recognizable menu surface and no direct submit from browsing.
- **BA:** The same item customizer, cart payload, first-order approval, and
  payment lock remain authoritative; only the point at which a guest confirms
  the cart moves into the sheet.
- **Senior Dev:** Reuse `MenuPanel`, `MenuPhotoButton`, `CartSheet`, shared
  `Button`/`Badge`, and existing message SSOT. No new components or queries.
- **QA/QC:** Add static guards for text-under-image cards and cart-sheet-only
  submission; rerun the focused suite and full gates. Browser remains blocked
  until a non-production runtime exists.

Attestation: the diff preserves the current customizer, cart payload,
approval, payment, and bill paths while moving browse-time confirmation into
the cart sheet. The full Web test suite (927 passed, 33 skipped), typecheck,
lint, and production build pass. Browser smoke remains intentionally
unverified because local dev uses production Supabase credentials.

- [x] **Guest menu and cart layout.** Replace image-overlay product tiles and
      direct sticky submission with the agreed menu hierarchy and one cart entry
      point.

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

### S6 T3 contract

Skill plan: repo rules = engineering + skills + database + workflow; external skill = Supabase; runtime tools = CodeGraph + production SELECT-only precheck + Preview Branch; skipped = production apply until owner delegation.

- **PM:** Remove only the retired V2 persistence and realtime capability. The current QR request, staff decision, and payment flows remain available.
- **BA:** Existing V2 rows are a stop condition, not disposable cleanup data. The request/payment model is the sole retained Self-Order state after cutover.
- **Senior Dev:** Use one forward migration: preflight V2 tables, remove their dependent session column/objects without `CASCADE`, and preserve the canonical request/payment RPCs and rate-limit purposes.
- **QA/QC:** Verify on a Preview Branch that no V2 relation/function/trigger/column remains, canonical RPCs still exist, and generated types plus focused tests match the reduced schema.

Live-catalog correction: drop the legacy V1 batch/session RPCs and private
snapshot/queue helpers as well as `_v2` functions. Remove the payment broadcast
trigger before its function, drop V2 tables before their remaining helper
functions, and replace the payment invariant trigger function without
`session_id` before dropping that column. Keep the open-POS-session payment
trigger and its helper.

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

- [x] **S7 — documentation truth sweep.** The motion contract now follows the
      drawer IA; the obsolete capability rollout and index entry are removed;
      ADR 0011 no longer records the retired Self-Order realtime topic.

### Preview migration-chain repair (T2)

Skill plan: repo rules = engineering + skills + database + workflow; external = Supabase; runtime = CodeGraph + migration-list precheck + Preview Branch; skipped = production apply and schema mutation.

PM: scope = make the canonical baseline-plus-forward migration set the only Preview input; acceptance = Preview can replay it; priority = unblock S6 verification.
BA: rules = historical SQL remains available to developers but never executes in a fresh environment; edge case = path references must follow the archive move; data flow = no production table, RPC, or RLS changes.
Dev: approach = move the historical tree outside `supabase/migrations`, update exact path references, and add one static guard; risk = documentation/test path drift.
QA: tests = migration discovery excludes the archive, baseline replay, focused static test, and Preview provisioning; regressions to recheck = migration list has no archived versions.

Attestation: the source layout matches this T2 contract. Focused static tests,
typecheck, lint, and build pass; baseline replay is blocked by unavailable Docker,
and Preview provisioning requires the unpushed migration layout to reach GitHub.

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

## Single-warehouse cutover (D078)

### T3 contract (condensed)

Skill plan: repo rules = engineering + skills + workflow + UI + database;
external = none; runtime = migration file only (no PROD apply). Focused tests +
typecheck/lint/build.

- **PM:** Owner tắt Bếp CN; một kho/chi nhánh. Done = no Kho↔Bếp UX, defaults
  warehouse, decision/docs/tests aligned, migration ready for owner apply.
- **BA:** Stock-bearing = warehouse only. Kitchen inactive. POS/issue/GRN/
  stocktake/count/production → warehouse. KDS workflow unchanged.
- **Dev:** App defaults + nav/copy; migration consolidates + rewires RPCs;
  do not apply prod without delegation.
- **QA:** Update static/unit tests locking 2-location model; verify gates.

- [x] **W1 — decision + docs.** D078; fold D000/D073 §5; inventory.md,
      screen-context, regressions, todo S11.
- [x] **W2 — app cutover.** Warehouse defaults; remove Điều chuyển / Chuyển Bếp;
      kitchen filters; POS copy.
- [x] **W3 — migration file.** `20260710220000_single_warehouse_retire_branch_kitchen.sql`
      (awaiting owner apply).
- [x] **W4 — owner-applied warehouse cutover.** Production migration
      `single_warehouse_retire_branch_kitchen` recorded as `20260710232715`;
      9.000 kitchen units moved to the branch warehouse, kitchen deactivated,
      and POS/gate functions now resolve warehouse.

Attestation: app/docs/tests match D078 single-warehouse product truth; DB
rewire lands only after owner applies the migration.

### POS sale deduction at branch warehouse (D078 follow-up)

### T3 contract

Skill plan: repo rules = engineering + skills + database + workflow;
external skills = Supabase; runtime tools = official Supabase documentation,
focused static tests, and full repo gates. Skipped = production apply, generated
types (no schema shape changes), and a new UI because the Owner-only branch
setting already owns the reversible control.

- **PM:** POS sales may reduce stock at the branch warehouse by default. Done
  means every active branch is enabled, every future branch starts enabled, and
  the Owner can still turn it off per branch.
- **BA:** A sale posts only through the existing outcome path: paid and eligible
  after kitchen dispatch/readiness. The same flag keeps the hard availability
  gate, idempotency, and no-negative-stock rule; a posting-time shortage must
  not fail the payment or create a partial movement.
- **Senior Dev:** Apply after the D078 warehouse rewire. Upsert active `branch`
  rows to enabled, then extend the existing branch-default trigger with an
  `ON CONFLICT DO NOTHING` seed so an explicit Owner-off override is preserved.
  No client-side ACL or direct stock writer is added.
- **QA/QC:** Lock migration order, active-branch scope, disabled-row reset,
  future-branch defaulting, and the retained Owner toggle with focused tests;
  run typecheck, lint, build, and review-tier checks. Production runtime smoke
  follows owner-applied migrations only.

Agreement: this reverses D016's default only. It does not change the POS event
boundary, refund behavior, or stock correction workflow.

- [x] **W5 — enable POS sale consumption at Kho chi nhánh.** Production migration
      `enable_pos_sale_stock_deduction_at_branch_warehouse` recorded as
      `20260710232737`; active branches have posting enabled and new branches
      seed the same reversible Owner override.

Attestation:

- Covered: active-branch enablement, new-branch defaulting, D078 preconditions,
  Owner-off preservation, POS outcome behavior, and browser-role revokes.
- BA mapping: `20260711120000_enable_pos_sale_stock_deduction_at_branch_warehouse.sql`
  writes the branch flag and trigger; D016 plus inventory/Finance contracts
  prohibit manual duplicate consumption.
- Out of scope: a synthetic paid POS order in production. The post-apply
  function/location/flag smoke and `db:types` completed; observe the next
  eligible real POS outcome for the sale movement evidence.

### P0 inventory runtime repair T3 contract

Skill plan: repo rules = engineering + skills + database + notifications + workflow;
external skill = Supabase; runtime tools = CodeGraph, SELECT-only production SQL,
focused static tests; skipped = production apply and data correction because both
require owner-controlled production action.

- **PM:** Restore the broken inventory readers and prevent a recipe from losing
  its required unit mapping. Done means low-stock alerts, movement reports,
  and blind stocktake reads no longer depend on retired `ingredients.unit`.
- **BA:** Inventory quantities are canonical base units. A public menu recipe
  requires its `(ingredient_id, entry_unit_id)` mapping to remain active;
  changing that mapping must be rejected before it creates a silent POS
  sale-consumption gap. Existing invalid catalog rows are remediation work,
  not values to be guessed or backfilled by the migration.
- **Senior Dev:** Add one forward migration that rewrites the three reader
  functions against `inventory_entry_unit_code`, preserves the existing
  `inventory.stock_low` producer/dedup contract, and adds a narrow trigger
  on `ingredient_units` to reject invalidating units used by recipes.
- **QA/QC:** Static tests lock the unit resolver, retained notification dedup,
  and recipe-unit guard. A preview branch or owner-applied production smoke
  must run before the migration is called runtime-verified.

Agreement: use base-unit codes for aggregate reports and blind counts; do not
build a new alert system or auto-repair stock. The Owner fixes the flagged menu
catalog and stock levels, then verifies the next real POS order.

## Branch Stock Cutover (D073 — supersedes the D067 round-2 scope)

> `docs/plan/decisions.md` D073 (2026-07-10): the Central Kitchen site (branch 16) is being decommissioned — stock transfers to Phước Hải (branch 3), then
> `is_active = false`. Every stock upgrade prepared for the kitchen round now
> targets the SHARED `/br/[branchId]/(operator)/stock/*` surface for kind
> `branch`. D067 §1 still governs the layering: share the server action and
> data loader; fork only presentation.
>
> **D078 (2026-07-10 owner):** Branch kitchen (`Bếp CN` / `location_kind='kitchen'`)
> is retired. Each branch keeps **one warehouse** only. S11 (Kho↔Bếp one-step)
> is cancelled — do not build it. Migration
> `20260710220000_single_warehouse_retire_branch_kitchen.sql` consolidates
> kitchen stock into warehouse and rewires RPCs; **not applied to production
> until owner delegates**.
>
> Owner-approved mockup (3 screens; the build must match it, re-anchored to a
> branch): `https://claude.ai/code/artifact/778026d5-8d60-4dfe-acc7-296efe75a30c`
> GRN receiving-location card stays conditional (hide when
> `branchLocations.length <= 1`) — after D078 apply, Phước Hải has one active
> warehouse so the card stays hidden.

- [x] **S0 — full test gate restored.** Current full suite is green with 1006
      passing, 33 skipped, and 0 failing tests; the earlier nine-failure wave is
      no longer present in the current tree.

- [x] **S1 — extend the Branch/Admin Dashboard import boundary guard before converting
      anything.** Widen `operator-admin-dashboard-shell-boundary` in
      `scripts/check-ui-contract.mjs` so `(operator)/**` may not import
      `@/(protected)/inventory/**` except `*-actions.ts`; allowlist `_lib/**`
      until S7 lands. Freeze current offenders as the baseline and burn one line
      down per slice. The current 22 non-action, non-`_lib` imports are frozen;
      a mutation check proves the next presenter import fails the UI contract.

- [x] **S2 — app-shell scroll defects fixed.** The shared footer uses
      `sticky bottom-0`, the root body uses `min-h-dvh`, and the 16 stale
      operator-stock `pb-28` wrappers are removed now that bottom nav is static.
      Static coverage locks the shared footer and padding removal. Runtime
      scroll geometry is flush (`0–0.42px` gap, no body overflow) at `390x844`,
      `768x1024`, `1024x768`, and `1280x900`.

- [x] **S3 — GRN never prefills a purchase price.** Owner rule: the market price
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
  - Implemented in the shared Branch loader/controller: the latest confirmed
    GRN contributes only ingredient, quantity, and entry unit; every carried
    line remains price-empty, and review/confirm stay disabled until all prices
    are entered.

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
      is imported by both the operator create flow and Admin Dashboard
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

- [ ] **S7 — relocate shared pure logic out of the Admin Dashboard route tree.** Move
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
      stays in Admin Dashboard `/inventory` (D073 §3). Guard entries for the removed
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

- [x] **S11 — retire Kho↔Bếp and operator transfer (D078 supersedes D073 §5).**
      Owner cancelled the one-step Kho↔Bếp build. App cutover: remove
      "Điều chuyển" tile, `Chuyển Bếp` / `quickInternalTransfer`, kitchen
      targets, kitchen filters/defaults; GRN/issue/count/stocktake/production
      prefer warehouse. Migration
      `20260710220000_single_warehouse_retire_branch_kitchen.sql` merges kitchen
      stock → warehouse, deactivates kitchens, retires
      `commit_intra_branch_transfer`, rewires POS/count/stocktake helpers —
      **awaiting owner apply**. Remaining cleanup (optional follow-up): delete
      dead `stock/transfer/**` + `stock/receive/**` route files and archetype
      rows once migration is live.

- [x] **S12 — retire supplier returns end-to-end (D073 §4).** Delete the
      operator routes (`stock/supplier-returns/**`, 3 pages + 3 clients), the
      Admin Dashboard routes (`/inventory/supplier-returns/**`, 3 pages + 4 clients),
      the shared loaders/model (`branch-supplier-return-data.ts`,
      `supplier-return-model.ts`), the actions file
      (`supplier-return-actions.ts`), the nav tile and Admin Dashboard nav item, and the
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
      tile; remove the Admin Dashboard PO nav entry and routes from daily navigation;
      remove the PO door from the GRN source picker
      (`fetchOpenPurchaseOrdersForReceiving` / `openPurchaseOrders` in
      `apps/web/lib/inventory/grn-source-data.ts`) and the
      `openPurchaseOrders` hub-queue count. Delete the Admin Dashboard PO routes and the PO server actions
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
      `database.types.ts` updated. Upsert/bulk_import bodies patched
      2026-07-11 to sync `ingredient_units` (no delete-all) so
      `production_recipes` FK does not block catalog saves.

- [x] **Catalog save blocked by `production_recipes` FK (misleading
      "Đơn vị tồn chuẩn không hợp lệ").** Forward migration ready (not
      applied): `20260710193250_upsert_ingredient_units_preserve_recipe_fk.sql`
      (sorts before `193300`) replaces live 12-arg `upsert_ingredient_catalog` + `bulk_import_ingredients` with identity-preserving unit sync +
      explicit REVOKE/GRANT; app error map distinguishes recipe-in-use /
      unit / category. Apply this hotfix alone on PROD (12-arg still live);
      do NOT apply `193300` until app/types drop `p_shelf_life_days`.
      `193300` already carries the same sync body for the future 11-arg RPC.

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
