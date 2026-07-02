-- Auth positions: remove active waiter bucket and allow central-site operators.
-- File-only migration. Production apply remains owner-run per database registry.

-- 1) Position catalog: keep access buckets small, but let HR positions be real jobs.
INSERT INTO public.positions (tenant_id, code, label_vi, label_en, is_active, is_system)
SELECT t.id, v.code, v.label_vi, v.label_en, true, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('cashier', 'Thu ngân (kiêm phục vụ)', 'Cashier / Service'),
  ('cashier_server', 'Thu ngân (kiêm phục vụ)', 'Cashier / Service'),
  ('kitchen_counter', 'Quầy bếp', 'Kitchen Counter'),
  ('kitchen_helper', 'Phụ bếp', 'Kitchen Helper'),
  ('grill_counter', 'Quầy nướng', 'Grill Counter'),
  ('cleaner', 'Tạp vụ', 'Cleaner'),
  ('warehouse_manager', 'Quản lý Kho Tổng', 'Central Supply Manager'),
  ('central_supply_manager', 'Quản lý Kho Tổng', 'Central Supply Manager'),
  ('production_manager', 'Quản lý Bếp Trung Tâm', 'Central Kitchen Manager'),
  ('central_kitchen_manager', 'Quản lý Bếp Trung Tâm', 'Central Kitchen Manager'),
  ('head_chef', 'Bếp trưởng', 'Head Chef'),
  ('accountant', 'Kế toán', 'Accountant'),
  ('marketing', 'Truyền thông', 'Marketing'),
  ('technician', 'Kỹ thuật', 'Technician'),
  ('design_construction', 'Thiết kế & Xây dựng', 'Design & Construction')
) AS v(code, label_vi, label_en)
ON CONFLICT (code, tenant_id) DO UPDATE
SET label_vi = EXCLUDED.label_vi,
    label_en = EXCLUDED.label_en,
    is_active = true,
    is_system = true;

-- 2) Backfill legacy waiter profiles to cashier before deactivating waiter.
WITH waiter_profiles AS (
  SELECT p.id AS profile_id, p.tenant_id, cashier.id AS cashier_position_id
  FROM public.profiles p
  JOIN public.positions waiter
    ON waiter.id = p.position_id
   AND waiter.tenant_id = p.tenant_id
   AND waiter.code = 'waiter'
  JOIN public.positions cashier
    ON cashier.tenant_id = p.tenant_id
   AND cashier.code = 'cashier'
)
UPDATE public.profiles p
SET position_id = wp.cashier_position_id,
    updated_at = now()
FROM waiter_profiles wp
WHERE p.id = wp.profile_id
  AND p.tenant_id = wp.tenant_id;

UPDATE auth.users au
SET raw_app_meta_data = COALESCE(au.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'role', 'cashier',
    'user_role', 'cashier',
    'access_bucket', 'cashier',
    'position', 'cashier',
    'position_code', 'cashier'
  )
WHERE COALESCE(au.raw_app_meta_data ->> 'role', '') = 'waiter'
   OR COALESCE(au.raw_app_meta_data ->> 'user_role', '') = 'waiter'
   OR COALESCE(au.raw_app_meta_data ->> 'access_bucket', '') = 'waiter'
   OR COALESCE(au.raw_app_meta_data ->> 'position', '') = 'waiter'
   OR COALESCE(au.raw_app_meta_data ->> 'position_code', '') = 'waiter';

UPDATE public.positions
SET is_active = false
WHERE code = 'waiter';

UPDATE public.role_templates rt
SET position_code = 'cashier',
    name = CASE
      WHEN rt.name = 'waiter' THEN
        CASE
          WHEN EXISTS (
            SELECT 1 FROM public.role_templates existing
            WHERE existing.tenant_id = rt.tenant_id
              AND existing.name = 'cashier_floor'
              AND existing.id <> rt.id
          )
          THEN 'cashier_floor_' || rt.id::text
          ELSE 'cashier_floor'
        END
      ELSE rt.name
    END,
    permission_keys = ARRAY(
      SELECT DISTINCT unnest(rt.permission_keys || ARRAY[
        'pos:close_shift',
        'pos:confirm_payment',
        'pos:open_cashbox',
        'pos:reprint_receipt'
      ]::text[])
      ORDER BY 1
    ),
    updated_at = now()
WHERE rt.position_code = 'waiter' OR rt.name = 'waiter';

