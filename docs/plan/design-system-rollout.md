# Má Tư Design System Program — P0–P7

> Status: in progress
> Current branch: `phuoc-hai`
> Scope: Design System, accessibility, CSS/motion, PWA, and interface rollout;
> no database, ACL, RPC, route-authority, or business-flow changes.

## 1. Goals and Required Order

The program creates one baseline for the Má Tư Design System and applies it
directly to every route by workstream. P6 is required; it is not an optional
optimization after the foundation is complete.

```text
P0 Preflight
→ P1 Baseline Audit
→ P2 Design System Foundation
→ P3 Accessibility
→ P4 Tailwind/CSS/Motion
→ P5 Native-quality PWA
→ P6 Screen & Layout Rollout
→ P7 Release & Self-Improving
```

Layer ownership is fixed as follows:

```text
Base UI behavior
→ @comtammatu/ui styled primitives
→ app/workflow adapters
→ route/domain UI
```

- Base UI owns primitive behavior and accessibility.
- Má Tư owns visual language, tokens, and semantic roles.
- Shadcn is reference material for anatomy, state, and API; it is not runtime
  authority.
- `packages/ui/src/styles/globals.css` remains the shared CSS SSoT.
- Do not create a competing component library, theme root, or route stylesheet.
- `Field` and `FormField` are current contracts, not legacy cleanup.

## 2. Program Status

| Phase | Status | Primary exit gate |
| --- | --- | --- |
| P0 | Complete | Clean worktree, green skills, fresh CodeGraph, live plan ready |
| P1 | Complete | Measured baseline, classified debt, C0 Decision Brief |
| P2 | Source-level complete; C1 reconciled | Authority, tokens, component contracts, docs, and guards aligned |
| P3 | Public runtime pass; authenticated/AT proof open | WCAG 2.2 AA on representative surfaces and shared primitives |
| P4 | Source convergence implemented; runtime proof open | Raw/custom CSS limited to valid exceptions; reduced-motion proof |
| P5 | Desktop Chrome manifest, update, and offline boundary pass; real install/standalone device proof open | Correct install/update/offline boundaries in production-like environments |
| P6 | Source/static rollout complete for 17 tranches; 123/123 pages passed Advisor Gate; `/offline` and `/access-denied` browser-runtime final | Every page classified keep/tune/rebuild and processed by route family |
| P7 | Self-improving loop, final P6 reconciliation, and full repository gate green; authenticated/AT/install proof open | Full gates, evidence reconciliation, and completion report |

Status changes only when exit-gate evidence exists. "Code written", "review
clean", "gate green", "browser verified", "runtime proven", "committed",
"pushed", "deployed", and "Production proven" are independent facts.

## 3. P0 — Preflight and Workspace Protection

- Use a clean worktree from `phuoc-hai` on `codex/design-system-rollout`.
- Do not edit, stash, reset, or reuse WIP in the main worktree.
- Run `codegraph index .` and `corepack pnpm agent:skills` before source audit.
- Read the engineering, skills, UI, workflow, and orchestration rules.
- Sync current outcomes into `tasks/todo.md`.
- Do not commit, push, open a PR, or deploy unless the Owner requests it.

Keep evidence of:

- Worktree path, branch, and starting HEAD.
- `agent:skills` result.
- `codegraph status .` after indexing.
- `git status --short` for the clean worktree before changes.

## 4. P1 — Baseline Audit

### 4.1 Design System inventory

- Inventory tokens, typography, color, spacing, density, radius, elevation,
  effects, and motion.
- Inventory `@comtammatu/ui` exports/consumers through the registry and source
  graph.
- Classify primitives, semantic components, app adapters, and route-local
  wrappers.
- Check direct Base UI imports, primitive escapes, and competing visual layers.
- Confirm every page has a route family, archetype, and exemplar.

### 4.2 Legacy/raw CSS inventory

Each finding must belong to exactly one group:

