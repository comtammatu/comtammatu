BEGIN;

-- Performance advisor `auth_rls_initplan`: RLS policies that call auth.uid()
-- directly re-evaluate it per row. Wrapping it in a scalar subquery lets Postgres
-- hoist it to a one-time InitPlan per statement. auth.uid() is STABLE and takes no
-- arguments, so (SELECT auth.uid()) is behavior-identical to auth.uid().
--
-- Data-driven on purpose: each policy is rewritten by a mechanical single-token
-- replace of its live definition, so roles/cmd/permissive and every other
-- predicate are preserved exactly. Only fully-unwrapped policies are touched.

DO $$
DECLARE
  r record;
  v_using text;
  v_check text;
  v_altered int := 0;
  v_remaining int;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') LIKE '%auth.uid()%'
        OR coalesce(with_check, '') LIKE '%auth.uid()%')
      AND lower(coalesce(qual, '') || ' ' || coalesce(with_check, '')) NOT LIKE '%select auth.uid()%'
  LOOP
    v_using := replace(r.qual, 'auth.uid()', '( SELECT auth.uid() )');
    v_check := replace(r.with_check, 'auth.uid()', '( SELECT auth.uid() )');

    IF r.qual IS NOT NULL AND r.with_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
                     r.policyname, r.tablename, v_using, v_check);
    ELSIF r.qual IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)',
                     r.policyname, r.tablename, v_using);
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)',
                     r.policyname, r.tablename, v_check);
    END IF;

    v_altered := v_altered + 1;
  END LOOP;

  RAISE NOTICE 'rls_initplan_wrap_auth_uid: % policies rewritten', v_altered;

  SELECT count(*) INTO v_remaining
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (coalesce(qual, '') LIKE '%auth.uid()%'
        AND lower(coalesce(qual, '')) NOT LIKE '%select auth.uid()%')
      OR (coalesce(with_check, '') LIKE '%auth.uid()%'
        AND lower(coalesce(with_check, '')) NOT LIKE '%select auth.uid()%')
    );

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'auth_rls_initplan rewrite incomplete: % policies still call a bare auth.uid()', v_remaining;
  END IF;
END $$;

COMMIT;
