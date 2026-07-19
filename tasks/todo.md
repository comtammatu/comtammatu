# Current Tasks

> Active outcomes only. Workflow and field rules live in
> `docs/agent/rules/workflow.md` → Current Task Lifecycle. Shipped work lives in
> git; deterministic failures live in `tasks/regressions.md`; durable lessons
> live in `tasks/lessons.md`; stable contracts live in their owning docs.

## Prove Self-Order offline navigation isolation

State: verify
Kind: qa
Tier: T2
Lane: self-order
Exit: Live offline navigation under `/q/*` never renders cached seating HTML, while the generic public page cache still works for non-sensitive routes.
Evidence: Production-like offline-browser capture plus the existing `PWA-SELF-ORDER-NAV-NETWORKONLY` static regression.

- [ ] Run the live offline-browser matrix for a previously visited seating URL and a non-sensitive public route; persist only the deterministic regression if behavior fails.

## Confirm the Greenfield product spine

State: ready
Kind: product
Tier: T3
Lane: greenfield
Exit: The owner accepts one minimal spine covering owner/auth, branch context, POS → payment → KDS/print → HĐĐT, inventory receive/production/stocktake, and HR/payroll basics.
Evidence: One current decision or owning-domain contract; no dated planning snapshot or duplicated source-of-truth map.

- [ ] Re-derive the minimal spine from the current baseline and runtime, then present additions outside that spine as explicit owner decisions.

## Establish Greenfield real-auth smokes

State: blocked
Kind: qa
Tier: T3
Lane: greenfield
Exit: Every owner-accepted spine flow has one repeatable real-auth runtime smoke using current scopes and routes.
Evidence: Executable tests or one operator runbook that records the authenticated actor, scope, route, expected result, and failure signal.
Blocker: The accepted product spine is not yet canonical. Recheck after “Confirm the Greenfield product spine” passes its Exit.

- [ ] Define and run one real-auth smoke per accepted spine flow without copying the product map into the tracker.

## Resolve the GRN warehouse on the server

State: ready
Kind: defect
Tier: T2
Lane: inventory
Exit: A new Branch GRN binds its only active Branch warehouse server-side and never depends on client fallback selection.
Evidence: Focused server/action coverage for one active warehouse, no active warehouse, and ambiguous active warehouses.

- [ ] Move sole-location resolution to the server boundary, keep the receiving-location card hidden for one location, and add focused coverage.

## Move shared inventory logic out of the Owner surface route tree

State: ready
Kind: debt
Tier: T2
Lane: inventory
Exit: Branch and Owner surface import `format`, `purchase-units`, `reference-cost`, `grn-draft`, and `types` from `apps/web/lib/inventory/`, and the operator/Owner surface boundary allowlist is narrowed.
Evidence: Import-boundary guard plus focused inventory tests and a source search showing no shared pure-logic imports from the Owner surface route tree.

- [ ] Move the five shared modules without forking behavior, update both planes, and tighten the allowlist to action boundaries only.

## Densify the Branch on-hand list

State: ready
Kind: feature
Tier: T2
Lane: inventory
Exit: Branch on-hand rows use the owner-approved 44px separator-based list with `gap-0` and no duplicate workflow toolbar.
Evidence: Focused static contract plus runtime QA at `390x844`, `768x1024`, `1024x768`, and `1280x900`.

- [ ] Replace the current oversized row/gap treatment, add separators, and verify touch and scroll behavior at the named viewports.

## Verify the Finance payment cutover

State: verify
Kind: qa
Tier: T3
Lane: finance/payments
Exit: Current SePay conflict behavior, expense transitions, supplier-payment retry, required-key `record_supplier_payment`, and Cash/VietQR-only UI all pass against the deployed non-production runtime.
Evidence: Isolated two-session results, authenticated phone/tablet smoke, deployed caller trace, and Cash/VietQR browser capture with no MoMo affordance.

- [ ] Rehearse current SePay completed-payment conflict behavior with the isolated two-session matrix.
- [ ] Run authenticated phone/tablet Finance smoke for expense transitions and supplier-payment retry.
- [ ] Prove the deployed runtime calls required-key `record_supplier_payment` and run current Cash/VietQR browser smoke with no MoMo affordance.

## Remove compatibility payment writes

State: blocked
Kind: release
Tier: T3
Lane: finance/payments
Exit: Legacy `create_supplier_payment` and authenticated direct `payments` UPDATE are absent; approved non-production schema/type/advisor gates pass; the separately owner-delegated Production apply and smoke are evidenced.
Evidence: Deployed required-key proof from the preceding outcome, catalog and ACL checks, generated-type no-diff, repository gates, advisors, and explicit Production apply/smoke evidence.
Blocker: Destructive cleanup depends on “Verify the Finance payment cutover” passing its Exit. Recheck after the deployed required-key proof exists and either persistent Cloud DEV is selected for agent-side mutation evidence or a trusted Preview registration/owner-operated path is available; Production still requires explicit owner delegation in that session.

- [ ] Revoke authenticated direct `UPDATE` on `payments` and drop legacy `create_supplier_payment` only after the required-key runtime proof.
- [ ] Apply the cleanup to registered Cloud DEV, or to Preview only through a trusted registration/owner-operated path; regenerate types and run repository gates plus database advisors.
- [ ] Perform the separately owner-delegated Production apply and smoke only after every prior gate is evidenced.

## Align KDS history authorization with route access

State: triage
Kind: defect
Tier: T3
Lane: auth/kds
Exit: An authenticated Owner who can open Branch KDS receives the intended completion-history result, or the UI and route intentionally hide or deny the history affordance according to the canonical ACL.
Evidence: Authority decision against the route/surface contract, focused authorization coverage for Owner and allowed KDS roles, and an authenticated Preview smoke at `/br/3/kds`.

- [ ] Reproduce the Owner-only `Không có quyền` completion-history result, trace the Server Action permission against route and surface access, then decide allow versus hide before implementation.
