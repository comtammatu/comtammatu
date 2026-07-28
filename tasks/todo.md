# Current Tasks

> Active outcomes only. Workflow and field rules live in
> `docs/agent/rules/workflow.md` → Current Task Lifecycle. Shipped work lives in
> git; deterministic failures live in `tasks/regressions.md`; durable lessons
> live in `tasks/lessons.md`; stable contracts live in their owning docs.

## Ship B-full operational roles (D088)

State: verify
Kind: feature
Tier: T3
Lane: auth/ops-roles
Exit: `accountant`, `central_supply_ops`, and `central_kitchen_lead` can log in and act per D088; GRN confirm requires an approved linked PO; branch managers cannot see purchase prices; `typecheck && lint && build` plus targeted auth/procurement/finance tests pass.
Evidence: D088; `.omc/plans/b-full-ops-roles-workplan.md`; folded D017/D076/D083; finance + inventory contract updates. Migrations `20260728140000_d088_b_full_ops_roles.sql`, `20260728141000_d088_grn_po_confirm_gate.sql`, `20260728142000_d088_accountant_finance_po_grants.sql` applied 2026-07-28 to Greenfield `enloyfnuerqgaqderbwb` (`matu-greenfield-company`) via `scripts/supabase-greenfield-push.mjs --apply` (ledger repaired MCP wall-clock orphans first; dropped invalid `positions.updated_at` / `permission_keys.updated_at` in SQL). `SUPABASE_PROJECT_ID=enloyfnuerqgaqderbwb corepack pnpm db:types` OK. Spot-check: positions + role_templates for 3 roles; finance/PO keys delegable; `confirm_goods_receipt_note` / `create_purchase_order_from_grn` present. State stays `verify` until Wave 5 lint/smoke.

- [ ] Wave 5 — auth.md + role-route-matrix, seeds/fixtures, full gates, owner smoke.

## Prove one money day on Greenfield

State: blocked
Kind: defect
Tier: T3
Lane: pos/operational-truth
Exit: On Greenfield, one cash order and one VietQR order show the same completed-payment money and `paid_at` day on `/orders`, Branch POS session, and `/finance/revenue`; KDS/print quantities remain separately named when kitchen evidence is in scope.
Evidence: Fund opening exists on Greenfield; Branch 3 sellable catalog and tables are still empty (`menu_items=0`), so no POS order can exist until seed + POS credential.
Blocker: Owner-only prerequisites — seed the Branch 3 (`Nguyễn Hữu Thọ`) sellable catalog plus tables, configure `payment_enable_vietqr`/`payment_vietqr_bank_code`/`payment_vietqr_account_no`/`payment_vietqr_account_name`/`payment_vietqr_code_prefix` and the deployed `SEPAY_WEBHOOK_SECRET`, and operate POS with an owner/cashier login the agent does not hold. Recheck after the catalog exists and a POS-capable credential is delegated.

- [ ] Seed the Branch 3 sellable catalog and tables, then confirm `menu_items > 0` before attempting POS.
- [ ] Place one completed cash order and one completed VietQR order on Branch 3 after the fund opening.
- [ ] Capture `/orders`, POS session, and `/finance/revenue` for the same Vietnam `paid_at` day and confirm totals match.
- [ ] If selling category `Khác`, map its kitchen printer before treating slip mismatch as a money bug.

## Defer central production workspace cutover

State: blocked
Kind: feature
Tier: T3
Lane: inventory/central-ops
Exit: Production runs only on `central_kitchen`; `/warehouse` and `/kitchen` workspaces exist after Phase 2 `operational_site` authority.
Evidence: D082, ADR 0015/0017, architecture Phase 2/4 exit criteria.
Blocker: Central procurement smoke proven on Greenfield; still depends on Greenfield authority cutover (Phase 2 / CTCP H2). Recheck when Phase 2 authority cutover lands on Greenfield.

- [ ] After Phase 2 authority lands, implement Phase 4 workspaces and move production off branch sites.

## Complete the CTCP authority and e-invoice cutover on current Greenfield

