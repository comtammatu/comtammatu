-- Branch-scoped procurement readers need supplier mappings to draft GRNs.
ALTER POLICY supplier_items_read
ON public.supplier_items
USING (
  tenant_id = public.auth_tenant_id()
  AND (SELECT public.has_permission_any('procurement:price_list_read'))
);
