# Production DB Data Cleanup

Runbook for owner-run production data cleanup. Do not use this file as a
business-record retention policy; it is an operational checklist for the exact
audited cleanup batches linked below.

Source evidence:

- [DB data cleanup worklog](../worklog/db-data-cleanup-2026-06-12.md)
- [Database environment registry](../agent/rules/database.md)

## Rules

- Target production project: `iexwsuaqqenyjiskawoj`.
- Run only after owner approval for the exact batch.
- Take a backup/snapshot first.
- Run preflight before every apply, even if the query was checked earlier.
- Do not run cleanup SQL as a migration.
- Do not broaden date, branch, status, or time filters inline.
- Do not delete all April orders unless there is a separate owner sign-off.
- Keep `order_daily_counters`; preserving counters avoids sequence reuse after
  removing historical test orders.

## Batch 2: April Night Orders

Batch 2: delete April 2026 POS test orders created in local UTC+7 night hours
from `22:00` to `<06:00` for branch 2 and branch 3.

Refreshed read-only preflight at `2026-06-12 16:01 +07`:

| Metric | Expected |
| --- | ---: |
| orders | 32 |
| order_items | 72 |
| payments | 28 |
| completed_payment_amount | 2,546,000 |
| kds_tickets | 33 |
| kitchen_send_batches | 0 |
| print_jobs | 81 |
| order_status_history | 104 |
| notifications | 32 |
| tax_invoices | 0 |
| tax_invoice_order_links | 0 |
| refunds | 0 |
| webhook_events | 0 |
| stock_movements | 0 |
| external `split_from_order_id` refs | 0 |
| external `merged_into_order_id` refs | 0 |

Branch/status breakdown:

| Branch | Status | Payment status | Rows | Total |
| ---: | --- | --- | ---: | ---: |
| 2 | cancelled | unpaid | 4 | 0 |
| 2 | completed | paid | 21 | 2,223,000 |
| 3 | cancelled | unpaid | 1 | 0 |
| 3 | completed | paid | 6 | 323,000 |

## Preflight