State: doing
Kind: feature
Tier: T3
Lane: platform/security-finance
Exit: The existing `comtammatu` deployment uses the current Greenfield project as its only target, legal identity and Viettel profile come from live Tenant data, VAT is explicit per sold line, and database authority no longer depends on HR positions or forged JWT scope.
Evidence: Greenfield is live target for `web.comtammatu.com`. Invoice-profile/VAT snapshot applied and types regenerated. Runtime still uses position-derived JWT `user_role` / `MODULE_ACL`. Catalog/Viettel smoke and ADR 0015 negative matrix still open; authority cutover must follow D082 `branches.branch_kind`.

- [ ] Re-plan and implement scoped authority caller/RLS cutover on Greenfield under D082 site model; preserve Tenant, Branch, profile, and Auth bootstrap rows.
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
Exit: A terminal stale session becomes anonymous without an error-level Vercel event, Supabase SSR deletion cookies are preserved, and unrelated auth failures remain loud instead of causing a silent login redirect. Far-from-expiry zombie JWTs after global signOut clear on the next protected `loadAuthState` navigation (redirect → GET `/api/auth/signout`).
Evidence: Focused middleware regression coverage (incl. still-valid access + terminal refresh → cleared), withAction `session_expired` mapping, `loadAuthState` → `probeAuthSessionLiveness` + signout GET, PROXY-NEVER-CALL-GETUSER + ZOMBIE-JWT-AFTER-GLOBAL-SIGNOUT docs/guards, T3 review.

- [ ] Deploy, run the stale-cookie smoke (incl. peer-tab far-from-expiry after global signOut), and observe Production runtime logs for 24 hours.

## Make HĐĐT worker failures diagnosable

State: verify
Kind: defect
Tier: T3
Lane: hddt/worker-observability
Exit: Per-job and top-level HĐĐT worker failures emit safe identifiers plus a bounded error code without logging provider payloads, PII, raw errors, or changing durable job-state behavior.
Evidence: Focused worker regression coverage, repository gates, T3 review, controlled Preview failure proof, and one read-only Production cron observation.

- [ ] Prove the failure log shape on Preview and observe one Production cron cadence read-only.

## Converge the Má Tư Design System and roll it into every route family

State: doing
Kind: feature
Tier: T3
Lane: ui/design-system
Exit: The P0-P7 program has one verified foundation, every page is classified keep/tune/rebuild and processed by route family, and accessibility/PWA/runtime evidence is reconciled without changing business authority.
Evidence: `docs/plan/design-system-rollout.md`, C0/C1/C2 external review reconciliation, UI debt and archetype audits, focused and full repository gates, authenticated viewport matrix, axe, assistive-technology, and production-like PWA proof.

- [ ] Complete authenticated Branch/Owner viewport and axe runs, VoiceOver/TalkBack critical-path proof, and real install/update/standalone PWA proof on a registered target.
- [ ] Run the P0-3 authenticated sweep for `/br/[branchId]/pos`, `/br/[branchId]/kds`, `/br/[branchId]`, `/inventory/issues`, and `/inventory/stock` at `390`, `768`, and `1280`, then record each disposition in `PAGE_DISPOSITION_OVERRIDES` (`scripts/page-archetypes.mjs`).

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
Evidence: Required-key `record_supplier_payment` (idempotent same-key replay + conflict on differing args), AP cash separate from operating expense, and Cash/VietQR-only sales UI are locked in code/static tests; owner-operated Preview smoke/trace still required.

- [ ] Rehearse current SePay completed-payment conflict behavior with the isolated two-session matrix.
- [ ] Run authenticated phone/tablet Finance smoke for expense transitions and a partial plus same-key retry supplier payment on a payable Greenfield invoice.
- [ ] Capture the deployed browser trace for required-key `record_supplier_payment` and the Cash/VietQR sales UI with no MoMo affordance.

## Surface AP blockers on the Finance list surfaces

