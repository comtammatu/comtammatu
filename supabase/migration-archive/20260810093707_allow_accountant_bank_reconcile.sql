-- Bank reconcile UI/actions already allow accountant via MODULE_ACL.finance
-- and finance:view. The SECURITY DEFINER RPC chain still checked auth_is_owner,
-- so accountant callers got forbidden_owner_only (PostgREST 403).
-- Widen the whole chain: reconcile plus nested SePay match helpers.

DO $migrate$
DECLARE
  fname text;
  def text;
  names text[] := ARRAY[
    'reconcile_bank_transaction_targets',
    'link_sepay_transaction_to_payment',
    'match_sepay_transaction_expenses',
    'match_sepay_transaction_supplier_payments',
    'match_sepay_transaction_refunds'
  ];
BEGIN
  FOREACH fname IN ARRAY names LOOP
    SELECT pg_get_functiondef(p.oid)
    INTO def
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = fname;

    IF def IS NULL THEN
      RAISE EXCEPTION 'missing_function:%', fname;
    END IF;

    IF position('auth_is_owner' IN def) = 0 THEN
      RAISE EXCEPTION 'unexpected_auth_gate:%', fname;
    END IF;

    def := regexp_replace(
      def,
      'OR NOT public\.auth_is_owner\((?:v_actor|v_user_id)\)',
      $r$OR public.auth_role() NOT IN ('owner', 'accountant')$r$,
      'g'
    );

    -- Nested match helpers previously omitted finance:view; require it too.
    def := regexp_replace(
      def,
      $r$OR public\.auth_role\(\) NOT IN \('owner', 'accountant'\)\s+THEN$r$,
      $r$OR public.auth_role() NOT IN ('owner', 'accountant')
    OR NOT public.has_permission_any('finance:view')
  THEN$r$,
      'g'
    );

    IF position('auth_is_owner' IN def) > 0 THEN
      RAISE EXCEPTION 'auth_is_owner_still_present:%', fname;
    END IF;

    IF position($$auth_role() NOT IN ('owner', 'accountant')$$ IN def) = 0 THEN
      RAISE EXCEPTION 'accountant_gate_missing:%', fname;
    END IF;

    IF position($$has_permission_any('finance:view')$$ IN def) = 0 THEN
      RAISE EXCEPTION 'finance_view_gate_missing:%', fname;
    END IF;

    EXECUTE def;
  END LOOP;
END;
$migrate$;

COMMENT ON FUNCTION public.reconcile_bank_transaction_targets(
  bigint,
  text,
  bigint[]
) IS
  'Owner/accountant reconciliation with finance:view. Classifies a canonical bank movement against operational evidence without changing bank balance; webhook-backed rows retain legacy evidence invariants.';