Expected output must match the table above before apply.

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
),
external_order_refs AS (
  SELECT 'split_from_order_id' AS ref_type, count(*) AS rows
  FROM public.orders o
  JOIN candidate_orders c ON c.id = o.split_from_order_id
  WHERE o.id NOT IN (SELECT id FROM candidate_orders)
  UNION ALL
  SELECT 'merged_into_order_id' AS ref_type, count(*) AS rows
  FROM public.orders o
  JOIN candidate_orders c ON c.id = o.merged_into_order_id
  WHERE o.id NOT IN (SELECT id FROM candidate_orders)
)
SELECT jsonb_build_object(
  'orders', (SELECT count(*) FROM candidate_orders),
  'orders_by_branch_status', (
    SELECT COALESCE(
      jsonb_agg(row_to_json(s) ORDER BY branch_id, status, payment_status),
      '[]'::jsonb
    )
    FROM (
      SELECT
        o.branch_id,
        o.status,
        o.payment_status,
        count(*) AS rows,
        COALESCE(sum(o.total_amount), 0) AS total_amount
      FROM public.orders o
      JOIN candidate_orders c ON c.id = o.id
      GROUP BY o.branch_id, o.status, o.payment_status
    ) s
  ),
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
  'kitchen_send_batches', (
    SELECT count(*)
    FROM public.kitchen_send_batches ksb
    JOIN candidate_orders c ON c.id = ksb.order_id
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
  ),
  'external_order_refs', (
    SELECT COALESCE(jsonb_object_agg(ref_type, rows), '{}'::jsonb)
    FROM external_order_refs
  )
) AS preflight;
```

Stop if any of these are non-zero:

- `tax_invoices`
- `tax_invoice_order_links`
- `refunds`
- `webhook_events`
- `stock_movements`
- external order refs

## Apply

Run in one SQL session after backup/snapshot and matching preflight. The first
result includes `candidate_order_ids`; keep it for post-apply notification
verification.

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

## Post-Apply

Run after commit.

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

Replace `[0]` with the `candidate_order_ids` array returned by the apply script.
Both checks should return `0`.

Record the run timestamp, preflight result, apply result, and post-apply result
back into the cleanup worklog.

## Batch 3: Inventory Full Reset

Batch 3 resets all Inventory, Procurement, and Production data. It does not
archive or preserve old Inventory data.

This batch intentionally includes Inventory master/config rows:

- ingredients
- inventory locations
- suppliers
- waste caps
- Inventory QC settings
- ingredient review policy

This batch intentionally excludes non-Inventory platform data:

- tenants, branches, profiles, menu
- POS orders, payments, refunds, HĐĐT
- finance journals, audit logs, payroll, attendance
- print jobs unrelated to Inventory reset

Status: applied at `2026-06-12 16:16 +07`.

Refreshed read-only preflight before apply at `2026-06-12 16:12 +07`:

| Metric | Expected |
| --- | ---: |
| branch_daily_waste_cap | 4 |
| ingredient_category_review_policy | 1 |
| ingredients | 66 |
| inventory_locations | 6 |
| inventory_qc_settings | 1 |
| suppliers | 1 |
| all listed Inventory transaction/document tables | 0 |
| Inventory/workflow notifications | 100 |
| notification_reads cascade | 25 |
| notification_push_deliveries cascade | 0 |
| Inventory-related audit_logs | 0 |
| Inventory-related notification_outbox | 0 |
| outside FK refs into Inventory tables | 0 |

Post-apply verification: all 36 target tables are zero rows, and remaining
Inventory/workflow notifications are `0`.

Inventory screens are empty until fresh setup data is recreated.

### Batch 3 Preflight

Expected output must match the table above before apply.

```sql
WITH table_counts AS (
  SELECT 'branch_daily_waste_cap' AS table_name, count(*) AS rows FROM public.branch_daily_waste_cap
  UNION ALL SELECT 'goods_received_notes', count(*) FROM public.goods_received_notes
  UNION ALL SELECT 'grn_baseline_pause', count(*) FROM public.grn_baseline_pause
  UNION ALL SELECT 'grn_express_extend_audit', count(*) FROM public.grn_express_extend_audit
  UNION ALL SELECT 'grn_hardblock_overrides', count(*) FROM public.grn_hardblock_overrides
  UNION ALL SELECT 'grn_items', count(*) FROM public.grn_items
  UNION ALL SELECT 'ingredient_abc_class', count(*) FROM public.ingredient_abc_class
  UNION ALL SELECT 'ingredient_category_review_policy', count(*) FROM public.ingredient_category_review_policy
  UNION ALL SELECT 'ingredients', count(*) FROM public.ingredients
  UNION ALL SELECT 'inventory_locations', count(*) FROM public.inventory_locations
  UNION ALL SELECT 'inventory_qc_settings', count(*) FROM public.inventory_qc_settings
  UNION ALL SELECT 'production_order_items', count(*) FROM public.production_order_items
  UNION ALL SELECT 'production_orders', count(*) FROM public.production_orders
  UNION ALL SELECT 'production_recipes', count(*) FROM public.production_recipes
  UNION ALL SELECT 'purchase_order_items', count(*) FROM public.purchase_order_items
  UNION ALL SELECT 'purchase_orders', count(*) FROM public.purchase_orders
  UNION ALL SELECT 'recipes', count(*) FROM public.recipes
  UNION ALL SELECT 'stock_issue_items', count(*) FROM public.stock_issue_items
  UNION ALL SELECT 'stock_issues', count(*) FROM public.stock_issues
  UNION ALL SELECT 'stock_levels', count(*) FROM public.stock_levels
  UNION ALL SELECT 'stock_movements', count(*) FROM public.stock_movements
  UNION ALL SELECT 'stock_transfer_items', count(*) FROM public.stock_transfer_items
  UNION ALL SELECT 'stock_transfers', count(*) FROM public.stock_transfers
  UNION ALL SELECT 'stocktake_conflicts', count(*) FROM public.stocktake_conflicts
  UNION ALL SELECT 'stocktake_drafts', count(*) FROM public.stocktake_drafts
  UNION ALL SELECT 'stocktake_lines', count(*) FROM public.stocktake_lines
  UNION ALL SELECT 'stocktake_sessions', count(*) FROM public.stocktake_sessions
  UNION ALL SELECT 'stocktake_zone_locks', count(*) FROM public.stocktake_zone_locks
  UNION ALL SELECT 'supplier_credit_notes', count(*) FROM public.supplier_credit_notes
  UNION ALL SELECT 'supplier_invoices', count(*) FROM public.supplier_invoices
  UNION ALL SELECT 'supplier_items', count(*) FROM public.supplier_items
  UNION ALL SELECT 'supplier_payments', count(*) FROM public.supplier_payments
  UNION ALL SELECT 'supplier_price_list', count(*) FROM public.supplier_price_list
  UNION ALL SELECT 'supplier_return_items', count(*) FROM public.supplier_return_items
  UNION ALL SELECT 'supplier_returns', count(*) FROM public.supplier_returns
  UNION ALL SELECT 'suppliers', count(*) FROM public.suppliers
),
candidate_notifications AS MATERIALIZED (
  SELECT n.id, n.kind, n.entity_type
  FROM public.notifications n
  WHERE n.kind ILIKE 'inventory.%'
     OR n.kind ILIKE 'workflow.po%'
     OR n.kind ILIKE 'workflow.grn%'
     OR n.kind ILIKE 'workflow.transfer%'
     OR n.kind ILIKE 'workflow.stock%'
     OR n.kind ILIKE 'workflow.waste%'
     OR n.entity_type IN (
      'ingredient', 'ingredients',
      'inventory_location', 'inventory_locations',
      'supplier', 'suppliers',
      'purchase_order', 'purchase_orders', 'po',
      'goods_received_note', 'goods_received_notes', 'grn',
      'supplier_invoice', 'supplier_invoices',
      'supplier_return', 'supplier_returns',
      'stock_transfer', 'stock_transfers',
      'stock_issue', 'stock_issues',
      'stocktake', 'stocktake_session', 'stocktake_sessions',
      'stock_movement', 'stock_movements',
      'production_order', 'production_orders',
      'production_recipe', 'production_recipes',
      'recipe', 'recipes',
      'inventory_qc_settings', 'branch_daily_waste_cap'
     )
),
inventory_related_audit AS (
  SELECT a.id
  FROM public.audit_logs a
  WHERE a.entity_type IN (
      'ingredient', 'ingredients',
      'inventory_location', 'inventory_locations',
      'supplier', 'suppliers',
      'purchase_order', 'purchase_orders', 'po',
      'goods_received_note', 'goods_received_notes', 'grn',
      'supplier_invoice', 'supplier_invoices',
      'supplier_return', 'supplier_returns',
      'stock_transfer', 'stock_transfers',
      'stock_issue', 'stock_issues',
      'stocktake', 'stocktake_session', 'stocktake_sessions',
      'stock_movement', 'stock_movements',
      'production_order', 'production_orders',
      'production_recipe', 'production_recipes',
      'recipe', 'recipes',
      'inventory_qc_settings', 'branch_daily_waste_cap'
    )
     OR a.entity_type ILIKE 'inventory%'
     OR a.entity_type ILIKE 'stock%'
     OR a.entity_type ILIKE 'supplier%'
     OR a.entity_type ILIKE 'purchase%'
     OR a.entity_type ILIKE 'grn%'
     OR a.entity_type ILIKE 'production%'
     OR a.entity_type ILIKE 'recipe%'
),
inventory_related_outbox AS (
  SELECT no.id
  FROM public.notification_outbox no
  WHERE no.topic ILIKE 'inventory.%'
     OR no.topic ILIKE 'workflow.po%'
     OR no.topic ILIKE 'workflow.grn%'
     OR no.topic ILIKE 'workflow.transfer%'
     OR no.topic ILIKE 'workflow.stock%'
     OR no.topic ILIKE 'workflow.waste%'
     OR no.payload::text ILIKE '%inventory%'
     OR no.payload::text ILIKE '%stock%'
     OR no.payload::text ILIKE '%supplier%'
     OR no.payload::text ILIKE '%purchase%'
     OR no.payload::text ILIKE '%grn%'
     OR no.payload::text ILIKE '%production%'
)
SELECT jsonb_build_object(
  'table_counts', (
    SELECT jsonb_object_agg(table_name, rows ORDER BY table_name)
    FROM table_counts
  ),
  'notifications', (SELECT count(*) FROM candidate_notifications),
  'notification_reads_cascade', (
    SELECT count(*)
    FROM public.notification_reads nr
    JOIN candidate_notifications c ON c.id = nr.notification_id
  ),
  'notification_push_deliveries_cascade', (
    SELECT count(*)
    FROM public.notification_push_deliveries npd
    JOIN candidate_notifications c ON c.id = npd.notification_id
  ),
  'inventory_related_audit_logs', (SELECT count(*) FROM inventory_related_audit),
  'inventory_related_notification_outbox', (SELECT count(*) FROM inventory_related_outbox)
) AS preflight;
```

Stop if `inventory_related_audit_logs` or `inventory_related_notification_outbox`
is non-zero; inspect before widening the reset.

Run this FK safety check before apply. It must return `outside_fk_refs = 0`.

```sql
WITH inventory_tables(table_name) AS (
  VALUES
    ('branch_daily_waste_cap'),
    ('goods_received_notes'), ('grn_baseline_pause'), ('grn_express_extend_audit'),
    ('grn_hardblock_overrides'), ('grn_items'),
    ('ingredient_abc_class'), ('ingredient_category_review_policy'), ('ingredients'),
    ('inventory_locations'), ('inventory_qc_settings'),
    ('production_order_items'), ('production_orders'), ('production_recipes'),
    ('purchase_order_items'), ('purchase_orders'), ('recipes'),
    ('stock_issue_items'), ('stock_issues'), ('stock_levels'), ('stock_movements'),
    ('stock_transfer_items'), ('stock_transfers'),
    ('stocktake_conflicts'), ('stocktake_drafts'), ('stocktake_lines'),
    ('stocktake_sessions'), ('stocktake_zone_locks'),
    ('supplier_credit_notes'), ('supplier_invoices'), ('supplier_items'),
    ('supplier_payments'), ('supplier_price_list'), ('supplier_return_items'),
    ('supplier_returns'), ('suppliers')
),
outside_refs AS (
  SELECT
    con.conname,
    src.relname AS source_table,
    tgt.relname AS target_table,
    pg_get_constraintdef(con.oid) AS definition
  FROM pg_constraint con
  JOIN pg_class src ON src.oid = con.conrelid
  JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
  JOIN pg_class tgt ON tgt.oid = con.confrelid
  JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
  WHERE con.contype = 'f'
    AND src_ns.nspname = 'public'
    AND tgt_ns.nspname = 'public'
    AND src.relname NOT IN (SELECT table_name FROM inventory_tables)
    AND tgt.relname IN (SELECT table_name FROM inventory_tables)
)
SELECT jsonb_build_object(
  'outside_fk_refs', (SELECT count(*) FROM outside_refs),
  'refs', (
    SELECT COALESCE(jsonb_agg(row_to_json(outside_refs)), '[]'::jsonb)
    FROM outside_refs
  )
) AS fk_safety;
```

### Batch 3 Apply

Run in one SQL session after backup/snapshot and matching preflight.

```sql
BEGIN;

