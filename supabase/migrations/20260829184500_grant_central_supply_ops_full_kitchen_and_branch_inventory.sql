-- Grant full warehouse, kitchen, and branch inventory/procurement authority to central_supply_ops (Thức)
-- 1. Ensure inventory, procurement, production, and supplier return keys are delegable
-- 2. Grant all inventory, production, request, transfer, stocktake, waste, procurement, and supplier return keys in role_templates
-- 3. Extend is_inventory_production_operator() and production_recipes_delete policy to include central_supply_ops
-- 4. Extend has_permission() so central_supply_ops has cross-branch authority for inventory and procurement
-- 5. Sync permissions via sync_missing_permissions_from_template()

UPDATE public.permission_keys
SET is_delegable_to_staff = true
WHERE key = ANY (ARRAY[
  'inventory:production_create',
  'inventory:production_confirm',
  'inventory:request_create',
  'inventory:request_submit',
  'inventory:request_cancel',
  'inventory:request_fulfill',
  'inventory:adjust_approve',
  'inventory:stocktake_unblind',
  'supplier_return:create',
  'supplier_return:confirm',
  'supplier_return:read',
  'procurement:grn_amend'
]::text[]);

UPDATE public.role_templates
SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY[
        'inventory:adjust_approve',
        'inventory:catalog_write',
        'inventory:count_approve',
        'inventory:count_assign',
        'inventory:production_confirm',
        'inventory:production_create',
        'inventory:read',
        'inventory:request_cancel',
        'inventory:request_create',
        'inventory:request_fulfill',
        'inventory:request_submit',
        'inventory:stocktake_complete',
        'inventory:stocktake_create',
        'inventory:stocktake_recount',
        'inventory:stocktake_unblind',
        'inventory:transfer_create',
        'inventory:transfer_receive',
        'inventory:transfer_ship',
        'inventory:units_master',
        'inventory:waste_approve',
        'inventory:write',
        'inventory:writeoff',
        'procurement:grn_amend',
        'procurement:grn_confirm',
        'procurement:grn_create',
        'procurement:invoice_create',
        'procurement:invoice_match',
        'procurement:po_approve',
        'procurement:po_create',
        'procurement:price_list_read',
        'procurement:price_list_write',
        'procurement:read',
        'procurement:request_manage',
        'procurement:supplier_manage',
        'supplier_return:confirm',
        'supplier_return:create',
        'supplier_return:read'
      ]::text[])
    ),
    updated_at = now()
WHERE position_code = 'central_supply_ops';

CREATE OR REPLACE FUNCTION public.is_inventory_production_operator() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.auth_is_owner(auth.uid())
    OR public.auth_role() = ANY (ARRAY['central_kitchen_lead'::text, 'central_supply_ops'::text]);
$$;

DROP POLICY IF EXISTS production_recipes_delete ON public.production_recipes;
CREATE POLICY production_recipes_delete ON public.production_recipes FOR DELETE TO authenticated
USING (
  (tenant_id = public.auth_tenant_id())
  AND (public.auth_role() = ANY (ARRAY['owner'::text, 'central_kitchen_lead'::text, 'central_supply_ops'::text]))
  AND (
    public.has_permission_any('inventory:production_create'::text)
    OR public.has_permission_any('inventory:production_confirm'::text)
    OR public.has_permission_any('menu:write'::text)
  )
);

CREATE OR REPLACE FUNCTION public.has_permission(p_branch_id bigint, p_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT private.has_role_capability(
      auth.uid(),
      public.auth_tenant_id(),
      p_branch_id,
      p_key
    )
    OR EXISTS (
      SELECT 1
      FROM public.staff_permissions sp
      JOIN public.profiles pr
        ON pr.id = sp.user_id
       AND pr.tenant_id = sp.tenant_id
      JOIN public.positions po
        ON po.id = pr.position_id
       AND po.tenant_id = pr.tenant_id
      JOIN public.permission_keys pk ON pk.key = sp.permission_key
      WHERE sp.user_id = auth.uid()
        AND pr.tenant_id = public.auth_tenant_id()
        AND pr.is_active
        AND po.is_active
        AND sp.permission_key = p_key
        AND pk.is_delegable_to_staff
        AND sp.valid_from <= now()
        AND (sp.valid_until IS NULL OR sp.valid_until > now())
        AND (
          CASE pk.scope
            WHEN 'tenant' THEN sp.branch_id IS NULL
            WHEN 'branch' THEN
              (
                p_branch_id IS NOT NULL
                AND sp.branch_id = p_branch_id
                AND pr.branch_id = p_branch_id
              )
              OR (
                po.code = 'central_supply_ops'
                AND pk.module IN ('inventory', 'inventory_procurement', 'procurement', 'supplier_return')
              )
            ELSE
              sp.branch_id IS NULL
              OR (
                p_branch_id IS NOT NULL
                AND sp.branch_id = p_branch_id
                AND pr.branch_id = p_branch_id
              )
              OR (
                po.code = 'central_supply_ops'
                AND pk.module IN ('inventory', 'inventory_procurement', 'procurement', 'supplier_return')
              )
          END
        )
        AND (
          p_key <> ALL (ARRAY[
            'hr:approve_checkout',
            'hr:approve_leave_request'
          ]::text[])
          OR (
            private.staff_role_from_position_code(po.code) = 'branch_manager'
            AND p_branch_id IS NOT NULL
            AND pr.branch_id = p_branch_id
            AND sp.branch_id = p_branch_id
          )
        )
    );
$$;

SELECT public.sync_missing_permissions_from_template();
