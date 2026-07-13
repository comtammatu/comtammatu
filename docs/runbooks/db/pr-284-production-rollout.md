# PR #284 Production Rollout

This runbook applies only the reviewed forward deltas after the current
production-schema cutoff. It does not replay history and it does not authorize a
production write. Every production stage requires fresh owner authorization for
the exact target and operation.

## Non-negotiable boundaries

- Target ref must be `iexwsuaqqenyjiskawoj` and must be reverified immediately
  before every production operation.
- Never apply `00000000000000_baseline.sql`,
  `20260627140000_fold_managed_surfaces.sql`, or anything under
  `supabase/migration-archive/` to production.
- Never use file-based `supabase db push`, chronological replay, or a Docker
  Local result as production proof. Use the owner-approved selective migration
  path; production ledger versions may be apply timestamps while `name` maps to
  the reviewed source migration.
- Apply one named migration at a time. Confirm both schema effect and migration
  ledger entry before advancing.
- A lock timeout, statement timeout, ambiguous backfill, unexpected row count,
  non-zero invalid SePay evidence count, failed smoke, or SHA mismatch is a hard
  stop. Do not repair around the failure inside the release window.
- Committed DDL is not rolled back with destructive reverse SQL. Disable the
  dependent feature or deploy a reviewed forward fix.

## Required proof before Stage A

1. Push the final reviewed PR SHA and create a new data-less Supabase Preview
   Branch associated with that exact Git branch and SHA. Prior Preview proof is
   invalid after any migration-body, generated-type, payment, or ledger change.
2. Prove the full active Preview chain, regenerate database types from that
   Preview schema, remove temporary untyped RPC adapters, and obtain green
   `typecheck`, `lint`, `build`, and complete tests on the resulting source.
3. Re-run production read-only preflight and capture:
   - project health and current migration-ledger tail;
   - source-name-to-production-ledger mapping for every candidate below;
   - `payment_enable_momo` disabled on the legacy runtime;
   - zero legacy MoMo pending payments, payment requests, and webhook events;
   - current SePay expense-match shape, signed evidence validity, event totals,
     expense caps, and absence of true ambiguous many-to-many backfill rows;
   - backup/PITR readiness and recent SePay/Vercel delivery health.
4. Confirm both deployment flags are false on the exact runtime being deployed:
   `MOMO_ENABLED=false` and `MOMO_RUNTIME_READY=false`.
5. Assign an operator, observer, abort owner, and a quiet payment window. Keep
   SePay webhook intake live. Freeze the manual expense-allocation editor during
   its runtime-to-migration compatibility window. Freeze all expense deletion
   before Stage A until migration 14 has committed and its foreign-key checks
   pass; before migration 14, deleting a matched expense can erase allocation
   evidence. Freeze ingredient/unit catalog create, update, and import before
   migration 3 until the exact-head runtime has fully drained the old runtime.
   Freeze Menu Limits replenishment before Stage B until migration 15 and its
   warehouse-ledger smoke pass. Keep supplier-payment creation and SePay
   supplier-link editing disabled until migration 16 is committed, the old
   runtime is drained, and the supplier-payment acceptance gates below pass.

## Selective forward manifest

| Order | Migration name                                                  | Release boundary               |
| ----: | --------------------------------------------------------------- | ------------------------------ |
|     1 | `20260710193275_expand_ingredient_catalog_without_shelf_life`   | Stage A                        |
|     2 | `20260712010647_canonicalize_po_notification_action_url`        | Stage A                        |
|     3 | `20260712022515_canonicalize_unit_codes_and_category_policy`    | Stage A                        |
|     4 | `20260712032325_canonicalize_payment_method_rpc_residue`        | Stage A                        |
|     5 | `20260712071541_stabilize_cash_receipt_warning`                 | Stage A                        |
|     6 | `20260712130942_fix_branch_stocktake_and_waste_upload_auth`     | Stage A                        |
|     7 | `20260712161526_quarantine_duplicate_sepay_transfers`           | Stage C                        |
|     8 | `20260712174500_allow_self_order_pending_add_more`              | Stage C                        |
|     9 | `20260712201500_add_momo_self_order_checkout`                   | Stage D, isolated              |
|    10 | `20260713032254_harden_runtime_control_plane`                   | Stage E                        |
|    11 | `20260713060850_adjudicate_sepay_payment_conflicts`             | Stage E                        |
|    12 | `20260713061000_retire_inventory_expiry_alert_contract`         | Stage E                        |
|    13 | `20260713150807_harden_sepay_cash_deposit_boundary`             | Stage E                        |
|    14 | `20260713151901_enforce_sepay_expense_allocation_amount`        | Stage E, isolated verification |
|    15 | `20260713173142_rewire_menu_limit_stock_exception_to_warehouse` | Stage E                        |
|    16 | `20260714103000_persist_sepay_supplier_payment_links`           | Stage E, isolated verification |
|    17 | `20260713210000_enforce_owner_only_refund_controls`             | Stage G                        |
|    18 | `20260713221534_drop_legacy_confirm_production_run_overload`    | Stage G                        |

