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
Evidence: Migrations, database types, Inventory contract tests, Production catalog checks, repository gates, and authenticated responsive smoke.
Blocker: Authenticated live smoke needs an owner-delegated Production Owner/Branch Manager credential (no user creation or impersonation).

- [ ] Run authenticated Owner/Branch Inventory smoke at `390`, `768`, and `1280`, then remove this outcome when every Exit item is evidenced.

## Post POS sale consumption per ingredient with follow-up flags

State: ready
Kind: defect
Tier: T3
Lane: inventory/pos-posting
Exit: A completed order with one short ingredient posts `stock_movements` for every recipe line, creates any missing `stock_levels` row, books cost through the ADR 0026 fallback ladder with the rung recorded, returns `consumed: true` only when no line was skipped, and emits one branch-reachable follow-up work item; no shortfall path aborts payment completion. Cashier/floor stock-exhausted inserts still hard-block until Branch Manager sets re-enable and/or a dedicated daily sellable-allowance field on the menu-limits page (`/br/[branchId]/menu-limits`, `Giới hạn bán`); override never skips posting, never books warehouse replenish, and never uses a POS manager PIN challenge.
Evidence: ADR 0026 (decision locked, Owner 2026-08-10; pre-order hybrid + BM override 1C/2A locked same day; 1C grain locked per menu item same day); SQL acceptance test for short, missing-row, unknown-WAC, and BM-override-then-post-and-flag cases; notification handoff matrix test; repository gates.

- [ ] Restructure `post_pos_sale_consumption_if_ready` from all-or-nothing early return to per-ingredient posting with `INSERT … ON CONFLICT … DO UPDATE`.
- [ ] Replace the unconditional `COALESCE(sl.avg_unit_cost, 0)` with the ADR 0026 Decision 4 cost ladder and record which rung was used.
- [ ] Emit a durable branch-targeted follow-up carrying `target_branch_id` and a branch-reachable URL, replacing the emitterless `pos.payment_stock_failed` kind.
- [ ] Keep `enforce_branch_stock_availability` hard-blocking cashiers/floor staff (non-BM). Add a dedicated daily sellable-allowance field **per menu item** on the menu-item / branch daily-limits plane (schema TBD — field name only; ACL likely `branch_menu_limits`; grain locked Owner 2026-08-10 — not per ingredient) that the gate and availability RPCs honor; UI only on menu-limits page/hub sheet; do not reuse `replenishMenuItemStock` / stock-exception (`Bổ sung tồn kho`); do not invent a POS PIN override; post-and-flag after payment stays unchanged.

## Make the first stock movement per location concurrency-safe

State: ready
Kind: defect
Tier: T3
Lane: inventory/ledger
Exit: Two concurrent first movements for the same `(ingredient_id, branch_id, location_id, tenant_id)` both succeed; neither raises a unique violation nor aborts the host transaction of GRN confirm, transfer receive, or POS payment.
Evidence: Concurrent-insert SQL test against the `stock_levels` unique key; repository gates.

- [ ] Replace the `stock_levels` AFTER INSERT trigger update-then-insert sequence with a single `INSERT … ON CONFLICT … DO UPDATE` (`supabase/migrations/20260802162900_baseline.sql:63193-63203`; unique key at `:74155`).

## Route inventory notifications to reachable surfaces

State: ready
Kind: defect
Tier: T2
Lane: inventory/notifications
Exit: `inventory.stock_request_rejected` and `inventory.waste_pending_approval` resolve to `/br/[branchId]/stock?work=receive` and `/br/[branchId]/stock/waste-approvals` when `v_branch_kind = 'branch'`; the critical valuation-drift notification points at an existing route; no inventory notification targets a path `module-acl.ts` denies to its own `target_roles`.
Evidence: Notification handoff matrix test; `apps/web/tests/inventory-valuation-ui-static.test.ts` still asserts `/finance/cost-close` is absent; repository gates.

- [ ] Add the `v_branch_kind = 'branch'` arms to the notification URL normalizer (`supabase/migrations/20260809160855_notification_handoff_matrix_harden.sql:1524-1527`) so branch-targeted rows stop pointing at `/inventory/*`, which `module-acl.ts` denies to `branch_manager`.
- [ ] Repoint the critical valuation-drift link away from `/finance/cost-close`, a route the repository deliberately does not have (`…20260809160855….sql:547`, `apps/web/app/lib/shell-primitives.ts:42`).

## Correct branch stock route documentation

State: ready
Kind: docs
Tier: T1
Lane: inventory/docs
Exit: `docs/ref/branch-route-inventory.md` matches the shipped redirects and hub shape; no reader is sent to a target the code does not produce.
Evidence: Redirect targets read from the branch stock route sources; `corepack pnpm lint:docs-budget`.

- [ ] Update `docs/ref/branch-route-inventory.md:57-58`: `/stock/requests` and `/stock/receive` redirect to `/br/[id]/stock` and `/br/[id]/stock?work=receive`, not to `/stock/transfer`; the hub renders four doors with `Giao nhận` folded into the fulfillment hub.

## Retire legacy inventory RPC grants

State: blocked
Kind: release
Tier: T3
Lane: inventory/cleanup
Exit: The `*_legacy` transfer and GRN RPCs and the orphan `consume_stock_for_order*` functions are absent from the Production catalog; generated types show no diff; advisors and repository gates pass.
Evidence: Production catalog check for the dropped routines, generated-type no-diff, database advisors, and explicit owner-delegated apply evidence.
Blocker: Owner-only — dropping routines is a Production mutation and needs explicit owner delegation per `docs/agent/rules/database.md`; confirm no caller remains before the drop.

- [ ] Confirm zero remaining callers of the `*_legacy` transfer/GRN RPCs and `consume_stock_for_order*`, then drop them and revoke their grants through the owner-operated path.

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

## Attribute transfer shortfall to the shipping site

State: ready
Kind: defect
Tier: T3
Lane: inventory/transfer
Exit: A short receive without transit classification writes a source-side `stock_movements` row equal to the difference; a `Nhận thiếu` receive writes a transit-loss movement with a mandatory reason; no transfer reaches `received` with an unrecorded difference.
Evidence: ADR 0028 (decision locked, Owner 2026-08-10); SQL test covering short receive with and without transit classification; repository gates.

- [ ] Write the source-side shortfall movement on non-transit short receive instead of closing the transfer with the difference unrecorded (`supabase/migrations/20260802162900_baseline.sql:59935-60101`, `:5680-5760`).
- [ ] Add the explicit receive classification step with its mandatory reason, and register the stored English reason code plus its `Nhận thiếu` operator label in `docs/ref/glossary.md`.

## Let operators replace a rejected request with a new voucher

State: ready
Kind: feature
Tier: T2
Lane: inventory/requests
Exit: A rejected stock or purchase request stays rejected and uneditable, and its detail surface offers a copy action that opens a new draft prefilled from its lines, clearly marked as a new document rather than a resubmission.
Evidence: ADR 0030 (decision locked, Owner 2026-08-10); request lifecycle test asserting a rejected voucher cannot re-enter approval; repository gates.

- [ ] Add the copy-to-new-draft action on rejected `Yêu cầu hàng` and `Yêu cầu mua` detail surfaces, keeping the rejected voucher read-only.

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
