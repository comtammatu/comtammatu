-- After a live recipe add, re-post only ingredients that this paid order has
-- not already consumed. Whole-order already_posted hid cups/packaging/tóp mỡ
-- on mixed bills. Then backfill paid sales-CN orders.

DO $post_missing_ingredients$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT replace(replace(
    pg_get_functiondef(
      'public.post_pos_sale_consumption_if_ready(bigint,uuid)'::regprocedure
    ),
    E'\r\n',
    E'\n'
  ), E'\r', E'\n')
  INTO v_def;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'post_pos_sale_consumption_if_ready missing';
  END IF;

  v_old := trim(both E'\n' from replace(replace($skip$
  IF EXISTS (
    SELECT 1
    FROM public.stock_movements sm
    WHERE sm.tenant_id = v_order.tenant_id
      AND sm.order_id = p_order_id
      AND sm.type = 'consumption'
      AND (sm.movement_subtype IS NULL OR sm.movement_subtype = 'sale_consumption')
  ) THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true, 'skipped', true, 'reason', 'already_posted');
  END IF;
$skip$, E'\r\n', E'\n'), E'\r', E'\n'));

  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'whole-order already_posted skip missing';
  END IF;
  v_def := replace(v_def, v_old, '');

  v_old := trim(both E'\n' from replace(replace($group$
            AND iu.is_active = TRUE
        )
    )
    GROUP BY r.ingredient_id
$group$, E'\r\n', E'\n'), E'\r', E'\n'));
  v_new := trim(both E'\n' from replace(replace($posted$
            AND iu.is_active = TRUE
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.stock_movements posted
      WHERE posted.tenant_id = v_order.tenant_id
        AND posted.order_id = p_order_id
        AND posted.ingredient_id = r.ingredient_id
        AND posted.type = 'consumption'
        AND (
          posted.movement_subtype IS NULL
          OR posted.movement_subtype = 'sale_consumption'
        )
    )
    GROUP BY r.ingredient_id
$posted$, E'\r\n', E'\n'), E'\r', E'\n'));

  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'recipe need GROUP BY pattern missing';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  v_old := trim(both E'\n' from replace(replace($zero$
  IF v_needed = 0 THEN
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'skipped', true, 'reason', 'no_recipe_movements');
  END IF;
$zero$, E'\r\n', E'\n'), E'\r', E'\n'));
  v_new := trim(both E'\n' from replace(replace($zero_posted$
  IF v_needed = 0 THEN
    IF EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.tenant_id = v_order.tenant_id
        AND sm.order_id = p_order_id
        AND sm.type = 'consumption'
        AND (sm.movement_subtype IS NULL OR sm.movement_subtype = 'sale_consumption')
    ) THEN
      RETURN jsonb_build_object('order_id', p_order_id, 'consumed', true, 'skipped', true, 'reason', 'already_posted');
    END IF;
    RETURN jsonb_build_object('order_id', p_order_id, 'consumed', false, 'skipped', true, 'reason', 'no_recipe_movements');
  END IF;
$zero_posted$, E'\r\n', E'\n'), E'\r', E'\n'));

  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'no_recipe_movements empty-need return missing';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  EXECUTE v_def;

  IF position(
    $gone$reason', 'already_posted');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.kds_tickets kt
$gone$ IN pg_get_functiondef(
      'public.post_pos_sale_consumption_if_ready(bigint,uuid)'::regprocedure
    )
  ) > 0 THEN
    RAISE EXCEPTION 'whole-order already_posted skip still present';
  END IF;

  IF position('posted.ingredient_id = r.ingredient_id' IN pg_get_functiondef(
    'public.post_pos_sale_consumption_if_ready(bigint,uuid)'::regprocedure
  )) = 0 THEN
    RAISE EXCEPTION 'per-ingredient sale_consumption skip missing';
  END IF;
END
$post_missing_ingredients$;

COMMENT ON FUNCTION public.post_pos_sale_consumption_if_ready(p_order_id bigint, p_actor_id uuid) IS
  'ADR 0026: posts per-ingredient sale consumption for paid completed orders. Re-entry after a recipe add posts only ingredients with no sale_consumption (or legacy NULL-subtype) row. Items without a KDS ticket qualify without kitchen dispatch; open KDS tickets still wait until ready.';

DO $backfill_missing_recipe_demand$
DECLARE
  v_order record;
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  FOR v_order IN
    SELECT o.id, o.created_by
    FROM public.orders o
    JOIN public.branches b ON b.id = o.branch_id
    WHERE o.payment_status = 'paid'
      AND o.status = 'completed'
      AND b.branch_kind = 'branch'
    ORDER BY o.id
  LOOP
    PERFORM public.post_pos_sale_consumption_if_ready(
      v_order.id,
      v_order.created_by
    );
  END LOOP;
END
$backfill_missing_recipe_demand$;
