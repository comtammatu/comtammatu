# Current Tasks

> Active outcomes only. Workflow and field rules live in
> `docs/agent/rules/workflow.md` → Current Task Lifecycle. Shipped work lives in
> git; deterministic failures live in `tasks/regressions.md`; durable lessons
> live in `tasks/lessons.md`; stable contracts live in their owning docs.

## Repair accountant expenses and purchase-demand approval

State: verify
Kind: defect
Tier: T3
Lane: finance/procurement
Exit: An Accountant with `finance:view` can edit or cancel an unmatched operating expense, and purchase-demand approval creates PO lines in each ingredient's receipt unit with an exact, three-decimal quantity conversion.
Evidence: focused regression, migration lineage, repository gates, authorized Production apply, regenerated types, and authenticated Accountant smoke.

- [ ] Run authenticated Accountant smoke: edit/cancel an unmatched operating expense and approve a purchase demand whose request and receipt units differ.

## Unify stock request and transfer fulfillment journey

State: verify
Kind: feature
Tier: T3
Lane: inventory/fulfillment
Exit: One stock request renders as one fulfillment row and one Owner/Ops document dialog across Central Supply and Central Kitchen lanes; only manual transfers render independently; Central Kitchen can request Central Supply ingredients at its pinned site while Branch keeps its Page/fullscreen touch workflow.
Evidence: pure projection and static UI tests, stock fulfillment rollback SQL test, repository gates, and authenticated Owner/Central Supply/Central Kitchen/Branch responsive smoke after the additive migration is applied to an authorized target.

- [ ] Apply the migration to owner-authorized Production, regenerate types, run the rollback SQL test, and complete authenticated responsive smoke at `390×844`, `768×1024`, and `1440×900`.

## Standardize vi-VN money and VAT precision

State: verify
Kind: defect
Tier: T3
Lane: finance/tax-money
Exit: Finance, expense VAT, and supplier invoice amounts preserve scale-2 values from input through PostgreSQL while POS, menu, cash, VietQR, and shift settlement remain whole-VND.
Evidence: shared fixed-point and formatter tests, form/static contracts, expense and supplier-invoice SQL regressions, data audits, repository gates, and authenticated Preview smoke.

- [ ] Run DB tests in the CI database container and complete the authenticated
      expense/supplier-invoice smoke before Production consideration.

## Route document stock corrections through the inventory ledger RPC

State: ready
Kind: defect
Tier: T3
Lane: inventory/ledger
Exit: GRN, issue, transfer, and production document corrections use one authenticated, idempotent RPC that validates source, scope, stock, and actor in the same transaction; runtime code cannot insert `stock_movements` directly; invoice, payment, VAT, and WAC facts remain unchanged.
Evidence: CodeGraph flow from every document dialog to the mutation boundary, focused SQL and static regressions, repository gates, authorized Production apply, and authenticated correction smoke.

- [ ] Replace `createInventoryDocumentCorrection` direct DML with the atomic RPC and add the smallest executable guard that rejects future runtime inserts into `stock_movements`.

## Revalidate the HRM F1-F15 findings against current authority

State: triage
Kind: debt
Tier: T3
Lane: hr/domain-integrity
Exit: Every HRM finding is rechecked against current source and routed once: confirmed defects become bounded outcomes or executable guards, stable contracts move to their owning HR docs, and unconfirmed or superseded claims are dropped.
Evidence: CodeGraph traces for employee provisioning, attendance, checklist, contract, leave, and payroll flows plus focused current tests and the owner decision boundary in ADR 0019.

- [ ] Re-audit the current HR flows, then split only confirmed and independently deliverable outcomes.

## Stabilize supplier invoice matching, payment, and advance

State: verify
Kind: feature
Tier: T3
Lane: finance/procurement-ap
Exit: Goods invoices match all confirmed receipt allocations through one DB helper with a ±1 VND tolerance; service invoices require reasoned verification; Owner and Accountant record invoice-bound payments while only Owner allocates visible supplier advances; retry and later allocation never duplicate payment or money movement.
Evidence: additive migration replay, focused DB tests, permission/static UI tests, repository gates, and authenticated Owner/Accountant responsive smoke after the migration is applied to an authorized target.

- [ ] Run authenticated Owner/Accountant smoke when Production has valid QA credentials.
- [ ] Run the cleanup migration only after deployed callers no longer use direct DML or old payment/matching RPC signatures.