CREATE TEMP TABLE cleanup_inventory_notification_ids (
  id bigint PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO cleanup_inventory_notification_ids (id)
  SELECT n.id
  FROM public.notifications n
  WHERE n.kind ILIKE 'inventory.%'
     OR n.kind ILIKE 'workflow.po%'
     OR n.kind ILIKE 'workflow.grn%'
     OR n.kind ILIKE 'workflow.transfer%'
     OR n.kind ILIKE 'workflow.stock%'
     OR n.kind ILIKE 'workflow.waste%'
     OR n.entity_type IN (
      'ingredient', 'ingredients',
      'inventory_location', 'inventory_locations',
      'supplier', 'suppliers',
      'purchase_order', 'purchase_orders', 'po',
      'goods_received_note', 'goods_received_notes', 'grn',
      'supplier_invoice', 'supplier_invoices',
      'supplier_return', 'supplier_returns',
      'stock_transfer', 'stock_transfers',
      'stock_issue', 'stock_issues',
      'stocktake', 'stocktake_session', 'stocktake_sessions',
      'stock_movement', 'stock_movements',
      'production_order', 'production_orders',
      'production_recipe', 'production_recipes',
      'recipe', 'recipes',
      'inventory_qc_settings', 'branch_daily_waste_cap'
     );

WITH deleted_notifications AS (
  DELETE FROM public.notifications n
  USING cleanup_inventory_notification_ids c
  WHERE n.id = c.id
  RETURNING n.kind, n.entity_type
)
SELECT jsonb_build_object(
  'notifications', (
    SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY rows DESC), '[]'::jsonb)
    FROM (
      SELECT kind, entity_type, count(*) AS rows
      FROM deleted_notifications
      GROUP BY kind, entity_type
    ) s
  )
) AS deleted_notification_traces;

