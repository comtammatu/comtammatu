SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET search_path = '';

CREATE OR REPLACE FUNCTION public.has_permission(p_branch_id bigint, p_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.auth_is_owner(auth.uid())
    OR (
      NOT (p_key = ANY (ARRAY[
        'orders:refund',
        'orders:refund_approve',
        'pos:void_paid_order'
      ]::text[]))
      AND EXISTS (
        SELECT 1
        FROM public.staff_permissions sp
        JOIN public.profiles pr ON pr.id = sp.user_id
        WHERE sp.user_id = auth.uid()
          AND COALESCE(pr.is_active, true) = true
          AND sp.permission_key = p_key
          AND (sp.branch_id = p_branch_id OR sp.branch_id IS NULL)
          AND sp.valid_from <= now()
          AND (sp.valid_until IS NULL OR sp.valid_until > now())
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.has_permission_any(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.auth_is_owner(auth.uid())
    OR (
      NOT (p_key = ANY (ARRAY[
        'orders:refund',
        'orders:refund_approve',
        'pos:void_paid_order'
      ]::text[]))
      AND EXISTS (
        SELECT 1
        FROM public.staff_permissions sp
        JOIN public.profiles pr ON pr.id = sp.user_id
        WHERE sp.user_id = auth.uid()
          AND COALESCE(pr.is_active, true) = true
          AND sp.permission_key = p_key
          AND sp.valid_from <= now()
          AND (sp.valid_until IS NULL OR sp.valid_until > now())
      )
    );
$function$;

-- refund_paid_order is SECURITY DEFINER and executable by authenticated users.
-- Its existing pos:void_paid_order permission check must therefore resolve to
-- Owner identity, even when a stale staff grant still exists.
UPDATE public.role_templates
SET permission_keys = array_remove(
      array_remove(
        array_remove(permission_keys, 'orders:refund'),
        'orders:refund_approve'
      ),
      'pos:void_paid_order'
    ),
    updated_at = now()
WHERE position_code IS DISTINCT FROM 'owner'
  AND permission_keys && ARRAY[
    'orders:refund',
    'orders:refund_approve',
    'pos:void_paid_order'
  ]::text[];

DELETE FROM public.staff_permissions
WHERE permission_key = ANY (ARRAY[
  'orders:refund',
  'orders:refund_approve',
  'pos:void_paid_order'
]::text[]);

UPDATE public.permission_keys
SET description = CASE key
  WHEN 'orders:refund' THEN 'Tạo yêu cầu hoàn tiền; chỉ Owner'
  WHEN 'orders:refund_approve' THEN 'Phê duyệt hoàn tiền; chỉ Owner'
  WHEN 'pos:void_paid_order' THEN 'Huỷ đơn đã thanh toán và hoàn tiền; chỉ Owner'
  ELSE description
END
WHERE key = ANY (ARRAY[
  'orders:refund',
  'orders:refund_approve',
  'pos:void_paid_order'
]::text[]);

DROP POLICY IF EXISTS refunds_select ON public.refunds;
CREATE POLICY refunds_select ON public.refunds
FOR SELECT TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.auth_is_owner(auth.uid())
);

DROP POLICY IF EXISTS refunds_insert ON public.refunds;
CREATE POLICY refunds_insert ON public.refunds
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.auth_is_owner(auth.uid())
);

DROP POLICY IF EXISTS refunds_update ON public.refunds;
CREATE POLICY refunds_update ON public.refunds
FOR UPDATE TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND public.auth_is_owner(auth.uid())
)
WITH CHECK (
  tenant_id = public.auth_tenant_id()
  AND public.auth_is_owner(auth.uid())
);

COMMENT ON POLICY refunds_select ON public.refunds IS
  'Refund review is restricted to the active tenant Owner.';
COMMENT ON POLICY refunds_insert ON public.refunds IS
  'Refund creation is restricted to the active tenant Owner.';
COMMENT ON POLICY refunds_update ON public.refunds IS
  'Refund approval and rejection are restricted to the active tenant Owner.';
