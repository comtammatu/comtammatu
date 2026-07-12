-- =============================================================
-- Regression test: GRN report reads preserve branch scope
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/grn_branch_report_scope_test.sql
--   supabase db query --linked --file supabase/tests/grn_branch_report_scope_test.sql
-- =============================================================

BEGIN;

DO $$
DECLARE
  v_tenant BIGINT;
  v_branch_a BIGINT;
  v_branch_b BIGINT;
  v_user UUID;
  v_owner UUID;
  v_supplier BIGINT;
  v_ingredient BIGINT;
  v_grn_a BIGINT;
  v_grn_b BIGINT;
  v_item_a BIGINT;
  v_item_b BIGINT;
BEGIN
  SELECT
    t.id,
    branch_pair.branch_a,
    branch_pair.branch_b,
    profile_fixture.id
  INTO
    v_tenant,
    v_branch_a,
    v_branch_b,
    v_user
  FROM public.tenants t
  CROSS JOIN LATERAL (
    SELECT
      MIN(b.id) AS branch_a,
      MAX(b.id) AS branch_b
    FROM public.branches b
    WHERE b.tenant_id = t.id
      AND b.is_active = TRUE
      AND b.branch_kind = 'branch'
    HAVING COUNT(*) >= 2
  ) branch_pair
  CROSS JOIN LATERAL (
    SELECT pr.id
    FROM public.profiles pr
    JOIN public.positions pos ON pos.id = pr.position_id
    WHERE pr.tenant_id = t.id
      AND COALESCE(pr.is_active, TRUE) = TRUE
      AND pos.code <> 'owner'
    ORDER BY pr.id
    LIMIT 1
  ) profile_fixture
  ORDER BY t.id
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION
      'TEST FAILED: requires one tenant with two active operational branches and a non-owner profile';
  END IF;

  SELECT pr.id
  INTO STRICT v_owner
  FROM public.profiles pr
  JOIN public.positions pos ON pos.id = pr.position_id
  WHERE pr.tenant_id = v_tenant
    AND COALESCE(pr.is_active, TRUE) = TRUE
    AND pos.code = 'owner'
  ORDER BY pr.id
  LIMIT 1;

  SELECT s.id
  INTO v_supplier
  FROM public.suppliers s
  WHERE s.tenant_id = v_tenant
  ORDER BY s.id
  LIMIT 1;

  IF v_supplier IS NULL THEN
    INSERT INTO public.suppliers (tenant_id, name)
    VALUES (v_tenant, 'TEST-RLS-SUPPLIER-' || txid_current()::text)
    RETURNING id INTO v_supplier;
  END IF;

  SELECT i.id
  INTO v_ingredient
  FROM public.ingredients i
  WHERE i.tenant_id = v_tenant
  ORDER BY i.id
  LIMIT 1;

  IF v_ingredient IS NULL THEN
    INSERT INTO public.ingredients (tenant_id, name)
    VALUES (v_tenant, 'TEST-RLS-INGREDIENT-' || txid_current()::text)
    RETURNING id INTO v_ingredient;
  END IF;

  DELETE FROM public.staff_permissions
  WHERE user_id = v_user
    AND permission_key IN (
      'reports:view_branch',
      'reports:view_tenant',
      'procurement:read'
    );

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    supplier_id,
    grn_number,
    created_by
  )
  VALUES (
    v_tenant,
    v_branch_a,
    v_supplier,
    'TEST-RLS-A-' || txid_current()::text,
    v_user
  )
  RETURNING id INTO v_grn_a;

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    supplier_id,
    grn_number,
    created_by
  )
  VALUES (
    v_tenant,
    v_branch_b,
    v_supplier,
    'TEST-RLS-B-' || txid_current()::text,
    v_user
  )
  RETURNING id INTO v_grn_b;

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    received_quantity,
    unit_cost,
    total_cost
  )
  VALUES (v_tenant, v_grn_a, v_ingredient, 1, 1000, 1000)
  RETURNING id INTO v_item_a;

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    received_quantity,
    unit_cost,
    total_cost
  )
  VALUES (v_tenant, v_grn_b, v_ingredient, 1, 1000, 1000)
  RETURNING id INTO v_item_b;

  PERFORM set_config('test.grn_rls_tenant', v_tenant::text, TRUE);
  PERFORM set_config('test.grn_rls_branch_a', v_branch_a::text, TRUE);
  PERFORM set_config('test.grn_rls_branch_b', v_branch_b::text, TRUE);
  PERFORM set_config('test.grn_rls_user', v_user::text, TRUE);
  PERFORM set_config('test.grn_rls_owner', v_owner::text, TRUE);
  PERFORM set_config('test.grn_rls_grn_a', v_grn_a::text, TRUE);
  PERFORM set_config('test.grn_rls_grn_b', v_grn_b::text, TRUE);
  PERFORM set_config('test.grn_rls_item_a', v_item_a::text, TRUE);
  PERFORM set_config('test.grn_rls_item_b', v_item_b::text, TRUE);

  INSERT INTO public.staff_permissions (
    user_id,
    tenant_id,
    branch_id,
    permission_key
  )
  VALUES (v_user, v_tenant, v_branch_a, 'reports:view_branch');

  PERFORM set_config('request.jwt.claim.sub', v_user::text, TRUE);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_user,
      'role', 'authenticated',
      'app_metadata', jsonb_build_object('tenant_id', v_tenant)
    )::text,
    TRUE
  );
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_grn_count INTEGER;
  v_item_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_grn_count
  FROM public.goods_received_notes
  WHERE id IN (
    current_setting('test.grn_rls_grn_a')::BIGINT,
    current_setting('test.grn_rls_grn_b')::BIGINT
  );

  SELECT COUNT(*)
  INTO v_item_count
  FROM public.grn_items
  WHERE id IN (
    current_setting('test.grn_rls_item_a')::BIGINT,
    current_setting('test.grn_rls_item_b')::BIGINT
  );

  IF v_grn_count <> 1 OR v_item_count <> 1 THEN
    RAISE EXCEPTION
      'TEST FAILED: branch report grant exposed % GRNs and % items; expected one of each',
      v_grn_count,
      v_item_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.goods_received_notes
    WHERE id = current_setting('test.grn_rls_grn_a')::BIGINT
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.grn_items
    WHERE id = current_setting('test.grn_rls_item_a')::BIGINT
  ) THEN
    RAISE EXCEPTION
      'TEST FAILED: branch report grant could not read its own branch GRN and item';
  END IF;
