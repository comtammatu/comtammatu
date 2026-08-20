-- Allow direct transition from draft / changes_requested to approved on purchase_orders,
-- and allow initial approved status for warehouse-authored purchase orders.

CREATE OR REPLACE FUNCTION private.enforce_retrospective_purchase_order_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
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
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status NOT IN ('draft', 'pending_approval', 'approved') THEN
      RAISE EXCEPTION 'purchase_order_initial_status_invalid'
        USING ERRCODE = '23514';
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
        USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF v_trusted_rpc IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'purchase_order_status_requires_rpc'
        USING ERRCODE = '42501';
    END IF;
    IF NOT (
      (OLD.status = 'draft'
        AND NEW.status IN ('approved', 'sent', 'pending_approval', 'cancelled'))
      OR (
        OLD.status = 'changes_requested'
        AND NEW.status IN ('approved', 'pending_approval', 'cancelled')
      )
      OR (
        OLD.status = 'pending_approval'
        AND NEW.status IN ('approved', 'changes_requested', 'cancelled')
      )
      OR (
        OLD.status = 'sent'
        AND NEW.status IN ('partially_received', 'received', 'closed', 'cancelled')
      )
      OR (
        OLD.status = 'approved'
        AND NEW.status IN (
          'sent',
          'partially_received',
          'received',
          'closed',
          'cancelled'
        )
      )
      OR (
        OLD.status = 'partially_received'
        AND NEW.status IN ('received', 'closed')
      )
    ) THEN
      RAISE EXCEPTION 'purchase_order_status_transition_invalid'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_linked
     AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
       OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
       OR NEW.po_number IS DISTINCT FROM OLD.po_number
       OR NEW.display_id IS DISTINCT FROM OLD.display_id
       OR NEW.ordered_at IS DISTINCT FROM OLD.ordered_at
       OR NEW.expected_delivery_date IS DISTINCT FROM
         OLD.expected_delivery_date
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.source_grn_id IS DISTINCT FROM OLD.source_grn_id
       OR NEW.purchase_group_key IS DISTINCT FROM OLD.purchase_group_key
       OR NEW.purchase_group_code IS DISTINCT FROM OLD.purchase_group_code
       OR NEW.group_sequence IS DISTINCT FROM OLD.group_sequence
     ) THEN
    RAISE EXCEPTION 'linked_grn_purchase_order_immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_retrospective_purchase_order_immutability() FROM PUBLIC;

COMMENT ON FUNCTION private.enforce_retrospective_purchase_order_immutability() IS 'Retrospective PO immutability with approved direct transition from draft/changes_requested and approved initial status support.';
