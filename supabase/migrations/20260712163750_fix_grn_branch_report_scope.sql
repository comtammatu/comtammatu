SET search_path = '';

DROP POLICY IF EXISTS grn_select ON public.goods_received_notes;

CREATE POLICY grn_select ON public.goods_received_notes
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.has_permission(branch_id, 'procurement:read'::text)
      OR public.has_permission(branch_id, 'reports:view_branch'::text)
      OR public.has_permission(NULL::bigint, 'reports:view_tenant'::text)
    )
  );

DROP POLICY IF EXISTS grn_items_select ON public.grn_items;

CREATE POLICY grn_items_select ON public.grn_items
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND EXISTS (
      SELECT 1
      FROM public.goods_received_notes g
      WHERE g.id = grn_items.grn_id
        AND g.tenant_id = grn_items.tenant_id
        AND (
          public.has_permission(g.branch_id, 'procurement:read'::text)
          OR public.has_permission(g.branch_id, 'reports:view_branch'::text)
          OR public.has_permission(NULL::bigint, 'reports:view_tenant'::text)
        )
    )
  );