END;
$$;

RESET ROLE;

DELETE FROM public.staff_permissions
WHERE user_id = current_setting('test.grn_rls_user')::UUID
  AND permission_key = 'reports:view_branch';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_grn_count INTEGER;
  v_item_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_grn_count
  FROM public.goods_received_notes
  WHERE id IN (
    current_setting('test.grn_rls_grn_a')::BIGINT,
    current_setting('test.grn_rls_grn_b')::BIGINT
  );

  SELECT COUNT(*)
  INTO v_item_count
  FROM public.grn_items
  WHERE id IN (
    current_setting('test.grn_rls_item_a')::BIGINT,
    current_setting('test.grn_rls_item_b')::BIGINT
  );

  IF v_grn_count <> 0 OR v_item_count <> 0 THEN
    RAISE EXCEPTION
      'TEST FAILED: user without GRN read grants exposed % GRNs and % items; expected zero',
      v_grn_count,
      v_item_count;
  END IF;
END;
$$;

RESET ROLE;

INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key
)
VALUES (
  current_setting('test.grn_rls_user')::UUID,
  current_setting('test.grn_rls_tenant')::BIGINT,
  current_setting('test.grn_rls_branch_a')::BIGINT,
  'reports:view_branch'
);

UPDATE public.profiles
SET is_active = FALSE
WHERE id = current_setting('test.grn_rls_user')::UUID;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_grn_count INTEGER;
  v_item_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_grn_count
  FROM public.goods_received_notes
  WHERE id IN (
    current_setting('test.grn_rls_grn_a')::BIGINT,
    current_setting('test.grn_rls_grn_b')::BIGINT
  );

  SELECT COUNT(*)
  INTO v_item_count
  FROM public.grn_items
  WHERE id IN (
    current_setting('test.grn_rls_item_a')::BIGINT,
    current_setting('test.grn_rls_item_b')::BIGINT
  );

  IF v_grn_count <> 0 OR v_item_count <> 0 THEN
    RAISE EXCEPTION
      'TEST FAILED: inactive profile exposed % GRNs and % items; expected zero',
      v_grn_count,
      v_item_count;
  END IF;
