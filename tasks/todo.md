# Current Tasks

> Active outcomes only. Workflow and field rules live in
> `docs/agent/rules/workflow.md` → Current Task Lifecycle. Shipped work lives in
> git; deterministic failures live in `tasks/regressions.md`; durable lessons
> live in `tasks/lessons.md`; stable contracts live in their owning docs.

## Implement purchase request → PO → GRN → supplier AP

State: verify
Kind: feature
Tier: T3
Lane: inventory/procurement-finance
Exit: External purchase requests create supplier-specific POs; each delivery creates one active GRN draft from its PO; confirmation applies only remaining PO quantity, values excess at zero, and updates stock/PO atomically; supplier invoices, payments, and credits support explicit many-to-many allocations without exposing monetary data to warehouse roles.
Evidence: additive migration replayed from the current baseline and applied to Greenfield; 38 focused PO/GRN/Finance acceptance tests; URL-filtered unified GRN list; regenerated Greenfield database types; post-apply RLS, RPC grants, and advisor checks.

### T3 review

- **PM:** The operational queue starts from approved POs that still have undelivered quantity. Internal `stock_requests` remain separate. No promotion engine, OCR, multi-currency, or speculative approval workflow is added.
- **BA:** `purchase_request → purchase_order → goods_received_note` is one-to-many at each boundary, while every new PO and GRN has exactly one parent. Free goods are ordinary zero-price PO lines. Unplanned accepted excess is stored separately from PO fulfillment and has zero receipt value. Invoices, payments, and credits use allocation rows; returns do not mutate AP automatically.
- **Senior Dev:** Multi-row writes stay in locked RPCs. Duplicate ingredient PO lines are preserved by line identity, not ingredient aggregation. Legacy confirmed GRNs and retrospective links remain readable; no heuristic split or destructive backfill is allowed. Monetary list payloads are selected only for authorized roles.
- **QA:** Concurrency, idempotency, partial deliveries, zero-price lines, excess, rejection, stable pagination, URL filters, role-based payload absence, invoice matching, payment allocation, and legacy compatibility each require executable coverage.

Synthesis: replace only the active procurement path and keep compatibility columns/functions read-only where existing records still depend on them. Database constraints and RPC locks own invariants; UI reflects the resulting state and does not recreate business rules.

- [ ] Run authenticated `390×844`, `768×1024`, and `1440×900` smoke after the migration is applied to the authorized target.

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

## Converge Inventory to D091

State: blocked
Kind: defect
Tier: T3
Lane: inventory/topology
Exit: D091 is the only active Inventory authority; every active site has exactly one active warehouse enforced by DB; stock-location Bếp routing, redundant GRN QC, price-QC, and promoted PO-first paths are absent from active runtime/docs/tests; fresh replay, Greenfield catalog checks, repository gates, and authenticated Inventory smoke pass.
Evidence: D091 is applied only to verified Greenfield `enloyfnuerqgaqderbwb`; fresh replay, final-catalog/behavior SQL, advisors, regenerated types, targeted and full tests, typecheck, package lint, and build pass. Branch 3 now has one warehouse, no active kitchen or legacy Inventory catalog remains, and `web.comtammatu.com` serves the new deployment with healthy DB/public route smoke at `390`, `768`, and `1280`.
Blocker: Authenticated live smoke needs an authorized Greenfield Owner/Branch Manager credential. The local manager/cashier/chef E2E accounts target local Supabase and none exists among the eight Greenfield Auth users. Do not create users or impersonate a live identity without owner delegation. Aggregate `lint` also stops only on the three pre-existing UI-contract hits in the owner's retained `surface.tsx` and `stock-client.tsx` edits; every subsequent lint gate and all package ESLint tasks pass. Recheck when the owner delegates a Greenfield test credential and resolves or intentionally accepts those retained UI-contract edits.

- [ ] Run authenticated Owner/Branch Inventory smoke at `390`, `768`, and `1280`, then remove this outcome when every Exit item is evidenced.

## Defer central production workspace cutover

State: blocked
Kind: feature
Tier: T3
Lane: inventory/central-ops
Exit: Production runs only on `central_kitchen`; `/warehouse` and `/kitchen` workspaces exist after Phase 2 `operational_site` authority.
Evidence: D091, ADR 0015/0017, architecture Phase 2/4 exit criteria.
Blocker: Central procurement smoke proven on Greenfield; still depends on Greenfield authority cutover (Phase 2 / CTCP H2). Recheck when Phase 2 authority cutover lands on Greenfield.

- [ ] After Phase 2 authority lands, implement Phase 4 workspaces and move production off branch sites.

## Complete the CTCP authority and e-invoice cutover on current Greenfield

State: doing
Kind: feature
Tier: T3
Lane: platform/security-finance
Exit: The existing `comtammatu` deployment uses the current Greenfield project as its only target, legal identity and Viettel profile come from live Tenant data, VAT is explicit per sold line, and database authority no longer depends on HR positions or forged JWT scope.
Evidence: Greenfield is live target for `web.comtammatu.com`. Invoice-profile/VAT snapshot applied and types regenerated. Runtime still uses position-derived JWT `user_role` / `MODULE_ACL`. Catalog/Viettel smoke and ADR 0015 negative matrix still open; authority cutover must preserve the D091 site model.

- [ ] Re-plan and implement scoped authority caller/RLS cutover on Greenfield under D091 site model; preserve Tenant, Branch, profile, and Auth bootstrap rows.
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
