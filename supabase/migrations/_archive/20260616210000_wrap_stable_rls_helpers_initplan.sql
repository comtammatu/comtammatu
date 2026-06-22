BEGIN;

-- Hoist zero/literal-arg STABLE RLS helpers to an InitPlan so PostgreSQL evaluates
-- them once per query instead of once per row on normal multi-row authenticated
-- SELECTs. Wraps ONLY auth_role() and has_permission_any('<literal>') as
-- ( SELECT fn(...) ). Two predicate classes are deliberately left bare:
--   * tenant_id = auth_tenant_id()  -- EXPLAIN proves wrapping demotes the
--     idx_*_tenant Index Scan to a Seq Scan in this single-tenant DB.
--   * has_permission(<column>, ...)  -- column-correlated; wrapping it builds a
--     per-row correlated SubPlan with no benefit.
-- The rewrite reads live pg_policies at apply time (resilient to concurrent
-- policy edits) and only touches policies whose body is still bare, so re-running
-- is a no-op. ALTER POLICY rewrites only USING / WITH CHECK; roles, command, and
-- PERMISSIVE/RESTRICTIVE are preserved unchanged.

DO $mig$
DECLARE
  r record;
  v_new_qual text;
  v_new_wc   text;
  v_set      text[];
BEGIN
  FOR r IN
    SELECT
      pol.polname,
      cls.relname,
      pg_get_expr(pol.polqual, pol.polrelid)      AS qual,
      pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check
    FROM pg_policy pol
    JOIN pg_class cls ON cls.oid = pol.polrelid
    JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    WHERE nsp.nspname = 'public'
      AND (
            ( pg_get_expr(pol.polqual, pol.polrelid) ~ 'auth_role\(\)'
              AND pg_get_expr(pol.polqual, pol.polrelid) !~ '\(\s*SELECT auth_role\(\)' )
         OR ( pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'auth_role\(\)'
              AND pg_get_expr(pol.polwithcheck, pol.polrelid) !~ '\(\s*SELECT auth_role\(\)' )
         OR ( pg_get_expr(pol.polqual, pol.polrelid) ~ 'has_permission_any\('
              AND pg_get_expr(pol.polqual, pol.polrelid) !~ '\(\s*SELECT has_permission_any\(' )
         OR ( pg_get_expr(pol.polwithcheck, pol.polrelid) ~ 'has_permission_any\('
              AND pg_get_expr(pol.polwithcheck, pol.polrelid) !~ '\(\s*SELECT has_permission_any\(' )
          )
  LOOP
    -- Wrap full has_permission_any('literal'::text) calls, then auth_role().
    -- \& is the whole match: the complete, already paren-balanced helper call,
    -- so the inserted ( SELECT ... ) stays balanced. The '_any(' literal pattern
    -- can never match the column-correlated has_permission(<col>, ...) form.
    v_new_qual := r.qual;
    v_new_wc   := r.with_check;

    IF v_new_qual IS NOT NULL THEN
      v_new_qual := regexp_replace(
        v_new_qual,
        'has_permission_any\(''[^'']*''(::text)?\)',
        '( SELECT \&)', 'g');
      v_new_qual := regexp_replace(
        v_new_qual, 'auth_role\(\)', '( SELECT auth_role())', 'g');
    END IF;

    IF v_new_wc IS NOT NULL THEN
      v_new_wc := regexp_replace(
        v_new_wc,
        'has_permission_any\(''[^'']*''(::text)?\)',
        '( SELECT \&)', 'g');
      v_new_wc := regexp_replace(
        v_new_wc, 'auth_role\(\)', '( SELECT auth_role())', 'g');
    END IF;

    -- Guard: never alter a tenant predicate. Abort if the rewrite changed the
    -- count of bare tenant_id = auth_tenant_id() occurrences for this policy.
    IF ( (SELECT count(*) FROM regexp_matches(coalesce(r.qual,'')||' '||coalesce(r.with_check,''),
            'tenant_id = auth_tenant_id\(\)', 'g'))
       <> (SELECT count(*) FROM regexp_matches(coalesce(v_new_qual,'')||' '||coalesce(v_new_wc,''),
            'tenant_id = auth_tenant_id\(\)', 'g')) ) THEN
      RAISE EXCEPTION 'aborting: rewrite altered tenant predicate on %.%', r.relname, r.polname;
    END IF;

    v_set := ARRAY[]::text[];
    IF v_new_qual IS NOT NULL THEN
      v_set := v_set || format('USING (%s)', v_new_qual);
    END IF;
    IF v_new_wc IS NOT NULL THEN
      v_set := v_set || format('WITH CHECK (%s)', v_new_wc);
    END IF;

    EXECUTE format('ALTER POLICY %I ON public.%I %s',
                   r.polname, r.relname, array_to_string(v_set, ' '));
  END LOOP;
END $mig$;

-- Self-assert: no public policy may still call auth_role() or
-- has_permission_any('literal') BARE (every occurrence must be wrapped as
-- ( SELECT ... )). RAISE if any remain.
DO $assert$
DECLARE
  v_residual int;
BEGIN
  SELECT count(*) INTO v_residual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
          ( (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ 'auth_role\(\)'
            AND (coalesce(qual,'')||' '||coalesce(with_check,'')) !~ '\(\s*SELECT auth_role\(\)' )
       OR ( (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ 'has_permission_any\('
            AND (coalesce(qual,'')||' '||coalesce(with_check,'')) !~ '\(\s*SELECT has_permission_any\(' )
        );

  IF v_residual <> 0 THEN
    RAISE EXCEPTION 'InitPlan wrap incomplete: % policy(ies) still call a bare in-scope helper', v_residual;
  END IF;
END $assert$;

COMMIT;
