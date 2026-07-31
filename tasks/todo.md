# Current Tasks

> Active outcomes only. Workflow and field rules live in
> `docs/agent/rules/workflow.md` → Current Task Lifecycle. Shipped work lives in
> git; deterministic failures live in `tasks/regressions.md`; durable lessons
> live in `tasks/lessons.md`; stable contracts live in their owning docs.

## Drop confirmed-dead purchase-request create/submit RPCs after demand cutover

State: triage
Kind: debt
Tier: T3
Lane: database/rpc-cleanup
Exit: `create_purchase_request` and `submit_purchase_request` are absent from Production after deployed callers and data proof; types regenerated; 6-channel scan + `pg_depend`/`pg_stat_user_functions` evidence recorded.
Evidence: 2026-08-01 inventory — both RPCs have zero JS `.rpc()` callers and no active SQL call/trigger/cron/policy refs beyond their own CREATE/GRANT; still present in types and additive migration `20260729180000`. Related blocked outcomes already cover `create_supplier_payment` and purchase-request retirement smoke.

- [ ] Reconfirm zero callers against Production catalogs (`pg_proc`, `pg_depend`, `pg_stat_user_functions.calls`) before writing a DROP migration.
- [ ] Drop only after the purchase-demand cutover Exit is proven and owner delegates Production apply; keep rollback bodies per `RPC-ROLLBACK-MUST-INCLUDE-BODY`.

## Revive Central Operator Hub for Kho Tổng / Bếp TT

State: verify
Kind: feature
Tier: T3
Lane: inventory/operator-shell
Exit: `central_supply_ops` / `central_kitchen_lead` login → `/br/{pinnedSiteId}` touch hub (bottom nav + job tiles); GRN/SX/YCM/fulfillment on central kinds; CN keeps D093 redirects; Owner/Accountant keep `/inventory`.
Evidence: ACL/scope/proxy/home chrome; OPERATOR_TILE_ITEMS; restored GRN/production/purchase-requests/transfer pages; docs role-ops/screen-map/ui/matrix; static auth/scope/nav contracts; typecheck.

- [ ] Authenticated CS/CK responsive smoke at `390×844`, `768×1024`, `1440×900`: home → GRN → fulfill → tồn; CK thêm SX + Yêu cầu Kho Tổng.

## Unit role picker + stock display contract

State: verify
Kind: feature
Tier: T3
Lane: inventory/units
Exit: GRN picks receipt|issue (default receipt); Issue/DC/waste pick issue|receipt (default issue); menu recipes accept any active ladder unit; stock UI qty/WAC display in issue unit while ledger stays `is_base`; PO stays receipt-only and BOM/LSX stay production-only.
Evidence: helpers + UI wired; migration `20260801001600_inventory_entry_unit_receipt_or_issue.sql` + SQL test; docs `inventory.md`/`glossary.md`; static contract tests; `typecheck`/`lint`/`build` green. Production ledger already has `20260801001600` (`private.entry_unit_matches_roles`; GRN trigger `receipt,issue`; issue/transfer `issue,receipt`); dry-run `supabase-production-push.mjs --dry-run` → remote up to date. Owner delegated apply 2026-08-01; no-op apply needed.

- [ ] Smoke: ingredient Nhập≠Xuất≠Sản xuất → GRN chọn Xuất OK; DC/Xuất chọn Nhập OK; Sản xuất trên GRN/Xuất fail; định mức món chọn đơn vị bất kỳ; màn tồn hiện SL/WAC theo Xuất.

## Replace production recipe yield_factor with output_quantity

State: verify
Kind: feature
Tier: T3
Lane: inventory/production
Exit: Production BOM stores and requires `output_quantity` (no prefills of 1 on create); `yield_factor` removed from `production_recipes`; scale uses `planned × qty / output_quantity`; menu `recipes.yield_factor` unchanged.
Evidence: migration `20260801001549` already on Production (`output_quantity` NOT NULL, no default, `yield_factor` dropped, upsert takes `p_output_quantity`); `db:types` regenerated; static tests + typecheck/lint/build passed.

- [ ] Owner smoke on `/inventory/production`: tạo công thức không prefills 1 → lưu với N → lệnh sản xuất scale đúng.

## Fix production recipe entry unit role pipe

State: verify
Kind: defect
Tier: T2
Lane: inventory/production
Exit: Saving a production recipe for an ingredient that already has `production_unit_id` succeeds; ingredients without a production role show clear Vietnamese copy and fail closed before RPC; quick-create from production sets `production_unit_id`.
Evidence: static test `production-recipe-source-static.test.ts`, typecheck/lint/build, authenticated Owner smoke on `/inventory/production`.

- [ ] Smoke save recipe with a material that has `production_unit_id` and one that lacks it.

## Grant inventory entry snapshot columns and skip HR queues on central sites

State: verify
Kind: defect
Tier: T3
Lane: inventory/authz
Exit: YCM list can select `purchase_order_items.entry_to_base_factor`; operator home on Kho Tổng / Bếp does not call leave/checkout review RPCs.
Evidence: migration `20260731233612` applied to Production, static tests, Owner smoke YCM list + `/br/1` home.

- [ ] Deploy web and smoke YCM list + `/br/1` home (no leave 403).

## Repair purchase-demand PO coverage across unit roles

State: verify
Kind: defect
Tier: T3
Lane: procurement/units
Exit: YCM progress and status compare PO coverage in base units so a demand in issue/export units that is fully ordered in receipt units shows complete (`ordered`, remaining 0) — including repair of `YCM-31072026-0010`.
Evidence: SQL coverage regression, progress unit test, static contract, Production apply + status repair, repository gates.

- [ ] Deploy web with demand progress mapping and smoke `YCM-31072026-0010` UI (`200/200 cuộn`).

## Repair accountant expenses and purchase-demand approval

State: verify
Kind: defect
Tier: T3
Lane: finance/procurement
Exit: An Accountant with `finance:expense_create` can edit/cancel an unmatched operating expense and confirm unpaid → cash|transfer; purchase-demand approval creates PO lines in each ingredient's receipt unit with an exact, three-decimal quantity conversion.
Evidence: focused regression, migration lineage, repository gates, authorized Production apply, regenerated types, and authenticated Accountant smoke.

- [ ] Smoke Accountant: edit/cancel unmatched operating expense and unpaid → TM/CK (`finance:expense_create` live on Production).
- [ ] Run authenticated Accountant smoke: approve a purchase demand whose request and receipt units differ.

## Correct unmatched expense payment method for Owner/Accountant

State: verify
Kind: defect
Tier: T3
Lane: finance/expenses
Exit: Owner and Accountant with `finance:expense_create` can change an unmatched operating-expense payment method (`cash`/`transfer`/`unpaid`) in the expense edit form; matched, `bank_deposit`, and open transfer-content intents stay locked; POS session bill PTTT is also available to Accountant.
Evidence: migration `20260801053526_correct_expense_payment_method.sql`, static finance-expense and cash-shift contract tests, repository gates, authorized Production apply, authenticated Owner/Accountant smoke on a cash-paid unmatched expense.

- [ ] Smoke Owner/Accountant: edit a cash-paid unmatched expense → chuyển khoản, then back if needed.

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
Evidence: ADR 0019 Accepted; non-durable plan snapshot removed; position-task editor shows all assignable positions (no staff/task filter bypass). Remaining findings still need CodeGraph/source re-audit.

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
