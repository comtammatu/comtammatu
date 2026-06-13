# DB Data Cleanup - 2026-06-12

Scope: production project `iexwsuaqqenyjiskawoj`. This pass is read-only audit
plus a proposed owner-run cleanup batch. No production write was executed by the
agent.

Skill plan: repo rules = engineering + skills + database + workflow +
references; external skills = supabase + supabase-postgres-best-practices +
careful; runtime tools = Supabase MCP SELECT-only SQL + local source/docs
inspection; skipped = production write/apply because the Environment Registry
allows SELECT-only unless the owner delegates a write in the current session.

## T3 Synthesis

PM:

- Goal is to reduce stale operational queue data without touching financial,
  tax, inventory, payroll, or audit records.
- Acceptance for batch 1 is exact preflight counts, FK checks, and a reversible
  decision boundary: only queue/inbox data older than the chosen retention
  window is eligible.
- Do not treat all old rows as junk. Real completed orders, payments, HĐĐT,
  journals, `audit_logs`, and `order_status_history` are business records.

BA:

- The first cleanup target should be operational artifacts: `print_jobs`,
  KDS queue rows, and low-value notification feed rows.
- Stale open POS sessions and old unpaid `new` orders are operational exceptions
  to close/cancel through the product workflow or an explicit incident runbook,
  not blind deletes.
- Notifications have `expires_at = NULL` today, so deletion must be a retention
  decision by `kind` and age, not the existing expired-notification janitor.

Senior Dev:

- Keep the first batch conservative: 30-day retention, status allowlists, and
  FK preflight before delete.
- Use short transactions and bounded CTE deletes. For larger future batches,
  run in chunks and verify counts between chunks.
- Do not add a migration or cron until batch 1 proves the retention contract.

QA/QC:

- Verify no orphan rows exist before cleanup and verify post-cleanup counts by
  status/kind.
- Re-check KDS/Runner code paths: current views query today's active/ready rows;
  completion history queries today's `ready`/`served` rows only.
- Keep prod mutation out of the agent path unless the owner explicitly delegates
  the exact batch in the current session.

## Read-Only Audit

Checked at `2026-06-12 14:33:58` Asia/Ho_Chi_Minh.

| Area | Current finding |
| --- | --- |
| Environment | `.env.local` and repo MCP point to production `iexwsuaqqenyjiskawoj`; no dev/test Supabase target is registered. |
| Largest table | `print_jobs`: 16,540 rows, about 26 MB total. |
| `print_jobs` | 15,688 `printed`, 852 `failed`; 8,767 printed + 301 failed are older than 30 days. Payload estimate for the 30-day candidates is about 8.8 MB. |
| `kds_tickets` | 624 rows. No active `pending`/`preparing` rows before today. Old non-active candidates older than 30 days: 158 branch 2 cancelled, 41 branch 2 served, 40 branch 3 cancelled. |
| `payments` | 5,612 `completed`, 21 `failed`, 0 `pending`; `cleanup_abandoned_payments()` has no current pending candidate. |
| `notifications` | 6,393 rows; all have `expires_at = NULL`; 3,252 older than 30 days. `pos.order_new` dominates with 6,184 rows. |
| `notification_reads` | 6,157 rows; 0 orphan reads. Reads cascade when a notification is deleted. |
| Daily-limit holds | 109 rows; all expired, but 34 committed and 75 released. 0 unresolved expired holds. |
| POS sessions | 2 sessions are open: branch 2 opened `2026-06-09 17:39:05+00`, branch 3 opened `2026-06-11 23:09:00+00`. |
| Orders | Branch 2 has 2 `new` + `unpaid` orders older than 24h. Do not delete as cleanup; resolve via POS workflow or a dedicated incident runbook. |
| HĐĐT | 41 draft invoices older than 24h. Preserve/reconcile, do not delete in this cleanup pass. |
| FK/orphans | 0 orphan `order_items`, `payments`, `kds_tickets`, `kitchen_send_batches`, `print_jobs`, or `notification_reads` in the audited joins. |

## Batch 1 Contract

Recommended first owner-run batch:

1. Delete `print_jobs` where `status IN ('printed', 'failed')` and
   `created_at < now() - interval '30 days'`.
