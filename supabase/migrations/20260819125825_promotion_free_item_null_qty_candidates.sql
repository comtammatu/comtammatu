-- free_item candidates ignore campaign cap. NULL free_item_qty is no cap, not
-- ineligible.

CREATE OR REPLACE FUNCTION public.promotion_free_item_candidates(
  p_order public.orders,
  p_promo public.promotions
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_item record;
  v_qty integer;
  v_price numeric;
BEGIN
  IF p_promo.kind IS DISTINCT FROM 'free_item' THEN
    RETURN v_out;
  END IF;

  FOR v_item IN
    SELECT oi.id, oi.item_name, oi.quantity, oi.unit_price, oi.menu_item_id
    FROM public.order_items oi
    WHERE oi.order_id = p_order.id
      AND oi.status <> 'cancelled'
      AND EXISTS (
        SELECT 1
        FROM public.promotion_items pi
        WHERE pi.promotion_id = p_promo.id
          AND pi.menu_item_id = oi.menu_item_id
          AND pi.item_role = 'get'
      )
    ORDER BY oi.id
  LOOP
    v_qty := GREATEST(COALESCE(v_item.quantity, 0), 0);
    v_price := GREATEST(COALESCE(v_item.unit_price, 0), 0);
    IF v_qty < 1 OR v_price <= 0 THEN
      CONTINUE;
    END IF;
    v_out := v_out || jsonb_build_array(
      jsonb_build_object(
        'order_item_id', v_item.id,
        'side_item_id', v_item.menu_item_id,
        'name', COALESCE(v_item.item_name, ''),
        'unit_price', v_price,
        'max_units', v_qty,
        'parent_name', COALESCE(v_item.item_name, '')
      )
    );
  END LOOP;

  RETURN v_out;
END;
$$;
