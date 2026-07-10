SET search_path = '';

-- Restores get_orders_paid_summary so a rollback to the pre-20260710090000 app
-- version (which still calls it) keeps working.
CREATE OR REPLACE FUNCTION public.get_orders_paid_summary(
  p_status text DEFAULT NULL::text,
  p_branch_id bigint DEFAULT NULL::bigint,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
) RETURNS TABLE (
  paid_count bigint,
  paid_revenue numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    count(*)::bigint,
    COALESCE(sum(o.total_amount), 0)::numeric(15, 2)
  FROM public.orders o
  WHERE o.payment_status = 'paid'
    AND o.status <> 'cancelled'
    AND (p_status IS NULL OR o.status = p_status)
    AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
    AND (p_date_from IS NULL OR o.created_at >= (p_date_from::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))
    AND (p_date_to IS NULL OR o.created_at < ((p_date_to + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'));
$function$;

GRANT EXECUTE ON FUNCTION public.get_orders_paid_summary(text, bigint, date, date) TO authenticated, service_role;
