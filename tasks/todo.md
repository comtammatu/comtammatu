# Current Tasks

> Active outcomes only. Workflow and field rules live in
> `docs/agent/rules/workflow.md` → Current Task Lifecycle. Shipped work lives in
> git; deterministic failures live in `tasks/regressions.md`; durable lessons
> live in `tasks/lessons.md`; stable contracts live in their owning docs.


## Ship D089 purchase-price authority (PO → GRN unit_cost)

State: doing
Kind: feature
Tier: T3 (RPC/ACL); docs T2
Lane: inventory/procurement
Exit: Warehouse GRN draft has no price UI; approve_purchase_order syncs PO `unit_price_est` into linked `grn_items.unit_cost`; confirm remains fail-closed without approved PO; static tests encode D089.
Evidence: D089 in `docs/plan/decisions.md`, migration `20260728143000_d089_po_price_sync_to_grn.sql`, focused web tests.

- [ ] Apply D089 migration to verified Preview/Greenfield after Environment Registry check (not production without owner delegation).
- [ ] Land/merge after D088 role track if ACL roles still missing on target schema.
- [ ] Owner smoke: GRN draft (no price) → PO price → approve sync → confirm.

## Defer central production workspace cutover

State: blocked
Kind: feature
Tier: T3
Lane: inventory/central-ops
Exit: Production runs only on `central_kitchen`; `/warehouse` and `/kitchen` workspaces exist after Phase 2 `operational_site` authority.
Evidence: D082, ADR 0015/0017, architecture Phase 2/4 exit criteria.
Blocker: Central procurement smoke proven on Greenfield; still depends on Greenfield authority cutover (Phase 2 / CTCP H2).

- [ ] After Phase 2 authority lands, implement Phase 4 workspaces and move production off branch sites.

## Complete the CTCP authority and e-invoice cutover on current Greenfield

State: doing
Kind: feature
Tier: T3
Lane: platform/security-finance
Exit: The existing `comtammatu` deployment uses the current Greenfield project as its only target, legal identity and Viettel profile come from live Tenant data, VAT is explicit per sold line, and database authority no longer depends on HR positions or forged JWT scope.
Evidence: Greenfield is live target for `web.comtammatu.com`. Invoice-profile/VAT snapshot applied (`20260727104839` / local `20260727161500`). Authority foundation was applied then removed (`remove_unused_greenfield_authority`); runtime still uses position-derived JWT `user_role` / `MODULE_ACL`. Catalog/Viettel smoke and ADR 0015 negative matrix still open. Re-plan authority against D082 `branches.branch_kind` (not `operational_sites`).

- [ ] Re-plan and implement scoped authority caller/RLS cutover on Greenfield under D082 site model; preserve Tenant, Branch, profile, and Auth bootstrap rows.
- [x] Apply the invoice-profile/VAT snapshot forward migration to Greenfield and regenerate database types.
- [ ] Complete catalog/RLS inspection, full repository gates, activate invoice profile after tenant legal/MST is complete, and the separately authorized Viettel smoke. Do not reset, rebaseline, create another project, or delete current identities.

## Restore fresh-install database ACL parity

State: verify
Kind: defect
Tier: T3
Lane: database/auth
Exit: A fresh migration replay restores the Production table, sequence, and function ACLs without inheriting extra `TRUNCATE`, `REFERENCES`, or `TRIGGER` privileges for `anon` or `authenticated`.
Evidence: Disposable local baseline replay, ACL inventory matched against read-only Production catalogs, `advisor_auth_hardening_test.sql`, repository gates, and CI e2e smoke.

- [ ] Confirm the PR CI e2e smoke and Supabase Preview checks pass.

## Recover stale Supabase refresh sessions

State: verify
Kind: defect
Tier: T3
Lane: auth/runtime-stability
Exit: A terminal stale session becomes anonymous without an error-level Vercel event, Supabase SSR deletion cookies are preserved, and unrelated auth failures remain loud instead of causing a silent login redirect.
Evidence: Focused middleware regression coverage, repository gates, T3 review, deployed stale-cookie smoke, and 24-hour Production runtime-log observation.

- [ ] Deploy, run the stale-cookie smoke, and observe Production runtime logs for 24 hours.

## Make HĐĐT worker failures diagnosable