2. Delete `kds_tickets` where `status IN ('cancelled', 'served')` and
   `created_at < now() - interval '30 days'`.
3. Delete only `notifications.kind = 'pos.order_new'` rows older than 30 days.
   Let `notification_reads` cascade through the FK.

Explicitly out of scope for batch 1:

- `orders`, `order_items`, `payments`, `refunds`, `tax_invoices`,
  `tax_invoice_events`, `journal_entries`, `journal_entry_lines`,
  `audit_logs`, `order_status_history`, inventory stock/procurement rows,
  payroll/attendance rows.
- Workflow notifications such as GRN/PO/transfer/stocktake until there is a
  retention policy for unresolved operational tasks.
- Migration ledger reconciliation, which is a separate concern from data
  cleanup.

## Owner-Run Preflight

Run before any delete:

```sql
WITH print_candidates AS (
  SELECT id
  FROM public.print_jobs
  WHERE status IN ('printed', 'failed')
    AND created_at < now() - interval '30 days'
),
kds_candidates AS (
  SELECT id
  FROM public.kds_tickets
  WHERE status IN ('cancelled', 'served')
    AND created_at < now() - interval '30 days'
),
notification_candidates AS (
  SELECT id
  FROM public.notifications
  WHERE kind = 'pos.order_new'
    AND severity = 'info'
    AND created_at < now() - interval '30 days'
)
SELECT
  (SELECT count(*) FROM print_candidates) AS print_jobs,
  (
    SELECT count(*)
    FROM public.print_jobs pj
    JOIN print_candidates c ON c.id = pj.reprinted_from_id
  ) AS print_jobs_referenced_by_reprints,
  (SELECT count(*) FROM kds_candidates) AS kds_tickets,
  (SELECT count(*) FROM notification_candidates) AS notifications,
  (
    SELECT count(*)
    FROM public.notification_reads nr
    JOIN notification_candidates c ON c.id = nr.notification_id
  ) AS notification_reads_cascade;
```

Expected from the read-only audit at the time above:

| Metric | Expected |
| --- | ---: |
| `print_jobs` | 9,068 |
| `print_jobs_referenced_by_reprints` | 0 |
| `kds_tickets` | 239 |
| `notifications` | 3,107 |
| `notification_reads_cascade` | 3,107 |

## Owner-Run Apply Script

Run only after backup/snapshot and owner approval for this exact batch:

```sql
BEGIN;

WITH deleted_print_jobs AS (
  DELETE FROM public.print_jobs pj
  WHERE pj.id IN (
    SELECT id
    FROM public.print_jobs
    WHERE status IN ('printed', 'failed')
      AND created_at < now() - interval '30 days'
    ORDER BY id
    LIMIT 10000
    FOR UPDATE SKIP LOCKED
  )
  RETURNING status
),
deleted_kds_tickets AS (
  DELETE FROM public.kds_tickets kt
  WHERE kt.id IN (
    SELECT id
    FROM public.kds_tickets
    WHERE status IN ('cancelled', 'served')
      AND created_at < now() - interval '30 days'
    ORDER BY id
    LIMIT 10000
    FOR UPDATE SKIP LOCKED
  )
  RETURNING status
),
deleted_notifications AS (
  DELETE FROM public.notifications n
  WHERE n.id IN (
    SELECT id
    FROM public.notifications
    WHERE kind = 'pos.order_new'
      AND severity = 'info'
      AND created_at < now() - interval '30 days'
    ORDER BY id
    LIMIT 10000
    FOR UPDATE SKIP LOCKED
  )
  RETURNING kind
)
SELECT jsonb_build_object(
  'print_jobs', (
    SELECT COALESCE(jsonb_object_agg(status, rows), '{}'::jsonb)
    FROM (SELECT status, count(*) AS rows FROM deleted_print_jobs GROUP BY status) s
  ),
  'kds_tickets', (
    SELECT COALESCE(jsonb_object_agg(status, rows), '{}'::jsonb)
    FROM (SELECT status, count(*) AS rows FROM deleted_kds_tickets GROUP BY status) s
  ),
  'notifications', (
    SELECT count(*) FROM deleted_notifications
  )
) AS deleted;

COMMIT;
```

## Post-Apply Verification

