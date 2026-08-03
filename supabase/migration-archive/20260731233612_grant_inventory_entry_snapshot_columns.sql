-- Column-level SELECT after monetary lockdown: unit-role snapshot columns
-- added by inventory_unit_roles_and_snapshots must be granted explicitly.

GRANT SELECT (
  entry_to_base_factor,
  entry_unit_code
) ON public.purchase_order_items TO authenticated;

GRANT SELECT (
  entry_to_base_factor,
  entry_unit_code
) ON public.grn_items TO authenticated;

GRANT SELECT (
  entry_to_base_factor,
  entry_unit_code
) ON public.stock_transfer_items TO authenticated;

GRANT SELECT (
  entry_to_base_factor,
  entry_unit_code
) ON public.stock_issue_items TO authenticated;

GRANT SELECT (
  entry_to_base_factor,
  entry_unit_code
) ON public.stock_movements TO authenticated;
