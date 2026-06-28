-- AUTHZ-1: Block privilege self-escalation. An actor holding
-- 'staff:assign_permission' must not be able to grant/revoke/apply-template
-- permissions to themselves. Reject p_target_user = auth.uid() with 42501,
-- immediately after the existing authorization check and before any write,
-- in grant_permission / revoke_permission / apply_template_to_user.
--
-- RPC-1: Harden update_pos_order_status. (a) Make the branch-scope comparison
-- NULL-safe (IS DISTINCT FROM) so a non-owner profile with a NULL branch_id can
-- no longer bypass the branch check. (b) Add a POS-operating role allow-list
-- (owner + branch_manager + cashier + waiter, matching the sibling POS RPC
-- apply_order_discount) so non-POS roles (e.g. 'office', kitchen, warehouse)
-- can no longer transition order status. Every other safeguard (owner bypass,
-- advisory lock, FOR UPDATE, terminal-state checks, item-status invariants) is
-- preserved byte-for-byte.

CREATE OR REPLACE FUNCTION public.grant_permission(p_target_user uuid, p_branch_id bigint, p_permission_key text, p_source_template bigint DEFAULT NULL::bigint, p_valid_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_valid_until timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id BIGINT;
  v_target_tenant BIGINT;
  v_grant_id  BIGINT;
  v_from      TIMESTAMPTZ := COALESCE(p_valid_from, now());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'staff:assign_permission') THEN
    RAISE EXCEPTION 'forbidden: missing staff:assign_permission' USING ERRCODE = '42501';
  END IF;

  IF p_target_user = auth.uid() THEN
    RAISE EXCEPTION 'cannot_self_assign_permissions' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'actor_no_profile' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_target_tenant FROM public.profiles WHERE id = p_target_user;
  IF v_target_tenant IS NULL OR v_target_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'target_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF public.auth_is_owner(p_target_user) THEN
    RAISE EXCEPTION 'cannot_manage_owner_permissions' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.permission_keys WHERE key = p_permission_key) THEN
    RAISE EXCEPTION 'unknown_permission_key: %', p_permission_key USING ERRCODE = '22023';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'branch_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF p_valid_until IS NOT NULL AND p_valid_until <= v_from THEN
    RAISE EXCEPTION 'invalid_validity_window: valid_until must be after valid_from' USING ERRCODE = '22023';
  END IF;

  -- Upsert semantics:
  --   Existing row for same (user, branch, key) → UPDATE validity if longer,
  --   else leave alone. This keeps audit meaningful: re-granting extends the
  --   window rather than creating duplicates.
  SELECT id INTO v_grant_id
  FROM public.staff_permissions
  WHERE user_id = p_target_user
    AND permission_key = p_permission_key
    AND (
      (p_branch_id IS NULL AND branch_id IS NULL)
      OR branch_id = p_branch_id
    )
  LIMIT 1;

  IF v_grant_id IS NULL THEN
    INSERT INTO public.staff_permissions (
      user_id, tenant_id, branch_id, permission_key, source_template, granted_by,
      valid_from, valid_until
    ) VALUES (
      p_target_user, v_tenant_id, p_branch_id, p_permission_key, p_source_template, auth.uid(),
      v_from, p_valid_until
    )
    RETURNING id INTO v_grant_id;

    INSERT INTO public.permission_audit_log (
      tenant_id, actor_user_id, target_user_id, branch_id,
      permission_key, action, source_template_id, metadata
    ) VALUES (
      v_tenant_id, auth.uid(), p_target_user, p_branch_id,
      p_permission_key, 'grant', p_source_template,
      jsonb_build_object(
        'valid_from',  v_from,
        'valid_until', p_valid_until
      )
    );
  ELSE
    -- Extend validity if new window is broader (or change explicit)
    UPDATE public.staff_permissions
    SET valid_from  = LEAST(valid_from, v_from),
        valid_until = CASE
          WHEN p_valid_until IS NULL THEN NULL  -- make permanent
          WHEN valid_until  IS NULL THEN valid_until  -- already permanent, keep
          ELSE GREATEST(valid_until, p_valid_until)
        END
    WHERE id = v_grant_id;
  END IF;

  RETURN v_grant_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.revoke_permission(p_target_user uuid, p_branch_id bigint, p_permission_key text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id BIGINT;
  v_target_tenant BIGINT;
  v_deleted INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'staff:assign_permission') THEN
    RAISE EXCEPTION 'forbidden: missing staff:assign_permission' USING ERRCODE = '42501';
  END IF;

  IF p_target_user = auth.uid() THEN
    RAISE EXCEPTION 'cannot_self_assign_permissions' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  SELECT tenant_id INTO v_target_tenant FROM public.profiles WHERE id = p_target_user;
  IF v_target_tenant IS NULL OR v_target_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'target_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF public.auth_is_owner(p_target_user) THEN
    RAISE EXCEPTION 'cannot_manage_owner_permissions' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.staff_permissions
  WHERE user_id = p_target_user
    AND permission_key = p_permission_key
    AND (
      (p_branch_id IS NULL AND branch_id IS NULL)
      OR branch_id = p_branch_id
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    INSERT INTO public.permission_audit_log (
      tenant_id, actor_user_id, target_user_id, branch_id,
      permission_key, action
    ) VALUES (
      v_tenant_id, auth.uid(), p_target_user, p_branch_id,
      p_permission_key, 'revoke'
    );
  END IF;

  RETURN v_deleted;
END;
$$;


CREATE OR REPLACE FUNCTION public.apply_template_to_user(p_target_user uuid, p_branch_id bigint, p_template_id bigint, p_valid_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_valid_until timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_tenant_id     BIGINT;
  v_target_tenant BIGINT;
  v_template      RECORD;
  v_perm_key      TEXT;
  v_inserted      INTEGER := 0;
  v_rows          INTEGER;
  v_from          TIMESTAMPTZ := COALESCE(p_valid_from, now());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'staff:assign_permission') THEN
    RAISE EXCEPTION 'forbidden: missing staff:assign_permission' USING ERRCODE = '42501';
  END IF;

  IF p_target_user = auth.uid() THEN
    RAISE EXCEPTION 'cannot_self_assign_permissions' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  SELECT tenant_id INTO v_target_tenant FROM public.profiles WHERE id = p_target_user;
  IF v_target_tenant IS NULL OR v_target_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'target_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF public.auth_is_owner(p_target_user) THEN
    RAISE EXCEPTION 'cannot_manage_owner_permissions' USING ERRCODE = '42501';
  END IF;

  IF p_valid_until IS NOT NULL AND p_valid_until <= v_from THEN
    RAISE EXCEPTION 'invalid_validity_window' USING ERRCODE = '22023';
  END IF;

  SELECT id, tenant_id, permission_keys
  INTO v_template
  FROM public.role_templates
  WHERE id = p_template_id;

  IF v_template.id IS NULL OR v_template.tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'template_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
    INSERT INTO public.staff_permissions (
      user_id, tenant_id, branch_id, permission_key, source_template, granted_by,
      valid_from, valid_until
    ) VALUES (
      p_target_user, v_tenant_id, p_branch_id, v_perm_key, v_template.id, auth.uid(),
      v_from, p_valid_until
    )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      INSERT INTO public.permission_audit_log (
        tenant_id, actor_user_id, target_user_id, branch_id,
        permission_key, action, source_template_id, metadata
      ) VALUES (
        v_tenant_id, auth.uid(), p_target_user, p_branch_id,
        v_perm_key, 'apply_template', v_template.id,
        jsonb_build_object(
          'template_id', v_template.id,
          'valid_from',  v_from,
          'valid_until', p_valid_until
        )
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;


CREATE OR REPLACE FUNCTION public.update_pos_order_status(p_order_id bigint, p_new_status text) RETURNS jsonb
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

  IF v_prof_role IS NULL OR v_prof_role NOT IN
     ('owner', 'branch_manager', 'cashier', 'waiter')
  THEN
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

    -- Same invariant as 'completed': every active item must already be
    -- terminal from the kitchen's perspective. Cashier cannot retire a
    -- ticket the chef is still working on.
    SELECT COUNT(*) INTO v_bad_items
    FROM public.order_items
    WHERE order_id = p_order_id
      AND status NOT IN ('ready', 'served', 'cancelled');

    IF v_bad_items > 0 THEN
      RAISE EXCEPTION 'items not terminal' USING ERRCODE = '22023';
    END IF;

    -- Only flip the rows that still need transitioning. 'served' stays
    -- 'served', 'cancelled' stays 'cancelled' (guard above already proved
    -- nothing is pending/preparing).
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
