BEGIN;

DROP FUNCTION public.scan_inventory_alerts();

CREATE FUNCTION public.scan_inventory_alerts()
RETURNS TABLE(low_stock_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_low bigint := 0;
  v_today text := to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD');
BEGIN
  WITH inserted AS (
    INSERT INTO public.notifications (
      tenant_id,
      target_branch_id,
      target_roles,
      kind,
      severity,
      title,
      body,
      entity_type,
      entity_id,
      action_url,
      dedup_key,
      meta,
      expires_at
    )
    SELECT
      sl.tenant_id,
      sl.branch_id,
      ARRAY['branch_manager', 'owner']::text[],
      'inventory.stock_low',
      'warning',
      format('Tồn kho thấp: %s', ing.name),
      format(
        'Còn %s (ngưỡng đặt lại %s)',
        trim(trailing '.0' from sl.current_quantity::text),
        trim(trailing '.0' from ing.reorder_point::text)
      ),
      'ingredient',
      ing.id,
      format('/inventory/stock?ingredient=%s&branch=%s', ing.id, sl.branch_id),
      format('stock_low:ingredient:%s:branch:%s:%s', ing.id, sl.branch_id, v_today),
      jsonb_build_object(
        'current_quantity', sl.current_quantity,
        'reorder_point', ing.reorder_point,
        'branch_id', sl.branch_id
      ),
      now() + interval '7 days'
    FROM public.stock_levels sl
    JOIN public.ingredients ing
      ON ing.id = sl.ingredient_id
     AND ing.tenant_id = sl.tenant_id
    WHERE ing.reorder_point IS NOT NULL
      AND ing.reorder_point > 0
      AND sl.current_quantity <= ing.reorder_point
      AND ing.is_active = true
    ON CONFLICT (tenant_id, dedup_key)
      WHERE dedup_key IS NOT NULL
      DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_low FROM inserted;

  DELETE FROM public.notifications
  WHERE expires_at IS NOT NULL
    AND expires_at < now();

  RETURN QUERY SELECT v_low;
END;
$$;

COMMENT ON FUNCTION public.scan_inventory_alerts() IS
  'Emits daily idempotent inventory.stock_low notifications.';

COMMENT ON COLUMN public.notifications.kind IS
  'Operational event kind, e.g. pos.order_new | workflow.po_pending_approval | inventory.stock_low';

REVOKE ALL ON FUNCTION public.scan_inventory_alerts()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_inventory_alerts()
  TO service_role;

COMMIT;
