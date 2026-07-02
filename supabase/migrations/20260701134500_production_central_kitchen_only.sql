CREATE OR REPLACE FUNCTION public.ensure_production_order_central_kitchen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = NEW.branch_id
      AND b.tenant_id = NEW.tenant_id
      AND b.branch_kind = 'central_kitchen'
      AND b.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'production_order_requires_central_kitchen'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_production_order_central_kitchen()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_production_order_central_kitchen()
  TO service_role;

DROP TRIGGER IF EXISTS trg_production_orders_central_kitchen_only
  ON public.production_orders;

CREATE TRIGGER trg_production_orders_central_kitchen_only
  BEFORE INSERT OR UPDATE ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_production_order_central_kitchen();

DROP POLICY IF EXISTS production_orders_write ON public.production_orders;

CREATE POLICY production_orders_write
ON public.production_orders
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.is_inventory_production_operator()
  AND (
    public.has_permission(branch_id, 'inventory:production_create'::text)
    OR public.has_permission(branch_id, 'inventory:production_confirm'::text)
  )
  AND EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = production_orders.branch_id
      AND b.tenant_id = production_orders.tenant_id
      AND b.branch_kind = 'central_kitchen'
      AND b.is_active = TRUE
  )
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.is_inventory_production_operator()
  AND (
    public.has_permission(branch_id, 'inventory:production_create'::text)
    OR public.has_permission(branch_id, 'inventory:production_confirm'::text)
  )
  AND EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = production_orders.branch_id
      AND b.tenant_id = production_orders.tenant_id
      AND b.branch_kind = 'central_kitchen'
      AND b.is_active = TRUE
  )
);

DROP POLICY IF EXISTS production_order_items_write
  ON public.production_order_items;

CREATE POLICY production_order_items_write
ON public.production_order_items
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.is_inventory_production_operator()
  AND EXISTS (
    SELECT 1
    FROM public.production_orders po
    JOIN public.branches b ON b.id = po.branch_id
    WHERE po.id = production_order_items.production_order_id
      AND po.tenant_id = production_order_items.tenant_id
      AND po.tenant_id = public.auth_tenant_id()
      AND b.tenant_id = po.tenant_id
      AND b.branch_kind = 'central_kitchen'
      AND b.is_active = TRUE
      AND (
        public.has_permission(po.branch_id, 'inventory:production_create'::text)
        OR public.has_permission(po.branch_id, 'inventory:production_confirm'::text)
      )
  )
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.is_inventory_production_operator()
  AND EXISTS (
    SELECT 1
    FROM public.production_orders po
    JOIN public.branches b ON b.id = po.branch_id
    WHERE po.id = production_order_items.production_order_id
      AND po.tenant_id = production_order_items.tenant_id
      AND po.tenant_id = public.auth_tenant_id()
      AND b.tenant_id = po.tenant_id
      AND b.branch_kind = 'central_kitchen'
      AND b.is_active = TRUE
      AND (
        public.has_permission(po.branch_id, 'inventory:production_create'::text)
        OR public.has_permission(po.branch_id, 'inventory:production_confirm'::text)
      )
  )
);
