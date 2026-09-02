-- Paid completed orders post sale consumption even when kitchen never
-- dispatched. Then backfill paid sales-CN orders that still have no movement.

DO $relax_dispatch$
DECLARE
  v_def text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'post_pos_sale_consumption_if_ready';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'post_pos_sale_consumption_if_ready missing';
  END IF;

  IF v_def ~ 'oi\.sent_to_kitchen_at IS NOT NULL' THEN
    v_updated := regexp_replace(
      v_def,
      'oi\.sent_to_kitchen_at IS NOT NULL\s+AND NOT EXISTS',
      $new$TRUE
            AND NOT EXISTS$new$
    );
    IF v_updated = v_def THEN
      RAISE EXCEPTION 'post_pos_sale_consumption_if_ready dispatch pattern missing';
    END IF;
    EXECUTE v_updated;
  END IF;

  IF pg_get_functiondef(
    'public.post_pos_sale_consumption_if_ready(bigint,uuid)'::regprocedure
  ) ~ 'oi\.sent_to_kitchen_at IS NOT NULL' THEN
    RAISE EXCEPTION 'post_pos_sale_consumption_if_ready still requires kitchen dispatch';
  END IF;
END
$relax_dispatch$;

COMMENT ON FUNCTION public.post_pos_sale_consumption_if_ready(p_order_id bigint, p_actor_id uuid) IS
  'ADR 0026: posts per-ingredient sale consumption for paid completed orders. Items without a KDS ticket qualify without kitchen dispatch; open KDS tickets still wait until ready.';

DO $backfill_paid$
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
      AND NOT EXISTS (
        SELECT 1
        FROM public.stock_movements sm
        WHERE sm.order_id = o.id
          AND sm.type = 'consumption'
          AND (
            sm.movement_subtype IS NULL
            OR sm.movement_subtype = 'sale_consumption'
          )
      )
    ORDER BY o.id
  LOOP
    PERFORM public.post_pos_sale_consumption_if_ready(
      v_order.id,
      v_order.created_by
    );
  END LOOP;
END
$backfill_paid$;
