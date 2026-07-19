CREATE OR REPLACE FUNCTION private.sync_completed_payment_method_to_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND (
       TG_OP = 'INSERT'
       OR OLD.status IS DISTINCT FROM NEW.status
       OR OLD.method IS DISTINCT FROM NEW.method
     )
  THEN
    UPDATE public.orders o
    SET
      payment_method = NEW.method,
      updated_at = now()
    WHERE o.id = NEW.order_id
      AND o.tenant_id = NEW.tenant_id
      AND o.branch_id = NEW.branch_id
      AND o.payment_method IS DISTINCT FROM NEW.method;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_completed_payment_method_to_order()
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_sync_completed_payment_method_to_order
AFTER INSERT OR UPDATE OF status, method ON public.payments
FOR EACH ROW
EXECUTE FUNCTION private.sync_completed_payment_method_to_order();

WITH completed_payments AS (
  SELECT
    p.tenant_id,
    p.branch_id,
    p.order_id,
    p.method,
    count(*) OVER (
      PARTITION BY p.tenant_id, p.branch_id, p.order_id
    ) AS completed_count
  FROM public.payments p
  WHERE p.status = 'completed'
    AND p.method IN ('cash', 'vietqr')
)
UPDATE public.orders o
SET
  payment_method = payment.method,
  updated_at = now()
FROM completed_payments payment
WHERE payment.completed_count = 1
  AND o.id = payment.order_id
  AND o.tenant_id = payment.tenant_id
  AND o.branch_id = payment.branch_id
  AND o.payment_method IS DISTINCT FROM payment.method;
