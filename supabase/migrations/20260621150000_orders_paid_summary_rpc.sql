-- Server-side aggregate for the orders paid-revenue summary. Replaces a JS
-- reduce over a PostgREST-capped page (silent ~6x undercount above the 1000-row
-- cap). SECURITY INVOKER: orders_select RLS scopes rows by tenant + branch.
CREATE OR REPLACE FUNCTION public.get_orders_paid_summary(
  p_status    text DEFAULT NULL,
  p_branch_id bigint DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to   date DEFAULT NULL
)
  RETURNS TABLE (paid_count bigint, paid_revenue numeric)
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO 'public'
  AS $$
  SELECT
    count(*)::bigint,
    COALESCE(sum(o.total_amount), 0)::numeric(15, 2)
  FROM public.orders o
  WHERE o.payment_status = 'paid'
    AND o.status <> 'cancelled'
    AND (p_status IS NULL OR o.status = p_status)
    AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
    -- VN-day boundaries (Asia/Ho_Chi_Minh, no DST); mirrors getVNDayUtcRange.
    AND (p_date_from IS NULL OR o.created_at >= (p_date_from::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))
    AND (p_date_to IS NULL OR o.created_at < ((p_date_to + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'));
$$;

REVOKE ALL ON FUNCTION public.get_orders_paid_summary(text, bigint, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_orders_paid_summary(text, bigint, date, date) TO authenticated;