1. Replaceable by a semantic token/utility.
2. Valid dynamic runtime style such as chart, geometry, or progress.
3. Browser, print, PWA, or safe-area exception with a clear owner.
4. Transitional alias that requires migrating every consumer before removal.

Do not delete by blind grep or rename solely for appearance. The baseline must
record separate counts for legacy variables, raw colors, arbitrary layout/effect,
inline styles, custom keyframes, and CSS files outside the SSoT.

### 4.3 Accessibility and responsive baseline

- Audit landmarks, heading, label/name, help/error relationships, focus,
  keyboard, and live regions.
- Audit contrast, touch targets, zoom, reduced motion, and horizontal overflow.
- Use the `320`, `390`, `768`, `1024`, `1440` matrix with loading, empty, error,
  blocked, permission, offline, and destructive states where applicable.

### 4.4 PWA baseline

- Check manifest identity/scope, service worker, install, update, and offline
  recovery.
- Separate root, operator, POS, KDS, Runner, and Self-order contracts.
- Keep Self-order and sensitive authenticated data behind the network-only
  boundary.

### 4.5 Checkpoint C0

Run read-only parallel reviews with English prompts and require `path:line`
evidence:

- `claude`: architecture, visual hierarchy, accessibility.
- `agy`: docs/rules, governance, debt classification, rollout risk.
- `cursor-agent`: source graph, blast radius, reuse, and test gaps.

Codex verifies each finding against current source, rejects findings without
evidence, and publishes one Baseline Decision Brief.

## 5. P2 — Design System Foundation

### 5.1 Tokens and visual roles

- Normalize semantic color, typography, spacing/density, radius/elevation,
  border/focus/status, safe-area/viewport, and motion roles.
- Migrate consumers before removing transitional aliases.
- Preserve contrast in both light and warm-dark themes.

### 5.2 Component contracts

Standardize by group:

- Input: Button, Link, Input, Textarea, Select, Checkbox, Radio, Switch.
- Form anatomy: Field, FormField, FieldGroup, help/error/validation.
- Overlay/composite: Dialog, Sheet, Popover, Menu, Tooltip, Tabs, Combobox.
- Data: Table, DataTable, list, board, mobile-card composition.
- State: loading, empty, error, not-found, blocked, permission, offline.
- App semantic: AppPage, AppSection, AppToolbar, KpiCard, StatusBadge, and operational components.

`Card` is only a thin frame; do not create a god component through variants. Public API changes must migrate consumers in the same wave.

### 5.3 Docs, registry, and guards

- Keep `docs/spec/design-system.md`, `docs/modules/ui.md`, page archetypes, and the component registry aligned.
- Update agent rules only when the source of truth or routing actually changes.
- Remove duplicate policy; do not create an agent-only documentation tree.
- Add ratchets for measurable debt, preferring blocking-zero or non-growth guards with a clear outcome.

### 5.4 Checkpoint C1

Three external agents review the foundation diff in read-only mode. Codex verifies findings, fixes valid ones, and reruns focused/full gates according to risk.

## 6. P3 — Accessibility Program

The target is WCAG 2.2 AA:

- Add `@axe-core/playwright` as a web-app dev dependency.
- Standardize landmarks, heading order, visible labels, accessible names, help/error links, focus visibility/trap/restore, keyboard composite controls, and live regions.
- Do not use color as the only signal.
- Contrast: normal text `4.5:1`, large text `3:1`, focus/non-text controls `3:1`.
- Minimum touch target `44px`; prefer `48px` for operational controls.
- Verify keyboard-only use, 200% zoom, reduced motion, and representative Axe runs.
- VoiceOver/Safari and TalkBack/Android are manual evidence for critical paths and must not be simulated by source tests.

Exit: no serious/critical Axe violations on representative surfaces; shared primitives meet the keyboard/focus contract; critical flows have assistive-technology evidence or an explicit environment blocker.

## 7. P4 — Tailwind CSS, raw CSS, and Motion

