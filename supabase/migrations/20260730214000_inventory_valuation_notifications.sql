-- Owner-only close authority and durable valuation exception notifications.

INSERT INTO public.permission_keys (
  key,
  module,
  description,
  scope,
  is_delegable_to_staff
)
VALUES (
  'accounting:period_close',
  'finance',
  'Close a reconciled inventory cost period with an explicit waiver for attention items.',
  'tenant',
  false
)
ON CONFLICT (key) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description,
    scope = EXCLUDED.scope,
    is_delegable_to_staff = EXCLUDED.is_delegable_to_staff;

UPDATE public.role_templates
SET permission_keys = ARRAY(
      SELECT DISTINCT permission_key
      FROM pg_catalog.unnest(
        permission_keys || ARRAY['accounting:period_close']::text[]
      ) AS permission_key
      ORDER BY permission_key
    ),
    updated_at = pg_catalog.now()
WHERE position_code = 'owner';

CREATE OR REPLACE FUNCTION private.notify_supplier_invoice_valuation_variance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_warning boolean;
  v_delta numeric(20,2);
  v_provisional numeric(20,2);
BEGIN
  IF NEW.document_status <> 'confirmed'
     OR OLD.document_status = 'confirmed'
     OR NEW.invoice_kind = 'service' THEN
    RETURN NEW;
  END IF;

  SELECT
    coalesce(pg_catalog.bool_or(
      pg_catalog.abs(event.value_delta) >= settings.variance_warning_amount
      OR (
        allocation.confirmed_net_inventory_amount - event.value_delta > 0
        AND pg_catalog.abs(event.value_delta) * 100
          / (
            allocation.confirmed_net_inventory_amount - event.value_delta
          ) >= settings.variance_warning_percent
      )
    ), FALSE),
    coalesce(pg_catalog.sum(event.value_delta), 0),
    coalesce(pg_catalog.sum(
      allocation.confirmed_net_inventory_amount - event.value_delta
    ), 0)
  INTO v_warning, v_delta, v_provisional
  FROM public.inventory_valuation_events AS event
  JOIN public.supplier_invoice_receipt_allocations AS allocation
    ON allocation.valuation_event_id = event.id
   AND allocation.tenant_id = event.tenant_id
  JOIN public.inventory_valuation_settings AS settings
    ON settings.tenant_id = event.tenant_id
  WHERE event.tenant_id = NEW.tenant_id
    AND event.source_invoice_id = NEW.id;

  IF NOT v_warning THEN
    RETURN NEW;
  END IF;

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
    meta
  )
  VALUES (
    NEW.tenant_id,
    NULL,
    ARRAY['owner']::text[],
    'inventory.valuation_variance',
    'warning',
    'Chênh lệch giá mua cần hậu kiểm',
    pg_catalog.format(
      'Hóa đơn %s đã xác nhận; chênh lệch quyết toán tồn kho là %sđ.',
      NEW.invoice_number,
      pg_catalog.to_char(v_delta, 'FM999G999G999G999G990D00')
    ),
    'supplier_invoice',
    NEW.id,
    '/finance/supplier-invoices?invoiceId=' || NEW.id::text,
    'inventory.valuation_variance:' || NEW.id::text,
    pg_catalog.jsonb_build_object(
      'invoice_number', NEW.invoice_number,
      'provisional_value', v_provisional,
      'variance_amount', v_delta,
      'currency', 'VND',
      'source', 'rpc'
    )
  )
  ON CONFLICT (tenant_id, dedup_key)
    WHERE dedup_key IS NOT NULL
  DO UPDATE SET
    severity = EXCLUDED.severity,
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    action_url = EXCLUDED.action_url,
    meta = EXCLUDED.meta,
    created_at = pg_catalog.now(),
    expires_at = NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_supplier_invoice_valuation_variance
ON public.supplier_invoices;
CREATE TRIGGER zz_supplier_invoice_valuation_variance
AFTER UPDATE OF document_status ON public.supplier_invoices
FOR EACH ROW
EXECUTE FUNCTION private.notify_supplier_invoice_valuation_variance();