## Stage A — compatible database preparation

Apply migrations 1–6 in order. Start the ingredient/unit write freeze before
migration 3. After each migration, verify its source name in the production
ledger and run its focused read-only catalog check. Stop before migration 7.

Acceptance:

- current production runtime remains healthy;
- cash/VietQR order creation and confirmation remain available;
- inventory and stocktake reads remain healthy;
- SePay delivery health and order settlement are unchanged.

After the exact-head runtime fully serves and the old runtime is drained, check
for residual legacy unit aliases and canonical-code collisions. Unfreeze catalog
writes only when that query is clean.

## Stage B — deploy the exact runtime default-off

Deploy the exact final PR SHA with both MoMo flags false. Do not change the
legacy `payment_enable_momo` setting. Confirm:

- new MoMo checkout is absent from Self-Order;
- MoMo cron returns the authenticated `momo_runtime_not_ready` skip before any
  database access;
- SePay webhook, VietQR, cash collection, POS, and Self-Order remain healthy;
- the expense-allocation editor is treated as read-only until migration 14 is
  committed and its generated contract is deployed.
- Menu Limits replenishment remains frozen because the head UI uses warehouse
  semantics while the old same-signature RPC can still post to a kitchen
  location.

Migration 7 must not run under the old SePay consumer. A rolling deployment is
acceptable only after the old runtime has drained and the exact-head runtime is
serving all payment/webhook traffic.

## Stage C — SePay and Self-Order compatibility

Apply migrations 7–8 in order. Recheck duplicate-transfer quarantine, exact
memo plus exact amount settlement, pending add-more idempotency, and recent
webhook status. Any real order must settle at most once.

## Stage D — isolated MoMo schema expansion

Migration 9 is a large explicit transaction and must run alone in a quiet
Self-Order payment window. Use its lock and statement timeouts as aborts; never
raise them ad hoc during rollout.

After commit, verify the MoMo payment method/provider constraints, request
columns, RPC signatures, grants, and empty pending state. Configure production
credentials and the trusted live base URL without logging secrets. Keep
`MOMO_ENABLED=false`.

Set `MOMO_RUNTIME_READY=true` and redeploy the same SHA only after schema/RPC
verification. This enables recovery and reconciliation for outstanding intents
without admitting new checkout. A later emergency admission shutdown must set
only `MOMO_ENABLED=false`; keep runtime readiness on so pending money can still
settle.

## Stage E — runtime, SePay adjudication, and allocation ledger

Apply migrations 10–13 one at a time, then run their focused catalog and money
smokes. Apply migration 14 alone.

Migration 14 preflight must prove:

- every matched event is signed SePay money-out, non-failed, and has a positive
  numeric amount;
- deterministic backfill produces an amount for every existing match;
- each event allocation sum equals its signed bank amount exactly;
- each legacy matched expense allocation sum equals its expense amount exactly;
- every legacy matched expense is already `transfer` with non-null `paid_at`;
- no true many-to-many shape requires an invented allocation;
- matched-expense deletion is restricted, and allocation-derived paid state can
  reverse on clear or reduction without clearing manually sourced paid state;
- existing matched expenses are classified as unknown paid-state provenance,
  while unmatched expenses receive the safe `false` default;
- direct `authenticated` table updates are removed so paid-state invariants can
  only change through the reviewed RPC or an explicitly authorized operation;
- authenticated inserts cannot supply the internal
  `paid_by_bank_allocation` provenance field.

