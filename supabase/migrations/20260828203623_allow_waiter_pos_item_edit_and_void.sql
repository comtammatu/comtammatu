-- Waiters may adjust individual order items with the existing
-- pos:void_order grant. Whole-order cancellation keeps the tighter
-- owner/branch_manager/cashier role boundary.

UPDATE public.role_templates AS template
SET
  permission_keys = array_append(template.permission_keys, 'pos:void_order'),
  updated_at = now()
FROM public.tenants AS tenant
WHERE tenant.slug = 'comtammatu'
  AND template.tenant_id = tenant.id
  AND template.position_code = 'waiter'
  AND NOT template.permission_keys @> ARRAY['pos:void_order']::text[];

-- Existing waiter profiles receive the newly-added template permission.
SELECT public.sync_missing_permissions_from_template();

DO $allow_waiter_void_order_item$
DECLARE
  v_def text;
  v_updated text;
  v_old_gate constant text :=
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'')';
  v_new_gate constant text :=
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'', ''branch_staff'')';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_def
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'void_order_item'
    AND pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
      'p_order_item_id bigint, p_reason text';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'void_order_item missing';
  END IF;

  v_def := replace(replace(v_def, E'\r\n', E'\n'), E'\r', E'\n');
  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  IF position(v_new_gate IN v_def) = 0 THEN
    IF position(v_old_gate IN v_def) = 0 THEN
      RAISE EXCEPTION 'void_order_item role gate changed unexpectedly';
    END IF;
    v_updated := replace(v_def, v_old_gate, v_new_gate);
    IF v_updated = v_def THEN
      RAISE EXCEPTION 'void_order_item waiter role patch failed';
    END IF;
    EXECUTE v_updated;
  END IF;
END;
$allow_waiter_void_order_item$;

DO $allow_waiter_reduce_order_item_quantity$
DECLARE
  v_def text;
  v_updated text;
  v_old_gate constant text :=
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'')';
  v_new_gate constant text :=
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'', ''branch_staff'')';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_def
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'reduce_order_item_quantity'
    AND pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
      'p_order_item_id bigint, p_new_quantity integer, p_reason text';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'reduce_order_item_quantity missing';
  END IF;

  v_def := replace(replace(v_def, E'\r\n', E'\n'), E'\r', E'\n');
  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  IF position(v_new_gate IN v_def) = 0 THEN
    IF position(v_old_gate IN v_def) = 0 THEN
      RAISE EXCEPTION 'reduce_order_item_quantity role gate changed unexpectedly';
    END IF;
    v_updated := replace(v_def, v_old_gate, v_new_gate);
    IF v_updated = v_def THEN
      RAISE EXCEPTION 'reduce_order_item_quantity waiter role patch failed';
    END IF;
    EXECUTE v_updated;
  END IF;
END;
$allow_waiter_reduce_order_item_quantity$;

DO $allow_waiter_edit_pending_order_item$
DECLARE
  v_def text;
  v_updated text;
  v_old_gate constant text :=
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'')';
  v_new_gate constant text :=
    'v_prof_role NOT IN (''owner'', ''branch_manager'', ''cashier'', ''branch_staff'')';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(procedure.oid)
  INTO v_def
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'edit_pending_order_item'
    AND pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
      'p_order_item_id bigint, p_variant_id bigint, p_variant_name text, p_unit_price numeric, p_modifiers jsonb, p_sides jsonb, p_note text, p_quantity integer';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'edit_pending_order_item missing';
  END IF;

  v_def := replace(replace(v_def, E'\r\n', E'\n'), E'\r', E'\n');
  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  IF position(v_new_gate IN v_def) = 0 THEN
    IF position(v_old_gate IN v_def) = 0 THEN
      RAISE EXCEPTION 'edit_pending_order_item role gate changed unexpectedly';
    END IF;
    v_updated := replace(v_def, v_old_gate, v_new_gate);
    IF v_updated = v_def THEN
      RAISE EXCEPTION 'edit_pending_order_item waiter role patch failed';
    END IF;
    EXECUTE v_updated;
  END IF;
END;
$allow_waiter_edit_pending_order_item$;
