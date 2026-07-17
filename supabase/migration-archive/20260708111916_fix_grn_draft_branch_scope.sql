DROP INDEX IF EXISTS public.uq_grn_active_draft_per_user_supplier;
DROP INDEX IF EXISTS public.uq_grn_active_draft_per_user_supplier_branch;

CREATE UNIQUE INDEX uq_grn_active_draft_per_user_supplier_branch
  ON public.goods_received_notes (tenant_id, created_by, supplier_id, branch_id)
  WHERE status = 'draft' AND created_by IS NOT NULL;
