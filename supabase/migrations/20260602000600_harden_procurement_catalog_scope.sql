-- =============================================================
-- Greenfield PBAC cleanup: procurement catalog tenant/branch scope.
--
-- Supplier, supplier price, and supplier SKU mapping tables are tenant-owned
-- catalogs. Branch/source boundaries belong to transactional records:
-- purchase_orders, goods_received_notes, supplier_invoices, and returns.
-- =============================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- ─── 1. Permission catalog truth ───────────────────────────────
-- Price catalog reads are used by branch procurement workflows, but the data
-- itself is tenant-level. Write/manage permissions stay tenant-only.
UPDATE public.permission_keys
   SET module = 'inventory_procurement',
       description = 'Read tenant-level supplier price catalog for procurement workflows.',
       scope = 'either'
 WHERE key = 'procurement:price_list_read';

UPDATE public.permission_keys
   SET module = 'inventory_procurement',
       scope = 'tenant'
 WHERE key IN ('procurement:supplier_manage', 'procurement:price_list_write');

-- Branch-applied templates must not carry tenant-only catalog mutation keys.
UPDATE public.role_templates rt
   SET permission_keys = ARRAY(
         SELECT DISTINCT perm.key
           FROM unnest(rt.permission_keys) AS perm(key)
          WHERE NOT (
            perm.key = ANY(ARRAY[
              'procurement:supplier_manage',
              'procurement:price_list_write'
            ]::TEXT[])
          )
          ORDER BY perm.key
       ),
       updated_at = now()
 WHERE rt.is_system = TRUE
   AND rt.position_code IN ('warehouse_head', 'area_manager', 'branch_manager', 'warehouse_keeper', 'head_chef')
   AND rt.permission_keys && ARRAY[
     'procurement:supplier_manage',
     'procurement:price_list_write'
   ]::TEXT[];

-- Existing branch-granted tenant-scope rows are invalid by definition.
-- Remove them instead of widening them to tenant-wide grants.
DELETE FROM public.staff_permissions sp
USING public.permission_keys pk
WHERE pk.key = sp.permission_key
  AND pk.scope = 'tenant'
  AND sp.branch_id IS NOT NULL;