CREATE OR REPLACE FUNCTION public.run_inventory_valuation_reconciliation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_tenant bigint := public.auth_tenant_id();
  v_tenant record;
  v_quantity_mismatches integer;
  v_value_mismatches integer;
  v_result jsonb := '[]'::jsonb;
  v_today date := (pg_catalog.now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_year integer := extract(
    YEAR FROM pg_catalog.now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )::integer;
  v_month integer := extract(
    MONTH FROM pg_catalog.now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  )::integer;
BEGIN
  IF v_actor IS NOT NULL
     AND (
       v_actor_tenant IS NULL
       OR NOT public.has_permission_any('inventory:valuation_read')
     ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR v_tenant IN
    SELECT cutover.tenant_id, cutover.status
    FROM public.inventory_valuation_cutovers AS cutover
    WHERE cutover.status IN ('shadow', 'active')
      AND (
        v_actor IS NULL
        OR cutover.tenant_id = v_actor_tenant
      )
    ORDER BY cutover.tenant_id
  LOOP
    SELECT
      pg_catalog.count(*) FILTER (
        WHERE account.quantity IS DISTINCT FROM stock.current_quantity
      ),
      pg_catalog.count(*) FILTER (
        WHERE account.book_value IS DISTINCT FROM origin_totals.book_value
           OR account.quantity IS DISTINCT FROM origin_totals.quantity
      )
    INTO v_quantity_mismatches, v_value_mismatches
    FROM public.inventory_valuation_accounts AS account
    FULL JOIN public.stock_levels AS stock
      ON stock.tenant_id = account.tenant_id
     AND stock.branch_id = account.branch_id
     AND stock.location_id = account.location_id
     AND stock.ingredient_id = account.ingredient_id
    LEFT JOIN LATERAL (
      SELECT
        coalesce(pg_catalog.sum(balance.quantity), 0) AS quantity,
        coalesce(pg_catalog.sum(balance.book_value), 0) AS book_value
      FROM public.inventory_origin_balances AS balance
      WHERE balance.tenant_id = account.tenant_id
        AND balance.valuation_account_id = account.id
        AND balance.holder_kind = 'stock_pool'
    ) AS origin_totals ON TRUE
    WHERE coalesce(account.tenant_id, stock.tenant_id) = v_tenant.tenant_id;

    IF v_quantity_mismatches > 0 THEN
      INSERT INTO public.notifications (
        tenant_id,
        target_roles,
        kind,
        severity,
        title,
        body,
        action_url,
        dedup_key,
        meta
      )
      VALUES (
        v_tenant.tenant_id,
        ARRAY['owner']::text[],
        'inventory.valuation_reconciliation_failed',
        'critical',
        'Số lượng tồn kho và sổ giá trị đang lệch',
        'Hệ thống đã dừng khóa kỳ; cần đối soát movement và valuation account.',
        '/finance/cost-close?year=' || v_year::text || '&month=' || v_month::text,
        'inventory.valuation_reconciliation_failed:'
          || v_today::text || ':quantity',
        pg_catalog.jsonb_build_object(
          'drift_type', 'quantity',
          'mismatch_count', v_quantity_mismatches,
          'source', 'scheduled_job'
        )
      )
      ON CONFLICT (tenant_id, dedup_key)
        WHERE dedup_key IS NOT NULL
      DO UPDATE SET
        body = EXCLUDED.body,
        meta = EXCLUDED.meta,
        created_at = pg_catalog.now(),
        expires_at = NULL;
    END IF;

    IF v_value_mismatches > 0 THEN
      INSERT INTO public.notifications (
        tenant_id,
        target_roles,
        kind,
        severity,
        title,
        body,
        action_url,
        dedup_key,
        meta
      )
      VALUES (
        v_tenant.tenant_id,
        ARRAY['owner']::text[],
        'inventory.valuation_reconciliation_failed',
        'critical',
        'Giá trị tồn kho và cost origin đang lệch',
        'Hệ thống đã dừng khóa kỳ; cần đối soát valuation account và origin balance.',
        '/finance/cost-close?year=' || v_year::text || '&month=' || v_month::text,
        'inventory.valuation_reconciliation_failed:'
          || v_today::text || ':value',
        pg_catalog.jsonb_build_object(
          'drift_type', 'value',
          'mismatch_count', v_value_mismatches,
          'source', 'scheduled_job'
        )
      )
      ON CONFLICT (tenant_id, dedup_key)
        WHERE dedup_key IS NOT NULL
      DO UPDATE SET
        body = EXCLUDED.body,
        meta = EXCLUDED.meta,
        created_at = pg_catalog.now(),
        expires_at = NULL;
    END IF;

    v_result := v_result || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'tenant_id', v_tenant.tenant_id,
        'status', v_tenant.status,
        'quantity_mismatches', v_quantity_mismatches,
        'value_mismatches', v_value_mismatches,
        'is_reconciled',
          v_quantity_mismatches = 0 AND v_value_mismatches = 0
      )
    );
  END LOOP;

  RETURN v_result;
END;
$$;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'inventory-valuation-reconciliation-daily';

  v_job_id := cron.schedule(
    'inventory-valuation-reconciliation-daily',
    '15 23 * * *',
    'SELECT public.run_inventory_valuation_reconciliation();'
  );

  INSERT INTO private.cron_job_health_grace (jobid, registered_at)
  VALUES (v_job_id, pg_catalog.now())
  ON CONFLICT (jobid) DO UPDATE
  SET registered_at = EXCLUDED.registered_at;
END;
$$;

REVOKE ALL ON FUNCTION
  private.notify_supplier_invoice_valuation_variance()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.run_inventory_valuation_reconciliation()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_inventory_valuation_reconciliation()
TO authenticated, service_role;