```sql
SELECT status, count(*) AS rows
FROM public.print_jobs
GROUP BY status
ORDER BY status;

SELECT branch_id, status, count(*) AS rows
FROM public.kds_tickets
GROUP BY branch_id, status
ORDER BY branch_id, status;

SELECT kind, severity, count(*) AS rows
FROM public.notifications
GROUP BY kind, severity
ORDER BY rows DESC, kind;
```

Expected impact: app runtime should not require a code change, but table bloat
may not shrink on disk until autovacuum catches up. A later durable retention
feature can add cron/RPC only after this first batch is accepted.

## April Inventory and Order Test-Data Audit

User clarification: old April Inventory and Order data, especially local
UTC+7 `22:00` to `<06:00`, is draft/testing data.

Read-only findings:

| Area | Finding |
| --- | --- |
| Inventory transactions | No April rows in `stock_movements`, `purchase_orders`, `goods_received_notes`, `supplier_invoices`, `supplier_returns`, `production_orders`, `stock_issues`, or `stocktake_sessions`. |
| Inventory config | 6 `inventory_locations` rows were created on `2026-04-22` during daytime local hours. Treat these as structural config, not transaction cleanup, unless the owner wants to reset Inventory setup. |
| April orders, all hours | 846 orders, total `63,553,300`; 705 paid/completed orders; 142 cancelled; one draft tax invoice; no tax invoice events, refunds, webhooks, stock movements, or journal rows in the audited joins. |
| April orders, local `22:00` to `<06:00` | 32 orders, total `2,546,000`; 27 paid/completed orders and 5 cancelled/unpaid orders; no HĐĐT, refunds, webhooks, stock movements, or journal rows. |
| April night dependencies | 72 `order_items`, 28 `payments`, 33 `kds_tickets`, 81 `print_jobs`, 104 `order_status_history` rows, and 32 order-linked `notifications`. |
| April night branches | Branch 2: 25 orders; branch 3: 7 orders. |

Conclusion: there is no April-night Inventory transaction batch to delete. The
best next cleanup target from the clarification is Order test data in April
night hours.

## Batch 2 Contract

Recommended owner-run batch after a backup/snapshot:

1. Delete April `orders` created in local UTC+7 night hours
   (`22:00` to `<06:00`) for branch 2 and branch 3.
2. Delete order-linked `notifications` for the same candidates because
   `notifications.entity_type/entity_id` is indexed metadata, not a foreign key
   to `orders`.
3. Let order child rows cascade through existing foreign keys:
   `order_items`, `payments`, `print_jobs`, `kds_tickets`,
   `order_status_history`, and any other FK children.

Narrower alternative for an extra-safe first slice: add
`AND (o.status = 'cancelled' OR o.payment_status IS DISTINCT FROM 'paid')` to
the candidate query. That reduces the first deletion to the 5 cancelled/unpaid
night orders.

Explicitly out of scope for batch 2:

- Broad April all-hours order deletion. That removes 846 orders, about
  `63,592,300` in completed payments, and one draft tax invoice, so it needs a
  separate owner sign-off.
- April `inventory_locations`; those are setup/config rows, not the transaction
  data that was audited as empty.
- `order_daily_counters`; preserving counters avoids sequence reuse after
  deleting historical test orders.

## Batch 2 Owner-Run Preflight

Run before any delete:

