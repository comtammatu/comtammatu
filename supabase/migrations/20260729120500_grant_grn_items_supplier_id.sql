-- Multi-supplier GRN added grn_items.supplier_id after column-level
-- privileges were locked down by inventory_topology_physical_qc_cleanup.
-- Authenticated clients need supplier_id for list embeds and line upserts.

GRANT SELECT (supplier_id) ON public.grn_items TO authenticated;
GRANT INSERT (supplier_id) ON public.grn_items TO authenticated;
GRANT UPDATE (supplier_id) ON public.grn_items TO authenticated;