## Implement purchase demand allocation → PO → GRN → supplier invoice

State: verify
Kind: feature
Tier: T3
Lane: inventory/procurement
Exit: Warehouse submits purchase demand without supplier or price; Accountant allocates the exact quantity across active suppliers and atomically creates supplier-specific approved POs plus one GRN draft per PO; supplier invoice lines remain the only commercial purchase-price input; Owner/Accountant invoice payment and Owner-only advances remain idempotent.
Evidence: additive migration replay, atomic RPC behavior tests, role/static workflow contracts, repository gates, and authenticated responsive smoke after the migration is applied to an authorized target.

- [ ] Apply the additive migrations to authorized Production, regenerate database types, and run authenticated Warehouse/Accountant/Owner smoke before cleanup.

## Retire purchase request → PO compatibility

State: verify
Kind: feature
Tier: T3
Lane: inventory/procurement-finance
Exit: No new application caller, navigation item, or canonical route creates YCM; legacy RPCs/columns remain only through additive rollout and are removed after deployed-caller and data cleanup proof.
Evidence: additive migration replayed from the current baseline and applied to Production; 38 focused PO/GRN/Finance acceptance tests; URL-filtered unified GRN list; regenerated Production database types; post-apply RLS, RPC grants, and advisor checks.

- [ ] Run authenticated `390×844`, `768×1024`, and `1440×900` smoke after the migration is applied to the authorized target.
- [ ] Smoke supplier invoice URL modes at `390×844` and `1440×900`: create from GRN, Back/Forward detail, view → pay/credit, filter retention, and permission-hidden create action.

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

## Complete the CTCP authority and e-invoice cutover on Production

State: doing
Kind: feature
Tier: T3
Lane: platform/security-finance
Exit: The existing `comtammatu` deployment uses Production as its only target, legal identity and Viettel profile come from live Tenant data, VAT is explicit per sold line, and database authority no longer depends on HR positions or forged JWT scope.
Evidence: Production is live target for `web.comtammatu.com`. Invoice-profile/VAT snapshot applied and types regenerated. Runtime still uses position-derived JWT `user_role` / `MODULE_ACL`. Catalog/Viettel smoke and ADR 0015 negative matrix remain open; authority cutover must preserve the current site model.

- [ ] Re-plan and implement scoped authority caller/RLS cutover on Production under the current site model; preserve Tenant, Branch, profile, and Auth bootstrap rows.
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
- [ ] Run the P0-3 authenticated sweep for `/br/[branchId]/pos`, `/br/[branchId]/kds`, `/br/[branchId]`, `/inventory/consumption`, and `/inventory/stock` at `390`, `768`, and `1280`, then record each disposition in `PAGE_DISPOSITION_OVERRIDES` (`scripts/page-archetypes.mjs`).

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
- [ ] Run authenticated phone/tablet Finance smoke for expense transitions and a partial plus same-key retry supplier payment on a payable Production invoice.
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
Blocker: Production baseline still exposes legacy `create_supplier_payment` to `authenticated` and `GRANT … UPDATE ON public.payments TO authenticated`. Recheck when the owner authorizes dropping both after required-key runtime proof.

- [ ] Revoke authenticated direct `UPDATE` on `payments` and drop legacy `create_supplier_payment` only after the required-key runtime proof.
- [ ] Apply the cleanup only through the trusted registration/owner-operated Preview path; regenerate types from the explicit Production source and run repository gates plus database advisors.

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
Exit: `/inventory/grn/[id]` shows document/history tabs, confirmed lines via `DataTable` + footers, sticky `AppDetailFooter`; `/inventory/grn/new/[supplierId]` sticky DOC CTA; Wave E static ratchet green; DETAIL clones (transfer/consumption/stocktake) use AppPageTabs history; authenticated GRN smoke at 390/1280 when E2E_OWNER session is live.
Evidence: `record-depth-inventory-detail-doc-wave-{a,b,c,d,e,f}-static`; e2e harness `e2e/inventory/grn-detail-archetype.spec.ts` (skips when owner auth stale). Auth setup against local `.env.test.local` timed out 2026-07-28 — recheck after owner/E2E credential refresh.

- [ ] Refresh Playwright owner storage (`authenticate as test owner`) and run `grn-detail-archetype.spec.ts` at 390/1280.
- [ ] Open a confirmed GRN detail and GRN create after supplier pick; confirm tabs, table lines, sticky footer vs pre-change dual-rail cards.
