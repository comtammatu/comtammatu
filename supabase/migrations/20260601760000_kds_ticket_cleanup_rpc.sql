-- =========================================================================
-- KDS queue maintenance: service-role-only cleanup RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.cleanup_kds_tickets_as_system(
  p_older_than TIMESTAMPTZ,
  p_reset_before_local_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted_total INT := 0;
  v_by_status JSONB := '{}'::jsonb;
  v_by_branch JSONB := '[]'::jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  IF p_older_than IS NULL AND p_reset_before_local_date IS NULL THEN
    RAISE EXCEPTION 'cleanup_cutoff_required' USING ERRCODE = '22023';
  END IF;

  WITH candidates AS (
    SELECT
      kt.id,
      kt.tenant_id,
      kt.branch_id,
      kt.status
    FROM public.kds_tickets kt
    JOIN public.branches b
      ON b.id = kt.branch_id
     AND b.tenant_id = kt.tenant_id
    LEFT JOIN public.kitchen_send_batches ksb
      ON ksb.id = kt.kitchen_send_batch_id
     AND ksb.tenant_id = kt.tenant_id
    WHERE kt.status IN ('pending', 'preparing', 'ready')
      AND b.branch_kind = 'branch'
      AND (
        (
          p_older_than IS NOT NULL
          AND COALESCE(ksb.created_at, kt.created_at) < p_older_than
        )
        OR (
          p_reset_before_local_date IS NOT NULL
          AND (
            COALESCE(ksb.created_at, kt.created_at)
              AT TIME ZONE 'Asia/Ho_Chi_Minh'
          )::date < p_reset_before_local_date
        )
      )
  ),
  deleted AS (
    DELETE FROM public.kds_tickets kt
    USING candidates c
    WHERE kt.id = c.id
    RETURNING kt.tenant_id, kt.branch_id, kt.status
  ),
  status_counts AS (
    SELECT status, count(*)::int AS deleted_count
    FROM deleted
    GROUP BY status
  ),
  branch_counts AS (
    SELECT tenant_id, branch_id, count(*)::int AS deleted_count
    FROM deleted
    GROUP BY tenant_id, branch_id
  )
  SELECT
    COALESCE((SELECT count(*)::int FROM deleted), 0),
    COALESCE(
      (SELECT jsonb_object_agg(status, deleted_count) FROM status_counts),
      '{}'::jsonb
    ),
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'tenant_id', tenant_id,
            'branch_id', branch_id,
            'deleted_count', deleted_count
          )
          ORDER BY tenant_id, branch_id
        )
        FROM branch_counts
      ),
      '[]'::jsonb
    )
  INTO v_deleted_total, v_by_status, v_by_branch;

  RETURN jsonb_build_object(
    'deleted_total', v_deleted_total,
    'by_status', v_by_status,
    'by_branch', v_by_branch,
    'older_than', p_older_than,
    'reset_before_local_date', p_reset_before_local_date
  );
END;
$$;

COMMENT ON FUNCTION public.cleanup_kds_tickets_as_system(TIMESTAMPTZ, DATE) IS
  'Service-role-only KDS board cleanup. Deletes active queue tickets older than the cutoff or before the current Asia/Ho_Chi_Minh local date; does not mutate orders, order_items, kitchen batches, or counters.';

REVOKE ALL ON FUNCTION public.cleanup_kds_tickets_as_system(TIMESTAMPTZ, DATE)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_kds_tickets_as_system(TIMESTAMPTZ, DATE)
  TO service_role;