- Tailwind CSS 4 is the default for layout/visual composition.
- Move raw static CSS to semantic tokens/utilities unless it is a valid exception.
- Keep inline style only for runtime geometry/chart/progress or a documented boundary.
- Do not add an animation framework, decorative loop, or `transition-all`.
- Motion serves state transitions, hierarchy, or direct feedback and always has
  reduced-motion behavior.
- Reduce the debt baseline only after consumers migrate and tests/audits are green.

## 8. P5 — Native-quality PWA

Apply Apple HIG, the Liquid Glass boundary, Material Design 3, Android adaptive
layout, WCAG 2.2, and web-platform best practices directly.

- Standalone chrome, safe area, touch feedback, and keyboard/viewport recovery.
- Adaptive bottom navigation, sidebar, and two-pane layout with the same IA.
- Do not depend on hover, disable zoom, or move critical actions outside thumb reach.
- Use Liquid Glass only for transient navigation/overlay/chrome; never cover data
  tables, forms, or operational workspaces.
- Provide contrast fallback and reduced-transparency behavior.
- Verify manifest, scope, install, update, offline recovery, asset reachability,
  and network-only boundaries.

Out of scope: Capacitor, Flutter, Swift/Kotlin rewrite, native wrapper, and
hardware bridge until a real need exists.

## 9. P6 — Layout and UI Interface Rollout

Every route must have `keep`, `tune`, or `rebuild` disposition; `keep` also
requires evidence. Rollout order:

1. Global chrome and shared state frames.
2. POS.
3. KDS.
4. Runner.
5. Self-order.
6. Branch runtime: landing, shift/attendance, inventory, staff, management.
7. Owner operations: Inventory, Finance, HR/payroll, Reports, Menu/configuration,
   and Settings/admin.
8. Public/system: login, QR/public, denied, offline/error, install/update.

Hot paths retain this information hierarchy:

```text
Next action or live queue
→ current context
→ primary work content
→ secondary data
```

Do not turn POS/KDS/Runner/Self-order into dashboard-card grids. Desktop may be
denser, but must keep the mobile IA.

### Process for Each Route-family Tranche

1. Record the UI Advisor Gate.
2. Lock actor, job, primary action, and recovery.
3. Choose the archetype, exemplar, and shared components.
4. Design applicable loading/empty/error/success/partial/blocked/permission/
   offline states.
5. Implement layout and interaction at the highest reasonable shared owner.
6. Verify accessibility and the viewport matrix.
7. Run focused tests, typecheck, lint, and build according to risk.
8. Update contracts/regressions only when the finding is shared.
9. Move automatically to the next tranche.

Run C2 after operational hot paths and after all P6 work; the three agents keep
the C0 review roles, and Codex is the final arbiter.

### P6.0a — UI Advisor Gate: offline system state

- Actor: any user when disconnected.
- Job: understand network status, know that data has not loaded, and retry when
  connectivity returns.
- Archetype: `GATE/AUTH`; shared composition: `AppPage`, `AppEmptyState`, `Button`.
- Primary action: `Thử lại`; no competing secondary action.
- Disposition: `tune` because the runtime contract, service-worker fallback,
  theme hydration, and contrast were adjusted at the shared owner; keep the
  current visual hierarchy.
- Evidence: local production build, no serious/critical Axe violation at
  `390×844` and `1440×900`, working operator offline fallback, and POS/Self-order
  still `NetworkOnly`.

### P6.0b — UI Advisor Gate: global recovery chrome

- Actor: any role leaving a detail/document workflow or recovering from a root error.
- Job: return to the previous context or retry without targeting a control that is
  too small.
- Shared owner: `AppBackLink` and root `global-error`; do not create route-local back buttons.
- Primary action: back or retry for the current state; add no competing navigation.
- Disposition: five Inventory detail/document routes move to
  `tune/implemented-static/open`; not final because the worktree has no
  authenticated browser target.
