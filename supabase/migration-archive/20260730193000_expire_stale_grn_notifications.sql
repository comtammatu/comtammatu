CREATE OR REPLACE FUNCTION private.expire_grn_pending_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_grn_id bigint := OLD.id;
  v_po_id bigint := OLD.po_id;
  v_tenant_id bigint := OLD.tenant_id;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'draft' THEN
    RETURN NULL;
  END IF;

  UPDATE public.notifications
  SET expires_at = now()
  WHERE tenant_id = v_tenant_id
    AND (
      expires_at IS NULL
      OR expires_at > now()
    )
    AND (
      (
        kind = 'workflow.grn_pending'
        AND entity_type = 'grn'
        AND entity_id = v_grn_id
      )
      OR (
        v_po_id IS NOT NULL
        AND kind IN ('workflow.po_approved', 'workflow.po_sent')
        AND entity_type = 'purchase_order'
        AND entity_id = v_po_id
      )
    );

  RETURN NULL;
END;
$$;

REVOKE ALL
ON FUNCTION private.expire_grn_pending_notification()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER expire_grn_pending_notification_after_resolution
AFTER UPDATE OF status OR DELETE
ON public.goods_received_notes
FOR EACH ROW
EXECUTE FUNCTION private.expire_grn_pending_notification();

UPDATE public.notifications AS notification
SET expires_at = now()
WHERE (
    notification.expires_at IS NULL
    OR notification.expires_at > now()
  )
  AND (
    (
      notification.kind = 'workflow.grn_pending'
      AND notification.entity_type = 'grn'
      AND NOT EXISTS (
        SELECT 1
        FROM public.goods_received_notes AS grn
        WHERE grn.id = notification.entity_id
          AND grn.tenant_id = notification.tenant_id
          AND grn.branch_id = notification.target_branch_id
          AND grn.status = 'draft'
          AND grn.created_at <= notification.created_at
      )
    )
    OR (
      notification.kind IN ('workflow.po_approved', 'workflow.po_sent')
      AND notification.entity_type = 'purchase_order'
      AND NOT EXISTS (
        SELECT 1
        FROM public.goods_received_notes AS grn
        WHERE grn.po_id = notification.entity_id
          AND grn.tenant_id = notification.tenant_id
          AND grn.branch_id = notification.target_branch_id
          AND grn.status = 'draft'
      )
    )
  );