```sql
WITH candidate_orders AS MATERIALIZED (
  SELECT o.id
  FROM public.orders o
  WHERE o.branch_id IN (2, 3)
    AND (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= DATE '2026-04-01'
    AND (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < DATE '2026-05-01'
    AND (
      (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time >= TIME '22:00'
      OR (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time < TIME '06:00'
    )
)
SELECT jsonb_build_object(
  'orders', (SELECT count(*) FROM candidate_orders),
  'order_items', (
    SELECT count(*)
    FROM public.order_items oi
    JOIN candidate_orders c ON c.id = oi.order_id
  ),
  'payments', (
    SELECT count(*)
    FROM public.payments p
    JOIN candidate_orders c ON c.id = p.order_id
  ),
  'completed_payment_amount', (
    SELECT COALESCE(sum(p.amount), 0)
    FROM public.payments p
    JOIN candidate_orders c ON c.id = p.order_id
    WHERE p.status = 'completed'
  ),
  'kds_tickets', (
    SELECT count(*)
    FROM public.kds_tickets kt
    JOIN candidate_orders c ON c.id = kt.order_id
  ),
  'print_jobs', (
    SELECT count(*)
    FROM public.print_jobs pj
    JOIN candidate_orders c ON c.id = pj.order_id
  ),
  'order_status_history', (
    SELECT count(*)
    FROM public.order_status_history osh
    JOIN candidate_orders c ON c.id = osh.order_id
  ),
  'notifications', (
    SELECT count(*)
    FROM public.notifications n
    JOIN candidate_orders c
      ON n.entity_type = 'order'
     AND n.entity_id = c.id
  ),
  'tax_invoices', (
    SELECT count(*)
    FROM public.tax_invoices ti
    JOIN candidate_orders c ON c.id = ti.order_id
  ),
  'tax_invoice_order_links', (
    SELECT count(*)
    FROM public.tax_invoice_orders tio
    JOIN candidate_orders c ON c.id = tio.order_id
  ),
  'refunds', (
    SELECT count(*)
    FROM public.refunds r
    JOIN candidate_orders c ON c.id = r.order_id
  ),
  'webhook_events', (
    SELECT count(*)
    FROM public.webhook_events we
    JOIN public.payments p ON p.id = we.payment_id
    JOIN candidate_orders c ON c.id = p.order_id
  ),
  'stock_movements', (
    SELECT count(*)
    FROM public.stock_movements sm
    JOIN candidate_orders c ON c.id = sm.order_id
  )
) AS preflight;
```

Expected from the read-only audit:

| Metric | Expected |
| --- | ---: |
| `orders` | 32 |
| `order_items` | 72 |
| `payments` | 28 |
| `completed_payment_amount` | 2,546,000 |
| `kds_tickets` | 33 |
| `print_jobs` | 81 |
| `order_status_history` | 104 |
| `notifications` | 32 |
| `tax_invoices` | 0 |
| `tax_invoice_order_links` | 0 |
| `refunds` | 0 |
| `webhook_events` | 0 |
| `stock_movements` | 0 |

Refresh at `2026-06-12 16:01 +07`: the preflight still matches the expected
candidate set. Additional checks found `0` external `split_from_order_id` refs
and `0` external `merged_into_order_id` refs into this batch.

## Batch 2 Owner-Run Apply Script

Run only after the preflight still matches the intended candidate set:

```sql
BEGIN;

CREATE TEMP TABLE cleanup_april_night_order_ids (
  id bigint PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO cleanup_april_night_order_ids (id)
  SELECT o.id
  FROM public.orders o
  WHERE o.branch_id IN (2, 3)
    AND (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= DATE '2026-04-01'
    AND (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < DATE '2026-05-01'
    AND (
      (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time >= TIME '22:00'
      OR (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time < TIME '06:00'
    );

SELECT jsonb_build_object(
  'candidate_order_ids', (
    SELECT jsonb_agg(id ORDER BY id)
    FROM cleanup_april_night_order_ids
  ),
  'candidate_orders', (
    SELECT count(*)
    FROM cleanup_april_night_order_ids
  ),
  'candidate_notifications', (
    SELECT count(*)
    FROM public.notifications n
    JOIN cleanup_april_night_order_ids c
      ON n.entity_type = 'order'
     AND n.entity_id = c.id
  )
) AS pre_delete_check;

WITH
deleted_notifications AS (
  DELETE FROM public.notifications n
  USING cleanup_april_night_order_ids c
  WHERE n.entity_type = 'order'
    AND n.entity_id = c.id
  RETURNING n.id
),
deleted_orders AS (
  DELETE FROM public.orders o
  USING cleanup_april_night_order_ids c
  WHERE o.id = c.id
  RETURNING o.id, o.branch_id, o.status, o.payment_status
)
SELECT jsonb_build_object(
  'notifications', (SELECT count(*) FROM deleted_notifications),
  'orders', (
    SELECT jsonb_agg(row_to_json(s))
    FROM (
      SELECT branch_id, status, payment_status, count(*) AS rows
      FROM deleted_orders
      GROUP BY branch_id, status, payment_status
      ORDER BY branch_id, status, payment_status
    ) s
  )
) AS deleted;

SELECT
  (
    SELECT count(*)
    FROM public.orders o
    JOIN cleanup_april_night_order_ids c ON c.id = o.id
  ) AS remaining_orders,
  (
    SELECT count(*)
    FROM public.notifications n
    JOIN cleanup_april_night_order_ids c
      ON n.entity_type = 'order'
     AND n.entity_id = c.id
  ) AS remaining_order_notifications;

COMMIT;
```