State: verify
Kind: feature
Tier: T3
Lane: finance/ap-operations
Exit: `/finance/expenses` separates the operating-expense period total from an actionable "cần xử lý" count with a matching list filter, and `/finance/supplier-invoices` exposes the missing-HĐ-GTGT payment blocker as a list filter, a per-group badge, and a marker in the record's invoice selector — all from one shared predicate per surface.
Evidence: `finance-expenses`, `supplier-invoice-list-semantics`, `supplier-invoice-payment-static`, `finance-hr-ui-consolidation-static`, `responsive-form-controls-static`, and `record-depth-inventory-list-wave2-static` pass; `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build` clean.

- [ ] Run authenticated Finance smoke at `390`, `768`, and `1280` for the expense "cần xử lý" filter and the supplier-invoice missing-VAT filter, badge, and blocked-pay affordance.

## Remove compatibility payment writes

State: blocked
Kind: release
Tier: T3
Lane: finance/payments
Exit: Legacy `create_supplier_payment` and authenticated direct `payments` UPDATE are absent; owner-operated Preview schema/type/advisor gates pass; the separately owner-delegated Production apply and smoke are evidenced.
Evidence: Deployed required-key proof from the preceding outcome, catalog and ACL checks, generated-type no-diff, repository gates, advisors, and explicit Production apply/smoke evidence.
Blocker: Greenfield baseline still exposes legacy `create_supplier_payment` to `authenticated` and `GRANT … UPDATE ON public.payments TO authenticated`. Recheck when the owner authorizes dropping both on the live Greenfield target after required-key runtime proof.

- [ ] Revoke authenticated direct `UPDATE` on `payments` and drop legacy `create_supplier_payment` only after the required-key runtime proof.
- [ ] Apply the cleanup only through the trusted registration/owner-operated Preview path; regenerate types from the explicit Production source and run repository gates plus database advisors.
- [ ] Keep every `matu-prod` apply deferred while the retired target stack is suspended; run it only under an explicit owner decision for that stack.

## Restore inventory Owner responsive control contracts

State: doing
Kind: defect
Tier: T2
Lane: ui/responsive-controls
Exit: Owner inventory surfaces keep the named responsive control contracts: ingredients use `useIsMobile(1024)`, stock filters share one control group source, and issue detail branches layout on `isTouchLayout`.
Evidence: Unit UX Exit already met (`inventory-stock-unit-format`, `inventory-count-units`, SOP §2c). Remaining failures are responsive-contract drift in `ingredients-client.tsx`, `stock-client.tsx`, and `issues/[id]/issue-detail-client.tsx`.

- [ ] Restore the `useIsMobile(1024)` control contract in `ingredients-client.tsx`.
- [ ] Restore the single stock status/category filter control source in `stock-client.tsx`.
- [ ] Restore the `isTouchLayout` layout branch in the issue detail client.

## Align KDS history authorization with route access

State: verify
Kind: defect
Tier: T3
Lane: auth/kds
Exit: An authenticated Owner who can open Branch KDS receives the intended completion-history result, or the UI and route intentionally hide or deny the history affordance according to the canonical ACL.
Evidence: Authority decision against the route/surface contract, focused authorization coverage for Owner and allowed KDS roles, and an authenticated Preview smoke at `/br/3/kds`.

- [ ] Smoke the completion-history affordance as an authenticated Owner at Preview `/br/3/kds`.

## Converge GRN DETAIL/DOC to visible page-archetype recipe

State: verify
Kind: feature
Tier: T2
Lane: inventory/ui
Exit: `/inventory/grn/[id]` shows document/history tabs, confirmed lines via `DataTable` + footers, sticky `AppDetailFooter`; `/inventory/grn/new/[supplierId]` sticky DOC CTA; Wave E static ratchet green.
Evidence: `record-depth-inventory-detail-doc-wave-{a,b,c,d,e}-static` 15/15; web `tsc --noEmit`; authenticated viewport smoke for a confirmed GRN at 390/1280.

- [ ] Open a confirmed GRN detail and GRN create after supplier pick; confirm tabs, table lines, sticky footer are visible vs pre-change dual-rail cards.
- [ ] Clone the same DETAIL skeleton to issues/transfers/production/stocktake after owner accepts the GRN exemplar.