END;
$$;

RESET ROLE;

UPDATE public.profiles
SET is_active = TRUE
WHERE id = current_setting('test.grn_rls_user')::UUID;

DELETE FROM public.staff_permissions
WHERE user_id = current_setting('test.grn_rls_user')::UUID
  AND permission_key = 'reports:view_branch';

INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key
)
VALUES (
  current_setting('test.grn_rls_user')::UUID,
  current_setting('test.grn_rls_tenant')::BIGINT,
  NULL,
  'reports:view_tenant'
);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_grn_count INTEGER;
  v_item_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_grn_count
  FROM public.goods_received_notes
  WHERE id IN (
    current_setting('test.grn_rls_grn_a')::BIGINT,
    current_setting('test.grn_rls_grn_b')::BIGINT
  );

  SELECT COUNT(*)
  INTO v_item_count
  FROM public.grn_items
  WHERE id IN (
    current_setting('test.grn_rls_item_a')::BIGINT,
    current_setting('test.grn_rls_item_b')::BIGINT
  );

  IF v_grn_count <> 2 OR v_item_count <> 2 THEN
    RAISE EXCEPTION
      'TEST FAILED: tenant report grant exposed % GRNs and % items; expected two of each',
      v_grn_count,
      v_item_count;
  END IF;
END;
$$;

RESET ROLE;

DELETE FROM public.staff_permissions
WHERE user_id = current_setting('test.grn_rls_user')::UUID
  AND permission_key = 'reports:view_tenant';

INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key
)
VALUES (
  current_setting('test.grn_rls_user')::UUID,
  current_setting('test.grn_rls_tenant')::BIGINT,
  current_setting('test.grn_rls_branch_b')::BIGINT,
  'procurement:read'
);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_grn_count INTEGER;
  v_item_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_grn_count
  FROM public.goods_received_notes
  WHERE id IN (
    current_setting('test.grn_rls_grn_a')::BIGINT,
    current_setting('test.grn_rls_grn_b')::BIGINT
  );

  SELECT COUNT(*)
  INTO v_item_count
  FROM public.grn_items
  WHERE id IN (
    current_setting('test.grn_rls_item_a')::BIGINT,
    current_setting('test.grn_rls_item_b')::BIGINT
  );

  IF v_grn_count <> 1 OR v_item_count <> 1 THEN
    RAISE EXCEPTION
      'TEST FAILED: procurement branch grant exposed % GRNs and % items; expected one of each',
      v_grn_count,
      v_item_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.goods_received_notes
    WHERE id = current_setting('test.grn_rls_grn_b')::BIGINT
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.grn_items
    WHERE id = current_setting('test.grn_rls_item_b')::BIGINT
  ) THEN
    RAISE EXCEPTION
      'TEST FAILED: procurement branch grant could not read its own branch GRN and item';
  END IF;
