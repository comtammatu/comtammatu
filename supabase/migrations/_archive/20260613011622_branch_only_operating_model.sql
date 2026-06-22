BEGIN;

CREATE TEMP TABLE _branch_kind_cleanup_ids ON COMMIT DROP AS
SELECT id
FROM public.branches
WHERE branch_kind IS DISTINCT FROM 'branch';

CREATE TEMP TABLE _branch_kind_cleanup_user_ids ON COMMIT DROP AS
SELECT p.id
FROM public.profiles p
JOIN public.positions po
  ON po.id = p.position_id
 AND po.tenant_id = p.tenant_id
WHERE p.branch_id IN (SELECT id FROM _branch_kind_cleanup_ids)
  AND private.staff_role_from_position_code(po.code) IN (
    'cashier',
    'waiter',
    'chef',
    'branch_manager',
    'warehouse_manager',
    'production_manager'
  );

UPDATE public.profiles p
SET branch_id = NULL
WHERE p.branch_id IN (SELECT id FROM _branch_kind_cleanup_ids)
  AND p.id NOT IN (SELECT id FROM _branch_kind_cleanup_user_ids);

UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb) - 'branch_id'
WHERE COALESCE(u.raw_app_meta_data, '{}'::jsonb) ? 'branch_id'
  AND u.raw_app_meta_data ->> 'branch_id' IN (
    SELECT id::text FROM _branch_kind_cleanup_ids
  );

DELETE FROM auth.users u
WHERE u.id IN (SELECT id FROM _branch_kind_cleanup_user_ids);

DELETE FROM public.branches b
WHERE b.id IN (SELECT id FROM _branch_kind_cleanup_ids);

UPDATE public.branches
SET branch_kind = 'branch',
    updated_at = now()
WHERE branch_kind IS DISTINCT FROM 'branch';

ALTER TABLE public.branches
  DROP CONSTRAINT IF EXISTS branches_branch_kind_check;

ALTER TABLE public.branches
  ADD CONSTRAINT branches_branch_kind_check CHECK (branch_kind = 'branch');

CREATE OR REPLACE FUNCTION public.set_branch_kind(
  p_branch_id bigint,
  p_kind text DEFAULT 'branch'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_tenant bigint;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.tenant_id
  INTO v_tenant
  FROM public.profiles p
  WHERE p.id = v_actor_id
    AND COALESCE(p.is_active, true) = true;

  IF NOT FOUND OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_kind <> 'branch' THEN
    RAISE EXCEPTION 'invalid branch_kind' USING ERRCODE = '22023';
  END IF;

  UPDATE public.branches
  SET branch_kind = 'branch',
      updated_at = now()
  WHERE id = p_branch_id
    AND tenant_id = v_tenant
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_branch_kind(p_branch_id bigint, p_kind text)
IS 'Sets a branch record to the branch-only operating model.';

CREATE OR REPLACE FUNCTION public.enforce_po_grn_branch_is_procurement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = NEW.branch_id
      AND b.tenant_id = NEW.tenant_id
      AND b.branch_kind = 'branch'
      AND b.is_active = true
  ) THEN
    RAISE EXCEPTION 'branch must be active branch' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_stock_transfer_direction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_from_kind text;
  v_to_kind text;
BEGIN
  IF NEW.from_branch_id = NEW.to_branch_id THEN
    RETURN NEW;
  END IF;

  SELECT b.branch_kind
  INTO v_from_kind
  FROM public.branches b
  WHERE b.id = NEW.from_branch_id
    AND b.tenant_id = NEW.tenant_id;

  SELECT b.branch_kind
  INTO v_to_kind
  FROM public.branches b
  WHERE b.id = NEW.to_branch_id
    AND b.tenant_id = NEW.tenant_id;

  IF v_from_kind IS NULL OR v_to_kind IS NULL THEN
    RAISE EXCEPTION 'stock_transfers: invalid branch reference' USING ERRCODE = '23514';
  END IF;

  IF v_from_kind = 'branch' AND v_to_kind = 'branch' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'stock_transfers: invalid direction % -> %', v_from_kind, v_to_kind
    USING ERRCODE = '23514';
END;
$$;

