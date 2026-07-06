-- Migration: Auto-create daily limits row on sale insert to accurately track sold_today for items without manual limits.

CREATE OR REPLACE FUNCTION public.enforce_branch_menu_daily_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_branch_id       bigint;
  v_order_date      date;
  v_tenant_id       bigint;
  v_target          record;
  v_limit           record;
  v_hold_token_text text;
  v_hold_token      uuid;
  v_active_hold_qty integer;
BEGIN
  IF COALESCE(current_setting('comtammatu.skip_quota_enforcement', true), 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  v_hold_token_text := NULLIF(
    current_setting('comtammatu.daily_limit_hold_token', true),
    ''
  );
  IF v_hold_token_text IS NOT NULL THEN
    v_hold_token := v_hold_token_text::uuid;
  END IF;

  SELECT o.tenant_id,
         o.branch_id,
         (o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  INTO v_tenant_id, v_branch_id, v_order_date
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_target IN
    WITH agg AS (
      SELECT NEW.menu_item_id::bigint AS item_id,
             NEW.quantity::integer    AS need_qty
      UNION ALL
      SELECT (s.elem ->> 'side_item_id')::bigint,
             (NEW.quantity * COALESCE(NULLIF(s.elem ->> 'quantity', '')::integer, 1))::integer
      FROM jsonb_array_elements(COALESCE(NEW.sides, '[]'::jsonb)) AS s(elem)
      WHERE s.elem ? 'side_item_id'
        AND (s.elem ->> 'side_item_id') ~ '^[0-9]+$'
    )
    SELECT item_id, SUM(need_qty)::integer AS need_qty
    FROM agg
    WHERE item_id IS NOT NULL
    GROUP BY item_id
    ORDER BY item_id ASC
  LOOP
    SELECT * INTO v_limit
    FROM public.branch_menu_item_daily_limits
    WHERE branch_id = v_branch_id
      AND menu_item_id = v_target.item_id
      AND limit_date = v_order_date
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.branch_menu_item_daily_limits (
        tenant_id,
        branch_id,
        menu_item_id,
        limit_date,
        limit_quantity,
        is_disabled,
        sold_today
      ) VALUES (
        v_tenant_id,
        v_branch_id,
        v_target.item_id,
        v_order_date,
        NULL,
        FALSE,
        v_target.need_qty
      )
      ON CONFLICT (branch_id, menu_item_id, limit_date)
      DO UPDATE SET sold_today = public.branch_menu_item_daily_limits.sold_today + EXCLUDED.sold_today;
      CONTINUE;
    END IF;

    IF v_limit.is_disabled THEN
      RAISE EXCEPTION 'daily_limit_item_disabled'
        USING ERRCODE = 'P0001',
              DETAIL = jsonb_build_object(
                'reason', 'daily_limit_item_disabled',
                'menu_item_id', v_target.item_id
              )::text;
    END IF;

    SELECT COALESCE(SUM(h.quantity), 0)::integer
    INTO v_active_hold_qty
    FROM public.branch_menu_item_daily_holds h
    WHERE h.tenant_id = v_tenant_id
      AND h.branch_id = v_branch_id
      AND h.menu_item_id = v_target.item_id
      AND h.limit_date = v_order_date
      AND (v_hold_token IS NULL OR h.hold_token <> v_hold_token)
      AND h.committed_at IS NULL
      AND h.released_at IS NULL
      AND h.expires_at > now();

    IF v_limit.limit_quantity IS NOT NULL
       AND v_limit.sold_today + v_active_hold_qty + v_target.need_qty > v_limit.limit_quantity THEN
      RAISE EXCEPTION 'daily_limit_exceeded'
        USING ERRCODE = 'P0001',
              DETAIL = jsonb_build_object(
                'reason', 'daily_limit_exceeded',
                'menu_item_id', v_target.item_id,
                'limit_quantity', v_limit.limit_quantity,
                'sold_today', v_limit.sold_today,
                'held_quantity', v_active_hold_qty,
                'requested_quantity', v_target.need_qty
              )::text;
    END IF;

    UPDATE public.branch_menu_item_daily_limits
    SET sold_today = sold_today + v_target.need_qty
    WHERE id = v_limit.id;
  END LOOP;

  RETURN NEW;
END;
$_$;

REVOKE EXECUTE ON FUNCTION public.enforce_branch_menu_daily_limit() FROM PUBLIC, anon, authenticated;
