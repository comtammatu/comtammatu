# Current Tasks

> Active outcomes only. Workflow and field rules live in
> `docs/agent/rules/workflow.md` → Current Task Lifecycle. Shipped work lives in
> git; deterministic failures live in `tasks/regressions.md`; durable lessons
> live in `tasks/lessons.md`; stable contracts live in their owning docs.

## Shorten shift punch, tasks, and checkout

State: verify
Kind: feature
Tier: T3
Lane: hr/self-service
Exit: Clock-in is one camera tap; in-shift tasks show short start/end phase rows; photo tasks cannot be marked done without a live photo; checkout is one tap on the personal shift page.
Evidence: Migration `20260817141000_shift_task_photo_required.sql` applied on Production `enloyfnuerqgaqderbwb` 2026-08-17 (batch with GRN). Catalog: toggle/checkout raise `photo_required`; attach sets `is_done = true`. Types unchanged. Static + SQL tests; `lint:copy`; `corepack pnpm verify` green 2026-08-17.

- [ ] Smoke: clock-in one tap; photo task rejects done without photo; capture marks done; checkout from `/br/.../shift`.

UI Advisor Gate
- Surface: `/br/[branchId]/shift` + `/shift/clock` + `/me/clock`; route family Branch personal day-flow / staff; plane: `branch` / `staff`; change: flow
- Context: screen-context-map §2.4A personal shift tab; actor: cashier/chef/branch_staff; job: punch, complete shift tasks, request checkout
- Journey: open shift page → camera → one tap clock-in → compact start then end tasks (photo = capture to complete) → one tap checkout; recovery: retake/upload if camera denied
- Information order: 1) current step action 2) task title 3) one-line hint; exclude: long done-definition walls, extra clock page hops, optional photo
- Pattern: LANDING; exemplar: `apps/web/lib/staff-runtime/page.tsx`; data display: Item list + live camera
- States: not_started, working, photo capture, checkout ready, pending, offline, camera denied
- Block: `employee-self-service`; components: Employee*/BranchOperator* + AppSheet; fallback: none
- Responsive/accessibility: phone primary; `playsInline` camera; labels on capture/checkout
- Verification: static UI + SQL functiondef tests, `lint:copy`, `lint:ui-contract`, `corepack pnpm verify`

## GRN partial, over-receipt, pack+loose units

State: verify
Kind: feature
Tier: T3
Lane: inventory/procurement
Exit: Partial receipt still allowed; over-receipt (gifts/extras) stocks at cost 0 instead of blocking confirm; warehouse staff can enter pack + loose units on one PO line; persist in the loose unit; remaining/apply compared in base.
Evidence: Migration `20260817122500_grn_receive_base_qty_and_excess.sql` applied on Production `enloyfnuerqgaqderbwb` 2026-08-17 (batch with shift-task photo). Catalog: confirm compares remaining in base via `inv_to_base`. Types unchanged. Model + static tests; `lint:copy`; `corepack pnpm verify` green 2026-08-17.

- [ ] Confirm Meizan draft `GRN-13082026-0055` (6 vs PO 4).
- [ ] Smoke pack+loose: PO 10 pack units, GRN 9+6 → `partially_received`; 10+6 → `received` with 6 loose units at cost 0.

UI Advisor Gate
- Surface: `/inventory/grn` document overlay + branch `/br/…/stock/grn/[id]` review; plane `control_surface` / `branch`; change: flow
- Context: screen-context-map §2.6; actor: warehouse receiving; job: record physical receipt per delivery
- Journey: Auto-GRN → pack+loose (or one field) → shortage/excess badge → confirm; recovery: next draft if shortage
- Information order: ordered qty (pack+loose) → accepted qty → rejected → applied/shortage/excess; exclude: purchase price
- Pattern: DETAIL/DOC existing GRN; exemplar `grn-line-row.tsx`
- States: draft edit, shortage, excess (warning, not block), QC reject, confirm
- Block: none — extend existing line row / draft card / branch line sheet
- Responsive: same two fields on desktop table and mobile card
- Verification: targeted GRN/model/SQL tests, `lint:copy`, `lint:ui-contract`, then `corepack pnpm verify`

## Control Surface layout rebuild (chrome, nav, compose)

