CREATE OR REPLACE FUNCTION public.decrement_branch_menu_daily_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_branch_id  BIGINT;
  v_order_date DATE;
  v_target     RECORD;
BEGIN
  IF OLD.status = 'cancelled' OR NEW.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.kds_tickets kt
    WHERE kt.tenant_id = NEW.tenant_id
      AND kt.order_item_id = NEW.id
      AND kt.first_ready_at IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  SELECT o.branch_id,
         (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  INTO v_branch_id, v_order_date
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_target IN
    WITH agg AS (
      SELECT OLD.menu_item_id::BIGINT AS item_id,
             OLD.quantity::INT        AS need_qty
      UNION ALL
      SELECT (s.elem ->> 'side_item_id')::BIGINT,
             (OLD.quantity * COALESCE(NULLIF(s.elem ->> 'quantity', '')::INT, 1))::INT
      FROM jsonb_array_elements(COALESCE(OLD.sides, '[]'::jsonb)) AS s(elem)
      WHERE s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
    )
    SELECT item_id, SUM(need_qty)::INT AS need_qty
    FROM agg
    WHERE item_id IS NOT NULL
    GROUP BY item_id
    ORDER BY item_id ASC
  LOOP
    UPDATE public.branch_menu_item_daily_limits
    SET sold_today = GREATEST(0, sold_today - v_target.need_qty)
    WHERE branch_id    = v_branch_id
      AND menu_item_id = v_target.item_id
      AND limit_date   = v_order_date;
  END LOOP;

  RETURN NEW;
END;
$_$;

COMMENT ON FUNCTION public.decrement_branch_menu_daily_limit() IS 'AFTER UPDATE OF status on order_items (→ cancelled): symmetric decrement using OLD.menu_item_id + OLD.sides aggregated by menu_item_id ASC. Bounded at 0 via GREATEST. First-ready boundary (D064 §5): a line the kitchen already made (kds_tickets.first_ready_at IS NOT NULL) keeps its quota consumed on cancel/void; a never-ready line returns quota.';

REVOKE ALL ON FUNCTION public.decrement_branch_menu_daily_limit() FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.decrement_branch_menu_daily_limit() TO service_role;
