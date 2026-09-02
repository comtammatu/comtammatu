-- Waiter POS stays near-cashier for order + pay, but provisional bills
-- (`enqueue_provisional_bill` / `pos:print`) are cashier-counter only.
-- Reprint stays on `pos:reprint_receipt`; kitchen tickets stay on
-- `pos:send_kitchen`. Owner and branch_manager keep `pos:print`.

UPDATE public.role_templates AS template
SET permission_keys = (
  SELECT coalesce(array_agg(DISTINCT k ORDER BY k), ARRAY[]::text[])
  FROM unnest(array_remove(template.permission_keys, 'pos:print')) AS k
),
updated_at = now()
WHERE template.position_code = 'waiter';

DELETE FROM public.staff_permissions AS permission
USING public.profiles AS profile,
      public.positions AS position
WHERE profile.id = permission.user_id
  AND profile.tenant_id = permission.tenant_id
  AND position.id = profile.position_id
  AND position.tenant_id = profile.tenant_id
  AND position.code = 'waiter'
  AND permission.permission_key = 'pos:print';