State: verify
Kind: feature
Tier: T2
Lane: control-surface/layout
Exit: Control Surface uses one chrome at three densities (tablet inherits phone IA, shell 1024), restored inventory nav groups, four mobile work slots (stock / inbound / transfer / production), LIST/home compose without KPI mosaics or a full `fetchFinanceCockpit` on `/`, `/me` on Employee* adapters, `/notifications` chrome-less per design-system A.7, and Control overlays limited to FormDialog / AppDialog document / AppSheet D1. No new design system, tokens, Owner* kits, or AppDetailFrame. DataTable presentation cut stays 1024 unless the owner explicitly forks tablet tables at 768.
Evidence: WP0–WP10 landed in product code. Implementation canvas `control-surface-layout-implementation.canvas.tsx`; diagnosis + IA in `control-surface-layout-rebuild.canvas.tsx`; compose/overlay/data contracts in `control-surface-compose-wireframes.canvas.tsx`. `lint:copy`, `lint:ui-contract`, and `corepack pnpm verify` green after the last product edit. WP11 (DataTable 768) was not implemented.

- [ ] Owner smoke: phone inventory bottom nav is stock / inbound / transfer / production; desktop catalog cluster is collapsed; `/` does not pull the full finance cockpit; `/orders` LIST has no KPI mosaic; `/notifications` has no AppShell.

UI Advisor Gate
- Surface: Control Surface shell + primary tabs / deep nav / bottom nav; routes `/`, `/orders`, `/inventory`, `/me`, `/notifications`; plane: `control_surface`; change: layout
- Context: screen-context-map Control Surface; actor: owner/ops on L0; job: navigate and complete LIST/DOC work without competing chrome
- Journey: open Control → module tab → deep work (or modules drawer on phone) → list/filter → overlay D1 when needed; recovery: in-page back on chrome-less `/notifications`
- Information order: 1) scope + title 2) work 3) at most one list filter 4) bottom nav; exclude: Branch/station chrome, KPI mosaic on LIST/home, Ctrl+K
- Pattern: mixed LIST / LANDING / STAFF_EMBED / chrome-less notifications; exemplar: GRN list + settings AppLinkCard + EmployeePage
- States: loading, empty, permission, overlay D1, modules drawer
- Block: `app-shell` / `control-surface-nav` / `AppListFrame` / `FormDialog`; components: existing App* / Employee* only; fallback: none — no second DS
- Responsive/accessibility: one H1, max two sticky bands on phone; tablet uses phone IA until 1024; DataTable cards below 1024 unless owner forks
- Verification: `lint:ui-contract`, `lint:copy`, targeted control-surface tests, then `corepack pnpm verify`

## POS convert completed cash orders to VietQR

State: verify
Kind: feature
Tier: T3
Lane: pos/payment
Exit: From POS `Đơn hoàn thành`, a cashier can convert a paid cash order to VietQR, stamp a payment code, and print the VietQR receipt; money remains on `payments.method` with closed-session cash recalc.
Evidence: RPC `pos_convert_cash_payment_to_vietqr` applied on Production `enloyfnuerqgaqderbwb`; `20260816113818_receipt_print_vietqr_for_paid_orders.sql` applied (ledger `20260816113818`); `corepack pnpm db:types` (no generated-type diff); advisors only the pre-existing `enqueue_receipt_print` SECURITY DEFINER grant; `corepack pnpm verify` green on the print-render + trigger fix.

- [ ] Reload POS, convert one paid cash order in completed orders, and confirm the VietQR slip has a scannable transfer QR.
- [ ] Confirm dialog appears on Convert to VietQR (button must not spin until after confirm).

UI Advisor Gate
- Surface: `/br/[branchId]/pos` completed-order sheet + receipt; route family station POS; plane: `station_chrome`; change: flow
- Context: screen-context-map §2.1 POS; actor: cashier (`pos:confirm_payment`); job: reclassify cash → VietQR and print QR
- Journey: open `Đơn hoàn thành` → cash paid row or receipt → confirm → convert + print; recovery: reprint / Finance bidirectional correction
- Information order: 1) completed list 2) bill amount + current method 3) convert/print; exclude: Finance vietqr→cash
- Pattern: BOARD; exemplar: `apps/web/app/(protected)/br/[branchId]/pos/_components/archived-orders-sheet.tsx`; data display: station list + StationSheet
- States: loading, empty, confirm, pending, success, print failsoft, permission, vietqr unconfigured
- Block: `pos-board`; components: `StationSheet`, `Button`, `confirm` dialog; fallback: receipt sheet actions
- Responsive/accessibility: touch targets; labels on convert/print; keyboard via confirm dialog
- Verification: static contract tests; `corepack pnpm verify` after implementation

