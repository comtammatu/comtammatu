-- Let service_role resolve a branch printer so webhook-driven prints work.
--
-- resolve_branch_printer_for_type gated every lookup on
--   p_tenant_id = auth.auth_tenant_id() AND (branch matches auth_branch_id())
-- which assumes an authenticated POS caller. Under service_role (the SePay/MoMo
-- webhooks → confirm_sepay_payment → enqueue_receipt_print) there is no user JWT,
-- so auth_tenant_id() is NULL, the equality is never true, and the resolver
-- returns NULL. enqueue_receipt_print then raises 'no active receipt printer',
-- confirm_sepay_payment swallows it (fail-soft), and the receipt is never queued —
-- SePay-confirmed orders auto-print only when a cashier session happens to enqueue
-- client-side. Bypass the auth-scope guard for service_role (already fully trusted:
-- the webhook verifies the SePay signature and resolves tenant/order server-side);
-- authenticated callers keep the same tenant/branch scoping. Only
-- enqueue_receipt_print calls this from service_role; enqueue_provisional_bill and
-- enqueue_shift_close_print require has_permission_any(...) so the new branch never
-- applies to them.

CREATE OR REPLACE FUNCTION public.resolve_branch_printer_for_type(p_tenant_id bigint, p_branch_id bigint, p_print_type text) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id
  FROM public.printers p
  JOIN public.printer_print_types ppt
    ON ppt.printer_id = p.id
   AND ppt.tenant_id = p.tenant_id
   AND ppt.branch_id = p.branch_id
   AND ppt.print_type = p_print_type
  WHERE p.tenant_id = p_tenant_id
    AND p.branch_id = p_branch_id
    AND (
      auth.role() = 'service_role'
      OR (
        p_tenant_id = public.auth_tenant_id()
        AND (
          public.auth_branch_id() IS NULL
          OR p_branch_id = public.auth_branch_id()
        )
      )
    )
    AND p.is_active = TRUE
  ORDER BY
    CASE
      WHEN p.role = 'receipt' THEN 0
      WHEN p.role = 'kitchen_1' THEN 1
      WHEN p.role = 'kitchen_2' THEN 2
      ELSE 3
    END,
    p.id
  LIMIT 1;
$$;