- Implementation: `AppBackLink` composes `Button` with `touch`/`icon-touch`,
  inherits the focus keyline, and has a fallback accessible name; raw
  global-error retry keeps a minimum `44px` hit target.

### P6.1a — UI Advisor Gate: POS shell and loading state

- Actor: cashier and Branch Manager opening a shift, selecting tables/items, checking a bill, and collecting payment.
- Job: see the current order and next action while the session/menu hydrates; PWA install/update/offline banners must not overflow or clip the workspace.
- Archetype: `BOARD`; preserve `next action/current order → menu/table context → bill → secondary session data`, without converting it into a dashboard-card grid.
- Shared owner: the outer POS layout owns the viewport; `PosPageSkeleton` owns only the flex space below the PWA toolbar.
- Primary action: continue the sales task after loading; this tranche changes no data, action, breakpoint, route authority, or business flow.
- Disposition: `tune/implemented-static/open`; not final because the worktree has no authenticated test target/session.
- Implementation: remove nested `h-dvh`, pass flex ownership through the Boneyard wrapper, and let the menu pane grow with `min-w-0 flex-1`; retain the two-pane `xl` breakpoint.

### P6.1b — UI Advisor Gate: KDS live queue

- Actor: kitchen staff monitoring the realtime queue and Branch Manager providing operational support.
- Job: see the next ticket, current station/filter context, and completion controls without the board being clipped by the PWA toolbar.
- Archetype: `BOARD`; preserve `live queue → station/filter context → ticket work → history/settings`, without converting it into a dashboard-card grid.
- Shared owner: the KDS layout owns the viewport; the board, loading, and error states own the remaining flex space.
- Primary action: mark a ticket ready; history, audio, fullscreen, and theme remain secondary controls.
- Disposition: `tune/implemented-static/open`; not final because authenticated KDS session and viewport runtime evidence are missing.
- Implementation: remove nested `h-dvh` from `KdsBoard` and let loading/error states fill the remaining workspace; do not change realtime, filtering, permission, mutation, or breakpoint behavior.

### P6.1c — UI Advisor Gate: Runner calling board

- Actor: service staff tracking the next food to deliver and guests viewing the branch calling board.
- Job: see the next order, item count, status, and wait time on a stable board when the PWA toolbar appears.
- Archetype: `BOARD`; preserve `next order → current queue → overflow queue → secondary Wi-Fi footer`.
- Shared owner: the Runner layout owns the viewport; queue, inline error, loading, and route error fill the remaining flex space.
- Primary action: Runner is an observation/call board; add no action, dashboard card, or interaction outside the flow.
- Disposition: `tune/implemented-static/open`; not final because authenticated/standalone Runner runtime evidence is missing.
- Implementation: remove nested `h-dvh` from the queue and inline error, normalize loading/error boundaries around the remaining workspace, and retain polling, queue ordering, the light-only contract, and responsive row limits.

### P6.1d — UI Advisor Gate: Self-order guest workflow

- Actor: guests scanning a table QR code to view the menu, select items, check the bill, send requests, and pay.
- Job: always see the current table/menu context and next cart action without double safe-area padding or nested viewport clipping.
- Archetype: `WORKFLOW`; preserve `current table/menu → menu content → cart/bill action → payment/recovery state`, without converting it into a dashboard-card grid.
- Shared owner: `AppPage mobile` only constrains workflow width and does not reserve fixed chrome; the Self-order owner provides content clearance and safe area for the Cart CTA.
- Primary action: open the cart or continue the current bill/payment state; this tranche changes no request/payment, data, route authority, or business flow.
- Disposition: `tune/implemented-static/open`; the unavailable state has public browser/Axe proof, while active ordering/payment remains open because the worktree has no registered environment or valid QR token.
- Implementation: remove implicit `pb-28`, remove inner `h-dvh` from the active workflow, let unavailable/completed/not-found states fill the viewport through flex ownership, and retain `pb-44` and `workflow-safe-pb` at the action owner.

