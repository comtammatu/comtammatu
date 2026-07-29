DROP FUNCTION IF EXISTS public.save_stock_request(
  bigint,
  bigint,
  text,
  jsonb,
  boolean,
  uuid
);

NOTIFY pgrst, 'reload schema';