-- 3) TS twin: packages/shared/src/auth/types.ts POSITION_CODE_TO_STAFF_ROLE.
CREATE OR REPLACE FUNCTION private.staff_role_from_position_code(p_code text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_code
    WHEN 'owner' THEN 'owner'
    WHEN 'branch_manager' THEN 'branch_manager'
    WHEN 'warehouse_manager' THEN 'warehouse_manager'
    WHEN 'central_supply_manager' THEN 'warehouse_manager'
    WHEN 'production_manager' THEN 'production_manager'
    WHEN 'central_kitchen_manager' THEN 'production_manager'
    WHEN 'head_chef' THEN 'production_manager'
    WHEN 'kitchen_counter' THEN 'chef'
    WHEN 'kitchen_helper' THEN 'chef'
    WHEN 'grill_counter' THEN 'chef'
    WHEN 'chef' THEN 'chef'
    WHEN 'cashier' THEN 'cashier'
    WHEN 'cashier_server' THEN 'cashier'
    WHEN 'waiter' THEN 'cashier'
    WHEN 'office' THEN 'office'
    WHEN 'accountant' THEN 'office'
    WHEN 'marketing' THEN 'office'
    WHEN 'technician' THEN 'office'
    WHEN 'design_construction' THEN 'office'
    WHEN 'cleaner' THEN 'office'
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION private.staff_role_from_position_code(text) IS
  'SQL twin of POSITION_CODE_TO_STAFF_ROLE (packages/shared/src/auth/types.ts). English position codes only. Legacy waiter maps to cashier.';

CREATE OR REPLACE FUNCTION public.auth_role_to_position(p_role text)
RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN 'owner'
    WHEN 'branch_manager' THEN 'branch_manager'
    WHEN 'warehouse_manager' THEN 'warehouse_manager'
    WHEN 'production_manager' THEN 'production_manager'
    WHEN 'head_chef' THEN 'head_chef'
    WHEN 'kitchen_helper' THEN 'kitchen_helper'
    WHEN 'chef' THEN 'chef'
    WHEN 'cashier' THEN 'cashier'
    WHEN 'waiter' THEN 'cashier'
    WHEN 'office' THEN 'office'
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION public.auth_role_to_position(text) IS
  'Maps compatibility access buckets to the canonical HR position code used at Auth user creation. Legacy waiter maps to cashier.';

REVOKE ALL ON FUNCTION public.auth_role_to_position(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_role_to_position(text) TO service_role;

CREATE OR REPLACE FUNCTION public.position_id_from_access_bucket(p_access_bucket text, p_tenant bigint)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH resolved AS (
    SELECT public.auth_role_to_position(p_access_bucket) AS preferred_position_code,
      COALESCE(private.staff_role_from_position_code(public.auth_role_to_position(p_access_bucket)), p_access_bucket) AS access_bucket
  )
  SELECT po.id
  FROM public.positions po
  CROSS JOIN resolved r
  WHERE po.tenant_id = p_tenant
    AND COALESCE(po.is_active, true) = true
    AND private.staff_role_from_position_code(po.code) = r.access_bucket
  ORDER BY
    CASE WHEN po.code = r.preferred_position_code THEN -1 ELSE 0 END,
    CASE po.code
      WHEN 'owner' THEN 0
      WHEN 'branch_manager' THEN 0
      WHEN 'warehouse_manager' THEN 0
      WHEN 'production_manager' THEN 0
      WHEN 'head_chef' THEN 1
      WHEN 'central_supply_manager' THEN 1
      WHEN 'central_kitchen_manager' THEN 1
      WHEN 'chef' THEN 0
      WHEN 'cashier' THEN 0
      WHEN 'office' THEN 0
      WHEN 'kitchen_counter' THEN 1
      WHEN 'kitchen_helper' THEN 1
      WHEN 'grill_counter' THEN 1
      WHEN 'cashier_server' THEN 1
      ELSE 9
    END,
    po.id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.position_id_from_access_bucket(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.position_id_from_access_bucket(text, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_tenant_id bigint;
  v_branch_id bigint;
  v_access_bucket text;
  v_position_code text;
  v_position_id bigint;
  v_required_branch_kind text;
  v_branch_kind text;
BEGIN
  v_tenant_id := COALESCE(
    (NEW.raw_app_meta_data ->> 'tenant_id')::bigint,
    (SELECT id FROM public.tenants WHERE slug = 'comtammatu' LIMIT 1)
  );
  v_branch_id := NULLIF(NEW.raw_app_meta_data ->> 'branch_id', '')::bigint;
  v_position_code := COALESCE(
    NULLIF(NEW.raw_app_meta_data ->> 'position_code', ''),
    NULLIF(NEW.raw_app_meta_data ->> 'position', '')
  );
  v_access_bucket := COALESCE(
    NULLIF(NEW.raw_app_meta_data ->> 'access_bucket', ''),
    NULLIF(NEW.raw_app_meta_data ->> 'user_role', ''),
    NULLIF(NEW.raw_app_meta_data ->> 'role', ''),
    'owner'
  );
  IF v_position_code = 'waiter' THEN
    v_position_code := 'cashier';
  END IF;

  IF v_position_code IS NOT NULL THEN
    SELECT po.id INTO v_position_id
    FROM public.positions po
    WHERE po.tenant_id = v_tenant_id
      AND po.code = v_position_code
      AND COALESCE(po.is_active, true) = true
    LIMIT 1;

    v_access_bucket := private.staff_role_from_position_code(v_position_code);
  ELSE
    v_position_id := public.position_id_from_access_bucket(v_access_bucket, v_tenant_id);
    SELECT po.code INTO v_position_code
    FROM public.positions po
    WHERE po.id = v_position_id
      AND po.tenant_id = v_tenant_id;
    v_access_bucket := private.staff_role_from_position_code(v_position_code);
  END IF;

  IF v_position_id IS NULL OR v_access_bucket IS NULL THEN
    RAISE EXCEPTION
      'handle_new_user: position_not_resolved for position=% access_bucket=% tenant=%',
      v_position_code, v_access_bucket, v_tenant_id
      USING ERRCODE = 'P0001';
  END IF;

  v_required_branch_kind := CASE v_position_code
    WHEN 'branch_manager' THEN 'branch'
    WHEN 'cashier' THEN 'branch'
    WHEN 'cashier_server' THEN 'branch'
    WHEN 'chef' THEN 'branch'
    WHEN 'kitchen_counter' THEN 'branch'
    WHEN 'kitchen_helper' THEN 'branch'
    WHEN 'grill_counter' THEN 'branch'
    WHEN 'cleaner' THEN 'branch'
    WHEN 'waiter' THEN 'branch'
    WHEN 'warehouse_manager' THEN 'central_supply'
    WHEN 'central_supply_manager' THEN 'central_supply'
    WHEN 'production_manager' THEN 'central_kitchen'
    WHEN 'central_kitchen_manager' THEN 'central_kitchen'
    WHEN 'head_chef' THEN 'central_kitchen'
    ELSE NULL
  END;

  IF v_required_branch_kind IS NOT NULL AND v_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_position' USING ERRCODE = 'P0001';
  END IF;

  IF v_branch_id IS NOT NULL THEN
    SELECT branch_kind INTO v_branch_kind
    FROM public.branches
    WHERE id = v_branch_id
      AND tenant_id = v_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch_not_found_in_tenant' USING ERRCODE = 'P0002';
    END IF;
    IF v_required_branch_kind IS NOT NULL AND v_branch_kind <> v_required_branch_kind THEN
      RAISE EXCEPTION 'position_site_kind_mismatch' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, tenant_id, branch_id, position_id, full_name)
  VALUES (
    NEW.id,
    v_tenant_id,
    v_branch_id,
    v_position_id,
    COALESCE(NEW.raw_app_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'full_name', '')
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

CREATE OR REPLACE FUNCTION public.update_pos_order_status(p_order_id bigint, p_new_status text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID;
  v_prof_tenant BIGINT;
  v_prof_branch BIGINT;
  v_prof_role TEXT;
  v_order RECORD;
  v_from_status TEXT;
  v_bad_items INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, p.branch_id, COALESCE(private.staff_role_from_position_code(po.code), 'office')
  INTO v_prof_tenant, v_prof_branch, v_prof_role
  FROM public.profiles p
  LEFT JOIN public.positions po ON po.id = p.position_id
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  IF v_prof_role IS NULL OR v_prof_role NOT IN ('owner', 'branch_manager', 'cashier') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_new_status NOT IN ('served', 'completed') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(p_order_id);

  SELECT id, tenant_id, branch_id, status
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id <> v_prof_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_prof_role IN ('owner') THEN
    NULL;
  ELSIF v_order.branch_id IS DISTINCT FROM v_prof_branch THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'order terminal' USING ERRCODE = '22023';
  END IF;

  v_from_status := v_order.status;

  IF p_new_status = 'served' THEN
    IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'ready') THEN
      RAISE EXCEPTION 'invalid transition to served' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*) INTO v_bad_items
    FROM public.order_items
    WHERE order_id = p_order_id
      AND status NOT IN ('ready', 'served', 'cancelled');

    IF v_bad_items > 0 THEN
      RAISE EXCEPTION 'items not terminal' USING ERRCODE = '22023';
    END IF;

    UPDATE public.order_items
    SET status = 'served',
        updated_at = now()
    WHERE order_id = p_order_id
      AND tenant_id = v_order.tenant_id
      AND status = 'ready';

    UPDATE public.kds_tickets
    SET status = 'served',
        bumped_at = COALESCE(bumped_at, now()),
        bumped_by = COALESCE(bumped_by, v_uid),
        updated_at = now()
    WHERE order_id = p_order_id
      AND tenant_id = v_order.tenant_id
      AND status = 'ready';

    UPDATE public.orders
    SET status = 'served', updated_at = now()
    WHERE id = p_order_id;
  ELSIF p_new_status = 'completed' THEN
    IF v_order.status <> 'served' THEN
      RAISE EXCEPTION 'complete requires served' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*) INTO v_bad_items
    FROM public.order_items
    WHERE order_id = p_order_id
      AND status NOT IN ('ready', 'served', 'cancelled');

    IF v_bad_items > 0 THEN
      RAISE EXCEPTION 'items not terminal' USING ERRCODE = '22023';
    END IF;

    UPDATE public.orders
    SET status = 'completed', updated_at = now()
    WHERE id = p_order_id;
  END IF;

  INSERT INTO public.order_status_history (
    tenant_id, order_id, from_status, to_status, changed_by, note
  )
  VALUES (
    v_order.tenant_id, p_order_id, v_from_status, p_new_status, v_uid, 'pos update'
  );

  RETURN jsonb_build_object('order_id', p_order_id, 'status', p_new_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_target_id uuid,
  p_full_name text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_role text DEFAULT NULL::text,
  p_branch_id bigint DEFAULT NULL::bigint,
  p_is_active boolean DEFAULT NULL::boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_tenant bigint;
  v_actor_role_text text;
  v_actor_branch bigint;
  v_target record;
  v_target_role text;
  v_final_role text;
  v_final_branch bigint;
  v_final_position bigint;
  v_final_position_code text;
  v_requested_code text;
  v_required_branch_kind text;
  v_branch_kind text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id, private.staff_role_from_position_code(po.code), p.branch_id
  INTO v_actor_tenant, v_actor_role_text, v_actor_branch
  FROM public.profiles p
  JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
  WHERE p.id = v_actor_id AND COALESCE(p.is_active, true) = true;
  IF NOT FOUND OR v_actor_tenant IS NULL OR v_actor_role_text IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('staff:manage') THEN
    RAISE EXCEPTION 'forbidden: missing staff:manage' USING ERRCODE = '42501';
  END IF;
  IF (p_role IS NOT NULL OR p_branch_id IS NOT NULL) AND NOT public.has_permission_any('staff:assign_position') THEN
    RAISE EXCEPTION 'forbidden: missing staff:assign_position' USING ERRCODE = '42501';
  END IF;

  SELECT p.id, p.branch_id, p.full_name, p.phone, p.tenant_id, p.position_id,
         po.code AS position_code,
         private.staff_role_from_position_code(po.code) AS role_text
  INTO v_target
  FROM public.profiles p
  JOIN public.positions po ON po.id = p.position_id AND po.tenant_id = p.tenant_id
  WHERE p.id = p_target_id AND p.tenant_id = v_actor_tenant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_profile_not_found_in_tenant' USING ERRCODE = 'P0002';
  END IF;

  v_target_role := v_target.role_text;
  v_requested_code := NULLIF(p_role, '');

  IF v_requested_code IS NULL THEN
    v_final_position := v_target.position_id;
    v_final_position_code := v_target.position_code;
    v_final_role := v_target_role;
  ELSE
    SELECT po.id, po.code, private.staff_role_from_position_code(po.code)
    INTO v_final_position, v_final_position_code, v_final_role
    FROM public.positions po
    WHERE po.tenant_id = v_actor_tenant
      AND po.code = v_requested_code
      AND COALESCE(po.is_active, true) = true
    LIMIT 1;

    IF v_final_position IS NULL THEN
      v_final_role := CASE WHEN v_requested_code = 'waiter' THEN 'cashier' ELSE v_requested_code END;
      IF v_final_role NOT IN ('owner','branch_manager','warehouse_manager','production_manager','cashier','chef','office') THEN
        RAISE EXCEPTION 'invalid_access_bucket: %', v_requested_code USING ERRCODE = '22023';
      END IF;
      v_final_position := public.position_id_from_access_bucket(v_final_role, v_actor_tenant);
      SELECT po.code INTO v_final_position_code
      FROM public.positions po
      WHERE po.id = v_final_position
        AND po.tenant_id = v_actor_tenant;
    END IF;
  END IF;

  IF v_final_position IS NULL OR v_final_role IS NULL OR v_final_position_code IS NULL THEN
    RAISE EXCEPTION 'admin_update_profile: position_not_resolved for position=% tenant=%', v_requested_code, v_actor_tenant USING ERRCODE = 'P0001';
  END IF;

  IF v_final_role = 'owner' THEN
    RAISE EXCEPTION 'cannot_modify_owner' USING ERRCODE = '42501';
  END IF;

  v_required_branch_kind := CASE v_final_position_code
    WHEN 'branch_manager' THEN 'branch'
    WHEN 'cashier' THEN 'branch'
    WHEN 'cashier_server' THEN 'branch'
    WHEN 'chef' THEN 'branch'
    WHEN 'kitchen_counter' THEN 'branch'
    WHEN 'kitchen_helper' THEN 'branch'
    WHEN 'grill_counter' THEN 'branch'
    WHEN 'cleaner' THEN 'branch'
    WHEN 'waiter' THEN 'branch'
    WHEN 'warehouse_manager' THEN 'central_supply'
    WHEN 'central_supply_manager' THEN 'central_supply'
    WHEN 'production_manager' THEN 'central_kitchen'
    WHEN 'central_kitchen_manager' THEN 'central_kitchen'
    WHEN 'head_chef' THEN 'central_kitchen'
    ELSE NULL
  END;

  IF v_required_branch_kind IS NULL AND v_requested_code IS NOT NULL THEN
    v_final_branch := NULL;
  ELSE
    v_final_branch := COALESCE(p_branch_id, v_target.branch_id);
  END IF;

  IF v_required_branch_kind IS NOT NULL AND v_final_branch IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_position' USING ERRCODE = 'P0001';
  END IF;

  IF v_final_branch IS NOT NULL THEN
    SELECT branch_kind INTO v_branch_kind
    FROM public.branches
    WHERE id = v_final_branch
      AND tenant_id = v_actor_tenant;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch_not_found_in_tenant' USING ERRCODE = 'P0002';
    END IF;
    IF v_required_branch_kind IS NOT NULL AND v_branch_kind <> v_required_branch_kind THEN
      RAISE EXCEPTION 'position_site_kind_mismatch' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_actor_role_text = 'owner' THEN
    NULL;
  ELSIF v_actor_role_text = 'branch_manager' THEN
    IF v_target.branch_id IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager_target_not_in_branch' USING ERRCODE = '42501';
    END IF;
    IF v_target_role = 'branch_manager' THEN
      RAISE EXCEPTION 'branch_manager_cannot_modify_peer' USING ERRCODE = '42501';
    END IF;
    IF v_final_role NOT IN ('cashier','chef') THEN
      RAISE EXCEPTION 'branch_manager_can_only_assign_branch_staff' USING ERRCODE = '42501';
    END IF;
    IF v_final_branch IS DISTINCT FROM v_actor_branch THEN
      RAISE EXCEPTION 'branch_manager_cannot_reassign_branch' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'insufficient_privileges_for_profile_management' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET full_name = COALESCE(p_full_name, full_name),
      phone = COALESCE(p_phone, phone),
      position_id = v_final_position,
      branch_id = v_final_branch,
      is_active = COALESCE(p_is_active, is_active),
      updated_at = now()
  WHERE id = p_target_id
    AND tenant_id = v_actor_tenant;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'user_role', v_final_role,
      'role', v_final_role,
      'access_bucket', v_final_role,
      'position', v_final_position_code,
      'position_code', v_final_position_code,
      'branch_id', v_final_branch
    )
  WHERE id = p_target_id;
END;
$$;