### P6.2a — UI Advisor Gate: Branch landing, shift, and shared loading

- Actor: Branch staff and Branch Manager starting a shift, viewing the queue, opening a station, or entering the next HR/inventory task.
- Job: see `today status → pending queue → station/primary work → support` before drilling down; loading must not build another page shell inside the operator shell.
- Archetype: Branch home `LANDING`, shift wrapper `EMBED-WRAPPER`; bottom navigation retains daily job families and management stays in secondary navigation.
- Primary action: depends on the current work state (attendance, continuing a checklist, opening a station, or handling a queue); add no dashboard KPI/card grid.
- Disposition: landing and shift composition keep `keep/source-baseline/open` because hierarchy, touch controls, and recovery are correct; the shared loading state is `tune/implemented-static` without promoting separately unaudited pages to final.
- Implementation: all seven operator loading boundaries use `PageSkeleton bare`, reuse the layout-owned `AppPage`, and remove nested width/padding shells; one regression locks the full route group.

### P6.2b — UI Advisor Gate: Branch on-hand list

- Actor: Branch Manager or inventory staff looking up current stock and opening an ingredient detail.
- Job: scan name, type/SKU, stock level, and warnings on a phone; filter and receiving remain context/exception actions and do not compete with row navigation.
- Archetype: `LIST`; preserve `attention exception → search/filter → dense stock list → ingredient detail`.
- Primary action: tap a row to open ingredient detail; add no quick mutation to the read-only lookup screen.
- Disposition: `tune/implemented-static/open`; authenticated touch/scroll proof for the defined matrix is still missing.
- Implementation: replace spaced 64px card rows with a semantic 44px list and separators, with no gap or repeated outer card; retain accessible `list/listitem`, risk badge, quantity, filter states, and GRN action ownership.

### P6.2c — UI Advisor Gate: Branch inventory entry workflows

- Actor: Branch Manager or inventory staff receiving goods, opening/continuing a stocktake, and looking up consumption in the correct branch.
- Job: move from the stock landing to the correct workflow; every flow exposes its next action, document state, filter, and recovery state without an Owner dashboard intruding.
- Archetype: stock root `LANDING`; GRN/stocktake/consumption `LIST` routes lead to `DOC-WORKFLOW` or typed detail.
- Primary action: stock root prioritizes stock, receiving, and production; GRN prioritizes creating/continuing a document, stocktake prioritizes opening/continuing a count, and consumption prioritizes recorded truth before a manual slip.
- Disposition: stock landing, stocktake, and consumption keep `keep/source-baseline/open`; GRN is `tune/implemented-static/open` because search and status filters need stable accessible names. Runtime remains open because no authenticated inventory target is available.
- Implementation: add `aria-label` to the GRN search and status trigger at the route owner, retain 80px rows for drafts/receipts with multiple metadata fields and destructive actions, and do not apply the 44px read-only on-hand density to document workflows.

### P6.2d — UI Advisor Gate: Branch Team workspace

- Actor: Branch Manager monitoring active staff, shifts requiring action, unsubmitted counts, and concise employee profiles.
- Job: see the exception/action queue first, filter by status, then drill into a drawer to process checkout/count or contact staff.
- Archetype: `BOARD` for the live team and `LIST`/directory for members in one touch-tab workspace; do not create a Branch account/permission module.
- Primary action: the board prioritizes `needs_action`, then `working`, then `all`; approval actions appear only in the detail drawer under existing permission.
- Disposition: `keep/source-baseline/open`; source already has touch tabs, overflow-safe filter chips, grouped mobile cards, a scroll-owned drawer, empty/error/no-access states, and named controls. Not final because authenticated phone/tablet evidence is missing.
- Implementation: make no source changes after the Advisor Gate; retain ACL, permission probes, attendance/count actions, and Owner-vs-Branch authority.

### P6.2e — UI Advisor Gate: Branch management surfaces

