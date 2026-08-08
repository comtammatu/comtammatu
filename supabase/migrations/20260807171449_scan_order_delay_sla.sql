-- Scan active orders whose kitchen wait exceeds 15 minutes and emit durable
-- SLA breach notifications for owner / branch_manager. Service-role cron only.

CREATE OR REPLACE FUNCTION public.scan_order_delay_sla()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_inserted bigint := 0;
BEGIN
  WITH delayed AS (
    SELECT
      o.tenant_id,
      o.branch_id,
      o.id AS order_id,
      o.order_number,
      floor(extract(epoch FROM (now() - o.created_at)) / 60)::integer AS wait_minutes
    FROM public.orders AS o
    WHERE o.status NOT IN ('completed', 'cancelled')
      AND o.created_at < (now() - interval '15 minutes')
      AND EXISTS (
        SELECT 1
        FROM public.kds_tickets AS t
        WHERE t.order_id = o.id
          AND t.tenant_id = o.tenant_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.kds_tickets AS t
        WHERE t.order_id = o.id
          AND t.tenant_id = o.tenant_id
          AND t.status NOT IN ('cancelled')
          AND t.status NOT IN ('ready', 'served')
      )
  ),
  upserted AS (
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
      delayed.tenant_id,
      delayed.branch_id,
      ARRAY['owner', 'branch_manager']::text[],
      'order.delay_sla_breach',
      'critical',
      format(
        'Cảnh báo trễ đơn #%s (%s phút)',
        delayed.order_number,
        delayed.wait_minutes
      ),
      format(
        'Đơn hàng #%s đã chờ %s phút chưa xong bếp. Quản lý cần kiểm tra với Bếp (KDS).',
        delayed.order_number,
        delayed.wait_minutes
      ),
      'order',
      delayed.order_id,
      format('/orders?orderId=%s', delayed.order_id),
      format('workflow.sla:order:%s:kds_ready', delayed.order_id),
      jsonb_build_object(
        'order_id', delayed.order_id,
        'order_number', delayed.order_number,
        'wait_minutes', delayed.wait_minutes,
        'sla_name', 'kds_ready'
      ),
      now() + interval '24 hours'
    FROM delayed
    ON CONFLICT (tenant_id, dedup_key)
      WHERE dedup_key IS NOT NULL
    DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM upserted;

  -- Expire unresolved breaches that are no longer delayed (KDS done or order closed).
  UPDATE public.notifications AS notification
  SET expires_at = now()
  WHERE notification.kind = 'order.delay_sla_breach'
    AND notification.dedup_key LIKE 'workflow.sla:order:%:kds_ready'
    AND (notification.expires_at IS NULL OR notification.expires_at > now())
    AND NOT EXISTS (
      SELECT 1
      FROM public.orders AS o
      WHERE o.id = notification.entity_id
        AND o.tenant_id = notification.tenant_id
        AND o.status NOT IN ('completed', 'cancelled')
        AND o.created_at < (now() - interval '15 minutes')
        AND EXISTS (
          SELECT 1
          FROM public.kds_tickets AS t
          WHERE t.order_id = o.id
            AND t.tenant_id = o.tenant_id
        )
        AND EXISTS (
          SELECT 1
          FROM public.kds_tickets AS t
          WHERE t.order_id = o.id
            AND t.tenant_id = o.tenant_id
            AND t.status NOT IN ('cancelled')
            AND t.status NOT IN ('ready', 'served')
        )
    );

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.scan_order_delay_sla() IS
  'Service-role cron: emit order.delay_sla_breach when active orders wait >15m without KDS terminal (ready|served).';

REVOKE ALL ON FUNCTION public.scan_order_delay_sla() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.scan_order_delay_sla() FROM anon;
REVOKE ALL ON FUNCTION public.scan_order_delay_sla() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.scan_order_delay_sla() TO service_role;

-- pg_cron upserts by jobname when the extension is available.
DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text, text, text)') IS NULL THEN
    RAISE NOTICE 'pg_cron unavailable; skip schedule for scan-order-delay-sla';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'scan-order-delay-sla',
    '* * * * *',
    'SELECT public.scan_order_delay_sla();'
  );
END;
$$;