## Redesign promotions create + apply (free side)

State: verify
Kind: feature
Tier: T3
Lane: promotions/pos
Exit: Owner creates any promo kind via kind-first DOC-WORKFLOW; cashiers/waiters apply codes and complete free-side selection; auto free-side offers appear without code; money lands on existing discount columns (ADR 0034); `corepack pnpm verify` green after Owner Accept of this design.
Evidence: Amended ADR 0039 / module / screen-map; migration `20260814114800_promotion_free_side.sql` applied on Production `enloyfnuerqgaqderbwb`; `corepack pnpm db:types`; Owner form + POS flow; `promotions-static` 4/4; `corepack pnpm verify` green.

- [ ] Live smoke: Owner create free_side (Com suon buy + Bi/Cha/Trung get, N=1, Code+Auto) -> POS code pick side -> auto offer chip pick side.

## Fix paid-receipt reprint and VAT-inclusive bill print

State: verify
Kind: defect
Tier: T3
Lane: pos/print
Exit: Cashier reprint of a paid receipt reaches the branch agent; provisional bill and payment receipt print menu line amounts and subtotal as VAT-inclusive, omit GTGT rate lines, then service/discount and grand total as the payable amount.
Evidence: print-agent UPDATE + always-on pending drain; print-render VAT-inclusive subtotal; POS print/reprint permission OR-gate; `corepack pnpm verify`.

- [ ] Redeploy print-agent 1.0.4 at Nguyen Huu Tho and reprint one paid receipt.
- [ ] Print one provisional bill and one payment receipt; confirm line amounts/subtotal are VAT-inclusive and grand total applies service/discount only.

## Close inventory RPC and loader cleanup

State: verify
Kind: defect
Tier: T3
Lane: inventory/procurement
Exit: Owner `/inventory/purchase-orders` (no branch filter) no longer times out; dead PO-first/GRN-draft/stocktake actions are gone; inventory RLS permission checks are initplan-wrapped; orphan inventory RPCs are dropped after a 6-channel scan; remaining nested list loaders are flattened and YCH deep links use `/inventory/transfers?requestId=`.
Evidence: Flattened purchase workspace loader; `includeUnits: false` plus companion units on PO/YCM pages; dead-action deletions; RLS wrap + DROP applied on Production `20260813142100` / `20260813142200`; `corepack pnpm db:types`; `corepack pnpm verify`.

- [ ] Owner smoke `/inventory/purchase-orders` unfiltered and one GRN confirm path.

## Ship notification attention on Control Surface

State: verify
Kind: feature
Tier: T2
Lane: notifications/attention
Exit: Owner control-surface routes show Sonner on a visible tab and OS popup when the tab is hidden; bell peek works on desktop Popover / mobile Sheet; `/notifications` is a LIST feed with device permission in the toolbar.
Evidence: `NotificationAttentionRuntime` mounted once from `ControlSurfaceShell`; `useForegroundNotifications` removed from `PwaRuntimeProvider`.

- [ ] Mount one attention runtime for every `(protected)` route and keep POS/KDS popup-only.
- [ ] Ship compact bell peek without colliding the full-page Realtime topic.
- [ ] Move device notification settings onto the `/notifications` LIST toolbar.

## Prove one money day on Production

State: blocked
Kind: defect
Tier: T3
Lane: pos/operational-truth
Exit: On Production, one cash order and one VietQR order show the same completed-payment money and `paid_at` day on `/orders`, Branch POS session, and `/finance/revenue`; KDS/print quantities remain separately named when kitchen evidence is in scope.
Evidence: Fund opening exists on Production; Branch 3 sellable catalog and tables empty (`menu_items=0`) — no POS order until seed + POS credential.
Blocker: Owner-only — seed Branch 3 (`Nguyễn Hữu Thọ`) catalog + tables; set VietQR payment settings + deployed `SEPAY_WEBHOOK_SECRET`; operate POS with owner/cashier login the agent does not hold.

