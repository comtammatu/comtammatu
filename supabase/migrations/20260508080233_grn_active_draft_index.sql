-- Sprint 6 #3: support server-side GRN draft auto-save replacing the
-- mobile-draft.ts localStorage cache.
--
-- Partial unique index serializes the (tenant, user, supplier) tuple for
-- in-flight drafts. Without this, two tabs/devices opening the same supplier
-- form simultaneously would lazy-create two orphan draft GRNs. With this,
-- the second concurrent createGrnDraft hits a UNIQUE_VIOLATION and the
-- server action falls back to loadActiveGrnDraft.
--
-- Also serves the loadActiveGrnDraft hot path: lookup by
-- (tenant_id, created_by, supplier_id, status='draft') is now an index seek.

CREATE UNIQUE INDEX IF NOT EXISTS uq_grn_active_draft_per_user_supplier
  ON public.goods_received_notes (tenant_id, created_by, supplier_id)
  WHERE status = 'draft' AND created_by IS NOT NULL;

COMMENT ON INDEX public.uq_grn_active_draft_per_user_supplier IS
  'Partial UNIQUE: at most one in-flight draft GRN per (tenant, user, supplier). Enforces server-side draft semantics for /inventory/grn/new flow. Sprint 6 #3.';
