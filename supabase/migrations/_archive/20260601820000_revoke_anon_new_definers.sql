-- =========================================================================
-- Security hardening for new SECURITY DEFINER print/KDS helper functions.
-- Keep callable RPCs authenticated-only and trigger/internal helpers non-API.
-- =========================================================================

REVOKE EXECUTE ON FUNCTION public.attach_print_document_to_payload(BIGINT, BIGINT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.print_jobs_attach_document_trigger()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.enqueue_edit_pending_order_item_quantity_print(BIGINT, INT, INT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_edit_pending_order_item_quantity_print(BIGINT, INT, INT, TEXT)
  TO authenticated;
