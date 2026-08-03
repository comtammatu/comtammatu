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
  v_ingredient bigint;
  v_unit bigint;
  v_same_branch_grn bigint;
  v_same_branch_line bigint;
  v_other_branch_grn bigint;
  v_other_branch_line bigint;
  v_same_branch_po bigint;
  v_same_branch_po_line bigint;
  v_other_branch_po bigint;
  v_other_branch_po_line bigint;
BEGIN
  SELECT profile.tenant_id, profile.id
  INTO v_tenant, v_staff
  FROM public.profiles AS profile
  JOIN public.positions AS position
    ON position.id = profile.position_id
   AND position.tenant_id = profile.tenant_id
  WHERE profile.is_active IS TRUE
    AND position.is_active IS TRUE
    AND position.code <> 'owner'
    AND 2 <= (
      SELECT count(*)
      FROM public.branches AS site
      WHERE site.tenant_id = profile.tenant_id
        AND site.branch_kind IN ('central_supply', 'central_kitchen')
        AND site.is_active IS TRUE
    )
  ORDER BY profile.id
  LIMIT 1;

  IF v_staff IS NULL THEN
    RAISE EXCEPTION
      'TEST FAILED: no active non-owner profile with two active central sites found';
  END IF;

  SELECT branch.id
  INTO v_staff_branch
  FROM public.branches AS branch
  WHERE branch.tenant_id = v_tenant
    AND branch.branch_kind IN ('central_supply', 'central_kitchen')
    AND branch.is_active IS TRUE
  ORDER BY branch.id
  LIMIT 1;

  SELECT branch.id
  INTO v_other_branch
  FROM public.branches AS branch
  WHERE branch.tenant_id = v_tenant
    AND branch.id <> v_staff_branch
    AND branch.branch_kind IN ('central_supply', 'central_kitchen')
    AND branch.is_active IS TRUE
  ORDER BY branch.id
  LIMIT 1;

  UPDATE public.profiles
  SET branch_id = v_staff_branch
  WHERE id = v_staff
    AND tenant_id = v_tenant;

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

  SELECT ingredient_unit.ingredient_id, ingredient_unit.unit_id
  INTO v_ingredient, v_unit
  FROM public.ingredient_units AS ingredient_unit
  JOIN public.ingredients AS ingredient
    ON ingredient.id = ingredient_unit.ingredient_id
   AND ingredient.tenant_id = ingredient_unit.tenant_id
  WHERE ingredient_unit.tenant_id = v_tenant
    AND ingredient_unit.is_base IS TRUE
    AND ingredient_unit.is_active IS TRUE
    AND ingredient.is_active IS TRUE
  ORDER BY ingredient_unit.id
  LIMIT 1;

  IF v_ingredient IS NULL OR v_unit IS NULL THEN
    RAISE EXCEPTION
      'TEST FAILED: active ingredient base unit is required';
  END IF;

  INSERT INTO public.supplier_items (
    tenant_id,
    supplier_id,
    ingredient_id,
    is_active,
    created_by
  )
  VALUES (
    v_tenant,
    v_supplier,
    v_ingredient,
    TRUE,
    v_staff
  );

  INSERT INTO public.purchase_orders (
    tenant_id, branch_id, supplier_id, po_number, status, created_by
  ) VALUES (
    v_tenant, v_staff_branch, v_supplier,
    'RLS-PO-SAME-' || txid_current()::text, 'draft', v_staff
  ) RETURNING id INTO v_same_branch_po;

  INSERT INTO public.purchase_order_items (
    tenant_id, po_id, ingredient_id, quantity, unit_price_est,
    entry_unit_id
  ) VALUES (
    v_tenant, v_same_branch_po, v_ingredient, 1, 0, v_unit
  ) RETURNING id INTO v_same_branch_po_line;

  INSERT INTO public.purchase_orders (
    tenant_id, branch_id, supplier_id, po_number, status, created_by
  ) VALUES (
    v_tenant, v_other_branch, v_supplier,
    'RLS-PO-OTHER-' || txid_current()::text, 'draft', v_staff
  ) RETURNING id INTO v_other_branch_po;

  INSERT INTO public.purchase_order_items (
    tenant_id, po_id, ingredient_id, quantity, unit_price_est,
    entry_unit_id
  ) VALUES (
    v_tenant, v_other_branch_po, v_ingredient, 1, 0, v_unit
  ) RETURNING id INTO v_other_branch_po_line;

  INSERT INTO public.goods_received_notes (
    tenant_id, branch_id, supplier_id, po_id, grn_number,
    created_by, status
  ) VALUES (
    v_tenant, v_staff_branch, v_supplier, v_same_branch_po,
    'RLS-SAME-' || gen_random_uuid()::text, v_staff, 'draft'
  ) RETURNING id INTO v_same_branch_grn;

  INSERT INTO public.goods_received_notes (
    tenant_id, branch_id, supplier_id, po_id, grn_number,
    created_by, status
  ) VALUES (
    v_tenant, v_other_branch, v_supplier, v_other_branch_po,
    'RLS-OTHER-' || gen_random_uuid()::text, v_staff, 'draft'
  ) RETURNING id INTO v_other_branch_grn;

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    received_quantity,
    rejected_quantity,
    entry_unit_id,
    purchase_order_item_id,
    supplier_id
  )
  VALUES (
    v_tenant,
    v_same_branch_grn,
    v_ingredient,
    1,
    0,
    v_unit,
    v_same_branch_po_line,
    v_supplier
  )
  RETURNING id INTO v_same_branch_line;

  INSERT INTO public.grn_items (
    tenant_id,
    grn_id,
    ingredient_id,
    received_quantity,
    rejected_quantity,
    entry_unit_id,
    purchase_order_item_id,
    supplier_id
  )
  VALUES (
    v_tenant,
    v_other_branch_grn,
    v_ingredient,
    1,
    0,
    v_unit,
    v_other_branch_po_line,
    v_supplier
  )
  RETURNING id INTO v_other_branch_line;

  PERFORM set_config('test.inv_attach_tenant', v_tenant::text, true);
  PERFORM set_config('test.inv_attach_staff', v_staff::text, true);
  PERFORM set_config(
    'test.inv_attach_same_grn',
    v_same_branch_grn::text,
    true
  );
  PERFORM set_config(
    'test.inv_attach_same_line',
    v_same_branch_line::text,
    true
  );
  PERFORM set_config(
    'test.inv_attach_other_grn',
    v_other_branch_grn::text,
    true
  );
  PERFORM set_config(
    'test.inv_attach_other_line',
    v_other_branch_line::text,
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
  v_same_line text := current_setting('test.inv_attach_same_line');
  v_other_grn text := current_setting('test.inv_attach_other_grn');
  v_other_line text := current_setting('test.inv_attach_other_line');
  v_rejected boolean;
BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
  VALUES (
    'inventory-attachments',
    format(
      '%s/grn/%s/rejected/%s/same-branch.webp',
      v_tenant,
      v_same_grn,
      v_same_line
    ),
    auth.uid()::text,
    '{"mimetype":"image/webp"}'::jsonb
  );

  v_rejected := false;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES (
      'inventory-attachments',
      format(
        '%s/grn/%s/rejected/%s/other-branch.webp',
        v_tenant,
        v_other_grn,
        v_other_line
      ),
      auth.uid()::text,
      '{"mimetype":"image/webp"}'::jsonb
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
    INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES (
      'inventory-attachments',
      format(
        '%s/grn/%s/rejected/%s/wrong-tenant.webp',
        (v_tenant::bigint + 1000)::text,
        v_same_grn,
        v_same_line
      ),
      auth.uid()::text,
      '{"mimetype":"image/webp"}'::jsonb
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