DO $$
DECLARE
  v_signature text;
  v_sql text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.admin_update_profile(uuid,text,text,text,bigint,boolean)',
    'public.confirm_goods_receipt_note(bigint)',
    'public.create_grn_from_po(bigint)',
    'public.confirm_stock_issue(bigint)',
    'public.create_production_order(bigint,text,text,jsonb)',
    'public.confirm_production_order(bigint)'
  ]
  LOOP
    SELECT pg_get_functiondef(v_signature::regprocedure)
    INTO v_sql;

    v_sql := regexp_replace(
      v_sql,
      'v_final_role IN \(''cashier'',[[:space:]]+''waiter'',[[:space:]]+''chef'',[[:space:]]+''branch_manager''\)[[:space:]]+AND v_branch_kind <> ''branch''',
      'v_final_role IN (''cashier'', ''waiter'', ''chef'', ''branch_manager'', ''warehouse_manager'', ''production_manager'') AND v_branch_kind <> ''branch''',
      'g'
    );
    v_sql := regexp_replace(
      v_sql,
      'IF v_final_role = ''warehouse_manager'' AND v_branch_kind <> ''[^'']+'' THEN[[:space:]]+RAISE EXCEPTION ''[^'']+'' USING ERRCODE = ''P0001'';[[:space:]]+END IF;[[:space:]]+',
      '',
      'g'
    );
    v_sql := regexp_replace(
      v_sql,
      'IF v_final_role = ''production_manager'' AND v_branch_kind <> ''[^'']+'' THEN[[:space:]]+RAISE EXCEPTION ''[^'']+'' USING ERRCODE = ''P0001'';[[:space:]]+END IF;[[:space:]]+',
      '',
      'g'
    );
    v_sql := regexp_replace(
      v_sql,
      'b\.branch_kind IN \([^)]+\)',
      'b.branch_kind = ''branch''',
      'g'
    );
    v_sql := regexp_replace(
      v_sql,
      'v_branch\.branch_kind NOT IN \([^)]+\)',
      'v_branch.branch_kind <> ''branch''',
      'g'
    );
    v_sql := regexp_replace(
      v_sql,
      'v_branch\.branch_kind <> ''[^'']+''',
      'v_branch.branch_kind <> ''branch''',
      'g'
    );
    v_sql := regexp_replace(
      v_sql,
      'v_order\.branch_kind <> ''[^'']+''',
      'v_order.branch_kind <> ''branch''',
      'g'
    );
    v_sql := regexp_replace(
      v_sql,
      'branch_must_be_[a-z_]+',
      'branch_must_be_operational',
      'g'
    );
    v_sql := regexp_replace(
      v_sql,
      'WHEN v_issue\.issue_type = ''consumption''[[:space:]]+AND v_branch_kind IN \([^)]+\)[[:space:]]+THEN ''storage_loss''[[:space:]]+',
      '',
      'g'
    );

    EXECUTE v_sql;
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS production_orders_write ON public.production_orders;
CREATE POLICY production_orders_write
ON public.production_orders
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.is_inventory_production_operator()
  AND (
    public.has_permission(branch_id, 'inventory:production_create')
    OR public.has_permission(branch_id, 'inventory:production_confirm')
  )
  AND EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = production_orders.branch_id
      AND b.tenant_id = production_orders.tenant_id
      AND b.branch_kind = 'branch'
  )
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.is_inventory_production_operator()
  AND (
    public.has_permission(branch_id, 'inventory:production_create')
    OR public.has_permission(branch_id, 'inventory:production_confirm')
  )
  AND EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = production_orders.branch_id
      AND b.tenant_id = production_orders.tenant_id
      AND b.branch_kind = 'branch'
  )
);

DROP POLICY IF EXISTS production_order_items_write ON public.production_order_items;
CREATE POLICY production_order_items_write
ON public.production_order_items
TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.is_inventory_production_operator()
  AND EXISTS (
    SELECT 1
    FROM public.production_orders po
    JOIN public.branches b
      ON b.id = po.branch_id
    WHERE po.id = production_order_items.production_order_id
      AND po.tenant_id = production_order_items.tenant_id
      AND po.tenant_id = public.auth_tenant_id()
      AND b.tenant_id = po.tenant_id
      AND b.branch_kind = 'branch'
      AND (
        public.has_permission(po.branch_id, 'inventory:production_create')
        OR public.has_permission(po.branch_id, 'inventory:production_confirm')
      )
  )
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.is_inventory_production_operator()
  AND EXISTS (
    SELECT 1
    FROM public.production_orders po
    JOIN public.branches b
      ON b.id = po.branch_id
    WHERE po.id = production_order_items.production_order_id
      AND po.tenant_id = production_order_items.tenant_id
      AND po.tenant_id = public.auth_tenant_id()
      AND b.tenant_id = po.tenant_id
      AND b.branch_kind = 'branch'
      AND (
        public.has_permission(po.branch_id, 'inventory:production_create')
        OR public.has_permission(po.branch_id, 'inventory:production_confirm')
      )
  )
);

COMMENT ON COLUMN public.stock_issues.issue_type
IS 'Type of internal stock issue voucher: consumption, writeoff, other.';

COMMENT ON COLUMN public.stock_movements.movement_subtype
IS 'Discriminator for stock_issue-originated movements: storage_loss | sale_consumption | writeoff | other. NULL for non-issue movements.';

COMMENT ON FUNCTION public.confirm_stock_issue(p_issue_id bigint)
IS 'Atomically confirms a stock issue with strict WAC lookup and movement subtype derivation.';

COMMIT;
