-- =============================================================
-- Finance dashboard summary RPC
--
-- /finance currently computes its work-queue counters with several
-- app-layer count queries. Move that read model behind one SECURITY
-- DEFINER RPC so scope, timezone, and branch filtering are consistent
-- with the rest of the Finance reporting surface.
--
-- Rules preserved:
--   - PERIOD-FILTER-USES-LOCAL-TZ for timestamp/date boundaries.
--   - RLS-NOT-APPLIED-ON-MV style: access checks live inside the RPC.
--   - No raw table DML; this is read-only and returns one summary row.
-- =============================================================

DROP FUNCTION IF EXISTS public.get_finance_dashboard_summary(DATE, DATE, BIGINT);

CREATE FUNCTION public.get_finance_dashboard_summary(
  p_start_date DATE,
  p_end_date   DATE,
  p_branch_id  BIGINT DEFAULT NULL
)
RETURNS TABLE (
  invoice_attention_count     BIGINT,
  invoice_issued_count        BIGINT,
  invoice_not_required_count  BIGINT,
  journal_draft_count         BIGINT,
  journal_posted_count        BIGINT,
  failed_webhook_count        BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       UUID;
  v_tenant    BIGINT;
  v_start_utc TIMESTAMPTZ;
  v_end_utc   TIMESTAMPTZ;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = '22023';
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT pr.tenant_id
  INTO v_tenant
  FROM public.profiles pr
  WHERE pr.id = v_uid;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF p_branch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = p_branch_id
        AND b.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'branch not found' USING ERRCODE = '22023';
    END IF;

    IF NOT public.has_permission(p_branch_id, 'finance:view') THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_permission_any('finance:view') THEN
      RAISE EXCEPTION 'permission denied: finance:view required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_start_utc := (p_start_date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');
  v_end_utc := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh');

  RETURN QUERY
  WITH scoped_tax_invoices AS (
    SELECT ti.*
    FROM public.tax_invoices ti
    WHERE ti.tenant_id = v_tenant
      AND (
        (p_branch_id IS NOT NULL AND ti.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (
            (ti.branch_id IS NOT NULL AND public.has_permission(ti.branch_id, 'finance:view'))
            OR (ti.branch_id IS NULL AND public.has_permission(NULL, 'finance:view'))
          )
        )
      )
  ),
  scoped_journals AS (
    SELECT je.*
    FROM public.journal_entries je
    WHERE je.tenant_id = v_tenant
      AND (
        (p_branch_id IS NOT NULL AND je.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (
            (je.branch_id IS NOT NULL AND public.has_permission(je.branch_id, 'finance:view'))
            OR (je.branch_id IS NULL AND public.has_permission(NULL, 'finance:view'))
          )
        )
      )
  ),
  scoped_failed_webhooks AS (
    SELECT we.id
    FROM public.webhook_events we
    LEFT JOIN public.payments p
      ON p.id = we.payment_id
     AND p.tenant_id = we.tenant_id
    WHERE we.tenant_id = v_tenant
      AND we.processing_status = 'failed'
      AND we.created_at >= v_start_utc
      AND we.created_at < v_end_utc
      AND (
        (p_branch_id IS NOT NULL AND p.branch_id = p_branch_id)
        OR (
          p_branch_id IS NULL
          AND (
            (p.branch_id IS NOT NULL AND public.has_permission(p.branch_id, 'finance:view'))
            OR (p.branch_id IS NULL AND public.has_permission(NULL, 'finance:view'))
          )
        )
      )
  )
  SELECT
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_tax_invoices ti
      WHERE ti.status IN ('draft', 'signing', 'submitted')
    ) AS invoice_attention_count,
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_tax_invoices ti
      WHERE ti.status = 'issued'
        AND ti.issued_at >= v_start_utc
        AND ti.issued_at < v_end_utc
    ) AS invoice_issued_count,
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_tax_invoices ti
      WHERE ti.status = 'not_required'
        AND ti.created_at >= v_start_utc
        AND ti.created_at < v_end_utc
    ) AS invoice_not_required_count,
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_journals je
      WHERE je.status = 'draft'
    ) AS journal_draft_count,
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_journals je
      WHERE je.status = 'posted'
        AND (je.entry_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
        AND (je.entry_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= p_end_date
    ) AS journal_posted_count,
    (
      SELECT COUNT(*)::BIGINT
      FROM scoped_failed_webhooks
    ) AS failed_webhook_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.get_finance_dashboard_summary(DATE, DATE, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.get_finance_dashboard_summary(DATE, DATE, BIGINT) TO authenticated;

COMMENT ON FUNCTION public.get_finance_dashboard_summary(DATE, DATE, BIGINT) IS
  'Finance home work-queue counters. Uses caller finance:view permission, '
  'branch scope, and Asia/Ho_Chi_Minh local date windows. p_branch_id NULL '
  'returns rows scoped to branches the caller can view plus tenant-wide '
  'journal entries.';