END;
$$;

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.grn_rls_user'),
  TRUE
);

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.grn_rls_user')::UUID,
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', current_setting('test.grn_rls_tenant')::BIGINT + 1000000
    )
  )::text,
  TRUE
);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_grn_count INTEGER;
  v_item_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_grn_count
  FROM public.goods_received_notes
  WHERE id IN (
    current_setting('test.grn_rls_grn_a')::BIGINT,
    current_setting('test.grn_rls_grn_b')::BIGINT
  );

  SELECT COUNT(*)
  INTO v_item_count
  FROM public.grn_items
  WHERE id IN (
    current_setting('test.grn_rls_item_a')::BIGINT,
    current_setting('test.grn_rls_item_b')::BIGINT
  );

  IF v_grn_count <> 0 OR v_item_count <> 0 THEN
    RAISE EXCEPTION
      'TEST FAILED: cross-tenant claims exposed % GRNs and % items; expected zero',
      v_grn_count,
      v_item_count;
  END IF;
END;
$$;

RESET ROLE;

SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.grn_rls_owner'),
  TRUE
);

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.grn_rls_owner')::UUID,
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', current_setting('test.grn_rls_tenant')::BIGINT
    )
  )::text,
  TRUE
);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_grn_count INTEGER;
  v_item_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_grn_count
  FROM public.goods_received_notes
  WHERE id IN (
    current_setting('test.grn_rls_grn_a')::BIGINT,
    current_setting('test.grn_rls_grn_b')::BIGINT
  );

  SELECT COUNT(*)
  INTO v_item_count
  FROM public.grn_items
  WHERE id IN (
    current_setting('test.grn_rls_item_a')::BIGINT,
    current_setting('test.grn_rls_item_b')::BIGINT
  );

  IF v_grn_count <> 2 OR v_item_count <> 2 THEN
    RAISE EXCEPTION
      'TEST FAILED: owner access exposed % GRNs and % items; expected two of each',
      v_grn_count,
      v_item_count;
  END IF;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_grn_policy TEXT;
  v_item_policy TEXT;
  v_grn_policy_count INTEGER;
  v_item_policy_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_grn_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'goods_received_notes'
    AND cmd = 'SELECT'
    AND permissive = 'PERMISSIVE'
    AND 'authenticated' = ANY (roles);

  SELECT COUNT(*)
  INTO v_item_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'grn_items'
    AND cmd = 'SELECT'
    AND permissive = 'PERMISSIVE'
    AND 'authenticated' = ANY (roles);

  SELECT qual
  INTO v_grn_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'goods_received_notes'
    AND policyname = 'grn_select'
    AND cmd = 'SELECT'
    AND permissive = 'PERMISSIVE'
    AND 'authenticated' = ANY (roles);

  SELECT qual
  INTO v_item_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'grn_items'
    AND policyname = 'grn_items_select'
    AND cmd = 'SELECT'
    AND permissive = 'PERMISSIVE'
    AND 'authenticated' = ANY (roles);

  IF v_grn_policy IS NULL OR v_item_policy IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: canonical GRN SELECT policies are missing';
  END IF;

  IF v_grn_policy_count <> 1 OR v_item_policy_count <> 1 THEN
    RAISE EXCEPTION
      'TEST FAILED: expected one permissive authenticated SELECT policy per GRN table, found % and %',
      v_grn_policy_count,
      v_item_policy_count;
  END IF;

  IF position(
       'has_permission(branch_id, ''reports:view_branch''::text)'
       IN v_grn_policy
     ) = 0
     OR position(
       'has_permission(g.branch_id, ''reports:view_branch''::text)'
       IN v_item_policy
     ) = 0
     OR position(
       'has_permission(NULL::bigint, ''reports:view_branch''::text)'
       IN v_grn_policy
     ) > 0
     OR position(
       'has_permission(NULL::bigint, ''reports:view_branch''::text)'
       IN v_item_policy
     ) > 0 THEN
    RAISE EXCEPTION 'TEST FAILED: GRN report policies do not preserve branch scope';
  END IF;

  RAISE NOTICE
    'TEST PASSED: GRN report reads are branch-scoped and tenant reporting remains tenant-wide';
END;
$$;

ROLLBACK;
