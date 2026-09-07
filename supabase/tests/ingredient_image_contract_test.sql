BEGIN;

DO $$
DECLARE
  v_function oid;
  v_policy_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ingredients'
      AND column_name = 'image_url' AND is_nullable = 'YES'
  ) THEN RAISE EXCEPTION 'Ingredient image column must be nullable'; END IF;
  IF NOT has_column_privilege('authenticated', 'public.ingredients', 'image_url', 'SELECT') THEN
    RAISE EXCEPTION 'Authenticated catalog readers need image column access';
  END IF;
  v_function := to_regprocedure('public.save_ingredient_catalog(bigint,text,text,bigint,text,text,numeric,numeric,numeric,integer,jsonb,text,bigint,bigint,bigint,boolean,boolean,text,boolean)');
  IF v_function IS NULL THEN RAISE EXCEPTION 'Extended catalog RPC is missing'; END IF;
  IF has_function_privilege('anon', v_function, 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous catalog RPC execution must be revoked';
  END IF;
  IF to_regprocedure('public.save_ingredient_catalog(bigint,text,text,bigint,text,text,numeric,numeric,numeric,integer,jsonb,text,bigint,bigint,bigint,boolean,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'Ambiguous legacy catalog overload remains';
  END IF;
  SELECT count(*) INTO v_policy_count FROM pg_policy
  WHERE polrelid = 'storage.objects'::regclass AND NOT polpermissive
    AND polname IN ('ingredient_image_insert', 'ingredient_image_immutable', 'ingredient_image_delete');
  IF v_policy_count <> 3 THEN RAISE EXCEPTION 'Restrictive image policies are missing'; END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{}', true);
DO $$
BEGIN
  IF private.ingredient_image_delete_allowed('419/ingredients/3a1d2c40-9f22-40b6-8bc3-7c3db8f19461/6ac71c37-d35d-4471-bce0-978b53724e12.webp') THEN
    RAISE EXCEPTION 'Unscoped cleanup must fail closed';
  END IF;
END;
$$;

ROLLBACK;