State: verify
Kind: defect
Tier: T3
Lane: hddt/worker-observability
Exit: Per-job and top-level HĐĐT worker failures emit safe identifiers plus a bounded error code without logging provider payloads, PII, raw errors, or changing durable job-state behavior.
Evidence: Focused worker regression coverage, repository gates, T3 review, controlled Preview failure proof, and one read-only Production cron observation.

- [ ] Prove the failure log shape on Preview and observe one Production cron cadence read-only.

## Restore order-to-revenue operational truth

State: doing
Kind: defect
Tier: T3
Lane: pos/operational-truth
Exit: `/orders`, Branch POS sessions, KDS History, and Finance daily revenue agree on completed-payment money and `paid_at` day boundaries; ordered, served, KDS-completed, printed, side, and main-dish quantities remain separately named; exact SePay, print, KDS, POS-session, HĐĐT, and audit evidence is traceable after cleanup.
Evidence: `docs/ref/order-kds-payment-revenue-operational-truth.md`, isolated Preview migration replay, generated types, focused and full repository gates, T3 review, authenticated desktop/mobile route captures, CI, separately owner-applied Production migration, and read-only Production smoke.

- [ ] Merge and deploy the web runtime, then capture authenticated Production evidence for `/orders`, Branch POS sessions, KDS History, and Finance daily revenue.
- [ ] Owner-confirm and apply the Phước Hải `Khác` category printer route, then prove one `Cơm Tấm Bì` test order has matching KDS ticket, print job, and physical kitchen slip.

## Converge the Má Tư Design System and roll it into every route family

State: doing
Kind: feature
Tier: T3
Lane: ui/design-system
Exit: The P0-P7 program has one verified foundation, every page is classified keep/tune/rebuild and processed by route family, and accessibility/PWA/runtime evidence is reconciled without changing business authority.
Evidence: `docs/plan/design-system-rollout.md`, C0/C1/C2 external review reconciliation, UI debt and archetype audits, focused and full repository gates, authenticated viewport matrix, axe, assistive-technology, and production-like PWA proof.

- [ ] Complete authenticated Branch/Owner viewport and axe runs, VoiceOver/TalkBack critical-path proof, and real install/update/standalone PWA proof on a registered target.

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
Blocker: This cleanup targets the suspended retired target database and is not required for Greenfield delivery. Recheck only after an explicit owner decision reopens retired target maintenance or authorizes retention cleanup.

- [ ] Revoke authenticated direct `UPDATE` on `payments` and drop legacy `create_supplier_payment` only after the required-key runtime proof.
- [ ] Apply the cleanup only through the trusted registration/owner-operated Preview path; regenerate types from the explicit Production source and run repository gates plus database advisors.
- [ ] Keep every `matu-prod` apply deferred while the retired target stack is suspended; run it only under the exact owner decision named in the Blocker.

## Improve inventory unit UX (mixed stock + count default + SOP)

State: blocked
Kind: feature
Tier: T2
Lane: inventory/units
Exit: Stock on-hand shows mixed packaging quantities; ingredient form guides output-unit choice; count flows default to purchase unit; SOP §2c documents unit selection.
Evidence: Targeted `inventory-stock-unit-format` + `inventory-count-units` + counting static tests pass; web `tsc --noEmit` clean for owned paths.
Blocker: Full `pnpm lint` / `pnpm build` fail on unrelated dirty-tree WIP — `auth.ts` missing required `getUser()` (PROXY-NEVER-CALL-GETUSER) and finance `supplier-invoices` `canAttachVatEvidence` prop mismatch. Recheck after those WIP lanes settle or are isolated.

- [ ] Re-run `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build` after unrelated auth/finance WIP is reconciled.

## Align KDS history authorization with route access

State: verify
Kind: defect
Tier: T3
Lane: auth/kds
Exit: An authenticated Owner who can open Branch KDS receives the intended completion-history result, or the UI and route intentionally hide or deny the history affordance according to the canonical ACL.
Evidence: Authority decision against the route/surface contract, focused authorization coverage for Owner and allowed KDS roles, and an authenticated Preview smoke at `/br/3/kds`.

- [ ] Smoke the completion-history affordance as an authenticated Owner at Preview `/br/3/kds`.