-- ─── 2. Scope guard for future permission grants ───────────────
CREATE OR REPLACE FUNCTION private.staff_permission_effective_branch_id(
  p_permission_key TEXT,
  p_requested_branch_id BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_scope TEXT;
BEGIN
  SELECT pk.scope
    INTO v_scope
    FROM public.permission_keys pk
   WHERE pk.key = p_permission_key;

  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'unknown_permission_key: %', p_permission_key USING ERRCODE = '22023';
  END IF;

  IF v_scope = 'tenant' THEN
    RETURN NULL;
  END IF;

  RETURN p_requested_branch_id;
END;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_staff_permission_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_effective_branch_id BIGINT;
BEGIN
  v_effective_branch_id := private.staff_permission_effective_branch_id(
    NEW.permission_key,
    NEW.branch_id
  );

  IF v_effective_branch_id IS DISTINCT FROM NEW.branch_id THEN
    RAISE EXCEPTION 'tenant_permission_requires_null_branch: %', NEW.permission_key
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.staff_permission_effective_branch_id(TEXT, BIGINT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.enforce_staff_permission_scope()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_staff_permissions_scope ON public.staff_permissions;
CREATE TRIGGER trg_staff_permissions_scope
BEFORE INSERT OR UPDATE OF permission_key, branch_id ON public.staff_permissions
FOR EACH ROW
EXECUTE FUNCTION private.enforce_staff_permission_scope();

-- ─── 3. Grant/revoke/template RPCs normalize tenant-scope keys ──
CREATE OR REPLACE FUNCTION public.grant_permission(
  p_target_user     UUID,
  p_branch_id       BIGINT,
  p_permission_key  TEXT,
  p_source_template BIGINT     DEFAULT NULL,
  p_valid_from      TIMESTAMPTZ DEFAULT NULL,
  p_valid_until     TIMESTAMPTZ DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_id BIGINT;
  v_target_tenant BIGINT;
  v_grant_id BIGINT;
  v_from TIMESTAMPTZ := COALESCE(p_valid_from, now());
  v_effective_branch_id BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  v_effective_branch_id := private.staff_permission_effective_branch_id(
    p_permission_key,
    p_branch_id
  );

  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'actor_no_profile' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_target_tenant FROM public.profiles WHERE id = p_target_user;
  IF v_target_tenant IS NULL OR v_target_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'target_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'branch_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_effective_branch_id, 'staff:assign_permission') THEN
    RAISE EXCEPTION 'forbidden: missing staff:assign_permission' USING ERRCODE = '42501';
  END IF;

  IF public._auth_v2_is_owner(p_target_user) THEN
    RAISE EXCEPTION 'cannot_manage_owner_permissions' USING ERRCODE = '42501';
  END IF;

  IF p_valid_until IS NOT NULL AND p_valid_until <= v_from THEN
    RAISE EXCEPTION 'invalid_validity_window: valid_until must be after valid_from' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_grant_id
  FROM public.staff_permissions
  WHERE user_id = p_target_user
    AND permission_key = p_permission_key
    AND (
      (v_effective_branch_id IS NULL AND branch_id IS NULL)
      OR branch_id = v_effective_branch_id
    )
  LIMIT 1;

  IF v_grant_id IS NULL THEN
    INSERT INTO public.staff_permissions (
      user_id, tenant_id, branch_id, permission_key, source_template, granted_by,
      valid_from, valid_until
    ) VALUES (
      p_target_user, v_tenant_id, v_effective_branch_id, p_permission_key, p_source_template, auth.uid(),
      v_from, p_valid_until
    )
    RETURNING id INTO v_grant_id;

    INSERT INTO public.permission_audit_log (
      tenant_id, actor_user_id, target_user_id, branch_id,
      permission_key, action, source_template_id, metadata
    ) VALUES (
      v_tenant_id, auth.uid(), p_target_user, v_effective_branch_id,
      p_permission_key, 'grant', p_source_template,
      jsonb_build_object(
        'requested_branch_id', p_branch_id,
        'valid_from', v_from,
        'valid_until', p_valid_until
      )
    );
  ELSE
    UPDATE public.staff_permissions
       SET valid_from = LEAST(valid_from, v_from),
           valid_until = CASE
             WHEN p_valid_until IS NULL THEN NULL
             WHEN valid_until IS NULL THEN valid_until
             ELSE GREATEST(valid_until, p_valid_until)
           END
     WHERE id = v_grant_id;
  END IF;

  RETURN v_grant_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_permission(
  p_target_user UUID,
  p_branch_id BIGINT,
  p_permission_key TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_id BIGINT;
  v_target_tenant BIGINT;
  v_deleted INTEGER;
  v_effective_branch_id BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  v_effective_branch_id := private.staff_permission_effective_branch_id(
    p_permission_key,
    p_branch_id
  );

  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  SELECT tenant_id INTO v_target_tenant FROM public.profiles WHERE id = p_target_user;
  IF v_target_tenant IS NULL OR v_target_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'target_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'branch_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(v_effective_branch_id, 'staff:assign_permission') THEN
    RAISE EXCEPTION 'forbidden: missing staff:assign_permission' USING ERRCODE = '42501';
  END IF;

  IF public._auth_v2_is_owner(p_target_user) THEN
    RAISE EXCEPTION 'cannot_manage_owner_permissions' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.staff_permissions
  WHERE user_id = p_target_user
    AND permission_key = p_permission_key
    AND (
      (v_effective_branch_id IS NULL AND branch_id IS NULL)
      OR branch_id = v_effective_branch_id
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    INSERT INTO public.permission_audit_log (
      tenant_id, actor_user_id, target_user_id, branch_id,
      permission_key, action, metadata
    ) VALUES (
      v_tenant_id, auth.uid(), p_target_user, v_effective_branch_id,
      p_permission_key, 'revoke',
      jsonb_build_object('requested_branch_id', p_branch_id)
    );
  END IF;

  RETURN v_deleted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_template_to_user(
  p_target_user UUID,
  p_branch_id BIGINT,
  p_template_id BIGINT,
  p_valid_from TIMESTAMPTZ DEFAULT NULL,
  p_valid_until TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_id BIGINT;
  v_target_tenant BIGINT;
  v_template RECORD;
  v_perm_key TEXT;
  v_inserted INTEGER := 0;
  v_rows INTEGER;
  v_from TIMESTAMPTZ := COALESCE(p_valid_from, now());
  v_effective_branch_id BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  SELECT tenant_id INTO v_target_tenant FROM public.profiles WHERE id = p_target_user;
  IF v_target_tenant IS NULL OR v_target_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'target_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'branch_not_in_tenant' USING ERRCODE = '42501';
  END IF;

  IF public._auth_v2_is_owner(p_target_user) THEN
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
    v_effective_branch_id := private.staff_permission_effective_branch_id(
      v_perm_key,
      p_branch_id
    );

    IF NOT public.has_permission(v_effective_branch_id, 'staff:assign_permission') THEN
      RAISE EXCEPTION 'forbidden: missing staff:assign_permission' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.staff_permissions (
      user_id, tenant_id, branch_id, permission_key, source_template, granted_by,
      valid_from, valid_until
    ) VALUES (
      p_target_user, v_tenant_id, v_effective_branch_id, v_perm_key, v_template.id, auth.uid(),
      v_from, p_valid_until
    )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows > 0 THEN
      INSERT INTO public.permission_audit_log (
        tenant_id, actor_user_id, target_user_id, branch_id,
        permission_key, action, source_template_id, metadata
      ) VALUES (
        v_tenant_id, auth.uid(), p_target_user, v_effective_branch_id,
        v_perm_key, 'apply_template', v_template.id,
        jsonb_build_object(
          'requested_branch_id', p_branch_id,
          'template_id', v_template.id,
          'valid_from', v_from,
          'valid_until', p_valid_until
        )
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.grant_permission(UUID, BIGINT, TEXT, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_permission(UUID, BIGINT, TEXT)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_template_to_user(UUID, BIGINT, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_permission(UUID, BIGINT, TEXT, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_permission(UUID, BIGINT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_template_to_user(UUID, BIGINT, BIGINT, TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated;

-- Remove the retired 3-arg apply_template signature as a bypass path.
DROP FUNCTION IF EXISTS public.apply_template_to_user(UUID, BIGINT, BIGINT);

-- ─── 4. Sync RPC uses canonical position-code role buckets ──────
CREATE OR REPLACE FUNCTION public.sync_missing_permissions_from_template()
RETURNS TABLE(rows_added integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile RECORD;
  v_template RECORD;
  v_perm_key TEXT;
  v_branch BIGINT;
  v_ab RECORD;
  v_added INTEGER := 0;
  v_rows INTEGER;
  v_effective_branch_id BIGINT;
BEGIN
  FOR v_profile IN
    SELECT p.id AS user_id,
           p.tenant_id,
           p.branch_id,
           p.area_id,
           pos.code AS position_code,
           private.staff_role_from_position_code(pos.code) AS role
      FROM public.profiles p
      JOIN public.positions pos ON pos.id = p.position_id
     WHERE p.is_active = TRUE
       AND p.position_id IS NOT NULL
  LOOP
    SELECT rt.id, rt.permission_keys
      INTO v_template
      FROM public.role_templates rt
     WHERE rt.tenant_id = v_profile.tenant_id
       AND rt.position_code = v_profile.position_code
     LIMIT 1;

    IF v_template.permission_keys IS NULL THEN
      CONTINUE;
    END IF;

    IF v_profile.role = 'area_manager' THEN
      FOR v_ab IN
        SELECT ab.branch_id
          FROM public.area_branches ab
         WHERE ab.tenant_id = v_profile.tenant_id
           AND ab.area_id = v_profile.area_id
      LOOP
        FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
          v_effective_branch_id := private.staff_permission_effective_branch_id(v_perm_key, v_ab.branch_id);
          INSERT INTO public.staff_permissions (user_id, tenant_id, branch_id, permission_key, source_template)
          VALUES (v_profile.user_id, v_profile.tenant_id, v_effective_branch_id, v_perm_key, v_template.id)
          ON CONFLICT DO NOTHING;
          GET DIAGNOSTICS v_rows = ROW_COUNT;
          v_added := v_added + v_rows;
        END LOOP;
      END LOOP;
    ELSIF v_profile.role IN ('owner', 'super_manager', 'office') THEN
      FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
        v_effective_branch_id := private.staff_permission_effective_branch_id(v_perm_key, NULL);
        INSERT INTO public.staff_permissions (user_id, tenant_id, branch_id, permission_key, source_template)
        VALUES (v_profile.user_id, v_profile.tenant_id, v_effective_branch_id, v_perm_key, v_template.id)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_added := v_added + v_rows;
      END LOOP;
    ELSE
      v_branch := v_profile.branch_id;
      IF v_branch IS NULL THEN
        CONTINUE;
      END IF;

      FOREACH v_perm_key IN ARRAY v_template.permission_keys LOOP
        v_effective_branch_id := private.staff_permission_effective_branch_id(v_perm_key, v_branch);
        INSERT INTO public.staff_permissions (user_id, tenant_id, branch_id, permission_key, source_template)
        VALUES (v_profile.user_id, v_profile.tenant_id, v_effective_branch_id, v_perm_key, v_template.id)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_added := v_added + v_rows;
      END LOOP;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_added;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.sync_missing_permissions_from_template()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_missing_permissions_from_template()
  TO service_role;

-- ─── 5. Catalog RLS: read either-scope, write tenant-only ──────
COMMENT ON TABLE public.suppliers IS
  'Tenant-level supplier catalog. Do not add branch_id; branch/source boundaries live on procurement transactions.';
COMMENT ON TABLE public.supplier_price_list IS
  'Tenant-level supplier price catalog. Read may be branch/either permission; writes require tenant-level price_list_write.';
COMMENT ON TABLE public.supplier_items IS
  'Tenant-level supplier SKU mapping catalog. Read may be branch/either permission; writes require tenant-level price_list_write.';

DROP POLICY IF EXISTS "suppliers_select" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_write" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_insert" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_update" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_delete" ON public.suppliers;

CREATE POLICY "suppliers_select" ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('procurement:read')
      OR public.has_permission(NULL, 'procurement:supplier_manage')
    )
  );

CREATE POLICY "suppliers_insert" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'procurement:supplier_manage')
  );

CREATE POLICY "suppliers_update" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'procurement:supplier_manage')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'procurement:supplier_manage')
  );

CREATE POLICY "suppliers_delete" ON public.suppliers
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'procurement:supplier_manage')
  );

DROP POLICY IF EXISTS "price_list_read" ON public.supplier_price_list;
DROP POLICY IF EXISTS "price_list_write" ON public.supplier_price_list;
DROP POLICY IF EXISTS "price_list_insert" ON public.supplier_price_list;
DROP POLICY IF EXISTS "price_list_update" ON public.supplier_price_list;
DROP POLICY IF EXISTS "price_list_delete" ON public.supplier_price_list;

CREATE POLICY "price_list_read" ON public.supplier_price_list
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('procurement:price_list_read')
      OR public.has_permission(NULL, 'procurement:price_list_write')
    )
  );

CREATE POLICY "price_list_insert" ON public.supplier_price_list
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'procurement:price_list_write')
  );

CREATE POLICY "price_list_update" ON public.supplier_price_list
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'procurement:price_list_write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'procurement:price_list_write')
  );

CREATE POLICY "price_list_delete" ON public.supplier_price_list
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'procurement:price_list_write')
  );

DROP POLICY IF EXISTS "supplier_items_read" ON public.supplier_items;
DROP POLICY IF EXISTS "supplier_items_write" ON public.supplier_items;
DROP POLICY IF EXISTS "supplier_items_insert" ON public.supplier_items;
DROP POLICY IF EXISTS "supplier_items_update" ON public.supplier_items;
DROP POLICY IF EXISTS "supplier_items_delete" ON public.supplier_items;

CREATE POLICY "supplier_items_read" ON public.supplier_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission_any('procurement:price_list_read')
      OR public.has_permission(NULL, 'procurement:price_list_write')
    )
  );

CREATE POLICY "supplier_items_insert" ON public.supplier_items
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'procurement:price_list_write')
  );

CREATE POLICY "supplier_items_update" ON public.supplier_items
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'procurement:price_list_write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'procurement:price_list_write')
  );

CREATE POLICY "supplier_items_delete" ON public.supplier_items
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(NULL, 'procurement:price_list_write')
  );
