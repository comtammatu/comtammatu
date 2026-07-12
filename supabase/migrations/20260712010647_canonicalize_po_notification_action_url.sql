CREATE OR REPLACE FUNCTION public.trg_notify_po_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent' THEN
    INSERT INTO public.notifications (
      tenant_id, target_branch_id, target_roles,
      kind, severity, title, body,
      entity_type, entity_id, action_url, meta
    )
    VALUES (
      NEW.tenant_id,
      NEW.branch_id,
      ARRAY['branch_manager', 'owner']::text[],
      'workflow.po_sent',
      'info',
      format('PO %s đã gửi NCC', NEW.po_number),
      'Chờ nhập hàng / đối soát GRN khi NCC giao',
      'purchase_order',
      NEW.id,
      '/inventory/grn',
      jsonb_build_object('po_number', NEW.po_number)
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_notify_po_sent()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_notify_po_sent() TO service_role;

UPDATE public.notifications
SET action_url = '/inventory/grn'
WHERE kind = 'workflow.po_sent'
  AND action_url LIKE '/inventory/purchase-orders/%';
