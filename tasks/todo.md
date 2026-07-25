# Current Tasks

> Active outcomes only. Workflow and field rules live in
> `docs/agent/rules/workflow.md` → Current Task Lifecycle. Shipped work lives in
> git; deterministic failures live in `tasks/regressions.md`; durable lessons
> live in `tasks/lessons.md`; stable contracts live in their owning docs.

## Restore order-to-revenue operational truth

State: doing
Kind: defect
Tier: T3
Lane: pos/operational-truth
Exit: `/orders`, Branch POS sessions, KDS History, and Finance daily revenue agree on completed-payment money and `paid_at` day boundaries; ordered, served, KDS-completed, printed, side, and main-dish quantities remain separately named; exact SePay, print, KDS, POS-session, HĐĐT, and audit evidence is traceable after cleanup.
Evidence: `docs/ref/order-kds-payment-revenue-operational-truth.md`, isolated Preview migration replay, generated types, focused and full repository gates, T3 review, authenticated desktop/mobile route captures, CI, separately owner-applied Production migration, and read-only Production smoke.

- [ ] Resolve the parent `main` branch `MIGRATIONS_FAILED` metadata/lineage through the owner-approved path, then replay all six migrations on a verified Preview child of `iexwsuaqqenyjiskawoj`, resolve SQL/ACL findings, and run database advisors.
- [ ] Regenerate types from the registered type source and complete authenticated route QA plus CI before the owner-operated Production apply.
- [ ] Owner-confirm and apply the Phước Hải `Khác` category printer route, then prove one `Cơm Tấm Bì` test order has matching KDS ticket, print job, and physical kitchen slip.

## Converge the Má Tư Design System and roll it into every route family

State: doing
Kind: feature
Tier: T3
Lane: ui/design-system
Exit: The P0-P7 program has one verified foundation, every page is classified keep/tune/rebuild and processed by route family, and accessibility/PWA/runtime evidence is reconciled without changing business authority.
Evidence: `docs/plan/design-system-rollout.md`, C0/C1/C2 external review reconciliation, UI debt and archetype audits, focused and full repository gates, authenticated viewport matrix, axe, assistive-technology, and production-like PWA proof.

- [ ] Complete authenticated Branch/Owner viewport and axe runs, VoiceOver/TalkBack critical-path proof, and real install/update/standalone PWA proof on a registered target.

## Re-align the schema migration lineage

State: doing
Kind: defect
Tier: T3
Lane: database
Exit: A current Production-derived baseline, required fresh-environment forwards, and the live Production ledger are reconciled without replaying or mutating business data.
Evidence: Production catalog/ACL comparison, CI baseline replay, type no-diff, and one disposable Preview proof.

- [ ] Apply the active baseline and forward chain to registered DEV, regenerate types, then complete aligned schema and disposable Preview validation.

## Prove Self-Order offline navigation isolation

State: verify
Kind: qa
Tier: T2
Lane: self-order
Exit: Live offline navigation under `/q/*` never renders cached seating HTML, while the generic public page cache still works for non-sensitive routes.
Evidence: Production-like offline-browser capture plus the existing `PWA-SELF-ORDER-NAV-NETWORKONLY` static regression.

- [ ] Run the live offline-browser matrix for a previously visited seating URL and a non-sensitive public route; persist only the deterministic regression if behavior fails.

## Densify the Branch on-hand list

State: verify
Kind: feature
Tier: T2
Lane: inventory
Exit: Branch on-hand rows use the owner-approved 44px separator-based list with `gap-0` and no duplicate workflow toolbar.
Evidence: Focused static contract plus runtime QA at `390x844`, `768x1024`, `1024x768`, and `1280x900`.

- [ ] Verify the implemented 44px separator list for touch and scroll behavior at `390x844`, `768x1024`, `1024x768`, and `1280x900` on an authenticated target.

## Verify the Finance payment cutover

State: verify
Kind: qa
Tier: T3
Lane: finance/payments
Exit: Current SePay conflict behavior, expense transitions, supplier-payment retry, required-key `record_supplier_payment`, and Cash/VietQR-only UI have owner-operated Preview evidence or remain explicitly blocked pending it.
Evidence: Isolated two-session results, authenticated phone/tablet smoke, deployed caller trace, Cash/VietQR browser capture with no MoMo affordance, and the Preview Branch target/evidence when available.

- [ ] Rehearse current SePay completed-payment conflict behavior with the isolated two-session matrix.
- [ ] Run authenticated phone/tablet Finance smoke for expense transitions and supplier-payment retry.
- [ ] Prove the deployed runtime calls required-key `record_supplier_payment` and run current Cash/VietQR browser smoke with no MoMo affordance.

## Remove compatibility payment writes

State: blocked
Kind: release
Tier: T3
Lane: finance/payments
Exit: Legacy `create_supplier_payment` and authenticated direct `payments` UPDATE are absent; owner-operated Preview schema/type/advisor gates pass; the separately owner-delegated Production apply and smoke are evidenced.
Evidence: Deployed required-key proof from the preceding outcome, catalog and ACL checks, generated-type no-diff, repository gates, advisors, and explicit Production apply/smoke evidence.
Blocker: Destructive cleanup depends on “Verify the Finance payment cutover” passing its Exit. Recheck after the deployed required-key proof and an owner-operated Preview path are available; Production still requires explicit owner delegation in that session.

- [ ] Revoke authenticated direct `UPDATE` on `payments` and drop legacy `create_supplier_payment` only after the required-key runtime proof.
- [ ] Apply the cleanup only through the trusted registration/owner-operated Preview path; regenerate types from the explicit Production source and run repository gates plus database advisors.
- [ ] Perform the separately owner-delegated Production apply and smoke only after every prior gate is evidenced.

## Align KDS history authorization with route access

State: verify
Kind: defect
Tier: T3
Lane: auth/kds
Exit: An authenticated Owner who can open Branch KDS receives the intended completion-history result, or the UI and route intentionally hide or deny the history affordance according to the canonical ACL.
Evidence: Authority decision against the route/surface contract, focused authorization coverage for Owner and allowed KDS roles, and an authenticated Preview smoke at `/br/3/kds`.

- [ ] Smoke the completion-history affordance as an authenticated Owner at Preview `/br/3/kds`.
