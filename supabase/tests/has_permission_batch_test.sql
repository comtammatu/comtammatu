-- Equivalence: has_permission_batch matches N single has_permission* calls.
\set ON_ERROR_STOP on
BEGIN;

SET LOCAL session_replication_role = replica;
DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_tenant bigint;
  v_branch bigint;
  v_position bigint;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_user);
  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES ('Perm batch fixture', 'perm-batch-' || v_user, v_user)
  RETURNING id INTO v_tenant;
  INSERT INTO public.positions (tenant_id, code, label_vi)
  VALUES (v_tenant, 'branch_manager', 'Quản lý chi nhánh')
  RETURNING id INTO v_position;
  INSERT INTO public.branches (tenant_id, name, slug, branch_kind)
  VALUES (v_tenant, 'Batch branch', 'perm-batch-branch-' || v_user, 'branch')
  RETURNING id INTO v_branch;
  INSERT INTO public.profiles (id, tenant_id, position_id, branch_id, full_name, is_active)
  VALUES (v_user, v_tenant, v_position, v_branch, 'Batch Manager', true);
  INSERT INTO public.staff_permissions (
    tenant_id, user_id, permission_key, branch_id, valid_from
  )
  SELECT
    v_tenant,
    v_user,
    key,
    CASE
      WHEN pk.scope = 'tenant' THEN NULL
      ELSE v_branch
    END,
    now()
  FROM (VALUES
    ('inventory:read'),
    ('hr:view_employee'),
    ('kds:use')
  ) AS g(key)
  JOIN public.permission_keys pk ON pk.key = g.key;

  PERFORM set_config('test.perm_batch', jsonb_build_object(
    'user', v_user,
    'branch', v_branch
  )::text, true);
END;
$$;
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  f jsonb := current_setting('test.perm_batch')::jsonb;
  v_user uuid := (f->>'user')::uuid;
  v_branch bigint := (f->>'branch')::bigint;
  v_items jsonb;
  v_batch boolean[];
  v_single boolean;
  v_i integer;
  v_key text;
  v_branch_id bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  v_items := jsonb_build_array(
    jsonb_build_object('key', 'inventory:read', 'branch_id', v_branch),
    jsonb_build_object('key', 'hr:view_employee', 'branch_id', NULL),
    jsonb_build_object('key', 'kds:use', 'branch_id', v_branch),
    jsonb_build_object('key', 'inventory:read', 'branch_id', v_branch),
    jsonb_build_object('key', 'not-a-real-permission', 'branch_id', v_branch)
  );

  v_batch := public.has_permission_batch(v_items);
  IF array_length(v_batch, 1) IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'batch length %', array_length(v_batch, 1);
  END IF;

  FOR v_i IN 0 .. 4 LOOP
    v_key := v_items -> v_i ->> 'key';
    IF v_items -> v_i ->> 'branch_id' IS NULL THEN
      v_single := public.has_permission_any(v_key);
    ELSE
      v_branch_id := (v_items -> v_i ->> 'branch_id')::bigint;
      v_single := public.has_permission(v_branch_id, v_key);
    END IF;
    IF v_batch[v_i + 1] IS DISTINCT FROM COALESCE(v_single, false) THEN
      RAISE EXCEPTION 'index % key % batch % single %',
        v_i, v_key, v_batch[v_i + 1], v_single;
    END IF;
  END LOOP;

  IF public.has_permission_batch('[]'::jsonb) <> ARRAY[]::boolean[] THEN
    RAISE EXCEPTION 'empty batch must return empty array';
  END IF;
END;
$$;

ROLLBACK;
