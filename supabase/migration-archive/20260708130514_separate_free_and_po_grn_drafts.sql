DROP INDEX IF EXISTS public.uq_grn_active_draft_per_user_supplier;
DROP INDEX IF EXISTS public.uq_grn_active_draft_per_user_supplier_branch;
DROP INDEX IF EXISTS public.uq_grn_active_free_draft_per_user_supplier_branch;
DROP INDEX IF EXISTS public.uq_grn_active_po_draft_per_user_po;

CREATE UNIQUE INDEX uq_grn_active_free_draft_per_user_supplier_branch
  ON public.goods_received_notes (tenant_id, created_by, supplier_id, branch_id)
  WHERE status = 'draft' AND created_by IS NOT NULL AND po_id IS NULL;

CREATE UNIQUE INDEX uq_grn_active_po_draft_per_user_po
  ON public.goods_received_notes (tenant_id, created_by, po_id)
  WHERE status = 'draft' AND created_by IS NOT NULL AND po_id IS NOT NULL;
