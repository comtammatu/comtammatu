-- Allow GRN line unit_cost sync from any draft PO linked via source_grn_id
-- (multi-supplier split), not only goods_received_notes.po_id.

CREATE OR REPLACE FUNCTION private.enforce_linked_grn_line_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_grn_id bigint;
  v_grn_ids bigint[];
  v_old_tenant_id bigint;
  v_new_tenant_id bigint;
  v_linked boolean := FALSE;
  v_grn_status text;
  v_trusted_rpc boolean;
  v_recovery_insert boolean :=
    COALESCE(
      pg_catalog.current_setting(
        'comtammatu.grn_recovery_insert',
        TRUE
      ),
      'false'
    ) = 'true';
BEGIN
  SELECT CURRENT_USER = pg_catalog.pg_get_userbyid(relation.relowner)
  INTO v_trusted_rpc
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = 'public.grn_items'::pg_catalog.regclass;

  IF TG_OP = 'INSERT' THEN
    v_grn_ids := ARRAY[NEW.grn_id];
    v_new_tenant_id := NEW.tenant_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_grn_ids := ARRAY[OLD.grn_id];
    v_old_tenant_id := OLD.tenant_id;
  ELSE
    v_grn_ids := ARRAY[OLD.grn_id, NEW.grn_id];
    v_old_tenant_id := OLD.tenant_id;
    v_new_tenant_id := NEW.tenant_id;
  END IF;

  FOR v_grn_id IN
    SELECT DISTINCT candidate.grn_id
    FROM unnest(v_grn_ids) AS candidate(grn_id)
    WHERE candidate.grn_id IS NOT NULL
    ORDER BY candidate.grn_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'retrospective-grn:' || v_grn_id::text,
        0
      )
    );
  END LOOP;

  SELECT EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.id = ANY (v_grn_ids)
      AND (
        grn.po_id IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.purchase_orders AS po
          WHERE po.source_grn_id = grn.id
            AND po.tenant_id = grn.tenant_id
        )
      )
      AND (
        grn.tenant_id = v_old_tenant_id
        OR grn.tenant_id = v_new_tenant_id
      )
  )
  INTO v_linked;

  IF NOT v_linked THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     AND v_trusted_rpc IS TRUE
     AND auth.role() = 'service_role'
     AND v_recovery_insert THEN
    RETURN NEW;
  END IF;

  -- Price sync from approve_purchase_order: match draft PO by legacy po_id
  -- or source_grn_id, scoped to the line's supplier when set.
  IF TG_OP = 'UPDATE'
     AND v_trusted_rpc IS TRUE
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.grn_id IS NOT DISTINCT FROM OLD.grn_id
     AND NEW.ingredient_id IS NOT DISTINCT FROM OLD.ingredient_id
     AND NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id
     AND NEW.received_quantity IS NOT DISTINCT FROM OLD.received_quantity
     AND NEW.rejected_quantity IS NOT DISTINCT FROM OLD.rejected_quantity
     AND NEW.rejection_reason IS NOT DISTINCT FROM OLD.rejection_reason
     AND NEW.rejected_photo_url IS NOT DISTINCT FROM OLD.rejected_photo_url
     AND NEW.entry_unit_id IS NOT DISTINCT FROM OLD.entry_unit_id THEN
    IF EXISTS (
      SELECT 1
      FROM public.goods_received_notes AS grn
      JOIN public.purchase_orders AS purchase_order
        ON purchase_order.tenant_id = grn.tenant_id
       AND (
         purchase_order.id = grn.po_id
         OR purchase_order.source_grn_id = grn.id
       )
      JOIN public.purchase_order_items AS po_item
        ON po_item.po_id = purchase_order.id
       AND po_item.tenant_id = purchase_order.tenant_id
       AND po_item.ingredient_id = NEW.ingredient_id
       AND po_item.entry_unit_id IS NOT DISTINCT FROM
         NEW.entry_unit_id
      WHERE grn.id = NEW.grn_id
        AND grn.tenant_id = NEW.tenant_id
        AND purchase_order.status = 'draft'
        AND (
          NEW.supplier_id IS NULL
          OR purchase_order.supplier_id = NEW.supplier_id
        )
        AND po_item.unit_price_est > 0
        AND NEW.unit_cost = po_item.unit_price_est
        AND NEW.total_cost = pg_catalog.round(
          (
            NEW.received_quantity - NEW.rejected_quantity
          ) * po_item.unit_price_est,
          2
        )
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND v_trusted_rpc IS TRUE
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.grn_id IS NOT DISTINCT FROM OLD.grn_id
     AND NEW.ingredient_id IS NOT DISTINCT FROM OLD.ingredient_id
     AND NEW.unit_cost IS NOT DISTINCT FROM OLD.unit_cost
     AND NEW.entry_unit_id IS NOT DISTINCT FROM OLD.entry_unit_id
     AND NEW.received_quantity >= 0
     AND NEW.received_quantity NOT IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     AND NEW.rejected_quantity >= 0
     AND NEW.rejected_quantity NOT IN (
       'NaN'::numeric,
       'Infinity'::numeric,
       '-Infinity'::numeric
     )
     AND NEW.rejected_quantity <= NEW.received_quantity
     AND (
       NEW.rejected_quantity = 0
       OR (
         NULLIF(pg_catalog.btrim(NEW.rejection_reason), '') IS NOT NULL
         AND private.grn_rejection_photo_exists(
           NEW.tenant_id,
           NEW.grn_id,
           NEW.id,
           NEW.rejected_photo_url
         )
       )
     )
     AND NEW.total_cost = pg_catalog.round(
       (
         NEW.received_quantity - NEW.rejected_quantity
       ) * NEW.unit_cost,
       2
     ) THEN
    SELECT grn.status
    INTO v_grn_status
    FROM public.goods_received_notes AS grn
    WHERE grn.id = NEW.grn_id
      AND grn.tenant_id = NEW.tenant_id
      AND (
        grn.po_id IS NOT NULL
        OR EXISTS (
          SELECT 1
          FROM public.purchase_orders AS po
          WHERE po.source_grn_id = grn.id
            AND po.tenant_id = grn.tenant_id
        )
      );

    IF v_grn_status = 'confirmed' THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'linked_grn_lines_immutable'
    USING ERRCODE = 'check_violation';
END;
$function$;

COMMENT ON FUNCTION private.enforce_linked_grn_line_immutability() IS
  'Linked GRN line immutability. Allows approve price sync from any draft PO linked via po_id or source_grn_id (multi-supplier).';