TRUNCATE TABLE
  public.branch_daily_waste_cap,
  public.goods_received_notes,
  public.grn_baseline_pause,
  public.grn_express_extend_audit,
  public.grn_hardblock_overrides,
  public.grn_items,
  public.ingredient_abc_class,
  public.ingredient_category_review_policy,
  public.ingredients,
  public.inventory_locations,
  public.inventory_qc_settings,
  public.production_order_items,
  public.production_orders,
  public.production_recipes,
  public.purchase_order_items,
  public.purchase_orders,
  public.recipes,
  public.stock_issue_items,
  public.stock_issues,
  public.stock_levels,
  public.stock_movements,
  public.stock_transfer_items,
  public.stock_transfers,
  public.stocktake_conflicts,
  public.stocktake_drafts,
  public.stocktake_lines,
  public.stocktake_sessions,
  public.stocktake_zone_locks,
  public.supplier_credit_notes,
  public.supplier_invoices,
  public.supplier_items,
  public.supplier_payments,
  public.supplier_price_list,
  public.supplier_return_items,
  public.supplier_returns,
  public.suppliers
RESTART IDENTITY;

SELECT
  (
    SELECT count(*)
    FROM public.notifications n
    JOIN cleanup_inventory_notification_ids c ON c.id = n.id
  ) AS remaining_inventory_notifications;