Before production apply, the fresh Preview must prove: one event to multiple
expenses, one expense from multiple events, edit, clear, reassign, replay,
over-allocation rejection, matched-expense deletion rejection, and overlapping
expense concurrency. It must also prove that an exact no-op replay is allowed
for an expense with unknown legacy provenance, while clear, reassignment, and
direct authenticated table updates are rejected. Before the successful
migration-14 rehearsal, seed a disposable pre-migration partial legacy fixture
in Preview and prove the migration aborts with
`expense_allocation_legacy_partial_requires_triage`; remove the fixture through
the Preview-only reset/rehearsal path, never by weakening the guard.

After production migration 14, verify both expense foreign keys use
`ON DELETE RESTRICT`, `expenses_update` is absent, and `anon`/`authenticated`
have no direct table `UPDATE` privilege. Confirm `anon` has no expense `INSERT`
privilege and `authenticated` can insert only the reviewed business columns,
excluding `paid_by_bank_allocation`. Run read-only backfill and conservation
checks plus only an owner-selected real reconciliation smoke; never insert
synthetic finance rows into production.

List every matched expense whose `paid_by_bank_allocation IS NULL` and reconcile
its payment history against the signed SePay event, audit log, and operator
evidence. Do not infer provenance from `payment_method` or `paid_at`. The owner
must approve an explicit per-expense mapping: `true` only when the bank
allocation established the paid state and may reverse it, `false` when an
independent manual payment established the paid state. Apply that mapping, if
needed, as a separately authorized metadata-only transaction and record the
evidence. Resume the allocation editor and expense deletion only after no
matched expense remains unclassified and all checks pass.

Apply migration 15 and verify the selected warehouse, stock movement, menu-limit
increment, and audit row in one controlled smoke. Unfreeze Menu Limits
replenishment only after that evidence is clean.

Apply migration 16 alone after the exact-head runtime is serving and every old
runtime instance has drained. Before production apply, the fresh Preview must
prove all of the following:

- only a signed, final, unclassified SePay money-out can be linked;
- one event can link one or multiple bank-transfer supplier payments only when
  their exact sum equals the bank amount;
- replay, edit, and clear are deterministic and atomically audited;
- duplicate IDs, missing payments, cash payments, cross-tenant rows, non-Owner
  callers, in-flight events, and events already attached to an order or payment
  are rejected;
- supplier-payment and expense allocation are mutually exclusive in both call
  orders and under real concurrent database sessions;
- two real sessions competing for the same supplier payment serialize, one
  wins, and the loser receives `supplier_payment_already_linked` without a
  second attribution;
- direct `authenticated` supplier-payment writes and sequence access are
  absent, while the existing `create_supplier_payment` RPC remains callable;
- deleting linked webhook evidence is restricted, generated database types
  include the new column/RPC, and the UI renders only persisted links rather
  than date/reference/amount inference.

Do not enable real supplier-payment creation as part of this PR. Before the
first AP payment pilot, add an idempotency key with tenant-unique replay
semantics to `create_supplier_payment`; a lost response followed by retry can
otherwise duplicate a valid partial payment. Also re-evaluate branch scope
before granting `finance:ap_pay` to any non-Owner position. These are AP pilot
gates, not permission to widen this rollout.

## Stage F — controlled MoMo admission

With runtime readiness still on, verify cron/recovery returns a healthy empty or
settled result. Set `MOMO_ENABLED=true` and redeploy the same SHA in a staffed
canary window. Run one controlled real checkout and prove provider request,
signed IPN, exact amount, one payment completion, order state, guest return, and
reconciliation replay.

If the canary fails, set `MOMO_ENABLED=false` and redeploy the same SHA. Keep
`MOMO_RUNTIME_READY=true` until every admitted intent is terminal or explicitly
reviewed.

## Stage G — owner refund and legacy overload contract

After the payment canary and SePay allocation ledger are stable, apply migration
17, prove Owner-only refund request/approve/reject and contention behavior, then
apply migration 18 and prove the retained production-run signature. These two
migrations do not share the MoMo enable decision and must not be bundled into an
earlier failed stage.

## Closeout evidence

Record the exact Git SHA, deployment ID, production ref, migration ledger names
and apply versions, stage timestamps, row-count/conservation results, focused
smokes, real-payment canary IDs, and final monitoring status. Keep the following
truths separate: Preview replayed, source reviewed, runtime deployed, migration
applied, ledger recorded, feature enabled, and real money settled.