- Actor: Branch Manager checking recent orders, POS sessions, menu limits, and floor/KDS/printer configuration for the correct branch.
- Job: handle live exceptions first, then drill into a document or configuration; do not bring Owner analytics or tenant-wide administration into the Branch shell.
- Archetype: orders and POS sessions `LIST/DETAIL`; menu limits `LIST` with swipe/drawer; settings root `LANDING` leading to `SETTINGS-PANEL` screens using shared embedded clients.
- Primary action: active orders, session variance, sold-out/disabled menu items, or the corresponding setup control; mutations live in typed sheets/drawers/forms rather than dashboard cards.
- Disposition: `keep/source-baseline/open`; source already has touch tabs/rows, exception-first sorting, accessible search/fields, one-scroll drawers, permission-filtered settings links, and embedded shared forms. Not final because authenticated Branch Manager runtime is required.
- Implementation: make no source changes after the Advisor Gate; retain POS/KDS/Printer/Table clients at the shared settings owner and preserve existing authority.

### P6.3a — UI Advisor Gate: Owner Inventory

- Actor: Owner overseeing stock, receiving, transfers, stocktakes, consumption, and cross-branch master data.
- Job: see tasks/exceptions first, enter the correct operational flow, then read KPIs and progress; Branch remains a filter/scope, not a separate IA.
- Archetype: inventory root `DASHBOARD`; queues are `LIST`, documents are `DOC-WORKFLOW`, details are `DETAIL`, reports are `REPORT`, and configuration is `SETTINGS-PANEL`.
- Primary action: an open task/alert and its corresponding flow card; KPIs drill down only when a direct data contract exists.
- Disposition: `keep/source-baseline/open`; the root already has `tasks/priority alerts → main flows → compact KPIs → active work`, and subroutes use shared list/detail/form contracts. Not final because the authenticated Owner matrix is missing.
- Implementation: make no source changes; retain existing route paths, scope, query, and inventory authority.

### P6.3b — UI Advisor Gate: Owner Finance

- Actor: Owner monitoring financial health, cash flow, reconciliation, expenses, revenue, HĐĐT, and supplier payables.
- Job: select a period/scope, read four directly contracted KPIs, check current funds, and process the exception queue; detail/report IA does not change by viewport.
- Archetype: finance root `DASHBOARD`; revenue/food-cost `REPORT`; bank/expenses/invoices/supplier invoices `LIST/DETAIL`.
- Primary action: drill down from a KPI or exception with an `href`; do not promote inferred metrics to KPIs or put settlement actions in decorative cards.
- Disposition: `keep/source-baseline/open`; existing regressions lock KPI order, the direct-contract set, DataTable/mobile-card composition, fail-closed initial state, and shared filters. Not final because authenticated Finance runtime is missing.
- Implementation: make no source changes; retain payment, SePay, HĐĐT, and supplier-payment business authority.

### P6.3c — UI Advisor Gate: Owner HR and payroll

- Actor: Owner managing employee records, attendance, payroll, and deep-linking to accounts/permissions when needed.
- Job: filter the list first, act on an employee/payroll row, and open access from a secondary action; do not turn “Tài khoản & quyền” into a peer business module.
- Archetype: HR root/staff/attendance/payroll `LIST`; payroll periods and permissions are `DETAIL`; HR setup is `SETTINGS-PANEL`.
- Primary action: add an employee or process the current row/period; account access is secondary header/deep navigation.
- Disposition: `keep/source-baseline/open`; source uses `AppPage`, responsive DataTable/mobile cards, touch header actions, shared status domains, and typed dialogs. Not final because authenticated HR runtime is missing.
- Implementation: make no changes to source, ACL, RPC, or payroll flow.

### P6.3d — UI Advisor Gate: Owner reports, menu, settings, and administration

