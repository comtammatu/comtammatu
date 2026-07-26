-- =============================================================
-- Regression test: inventory attachment uploads use document branch scope
--
-- Usage:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/inventory_attachment_branch_rls_test.sql
-- =============================================================

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_tenant bigint;
  v_staff uuid;
  v_staff_branch bigint;
  v_other_branch bigint;
  v_supplier bigint;
  v_same_branch_grn bigint;
  v_other_branch_grn bigint;
BEGIN
  SELECT profile.tenant_id, profile.id, profile.branch_id
  INTO v_tenant, v_staff, v_staff_branch
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  JOIN public.branches AS branch
    ON branch.id = profile.branch_id
   AND branch.tenant_id = profile.tenant_id
  WHERE profile.is_active IS TRUE
    AND position.is_active IS TRUE
    AND position.code <> 'owner'
    AND branch.is_active IS TRUE
    AND EXISTS (
      SELECT 1
      FROM public.branches AS other_branch
      WHERE other_branch.tenant_id = profile.tenant_id
        AND other_branch.id <> profile.branch_id
        AND other_branch.is_active IS TRUE
    )
  ORDER BY profile.id
  LIMIT 1;

  IF v_staff IS NULL THEN
    RAISE EXCEPTION
      'TEST FAILED: no active non-owner profile with two active tenant branches found';
  END IF;

  SELECT branch.id
  INTO v_other_branch
  FROM public.branches AS branch
  WHERE branch.tenant_id = v_tenant
    AND branch.id <> v_staff_branch
    AND branch.is_active IS TRUE
  ORDER BY branch.id
  LIMIT 1;

  IF (
    SELECT count(*)
    FROM public.permission_keys
    WHERE key IN ('procurement:grn_create', 'procurement:read')
      AND scope IN ('branch', 'either')
      AND is_delegable_to_staff IS TRUE
  ) <> 2 THEN
    RAISE EXCEPTION
      'TEST FAILED: GRN create/read permissions are not delegable branch permissions';
  END IF;

  INSERT INTO public.staff_permissions (
    user_id,
    tenant_id,
    branch_id,
    permission_key,
    valid_from,
    valid_until
  )
  SELECT
    v_staff,
    v_tenant,
    v_staff_branch,
    permission_key,
    now() - interval '1 day',
    NULL
  FROM unnest(
    ARRAY['procurement:grn_create', 'procurement:read']
  ) AS permission(permission_key)
  ON CONFLICT (user_id, branch_id, permission_key)
    WHERE branch_id IS NOT NULL
  DO UPDATE SET
    valid_from = EXCLUDED.valid_from,
    valid_until = NULL;

  INSERT INTO public.suppliers (tenant_id, name)
  VALUES (
    v_tenant,
    'Inventory attachment RLS test ' || txid_current()::text
  )
  RETURNING id INTO v_supplier;

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    supplier_id,
    grn_number,
    created_by,
    status
  ) VALUES (
    v_tenant,
    v_staff_branch,
    v_supplier,
    'RLS-SAME-' || txid_current()::text,
    v_staff,
    'draft'
  )
  RETURNING id INTO v_same_branch_grn;

  INSERT INTO public.goods_received_notes (
    tenant_id,
    branch_id,
    supplier_id,
    grn_number,
    created_by,
    status
  ) VALUES (
    v_tenant,
    v_other_branch,
    v_supplier,
    'RLS-OTHER-' || txid_current()::text,
    v_staff,
    'draft'
  )
  RETURNING id INTO v_other_branch_grn;

  PERFORM set_config('test.inv_attach_tenant', v_tenant::text, true);
  PERFORM set_config('test.inv_attach_staff', v_staff::text, true);
  PERFORM set_config(
    'test.inv_attach_same_grn',
    v_same_branch_grn::text,
    true
  );
  PERFORM set_config(
    'test.inv_attach_other_grn',
    v_other_branch_grn::text,
    true
  );
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('test.inv_attach_staff'),
    'role', 'authenticated',
    'app_metadata', jsonb_build_object(
      'tenant_id', current_setting('test.inv_attach_tenant')::bigint
    )
  )::text,
  true
);
SELECT set_config(
  'request.jwt.claim.sub',
  current_setting('test.inv_attach_staff'),
  true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_tenant text := current_setting('test.inv_attach_tenant');
  v_same_grn text := current_setting('test.inv_attach_same_grn');
  v_other_grn text := current_setting('test.inv_attach_other_grn');
  v_rejected boolean;
BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner_id)
  VALUES (
    'inventory-attachments',
    format(
      '%s/grn/%s/price-override/1/same-branch.jpg',
      v_tenant,
      v_same_grn
    ),
    auth.uid()::text
  );

  v_rejected := false;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES (
      'inventory-attachments',
      format(
        '%s/grn/%s/price-override/1/other-branch.jpg',
        v_tenant,
        v_other_grn
      ),
      auth.uid()::text
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'TEST FAILED: cross-branch GRN attachment upload was accepted';
  END IF;

  v_rejected := false;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES (
      'inventory-attachments',
      format(
        '%s/grn/%s/price-override/1/wrong-tenant.jpg',
        (v_tenant::bigint + 1000)::text,
        v_same_grn
      ),
      auth.uid()::text
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_rejected := true;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION
      'TEST FAILED: wrong-tenant attachment upload was accepted';
  END IF;

  RAISE NOTICE
    'TEST PASSED: inventory attachment uploads enforce document branch scope';
END;
$$;

RESET ROLE;
ROLLBACK;
