CREATE OR REPLACE FUNCTION public.self_order_fill_payment_request_fingerprint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.request_fingerprint IS NULL THEN
    NEW.request_fingerprint := public.self_order_payment_request_fingerprint(
      NEW.method,
      NEW.invoice_payload
    );
    NEW.request_fingerprint_version := 'payment:v1';
  ELSIF NEW.request_fingerprint_version IS NULL THEN
    NEW.request_fingerprint_version := 'payment:v1';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.self_order_fill_payment_request_fingerprint()
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.self_order_payment_requests
    WHERE request_fingerprint_version = 'legacy:v0'
      AND request_fingerprint IS DISTINCT FROM
        public.self_order_payment_request_fingerprint(method, invoice_payload)
  ) THEN
    RAISE EXCEPTION 'self_order_legacy_payment_fingerprint_mismatch';
  END IF;

  EXECUTE
    'ALTER TABLE public.self_order_payment_requests DISABLE TRIGGER trg_self_order_enforce_payment_request_invariants';
  EXECUTE
    'ALTER TABLE public.self_order_payment_requests DISABLE TRIGGER trg_self_order_payment_requests_updated_at';

  UPDATE public.self_order_payment_requests
  SET request_fingerprint_version = 'payment:v1'
  WHERE request_fingerprint_version = 'legacy:v0';

  EXECUTE
    'ALTER TABLE public.self_order_payment_requests ENABLE TRIGGER trg_self_order_payment_requests_updated_at';
  EXECUTE
    'ALTER TABLE public.self_order_payment_requests ENABLE TRIGGER trg_self_order_enforce_payment_request_invariants';
END;
$$;

ALTER TABLE public.self_order_payment_requests
  DROP CONSTRAINT self_order_payment_requests_fingerprint_version_check;

ALTER TABLE public.self_order_payment_requests
  ADD CONSTRAINT self_order_payment_requests_fingerprint_version_check
  CHECK (request_fingerprint_version = 'payment:v1');
