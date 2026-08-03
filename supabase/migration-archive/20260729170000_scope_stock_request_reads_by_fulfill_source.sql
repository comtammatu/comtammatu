CREATE OR REPLACE FUNCTION public.stock_request_actor_can_read(
  p_request_id bigint,
  p_item_fulfill_site_kind text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_branch_id bigint;
  v_actor_fulfill_kind text;
BEGIN
  IF auth.uid() IS NULL OR public.auth_tenant_id() IS NULL THEN
    RETURN false;
  END IF;

  SELECT req.branch_id
  INTO v_branch_id
  FROM public.stock_requests AS req
  WHERE req.id = p_request_id
    AND req.tenant_id = public.auth_tenant_id();

  IF v_branch_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.auth_is_owner(auth.uid())
     OR public.has_permission(v_branch_id, 'inventory:read')
     OR public.has_permission(v_branch_id, 'inventory:request_create')
  THEN
    RETURN true;
  END IF;

  IF NOT public.has_permission_any('inventory:request_fulfill') THEN
    RETURN false;
  END IF;

  v_actor_fulfill_kind := CASE public.auth_role()
    WHEN 'central_supply_ops' THEN 'central_supply'
    WHEN 'central_kitchen_lead' THEN 'central_kitchen'
    ELSE NULL
  END;

  IF v_actor_fulfill_kind IS NULL THEN
    RETURN false;
  END IF;

  IF p_item_fulfill_site_kind IS NOT NULL THEN
    RETURN p_item_fulfill_site_kind = v_actor_fulfill_kind;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.stock_request_items AS item
    WHERE item.request_id = p_request_id
      AND item.tenant_id = public.auth_tenant_id()
      AND item.fulfill_site_kind = v_actor_fulfill_kind
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stock_request_actor_can_read(bigint, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stock_request_actor_can_read(bigint, text)
  TO authenticated, service_role;

DROP POLICY IF EXISTS stock_requests_select ON public.stock_requests;
CREATE POLICY stock_requests_select
  ON public.stock_requests
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.stock_request_actor_can_read(id, NULL)
  );

DROP POLICY IF EXISTS stock_request_items_select
  ON public.stock_request_items;
CREATE POLICY stock_request_items_select
  ON public.stock_request_items
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.stock_request_actor_can_read(
      request_id,
      fulfill_site_kind
    )
  );

DROP FUNCTION public.stock_request_actor_can_read(bigint);
