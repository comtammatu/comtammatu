CREATE OR REPLACE FUNCTION public.order_payment_code_is_exposed(
  p_order_id bigint,
  p_tenant_id bigint,
  p_branch_id bigint,
  p_payment_code text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.payments p
     WHERE p.order_id = p_order_id
       AND p.tenant_id = p_tenant_id
       AND p.branch_id = p_branch_id
       AND p.method = 'vietqr'
       AND p.status IN ('pending', 'failed')
       AND p.provider_ref IS NOT NULL
       AND lower(p.provider_ref) = lower(p_payment_code)
  );
$$;

CREATE OR REPLACE FUNCTION public.prevent_order_amount_mutation_after_payment_code_exposed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_money_changed boolean;
  v_cancelled_unpaid boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.payment_status, 'unpaid') = 'paid' THEN
    RETURN NEW;
  END IF;

  v_money_changed :=
    NEW.subtotal IS DISTINCT FROM OLD.subtotal
    OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.service_charge IS DISTINCT FROM OLD.service_charge
    OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
    OR NEW.discount_value IS DISTINCT FROM OLD.discount_value
    OR NEW.discount_note IS DISTINCT FROM OLD.discount_note
    OR NEW.order_discount_amount IS DISTINCT FROM OLD.order_discount_amount
    OR NEW.item_discount_amount IS DISTINCT FROM OLD.item_discount_amount
    OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
    OR NEW.total_amount IS DISTINCT FROM OLD.total_amount;

  v_cancelled_unpaid :=
    NEW.status = 'cancelled'
    AND OLD.status IS DISTINCT FROM NEW.status
    AND COALESCE(OLD.payment_status, 'unpaid') <> 'paid';

  IF (v_money_changed OR v_cancelled_unpaid)
     AND public.order_payment_code_is_exposed(
       OLD.id,
       OLD.tenant_id,
       OLD.branch_id,
       OLD.payment_code
     )
  THEN
    RAISE EXCEPTION 'payment_code_locked' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_zz_payment_code_lock ON public.orders;
CREATE TRIGGER trg_orders_zz_payment_code_lock
  BEFORE UPDATE OF
    status,
    subtotal,
    tax_amount,
    service_charge,
    discount_type,
    discount_value,
    discount_note,
    order_discount_amount,
    item_discount_amount,
    discount_amount,
    total_amount,
    updated_at
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_order_amount_mutation_after_payment_code_exposed();

REVOKE ALL ON FUNCTION public.order_payment_code_is_exposed(bigint, bigint, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.order_payment_code_is_exposed(bigint, bigint, bigint, text) FROM anon;
REVOKE ALL ON FUNCTION public.order_payment_code_is_exposed(bigint, bigint, bigint, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.prevent_order_amount_mutation_after_payment_code_exposed() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_order_amount_mutation_after_payment_code_exposed() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_order_amount_mutation_after_payment_code_exposed() FROM authenticated;