- [ ] Seed the Branch 3 sellable catalog and tables, then confirm `menu_items > 0` before attempting POS.
- [ ] Place one completed cash order and one completed VietQR order on Branch 3 after the fund opening.
- [ ] Capture `/orders`, POS session, and `/finance/revenue` for the same Vietnam `paid_at` day and confirm totals match.
- [ ] If selling category `Khác` (Other), map its kitchen printer before treating slip mismatch as a money bug.

## Verify the current Inventory topology

State: blocked
Kind: qa
Tier: T3
Lane: inventory/topology
Exit: Every active site has exactly one active warehouse; GRN remains central-only, Branch receives transfer, and the authenticated Owner/Branch Inventory journeys pass at `390`, `768`, and `1280`.
Evidence: Migrations, database types, Inventory contract tests, Production catalog checks, repository gates; topology sites = `Kho Tổng` + `Bếp Trung Tâm` + NHT (one selling branch).
Blocker: Authenticated live smoke at `390` / `768` / `1280` needs an owner-delegated Production Owner or Branch Manager credential (ephemeral QA accounts deleted 2026-08-10).

- [ ] Run authenticated Owner/Branch Inventory smoke at `390`, `768`, and `1280`, then remove this outcome when every Exit item is evidenced.

## Ship INV-10 suggested editable request quantity

State: verify
Kind: feature
Tier: T2
Lane: inventory/requests
Exit: Choosing an ingredient on stock-request and purchase-request editors prefills an editable quantity from `max(0, min_stock_level - current_quantity)` (base unit for stock requests; default pack for purchase requests).
Evidence: `suggested-order-qty.ts`, request/purchase loaders, editor `chooseIngredient` prefill, unit test; Branch 3 YCH smoke (`Gạo` prefill then cancel) during `[QA-SMOKE-20260810]`.

- [ ] Smoke prefill on one purchase-request editor after login (needs Production credential; ephemeral QA accounts deleted).

## Accept INV-9 consolidation design (ADR 0032)

State: blocked
Kind: qa
Tier: T2
Lane: inventory/procurement
Exit: Owner Accepts or revises ADR 0032 so INV-9 build can start; no consolidation code ships before Accept.
Evidence: `docs/plan/adr/0032-purchase-demand-consolidation-design.md`; ADR 0029 pointer.
Blocker: Owner decision on junction naming and short-delivery rule.

- [ ] Owner Accept / revise ADR 0032; only then open an INV-9 implementation outcome.

## Decide inventory valuation cutover and POS stock flag go-live

State: blocked
Kind: qa
Tier: T3
Lane: inventory/valuation
Exit: The owner has answered the open questions below, and the answers are recorded in the owning doc or a design ADR — not in this entry — so cutover activation and the `pos_stock_outcome_posting` go-live can be planned as normal work.
Evidence: Owner workshop outcome; `apps/web/lib/finance/finance-cockpit.ts:203` and `apps/web/lib/finance/expense-actions.ts:568` gate food cost on cutover `status === 'active'`; `prepare_/activate_inventory_valuation_cutover` are `GRANT … TO service_role` only with no UI (`supabase/migrations/20260802162900_baseline.sql:89302-89303`).
Blocker: Owner-only — needs investigation and discussion before any decision. Explicitly parked, not deferred by the agent. Do not write an Accepted ADR for this until the workshop happens.

Open questions for the workshop:

- What does "valuation cutover" mean in operations language, stated without accounting vocabulary?
- Which business date is the cutover day, and what happens to movements before it?
- Who produces the opening stock quantities and unit costs, and how are they verified before activation?
- Should food-cost screens be visible before activation (showing that they are inert), or stay hidden until cutover is active?
- How does activation relate to the `pos_stock_outcome_posting` branch flag: flipped at the same moment, staged per branch afterwards, or independent?
- Reconciliation only iterates tenants that already have a cutover row, and its results have no screen (INV-14). Does the output need a surface, or does it reach the owner through an existing notification?

- [ ] Hold the owner workshop, then record the answers in `docs/ref/inventory.md` / `docs/modules/finance.md` or a design ADR and delete this entry.

## Remove compatibility payment writes

