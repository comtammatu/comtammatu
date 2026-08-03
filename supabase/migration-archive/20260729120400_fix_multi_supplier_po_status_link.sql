-- Treat purchase_orders.source_grn_id as a retrospective GRN link so
-- confirm can move split POs sent → received/partially_received.

CREATE OR REPLACE FUNCTION private.enforce_retrospective_purchase_order_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_linked boolean := FALSE;
  v_trusted_rpc boolean;
BEGIN
  SELECT CURRENT_USER = pg_catalog.pg_get_userbyid(relation.relowner)
  INTO v_trusted_rpc
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = 'public.purchase_orders'::pg_catalog.regclass;

  IF TG_OP = 'INSERT' THEN
    IF v_trusted_rpc IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'purchase_order_insert_requires_rpc'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'purchase_order_must_start_as_draft'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'retrospective-po:' || OLD.id::text,
      0
    )
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.goods_received_notes AS grn
    WHERE grn.tenant_id = OLD.tenant_id
      AND (
        grn.po_id = OLD.id
        OR OLD.source_grn_id = grn.id
      )
  )
  INTO v_linked;

  IF TG_OP = 'DELETE' THEN
    IF v_linked THEN
      RAISE EXCEPTION 'linked_grn_purchase_order_immutable'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT v_linked THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF v_trusted_rpc IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'purchase_order_status_requires_rpc'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF OLD.status <> 'draft' OR NEW.status <> 'sent' THEN
        RAISE EXCEPTION 'purchase_order_status_transition_invalid'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF v_trusted_rpc IS TRUE
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
     AND NEW.supplier_id IS NOT DISTINCT FROM OLD.supplier_id
     AND NEW.po_number IS NOT DISTINCT FROM OLD.po_number
     AND NEW.ordered_at IS NOT DISTINCT FROM OLD.ordered_at
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
     AND NEW.display_id IS NOT DISTINCT FROM OLD.display_id
     AND NEW.source_grn_id IS NOT DISTINCT FROM OLD.source_grn_id
     AND (
       (
         OLD.status = 'draft'
         AND NEW.status = 'sent'
       )
       OR (
         OLD.status IN ('sent', 'partially_received', 'received')
         AND NEW.status IN ('partially_received', 'received')
       )
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'linked_grn_purchase_order_immutable'
    USING ERRCODE = 'check_violation';
END;
$function$;

COMMENT ON FUNCTION private.enforce_retrospective_purchase_order_immutability() IS
  'Retrospective PO immutability. Links via grn.po_id or purchase_orders.source_grn_id (multi-supplier split).';
