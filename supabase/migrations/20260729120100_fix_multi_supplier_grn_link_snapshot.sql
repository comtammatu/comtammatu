-- Fix retrospective GRN↔PO link trigger for multi-supplier drafts (D092).
-- When goods_received_notes.supplier_id is NULL, the legacy po_id pointer is the
-- first split PO only; snapshot compare must use lines for that PO's supplier.

CREATE OR REPLACE FUNCTION private.enforce_retrospective_grn_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_po record;
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
  WHERE relation.oid = 'public.goods_received_notes'::pg_catalog.regclass;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'grn_must_start_as_draft'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.po_id IS NOT NULL
       AND (
         v_trusted_rpc IS DISTINCT FROM TRUE
         OR auth.role() IS DISTINCT FROM 'service_role'
         OR NOT v_recovery_insert
       ) THEN
      RAISE EXCEPTION 'linked_grn_must_start_as_unlinked_draft'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'retrospective-grn:' || OLD.id::text,
      0
    )
  );

  IF TG_OP = 'DELETE' THEN
    IF OLD.po_id IS NOT NULL THEN
      RAISE EXCEPTION 'linked_grn_immutable'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.po_id IS NOT NULL THEN
    IF v_trusted_rpc IS TRUE
       AND NEW.id IS NOT DISTINCT FROM OLD.id
       AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
       AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
       AND NEW.po_id IS NOT DISTINCT FROM OLD.po_id
       AND NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id
       AND NEW.grn_number IS NOT DISTINCT FROM OLD.grn_number
       AND NEW.received_date IS NOT DISTINCT FROM OLD.received_date
       AND NEW.received_by IS NOT DISTINCT FROM OLD.received_by
       AND NEW.notes IS NOT DISTINCT FROM OLD.notes
       AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
       AND NEW.location_id IS NOT DISTINCT FROM OLD.location_id
       AND OLD.status = 'draft'
       AND NEW.status = 'confirmed' THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'linked_grn_immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.po_id IS NULL THEN
    IF OLD.status IS DISTINCT FROM 'confirmed'
       AND NEW.status = 'confirmed' THEN
      RAISE EXCEPTION 'grn_confirm_requires_approved_po'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF v_trusted_rpc IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'grn_po_link_requires_rpc'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'retrospective-po:' || NEW.po_id::text,
      0
    )
  );

  SELECT purchase_order.*
  INTO v_po
  FROM public.purchase_orders AS purchase_order
  WHERE purchase_order.id = NEW.po_id;

  IF NOT FOUND
     OR v_po.tenant_id <> NEW.tenant_id
     OR v_po.branch_id <> NEW.branch_id
     OR (
       NEW.supplier_id IS NOT NULL
       AND v_po.supplier_id IS DISTINCT FROM NEW.supplier_id
     )
     OR v_po.status <> 'draft'
     OR NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'grn_po_link_invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_locations AS location
    WHERE location.id = NEW.location_id
      AND location.tenant_id = NEW.tenant_id
      AND location.branch_id = NEW.branch_id
      AND location.location_kind = 'warehouse'
      AND location.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'grn_receiving_warehouse_required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT private.grn_physical_qc_is_valid(NEW.tenant_id, NEW.id)
     OR NOT EXISTS (
       SELECT 1
       FROM public.grn_items AS item
       WHERE item.tenant_id = NEW.tenant_id
         AND item.grn_id = NEW.id
         AND item.received_quantity - item.rejected_quantity > 0
     ) THEN
    RAISE EXCEPTION 'grn_physical_qc_incomplete'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    WITH grn_snapshot AS (
      SELECT
        item.ingredient_id,
        item.entry_unit_id,
        sum(
          item.received_quantity - item.rejected_quantity
        )::numeric(15,3) AS quantity
      FROM public.grn_items AS item
      WHERE item.tenant_id = NEW.tenant_id
        AND item.grn_id = NEW.id
        AND item.received_quantity - item.rejected_quantity > 0
        AND (
          -- Single-supplier header: all receivable lines.
          -- Multi-supplier (NULL header): lines for the linked first PO only.
          NEW.supplier_id IS NOT NULL
          OR item.supplier_id = v_po.supplier_id
        )
      GROUP BY item.ingredient_id, item.entry_unit_id
    ),
    po_snapshot AS (
      SELECT
        item.ingredient_id,
        item.entry_unit_id,
        sum(item.quantity)::numeric(15,3) AS quantity
      FROM public.purchase_order_items AS item
      WHERE item.tenant_id = NEW.tenant_id
        AND item.po_id = NEW.po_id
      GROUP BY item.ingredient_id, item.entry_unit_id
    )
    SELECT 1
    FROM grn_snapshot
    FULL JOIN po_snapshot
      ON po_snapshot.ingredient_id = grn_snapshot.ingredient_id
     AND po_snapshot.entry_unit_id IS NOT DISTINCT FROM
       grn_snapshot.entry_unit_id
    WHERE grn_snapshot.ingredient_id IS NULL
       OR po_snapshot.ingredient_id IS NULL
       OR grn_snapshot.quantity <> po_snapshot.quantity
  ) THEN
    RAISE EXCEPTION 'grn_po_snapshot_mismatch'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION private.enforce_retrospective_grn_immutability() IS
  'Retrospective GRN↔PO link guard. Multi-supplier drafts (NULL header supplier_id) snapshot only the lines for the linked first PO supplier.';
