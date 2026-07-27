CREATE OR REPLACE FUNCTION private.validate_grn_qc_before_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_error text;
BEGIN
  SELECT invalid.error_code
  INTO v_error
  FROM public.grn_items AS item
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN item.quality_status = 'accepted'
        AND COALESCE(item.rejected_quantity, 0) <> 0
        THEN 'grn_qc_quantity_mismatch'
      WHEN item.quality_status = 'partial'
        AND NOT (
          item.received_quantity > 0
          AND item.rejected_quantity > 0
          AND item.rejected_quantity < item.received_quantity
        )
        THEN 'grn_qc_quantity_mismatch'
      WHEN item.quality_status = 'rejected'
        AND NOT (
          item.received_quantity > 0
          AND item.rejected_quantity = item.received_quantity
        )
        THEN 'grn_qc_quantity_mismatch'
      WHEN item.quality_status IN ('partial', 'rejected')
        AND NULLIF(btrim(item.rejection_reason), '') IS NULL
        THEN 'grn_qc_reason_required'
      WHEN item.quality_status IN ('partial', 'rejected')
        AND NULLIF(btrim(item.rejected_photo_url), '') IS NULL
        THEN 'grn_qc_photo_required'
    END AS error_code
  ) AS invalid
  WHERE item.grn_id = NEW.id
    AND item.tenant_id = NEW.tenant_id
    AND invalid.error_code IS NOT NULL
  ORDER BY item.id
  LIMIT 1;

  IF v_error IS NOT NULL THEN
    RAISE EXCEPTION '%', v_error
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_grn_qc_before_confirm()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_grn_validate_qc_before_confirm
BEFORE UPDATE OF status ON public.goods_received_notes
FOR EACH ROW
WHEN (OLD.status = 'draft' AND NEW.status = 'confirmed')
EXECUTE FUNCTION private.validate_grn_qc_before_confirm();
