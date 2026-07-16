BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.payments
  DROP CONSTRAINT payments_method_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_method_check
  CHECK (method = ANY (ARRAY[
    'cash'::text,
    'vietqr'::text,
    'momo'::text
  ]))
  NOT VALID;

ALTER TABLE public.payments
  VALIDATE CONSTRAINT payments_method_check;

ALTER TABLE public.webhook_events
  DROP CONSTRAINT webhook_events_provider_check;

ALTER TABLE public.webhook_events
  ADD CONSTRAINT webhook_events_provider_check
  CHECK (provider = ANY (ARRAY[
    'momo'::text,
    'vietqr'::text,
    'vnpay'::text,
    'sepay'::text
  ]))
  NOT VALID;

ALTER TABLE public.webhook_events
  VALIDATE CONSTRAINT webhook_events_provider_check;

COMMIT;
