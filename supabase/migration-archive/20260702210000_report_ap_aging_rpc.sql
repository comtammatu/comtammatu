-- AP aging report: tenant-scoped SECURITY DEFINER RPC replacing JS bucket aggregation.
CREATE OR REPLACE FUNCTION public.get_ap_aging()
RETURNS TABLE (
  supplier_id BIGINT,
  supplier_name TEXT,
  buckets JSONB,
  total_outstanding NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant BIGINT := public.auth_tenant_id();
  v_today  DATE;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission_any('procurement:read') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;

  RETURN QUERY
  WITH scoped AS (
    SELECT
      si.supplier_id AS s_id,
      si.total_amount - COALESCE(si.paid_amount, 0) AS outstanding,
      CASE
        WHEN si.due_date IS NULL OR (v_today - si.due_date) <= 0 THEN 'current'
        WHEN (v_today - si.due_date) <= 30 THEN 'days_1_30'
        WHEN (v_today - si.due_date) <= 60 THEN 'days_31_60'
        WHEN (v_today - si.due_date) <= 90 THEN 'days_61_90'
        ELSE 'days_over_90'
      END AS bucket
    FROM public.supplier_invoices si
    WHERE si.tenant_id = v_tenant
      AND si.payment_status IN ('unpaid', 'partial')
  )
  SELECT
    a.s_id AS supplier_id,
    COALESCE(s.name, 'NCC #' || a.s_id) AS supplier_name,
    jsonb_build_object(
      'current', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE a.bucket = 'current'),
        'total', COALESCE(SUM(a.outstanding) FILTER (WHERE a.bucket = 'current'), 0)
      ),
      'days_1_30', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE a.bucket = 'days_1_30'),
        'total', COALESCE(SUM(a.outstanding) FILTER (WHERE a.bucket = 'days_1_30'), 0)
      ),
      'days_31_60', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE a.bucket = 'days_31_60'),
        'total', COALESCE(SUM(a.outstanding) FILTER (WHERE a.bucket = 'days_31_60'), 0)
      ),
      'days_61_90', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE a.bucket = 'days_61_90'),
        'total', COALESCE(SUM(a.outstanding) FILTER (WHERE a.bucket = 'days_61_90'), 0)
      ),
      'days_over_90', jsonb_build_object(
        'count', COUNT(*) FILTER (WHERE a.bucket = 'days_over_90'),
        'total', COALESCE(SUM(a.outstanding) FILTER (WHERE a.bucket = 'days_over_90'), 0)
      )
    ) AS buckets,
    COALESCE(SUM(a.outstanding), 0) AS total_outstanding
  FROM scoped a
  LEFT JOIN public.suppliers s ON s.id = a.s_id
  GROUP BY a.s_id, s.name
  ORDER BY COALESCE(SUM(a.outstanding), 0) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ap_aging() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ap_aging() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ap_aging() TO service_role;
