-- Migration: pickup_public_broadcast_invalidation

-- The guest Pickup board cannot depend on table-level Postgres Changes because
-- its exact route is intentionally public and has no authenticated database
-- session. Emit only a payload-free invalidation signal. Statement-level
-- transition tables keep bulk mutations to one message per affected branch.
CREATE OR REPLACE FUNCTION public.broadcast_pickup_invalidation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_branch_id bigint;
BEGIN
  IF TG_TABLE_NAME = 'order_items' THEN
    FOR v_branch_id IN
      WITH changed AS (
        SELECT
          old_row.order_id AS old_order_id,
          new_row.order_id AS new_order_id
        FROM old_rows AS old_row
        INNER JOIN new_rows AS new_row USING (id)
        WHERE ROW(
          old_row.order_id,
          old_row.quantity,
          old_row.is_priority
        ) IS DISTINCT FROM ROW(
          new_row.order_id,
          new_row.quantity,
          new_row.is_priority
        )
      ),
      affected_orders AS (
        SELECT changed.old_order_id AS order_id FROM changed
        UNION
        SELECT changed.new_order_id AS order_id FROM changed
      )
      SELECT DISTINCT order_row.branch_id
      FROM affected_orders
      INNER JOIN public.orders AS order_row
        ON order_row.id = affected_orders.order_id
      WHERE order_row.branch_id IS NOT NULL
    LOOP
      PERFORM realtime.send(
        '{}'::jsonb,
        'invalidate',
        'pickup:' || v_branch_id,
        false
      );
    END LOOP;
  ELSIF TG_TABLE_NAME = 'orders' THEN
    FOR v_branch_id IN
      WITH changed AS (
        SELECT
          old_row.branch_id AS old_branch_id,
          new_row.branch_id AS new_branch_id
        FROM old_rows AS old_row
        INNER JOIN new_rows AS new_row USING (id)
        WHERE ROW(
          old_row.branch_id,
          old_row.order_number,
          old_row.order_type,
          old_row.table_id,
          old_row.status,
          old_row.created_at,
          old_row.is_priority,
          old_row.delivery_platform,
          old_row.external_order_ref
        ) IS DISTINCT FROM ROW(
          new_row.branch_id,
          new_row.order_number,
          new_row.order_type,
          new_row.table_id,
          new_row.status,
          new_row.created_at,
          new_row.is_priority,
          new_row.delivery_platform,
          new_row.external_order_ref
        )
      )
      SELECT DISTINCT affected.branch_id
      FROM changed
      CROSS JOIN LATERAL (
        VALUES (changed.old_branch_id), (changed.new_branch_id)
      ) AS affected(branch_id)
      WHERE affected.branch_id IS NOT NULL
    LOOP
      PERFORM realtime.send(
        '{}'::jsonb,
        'invalidate',
        'pickup:' || v_branch_id,
        false
      );
    END LOOP;
  ELSIF TG_TABLE_NAME = 'kitchen_send_batches' THEN
    FOR v_branch_id IN
      WITH changed AS (
        SELECT
          old_row.branch_id AS old_branch_id,
          new_row.branch_id AS new_branch_id
        FROM old_rows AS old_row
        INNER JOIN new_rows AS new_row USING (id)
        WHERE ROW(
          old_row.branch_id,
          old_row.order_id,
          old_row.kitchen_ticket_number,
          old_row.send_seq,
          old_row.kind,
          old_row.created_at
        ) IS DISTINCT FROM ROW(
          new_row.branch_id,
          new_row.order_id,
          new_row.kitchen_ticket_number,
          new_row.send_seq,
          new_row.kind,
          new_row.created_at
        )
      )
      SELECT DISTINCT affected.branch_id
      FROM changed
      CROSS JOIN LATERAL (
        VALUES (changed.old_branch_id), (changed.new_branch_id)
      ) AS affected(branch_id)
      WHERE affected.branch_id IS NOT NULL
    LOOP
      PERFORM realtime.send(
        '{}'::jsonb,
        'invalidate',
        'pickup:' || v_branch_id,
        false
      );
    END LOOP;
  ELSIF TG_TABLE_NAME = 'tables' THEN
    FOR v_branch_id IN
      WITH changed AS (
        SELECT
          old_row.branch_id AS old_branch_id,
          new_row.branch_id AS new_branch_id
        FROM old_rows AS old_row
        INNER JOIN new_rows AS new_row USING (id)
        WHERE ROW(
          old_row.branch_id,
          old_row.number
        ) IS DISTINCT FROM ROW(
          new_row.branch_id,
          new_row.number
        )
      )
      SELECT DISTINCT affected.branch_id
      FROM changed
      CROSS JOIN LATERAL (
        VALUES (changed.old_branch_id), (changed.new_branch_id)
      ) AS affected(branch_id)
      WHERE affected.branch_id IS NOT NULL
    LOOP
      PERFORM realtime.send(
        '{}'::jsonb,
        'invalidate',
        'pickup:' || v_branch_id,
        false
      );
    END LOOP;
  ELSIF TG_OP = 'INSERT' THEN
    FOR v_branch_id IN
      SELECT DISTINCT rows.branch_id
      FROM new_rows AS rows
      WHERE rows.branch_id IS NOT NULL
    LOOP
      PERFORM realtime.send(
        '{}'::jsonb,
        'invalidate',
        'pickup:' || v_branch_id,
        false
      );
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    FOR v_branch_id IN
      SELECT DISTINCT rows.branch_id
      FROM old_rows AS rows
      WHERE rows.branch_id IS NOT NULL
    LOOP
      PERFORM realtime.send(
        '{}'::jsonb,
        'invalidate',
        'pickup:' || v_branch_id,
        false
      );
    END LOOP;
  ELSIF TG_OP = 'UPDATE' THEN
    FOR v_branch_id IN
      WITH changed AS (
        SELECT
          old_row.branch_id AS old_branch_id,
          new_row.branch_id AS new_branch_id
        FROM old_rows AS old_row
        INNER JOIN new_rows AS new_row USING (id)
        WHERE ROW(
          old_row.branch_id,
          old_row.order_id,
          old_row.order_item_id,
          old_row.kitchen_send_batch_id,
          old_row.status,
          old_row.bumped_at,
          old_row.created_at
        ) IS DISTINCT FROM ROW(
          new_row.branch_id,
          new_row.order_id,
          new_row.order_item_id,
          new_row.kitchen_send_batch_id,
          new_row.status,
          new_row.bumped_at,
          new_row.created_at
        )
      )
      SELECT DISTINCT affected.branch_id
      FROM changed
      CROSS JOIN LATERAL (
        VALUES (changed.old_branch_id), (changed.new_branch_id)
      ) AS affected(branch_id)
      WHERE affected.branch_id IS NOT NULL
    LOOP
      PERFORM realtime.send(
        '{}'::jsonb,
        'invalidate',
        'pickup:' || v_branch_id,
        false
      );
    END LOOP;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Realtime is an acceleration path. A broker/partition failure must never
  -- roll back the order or kitchen mutation that owns the business truth.
  RAISE WARNING 'broadcast_pickup_invalidation best-effort send failed (table=%, op=%): %',
    TG_TABLE_NAME, TG_OP, SQLERRM;
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.broadcast_pickup_invalidation() IS
  'Statement-level trigger that sends a payload-free public Pickup invalidation once per relevant affected branch.';

