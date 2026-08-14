# Current Tasks

> Active outcomes only. Workflow and field rules live in
> `docs/agent/rules/workflow.md` → Current Task Lifecycle. Shipped work lives in
> git; deterministic failures live in `tasks/regressions.md`; durable lessons
> live in `tasks/lessons.md`; stable contracts live in their owning docs.

## Redesign promotions create + apply (free side)

State: ready
Kind: feature
Tier: T3
Lane: promotions/pos
Exit: Owner creates any promo kind via kind-first DOC-WORKFLOW; cashiers/waiters apply codes and complete free-side selection; auto free-side offers appear without code; money lands on existing discount columns (ADR 0034); `corepack pnpm verify` green after Owner Accept of this design.
Evidence: Amended ADR 0039; migration + RPCs; Owner form + DiscountSheet/picker; static + RPC tests.

- [ ] Owner Accept design below (1B + code&auto free_side).
- [ ] Amend ADR 0039 / module / screen-map; add `free_side` kind + selection RPCs.
- [ ] Redesign Owner `/promotions` form (kind-first sections for all kinds).
- [ ] Redesign POS `Mã giảm` flow + free-side picker + auto offer chip.
- [ ] Targeted tests + `corepack pnpm verify`.

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