COMMIT;
```

This apply script intentionally omits `CASCADE`. If a future FK from another
domain points into Inventory, the statement should fail instead of deleting
outside the explicit table list.

### Batch 3 Post-Apply

Run after commit. Every value should be `0`.

```sql
SELECT 'branch_daily_waste_cap' AS table_name, count(*) AS rows FROM public.branch_daily_waste_cap
UNION ALL SELECT 'goods_received_notes', count(*) FROM public.goods_received_notes
UNION ALL SELECT 'grn_baseline_pause', count(*) FROM public.grn_baseline_pause
UNION ALL SELECT 'grn_express_extend_audit', count(*) FROM public.grn_express_extend_audit
UNION ALL SELECT 'grn_hardblock_overrides', count(*) FROM public.grn_hardblock_overrides
UNION ALL SELECT 'grn_items', count(*) FROM public.grn_items
UNION ALL SELECT 'ingredient_abc_class', count(*) FROM public.ingredient_abc_class
UNION ALL SELECT 'ingredient_category_review_policy', count(*) FROM public.ingredient_category_review_policy
UNION ALL SELECT 'ingredients', count(*) FROM public.ingredients
UNION ALL SELECT 'inventory_locations', count(*) FROM public.inventory_locations
UNION ALL SELECT 'inventory_qc_settings', count(*) FROM public.inventory_qc_settings
UNION ALL SELECT 'production_order_items', count(*) FROM public.production_order_items
UNION ALL SELECT 'production_orders', count(*) FROM public.production_orders
UNION ALL SELECT 'production_recipes', count(*) FROM public.production_recipes
UNION ALL SELECT 'purchase_order_items', count(*) FROM public.purchase_order_items
UNION ALL SELECT 'purchase_orders', count(*) FROM public.purchase_orders
UNION ALL SELECT 'recipes', count(*) FROM public.recipes
UNION ALL SELECT 'stock_issue_items', count(*) FROM public.stock_issue_items
UNION ALL SELECT 'stock_issues', count(*) FROM public.stock_issues
UNION ALL SELECT 'stock_levels', count(*) FROM public.stock_levels
UNION ALL SELECT 'stock_movements', count(*) FROM public.stock_movements
UNION ALL SELECT 'stock_transfer_items', count(*) FROM public.stock_transfer_items
UNION ALL SELECT 'stock_transfers', count(*) FROM public.stock_transfers
UNION ALL SELECT 'stocktake_conflicts', count(*) FROM public.stocktake_conflicts
UNION ALL SELECT 'stocktake_drafts', count(*) FROM public.stocktake_drafts
UNION ALL SELECT 'stocktake_lines', count(*) FROM public.stocktake_lines
UNION ALL SELECT 'stocktake_sessions', count(*) FROM public.stocktake_sessions
UNION ALL SELECT 'stocktake_zone_locks', count(*) FROM public.stocktake_zone_locks
UNION ALL SELECT 'supplier_credit_notes', count(*) FROM public.supplier_credit_notes
UNION ALL SELECT 'supplier_invoices', count(*) FROM public.supplier_invoices
UNION ALL SELECT 'supplier_items', count(*) FROM public.supplier_items
UNION ALL SELECT 'supplier_payments', count(*) FROM public.supplier_payments
UNION ALL SELECT 'supplier_price_list', count(*) FROM public.supplier_price_list
UNION ALL SELECT 'supplier_return_items', count(*) FROM public.supplier_return_items
UNION ALL SELECT 'supplier_returns', count(*) FROM public.supplier_returns
UNION ALL SELECT 'suppliers', count(*) FROM public.suppliers
ORDER BY table_name;

SELECT count(*) AS remaining_inventory_notifications
FROM public.notifications n
WHERE n.kind ILIKE 'inventory.%'
   OR n.kind ILIKE 'workflow.po%'
   OR n.kind ILIKE 'workflow.grn%'
   OR n.kind ILIKE 'workflow.transfer%'
   OR n.kind ILIKE 'workflow.stock%'
   OR n.kind ILIKE 'workflow.waste%'
   OR n.entity_type IN (
    'ingredient', 'ingredients',
    'inventory_location', 'inventory_locations',
    'supplier', 'suppliers',
    'purchase_order', 'purchase_orders', 'po',
    'goods_received_note', 'goods_received_notes', 'grn',
    'supplier_invoice', 'supplier_invoices',
    'supplier_return', 'supplier_returns',
    'stock_transfer', 'stock_transfers',
    'stock_issue', 'stock_issues',
    'stocktake', 'stocktake_session', 'stocktake_sessions',
    'stock_movement', 'stock_movements',
    'production_order', 'production_orders',
    'production_recipe', 'production_recipes',
    'recipe', 'recipes',
    'inventory_qc_settings', 'branch_daily_waste_cap'
   );
```