REVOKE ALL ON FUNCTION public.broadcast_pickup_invalidation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_pickup_invalidation() TO service_role;

DROP TRIGGER IF EXISTS trg_kds_tickets_broadcast_pickup_insert ON public.kds_tickets;
CREATE TRIGGER trg_kds_tickets_broadcast_pickup_insert
AFTER INSERT ON public.kds_tickets
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.broadcast_pickup_invalidation();

DROP TRIGGER IF EXISTS trg_kds_tickets_broadcast_pickup_update ON public.kds_tickets;
CREATE TRIGGER trg_kds_tickets_broadcast_pickup_update
AFTER UPDATE ON public.kds_tickets
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.broadcast_pickup_invalidation();

DROP TRIGGER IF EXISTS trg_kds_tickets_broadcast_pickup_delete ON public.kds_tickets;
CREATE TRIGGER trg_kds_tickets_broadcast_pickup_delete
AFTER DELETE ON public.kds_tickets
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.broadcast_pickup_invalidation();

DROP TRIGGER IF EXISTS trg_orders_broadcast_pickup_update ON public.orders;
CREATE TRIGGER trg_orders_broadcast_pickup_update
AFTER UPDATE ON public.orders
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.broadcast_pickup_invalidation();

DROP TRIGGER IF EXISTS trg_order_items_broadcast_pickup_update ON public.order_items;
CREATE TRIGGER trg_order_items_broadcast_pickup_update
AFTER UPDATE ON public.order_items
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.broadcast_pickup_invalidation();

DROP TRIGGER IF EXISTS trg_kitchen_send_batches_broadcast_pickup_update ON public.kitchen_send_batches;
CREATE TRIGGER trg_kitchen_send_batches_broadcast_pickup_update
AFTER UPDATE ON public.kitchen_send_batches
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.broadcast_pickup_invalidation();

DROP TRIGGER IF EXISTS trg_tables_broadcast_pickup_update ON public.tables;
CREATE TRIGGER trg_tables_broadcast_pickup_update
AFTER UPDATE ON public.tables
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.broadcast_pickup_invalidation();