## Batch 2 Post-Apply Verification

The apply script emits exact `remaining_orders` and
`remaining_order_notifications` before commit by using the temp candidate-id
table. For an independent check after commit, only the order-window count can be
recomputed exactly from `orders`; notification verification needs the
`candidate_order_ids` emitted by the apply script because those rows no longer
have live parent orders. Replace the JSON array below with that emitted ID list.

```sql
SELECT count(*) AS remaining_april_night_orders
FROM public.orders o
WHERE o.branch_id IN (2, 3)
  AND (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= DATE '2026-04-01'
  AND (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < DATE '2026-05-01'
  AND (
    (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time >= TIME '22:00'
    OR (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time < TIME '06:00'
  );

WITH deleted_order_ids AS (
  SELECT jsonb_array_elements_text('[0]'::jsonb)::bigint AS id
)
SELECT count(*) AS remaining_order_notifications
FROM public.notifications n
JOIN deleted_order_ids c
  ON n.entity_type = 'order'
 AND n.entity_id = c.id;
```

## Inventory Full Reset

User clarification: Inventory should be fully reset, with no old Inventory data
kept.

Skill plan: repo rules = engineering + skills + database + workflow +
references; external skills = supabase + supabase-postgres-best-practices +
careful; runtime tools = Supabase MCP SQL + local source/docs inspection;
production write = owner delegated Inventory full reset in the current session.

T3 synthesis for batch 3:

PM:

- Goal is a clean Inventory baseline, not partial retention.
- Acceptance is zero rows across Inventory, Procurement, Production, and
  Inventory-linked notification traces.
- Reset does not recreate seed/catalog data; that is a separate setup step.

BA:

- Scope includes master/config rows: ingredients, inventory locations,
  suppliers, waste caps, QC settings, review policy.
- Scope includes operational Inventory workflow notifications so the app does
  not keep feed rows pointing at removed Inventory records.
- Scope does not include branches, menu, POS orders, payments, HĐĐT, finance
  journals, profiles, or tenants.

Senior Dev:

- Use explicit table list with `TRUNCATE ... RESTART IDENTITY` and no `CASCADE`.
  If an unexpected outside FK exists, the apply should fail instead of widening
  the blast radius.
- Delete Inventory/workflow notifications first because they are metadata links,
  not FKs to the Inventory tables.
- Keep the reset as an owner-run SQL batch, not a migration.

QA/QC:

- Preflight must match table counts and trace counts before apply.
- Post-apply must prove all target tables are zero and Inventory notification
  traces are zero.
- Inventory UI will show empty setup states until fresh locations, ingredients,
  suppliers, and any needed policies are recreated.

Read-only inventory reset audit at `2026-06-12 16:12 +07`:

| Area | Rows |
| --- | ---: |
| `ingredients` | 66 |
| `inventory_locations` | 6 |
| `suppliers` | 1 |
| `branch_daily_waste_cap` | 4 |
| `ingredient_category_review_policy` | 1 |
| `inventory_qc_settings` | 1 |
| Inventory/Procurement/Production transaction tables | 0 |
| Inventory/workflow `notifications` | 100 |
| `notification_reads` cascading from those notifications | 25 |
| `notification_push_deliveries` cascading from those notifications | 0 |
| Inventory-related `audit_logs` | 0 |
| Inventory-related `notification_outbox` | 0 |
| Outside tables referencing Inventory tables by FK | 0 |

Applied at `2026-06-12 16:16 +07`.

Post-apply verification:

| Check | Result |
| --- | --- |
| Inventory/Procurement/Production target tables | 36/36 zero rows |
| Non-zero target tables | 0 |
| Remaining Inventory/workflow notifications | 0 |

Runbook: `docs/runbooks/db-data-cleanup-production.md`.
