-- =============================================================
-- Inventory alert scanner — low stock + expiring batches
-- =============================================================
-- scan_inventory_alerts() inserts notifications for:
--   1. stock_levels.current_quantity <= ingredients.reorder_point
--      (dedup_key = 'stock_low:ingredient:{iid}:branch:{bid}:{yyyy-mm-dd}')
--   2. grn_items.expiry_date within the next 7 days, only if the batch
--      still has remaining (received − rejected > 0).
--      (dedup_key = 'expiry_soon:grn_item:{grn_item_id}:{yyyy-mm-dd}')
-- Intended to be invoked daily via pg_cron (see next migration).
-- Callable ad-hoc by service_role for manual re-scans.

CREATE OR REPLACE FUNCTION public.scan_inventory_alerts()
RETURNS TABLE(low_stock_count BIGINT, expiry_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_low BIGINT := 0;
  v_exp BIGINT := 0;
  v_today TEXT := to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD');
BEGIN
  -- Low-stock alerts
  WITH inserted AS (
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, dedup_key, meta,
      expires_at
    )
    SELECT
      sl.tenant_id,
      sl.branch_id,
      ARRAY['branch_manager', 'super_manager', 'owner']::TEXT[],
      'inventory.stock_low',
      'warning',
      format('Tồn kho thấp: %s', ing.name),
      format('Còn %s %s (ngưỡng đặt lại %s)',
        trim(trailing '.0' from sl.current_quantity::text),
        ing.unit,
        trim(trailing '.0' from ing.reorder_point::text)),
      'ingredient',
      ing.id,
      format('/inventory/stock?ingredient=%s&branch=%s', ing.id, sl.branch_id),
      format('stock_low:ingredient:%s:branch:%s:%s', ing.id, sl.branch_id, v_today),
      jsonb_build_object(
        'current_quantity', sl.current_quantity,
        'reorder_point', ing.reorder_point,
        'branch_id', sl.branch_id
      ),
      (now() + interval '7 days')
    FROM public.stock_levels sl
    JOIN public.ingredients ing
      ON ing.id = sl.ingredient_id AND ing.tenant_id = sl.tenant_id
    WHERE ing.reorder_point IS NOT NULL
      AND ing.reorder_point > 0
      AND sl.current_quantity <= ing.reorder_point
      AND ing.is_active = true
    ON CONFLICT (tenant_id, dedup_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_low FROM inserted;

  -- Expiry soon (next 7 days, batch still has remaining)
  WITH inserted AS (
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, dedup_key, meta,
      expires_at
    )
    SELECT
      gi.tenant_id,
      g.branch_id,
      ARRAY['branch_manager', 'super_manager', 'owner']::TEXT[],
      'inventory.expiry_soon',
      CASE
        WHEN gi.expiry_date <= (now()::date + interval '2 days') THEN 'critical'
        ELSE 'warning'
      END,
      format('Sắp hết hạn: %s', ing.name),
      format('Hạn %s — lô %s (còn %s %s)',
        to_char(gi.expiry_date, 'DD/MM/YYYY'),
        COALESCE(gi.batch_number, '—'),
        trim(trailing '.0' from (gi.received_quantity - gi.rejected_quantity)::text),
        ing.unit),
      'grn_item',
      gi.id,
      format('/inventory/expiry?grn_item=%s', gi.id),
      format('expiry_soon:grn_item:%s:%s', gi.id, v_today),
      jsonb_build_object(
        'expiry_date', gi.expiry_date,
        'batch_number', gi.batch_number,
        'remaining_quantity', gi.received_quantity - gi.rejected_quantity,
        'grn_id', gi.grn_id,
        'branch_id', g.branch_id
      ),
      (gi.expiry_date::timestamptz + interval '1 day')
    FROM public.grn_items gi
    JOIN public.goods_received_notes g
      ON g.id = gi.grn_id AND g.tenant_id = gi.tenant_id
    JOIN public.ingredients ing
      ON ing.id = gi.ingredient_id AND ing.tenant_id = gi.tenant_id
    WHERE gi.expiry_date IS NOT NULL
      AND gi.expiry_date BETWEEN now()::date AND (now()::date + interval '7 days')
      AND (gi.received_quantity - gi.rejected_quantity) > 0
      AND g.status = 'confirmed'
    ON CONFLICT (tenant_id, dedup_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_exp FROM inserted;

  -- Cleanup expired notifications (housekeeping)
  DELETE FROM public.notifications
  WHERE expires_at IS NOT NULL AND expires_at < now();

  RETURN QUERY SELECT v_low, v_exp;
END;
$$;

COMMENT ON FUNCTION public.scan_inventory_alerts() IS
  'Emit inventory.stock_low and inventory.expiry_soon notifications (idempotent per day via dedup_key). Wire to pg_cron.';

-- Do NOT grant to authenticated — triggered by cron (postgres role) or service_role.
REVOKE ALL ON FUNCTION public.scan_inventory_alerts() FROM public, anon, authenticated;
