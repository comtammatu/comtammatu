-- Migration: delete_promotion_rpc
-- Deletes a promotion safely: if used in orders or has redeemed codes, transitions status to 'ended' for accounting integrity.
-- If unused/draft, hard-deletes associated promotion_branches, promotion_items, promotion_codes, and the promotion row.

CREATE OR REPLACE FUNCTION public.delete_promotion(
  p_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_promo public.promotions%ROWTYPE;
  v_has_orders boolean := false;
  v_has_redeemed boolean := false;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission(NULL::bigint, 'promo:write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_promo
  FROM public.promotions
  WHERE id = p_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'promotion_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Check if used in any orders
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.tenant_id = v_tenant
      AND o.promotion_id = p_id
  ) INTO v_has_orders;

  -- Check if any codes have been redeemed
  SELECT EXISTS (
    SELECT 1
    FROM public.promotion_codes c
    WHERE c.tenant_id = v_tenant
      AND c.promotion_id = p_id
      AND c.status = 'redeemed'
  ) INTO v_has_redeemed;

  IF v_has_orders OR v_has_redeemed THEN
    -- Transition to ended to preserve historical and accounting records
    UPDATE public.promotions
    SET status = 'ended',
        updated_at = now()
    WHERE id = p_id AND tenant_id = v_tenant;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'ended',
      'id', p_id
    );
  END IF;

  -- Clean up child rows and delete promotion
  DELETE FROM public.promotion_branches
  WHERE tenant_id = v_tenant AND promotion_id = p_id;

  DELETE FROM public.promotion_items
  WHERE tenant_id = v_tenant AND promotion_id = p_id;

  DELETE FROM public.promotion_codes
  WHERE tenant_id = v_tenant AND promotion_id = p_id;

  DELETE FROM public.promotions
  WHERE tenant_id = v_tenant AND id = p_id;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'deleted',
    'id', p_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_promotion(bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_promotion(bigint) TO authenticated;
GRANT ALL ON FUNCTION public.delete_promotion(bigint) TO service_role;