State: blocked
Kind: release
Tier: T3
Lane: finance/payments
Exit: Legacy `create_supplier_payment` and authenticated direct `payments` UPDATE are absent; owner-operated Preview schema/type/advisor gates pass; the separately owner-delegated Production apply and smoke are evidenced.
Evidence: Required-key proof from the preceding outcome, catalog/ACL checks, generated-type no-diff, repository gates, advisors, and explicit Production apply/smoke evidence.
Blocker: Production baseline still exposes legacy `create_supplier_payment` to `authenticated` and `GRANT … UPDATE ON public.payments TO authenticated` — drop only after owner-authorized required-key runtime proof.

- [ ] Revoke authenticated direct `UPDATE` on `payments` and drop legacy `create_supplier_payment` only after the required-key runtime proof.
- [ ] Apply the cleanup only through the trusted registration/owner-operated Preview path; regenerate types from the explicit Production source and run repository gates plus database advisors.

## Prove Work module pilot smoke

State: verify
Kind: feature
Tier: T2
Lane: work/control-surface
Exit: Owner member can open Inbox and task DETAIL; a user without membership is denied; 7-day `Văn phòng` pilot has no RLS leak.
Evidence: `work_*` migrations + types; ACL `work`; nav `Công việc`; Inbox/Board/Calendar/Timeline UI; control-home `work:mine-due`; `/me` CTA; static + pgTAP; runbook `docs/runbooks/work-module-pilot-rollback.md`. ADR 0033 / screen-map `/work` Accepted.
Pilot department seed label: **`Van phong`** (product UI keeps the Vietnamese label).

- [ ] Smoke Inbox as Owner member and deny path for a user without membership; 7-day pilot watch.

## Work UI compose redesign (ADR 0035)

State: verify
Kind: feature
Tier: T2
Lane: work/control-surface
Exit: Owner adds a Van phong member who then opens `/work`; create CTA + DETAIL StatusBadge + inline toolbar filters pass manual smoke.
Evidence: ADR 0035 Accepted; W-UI-4..3 app code; Production migration `20260812140000_work_department_membership_admin.sql` applied; `db:types` regenerated; work-module-static green; RPCs verified on Production.

- [ ] Manual exit: add Van phong member via `/work/team` → that user opens `/work`.

## Burn down frozen Má Tư DS debt

State: doing
Kind: debt
Tier: T3
Lane: design-system/enforcement
Exit: Every frozen budget below trends down by removing allowlist entries (ratchet only fails on growth, so burned files may be dropped); the 40 `tune` pages reach `keep`/`final` disposition through the three exemplar waves. Never raise a budget; new files start at 0.
Evidence: `scripts/check-ui-contract.mjs` `legacy-debt-ratchet` guards (frozen 2026-08-13); `corepack pnpm audit:ui-components` Page Disposition Coverage; exemplar fixes in `finance/components/filter-bar.tsx`, `team/team-workspace-tabs.tsx`, `work/_lib/compose-styles.ts`, and the icon-tier batch.

Frozen debt per guard (burn down to zero):

| guard | frozen hits | files |
| --- | --- | --- |
| `arbitrary-dimension` | 85 | 53 |
| `presentation-inline-style` | 13 | 7 |
| `font-bold-lock` | 26 | 15 |
| `hex-literal-app` | 15 | 2 |
| `off-tier-radius-app` | 6 | 1 (ds-lab tier demo — keep until ds-lab cleanup) |
| `icon-size-tier` | 0 | 0 |
| `chrome-class-constant` | 0 | 0 |

`audit:ui-components` tune pages (40) in three waves, each anchored to an Exemplar Matrix exemplar:

- [ ] Wave 1 — control_surface LIST/DETAIL pages follow `apps/web/app/(protected)/inventory/grn/page.tsx`. Burned so far: `inventory/production/new/production-new-client.tsx` (4 hits → flex + `max-w-44`/`w-22` named scale) and the `font-bold` → `font-semibold` batch (`finance/revenue/[date]/revenue-drill-tabs.tsx`, `finance/revenue/revenue-client.tsx`, `components/form/photo-upload-input.tsx`).
- [ ] Wave 2 — branch `(operator)` pages follow `apps/web/app/(protected)/br/[branchId]/(operator)/page.tsx`.
- [ ] Wave 3 — station plane pages follow `apps/web/app/(protected)/br/[branchId]/kds/page.tsx`; spot-check light + dark at the station viewport.

