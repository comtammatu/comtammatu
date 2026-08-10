# Current Tasks

> Active outcomes only. Workflow and field rules live in
> `docs/agent/rules/workflow.md` → Current Task Lifecycle. Shipped work lives in
> git; deterministic failures live in `tasks/regressions.md`; durable lessons
> live in `tasks/lessons.md`; stable contracts live in their owning docs.

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

## Pilot POS stock post-and-flag on one Production branch

State: done
Kind: qa
Tier: T3
Lane: inventory/pos-posting
Exit: On one Production branch with `pos_stock_outcome_posting` enabled, a stock-exhausted cashier insert hard-blocks; Branch Manager `Cho phép bán thêm` reopens sell without ledger replenish; payment still completes and posts per-ingredient consumption (negative on-hand allowed) with a branch-reachable follow-up when short; short receive requires classification and attributes shortfall to the shipping site.
Evidence: Sole selling branch is NHT (`branch_kind=branch` id=3); `Kho Tổng` / `Bếp Trung Tâm` are not POS surfaces. Flag ON only on NHT. ADR 0026/0028/0030; hard-block → allowance → paid order post+followup; valuation shortfall migration; short receive source_variance + transit_loss; copy-to-new-draft UI; QA data purged + sales sequences reset 2026-08-10.

- [x] Re-smoke post-and-flag / follow-up after valuation conflict is resolved.
- [x] Smoke short transfer receive with `source_variance` and `Nhận thiếu` (`transit_loss`) classification.
- [x] Smoke copy-to-new-draft on a rejected stock or cancelled purchase request.

## Ship INV-10 suggested editable request quantity

State: verify
Kind: feature
Tier: T2
Lane: inventory/requests
Exit: Choosing an ingredient on stock-request and purchase-request editors prefills an editable quantity from `max(0, min_stock_level - current_quantity)` (base unit for stock requests; default pack for purchase requests).
Evidence: `suggested-order-qty.ts`, request/purchase loaders, editor `chooseIngredient` prefill, unit test; Branch 3 YCH smoke (`Gạo` prefill then cancel) during `[QA-SMOKE-20260810]`.

- [x] Smoke prefill on Branch 3 stock request editor after login.
- [ ] Smoke prefill on one purchase-request editor after login (needs Production credential; ephemeral QA accounts deleted).

## Close INV-12 stocktake reason codes

State: done
Kind: feature
Tier: T3
Lane: inventory/stocktake
Exit: Stocktake variance lines store constrained `reason_code` (waste enum); complete requires code when adjustment ≠ 0; ADR 0031 accepted direction.
Evidence: Production apply `20260810022059_stocktake_variance_reason_code.sql` (2026-08-10); catalog `stocktake_lines.reason_code`; stocktake UI dropdown; ADR 0031; Branch 3 session 19 smoke completed with gate `stocktake_reason_code_required` then `found_missing`; session purged with QA cleanup.

- [x] Smoke complete-with-variance requiring `reason_code` on Branch or central stocktake.

## Production QA smoke (owner-delegated 2026-08-10)

State: done
Kind: qa
Tier: T3
Lane: inventory/pos-posting
Exit: Branch 3 INV-10/12 + pilot post-and-flag smoke evidenced; QA drafts cancelled; ephemeral QA accounts deleted; baselines match pre-session for open drafts/stocktakes.
Evidence: Marker `[QA-SMOKE-20260810]`; smoke outcomes closed; hard purge 2026-08-10 removed order 11, transfers 90–92, stocktake 19, YC 0003–0005, movements/valuation events, notifications, and BM/cashier/ops accounts; stock_levels restored (`Tiêu Kho Tổng` 95000, Branch 3 `Tiêu` 0 / NL#26 5). Script: `scripts/qa-smoke-cleanup-20260810.mjs`.

- [x] Fix / decide valuation vs post-and-flag conflict, then re-smoke KDS-ready posting + follow-up notification.
- [x] Short transfer receive classification smoke.
- [x] INV-12 stocktake reason_code smoke.
- [x] Delete ephemeral accounts after remaining smokes.
- [x] Hard-purge all `[QA-SMOKE-20260810]` Production data.

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