- Actor: Owner configuring the menu, operating sites, tenant/payment/printing, and decision-support reports/details.
- Job: list/filter first, open the correctly scoped form/detail, and distinguish empty data from load failure.
- Archetype: Menu and Branches are `LIST`; Settings is `LANDING/SETTINGS-PANEL`; print jobs are `LIST`; report surfaces are `REPORT`.
- Primary action: add/edit an entity or handle a monitoring exception; settings landing only links to permissioned configuration groups.
- Disposition: Menu/Settings/reports keep `keep/source-baseline/open`; `/branches` is `tune/implemented-static/open` because query errors were previously rendered as an empty list.
- Implementation: `/branches` catches Supabase errors and renders shared `AppEmptyState mode="error"` with centralized copy; a static regression locks the failure-vs-empty distinction without changing branch CRUD or authority.

### P6.4 — UI Advisor Gate: Public and system surfaces

- Actor: unauthenticated staff, users denied access, disconnected operators, and QR Self-order guests.
- Job: understand the current state immediately, have one clear recovery action, and avoid exposing or routing data across public, authenticated, or NetworkOnly boundaries.
- Archetype: login/access-denied/offline are `GATE/AUTH`; root not-found/error is a shared recovery frame; Self-order is `PUBLIC-WORKFLOW`.
- Primary action: sign in, return to the default route/sign out, retry when online, or continue the guest workflow; all important controls use named touch sizes.
- Disposition: `/offline` and `/access-denied` are `tune/browser-runtime/final`; login is `tune/browser-runtime/open` because visual/Axe passes but auth success needs a registered target; the Self-order active flow remains `tune/implemented-static/open`, while its unavailable state has public runtime proof.
- Implementation: use `size="touch"` for offline retry; remove the decorative infinite mascot loop from login; use semantic Badge variants instead of route-local tone classes for access-denied; Axe passes at `390×844` and `1440×900`, and offline retry measures ≥44px. Login runtime uses a local-only Supabase placeholder to render the proxy path without connecting to Cloud.

## 10. P7 — Release Gate and Self-Improving Loop

Each tranche runs at most two loops:

```text
Observe
→ Measure
→ Challenge
→ Fix at the highest shared owner
→ Verify
→ Encode durable learning
```

Track:

- Legacy token/alias count.
- Raw CSS/inline-style exception count.
- Direct primitive escapes and duplicate-wrapper count.
- Page-archetype and keep/tune/rebuild coverage.
- Axe, overflow, responsive, motion, and PWA failures.
- POS/KDS/Self-order hot-path performance.

Promote to a shared component only when there is a clear semantic role or multiple real consumers.

Each wave runs focused tests, `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm build`, and `codegraph index .` according to risk. The full program runs `corepack pnpm verify`, the authenticated browser matrix, production-like PWA proof, VoiceOver/TalkBack proof, `git diff --check`, and final C0/C1/C2 reconciliation.

## 11. Current evidence summary

The program has completed its source/static rollout across 17 tranches. The route
census covers 123/123 pages. Current disposition is 107
`keep/source-baseline/open`, 13 `tune/implemented-static/open`, 1
`tune/browser-runtime/open`, and 2 `tune/browser-runtime/final`.

The shared design-system foundation, CSS/motion ratchets, PWA boundary, public
recovery surfaces, and focused responsive contracts are implemented. Evidence
does not promote protected routes to browser-final without authenticated runtime
proof. Static tests, typecheck, lint, build, and repository verification remain
separate gates; none is a substitute for browser, PWA, or assistive-technology
evidence.

## 16. Open gates and next steps

- Authenticated Branch/Owner Axe and viewport matrices require `.env.test.local`, auth storage, and a registered test target; do not use credentials or remote databases with unclear authority.
- VoiceOver/Safari, TalkBack/Android, installation, and the real standalone shell remain separate manual/runtime evidence; desktop Chrome manifest/update and operator offline recovery already have local production-like proof.
- The P6 source/static rollout is complete for all 17 tranches. P7 next runs three authenticated Axe/viewport cases, VoiceOver/TalkBack critical paths, and install/update/standalone proof on an authorized target; a route becomes `final=true` only when its corresponding evidence exists.
