-- Allow confirm_goods_receipt_note to amend ordered quantity when accepted
-- receipt quantity exceeds the remaining PO quantity. Direct mutations remain
-- blocked by the linked-GRN immutability boundary.
CREATE OR REPLACE FUNCTION private.enforce_retrospective_purchase_order_line_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_po_id bigint;
  v_po_ids bigint[];
  v_old_tenant_id bigint;
  v_new_tenant_id bigint;
  v_po_status text;
  v_linked boolean := FALSE;
  v_trusted_rpc boolean;
  v_confirming boolean := pg_catalog.coalesce(
    pg_catalog.current_setting('comtammatu.grn_confirm', TRUE),
    'false'
  ) = 'true';
BEGIN
  IF TG_OP = 'UPDATE'
     AND (
       pg_catalog.to_jsonb(NEW) - 'entry_to_base_factor' - 'entry_unit_code'
     ) IS NOT DISTINCT FROM (
       pg_catalog.to_jsonb(OLD) - 'entry_to_base_factor' - 'entry_unit_code'
     ) THEN
    RETURN NEW;
  END IF;

  SELECT CURRENT_USER = pg_catalog.pg_get_userbyid(relation.relowner)
  INTO v_trusted_rpc
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = 'public.purchase_order_items'::pg_catalog.regclass;

  IF TG_OP = 'INSERT' THEN
    v_po_ids := ARRAY[NEW.po_id];
    v_new_tenant_id := NEW.tenant_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_po_ids := ARRAY[OLD.po_id];
    v_old_tenant_id := OLD.tenant_id;
  ELSE
    v_po_ids := ARRAY[OLD.po_id, NEW.po_id];
    v_old_tenant_id := OLD.tenant_id;
    v_new_tenant_id := NEW.tenant_id;
  END IF;

  FOR v_po_id IN
    SELECT DISTINCT candidate.po_id
    FROM pg_catalog.unnest(v_po_ids) AS candidate(po_id)
    WHERE candidate.po_id IS NOT NULL
    ORDER BY candidate.po_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('retrospective-po:' || v_po_id::text, 0)
    );
  END LOOP;

  SELECT EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.po_id = ANY (v_po_ids)
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

  IF TG_OP = 'UPDATE'
     AND v_trusted_rpc IS TRUE
     AND v_confirming
     AND NEW.quantity > OLD.quantity
     AND (
       pg_catalog.to_jsonb(NEW) - 'quantity'
     ) IS NOT DISTINCT FROM (
       pg_catalog.to_jsonb(OLD) - 'quantity'
     ) THEN
    SELECT purchase_order.status
    INTO v_po_status
    FROM public.purchase_orders AS purchase_order
    WHERE purchase_order.id = NEW.po_id;

    IF v_po_status IN ('sent', 'approved', 'partially_received') THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND v_trusted_rpc IS TRUE
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.po_id IS NOT DISTINCT FROM OLD.po_id
     AND NEW.ingredient_id IS NOT DISTINCT FROM OLD.ingredient_id
     AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity
     AND NEW.entry_unit_id IS NOT DISTINCT FROM OLD.entry_unit_id THEN
    SELECT purchase_order.status
    INTO v_po_status
    FROM public.purchase_orders AS purchase_order
    WHERE purchase_order.id = NEW.po_id;

    IF v_po_status = 'draft' THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'linked_grn_purchase_order_lines_immutable'
    USING ERRCODE = 'check_violation';
END;
$function$;

REVOKE ALL ON FUNCTION private.enforce_retrospective_purchase_order_line_immutability()
FROM PUBLIC;
