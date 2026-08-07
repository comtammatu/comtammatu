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
Evidence: Fund opening exists on Production; Branch 3 sellable catalog and tables are still empty (`menu_items=0`), so no POS order can exist until seed + POS credential.
Blocker: Owner-only prerequisites — seed the Branch 3 (`Nguyễn Hữu Thọ`) sellable catalog plus tables, configure `payment_enable_vietqr`/`payment_vietqr_bank_code`/`payment_vietqr_account_no`/`payment_vietqr_account_name`/`payment_vietqr_code_prefix` and the deployed `SEPAY_WEBHOOK_SECRET`, and operate POS with an owner/cashier login the agent does not hold. Recheck after the catalog exists and a POS-capable credential is delegated.

- [ ] Seed the Branch 3 sellable catalog and tables, then confirm `menu_items > 0` before attempting POS.
- [ ] Place one completed cash order and one completed VietQR order on Branch 3 after the fund opening.
- [ ] Capture `/orders`, POS session, and `/finance/revenue` for the same Vietnam `paid_at` day and confirm totals match.
- [ ] If selling category `Khác`, map its kitchen printer before treating slip mismatch as a money bug.

## Verify the current Inventory topology

State: blocked
Kind: qa
Tier: T3
Lane: inventory/topology
Exit: Every active site has exactly one active warehouse; GRN remains central-only, Branch receives transfer, and the authenticated Owner/Branch Inventory journeys pass at `390`, `768`, and `1280`.
Evidence: Current migrations, database types, Inventory contract tests, Production catalog checks, repository gates, and authenticated responsive smoke.
Blocker: Authenticated live smoke needs an owner-delegated Production Owner/Branch Manager credential. Do not create users or impersonate a live identity. Recheck when the owner delegates a Production test credential.

- [ ] Run authenticated Owner/Branch Inventory smoke at `390`, `768`, and `1280`, then remove this outcome when every Exit item is evidenced.

## Remove compatibility payment writes

State: blocked
Kind: release
Tier: T3
Lane: finance/payments
Exit: Legacy `create_supplier_payment` and authenticated direct `payments` UPDATE are absent; owner-operated Preview schema/type/advisor gates pass; the separately owner-delegated Production apply and smoke are evidenced.
Evidence: Deployed required-key proof from the preceding outcome, catalog and ACL checks, generated-type no-diff, repository gates, advisors, and explicit Production apply/smoke evidence.
Blocker: Production baseline still exposes legacy `create_supplier_payment` to `authenticated` and `GRANT … UPDATE ON public.payments TO authenticated`. Recheck when the owner authorizes dropping both after required-key runtime proof.

- [ ] Revoke authenticated direct `UPDATE` on `payments` and drop legacy `create_supplier_payment` only after the required-key runtime proof.
- [ ] Apply the cleanup only through the trusted registration/owner-operated Preview path; regenerate types from the explicit Production source and run repository gates plus database advisors.

