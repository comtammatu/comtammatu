-- Make the VietQR transfer-memo prefix owner-configurable in Payment Settings
-- (system_settings key 'payment_vietqr_code_prefix') instead of a hardcoded
-- literal. The prior literal 'QAJZRU5550 MBBMS01382716 1' becomes the seeded
-- default, so behaviour is unchanged until the owner edits it. The stored code
-- stays <prefix> + ' ' + 12-char CSPRNG suffix; the prefix is sanitised to
-- uppercase single-spaced [A-Z0-9 ] so it survives the QR-memo builder and the
-- SePay webhook, which both collapse whitespace before matching.

-- Seed the default prefix for every tenant (no-op if a row already exists, so
-- re-running never clobbers an owner-edited value).
INSERT INTO public.system_settings (tenant_id, key, value)
SELECT id, 'payment_vietqr_code_prefix', 'QAJZRU5550 MBBMS01382716 1'
FROM public.tenants
ON CONFLICT (key, tenant_id) DO NOTHING;

-- Canonical configured prefix, or the seeded literal when unset. SECURITY
-- INVOKER (the default): every real caller — the column-default generator,
-- ensure_order_payment_code, and enqueue_receipt_print — already runs SECURITY
-- DEFINER, so this nested read resolves as the definer and bypasses RLS; a direct
-- authenticated call simply falls back to the literal when RLS hides the row.
-- Sanitised to uppercase single-spaced [A-Z0-9 ].
-- ponytail: single-tenant — reads the one prefix row; add a tenant_id arg if
-- the app ever serves multiple tenants.
CREATE OR REPLACE FUNCTION public.vietqr_payment_code_prefix() RETURNS text
    LANGUAGE sql
    STABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(regexp_replace(upper(value), '[^A-Z0-9]+', ' ', 'g')), '')
       FROM public.system_settings
      WHERE key = 'payment_vietqr_code_prefix'
      ORDER BY tenant_id
      LIMIT 1),
    'QAJZRU5550 MBBMS01382716 1'
  );
$$;

REVOKE ALL ON FUNCTION public.vietqr_payment_code_prefix() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vietqr_payment_code_prefix() FROM anon;
GRANT EXECUTE ON FUNCTION public.vietqr_payment_code_prefix() TO authenticated;
GRANT EXECUTE ON FUNCTION public.vietqr_payment_code_prefix() TO service_role;

-- Generator: configured prefix + 12 CSPRNG alphanumerics (uppercase, so the
-- transfer memo survives SePay/bank case-folding, which the webhook and RPC
-- match on).
CREATE OR REPLACE FUNCTION public.generate_order_payment_code() RETURNS text
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  SELECT public.vietqr_payment_code_prefix() || ' ' || string_agg(
    substr(
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      1 + (get_byte(extensions.gen_random_bytes(1), 0) % 36),
      1
    ),
    ''
  )
  FROM generate_series(1, 12);
$$;

-- The prefix is now dynamic, so a static per-format CHECK is impossible (a CHECK
-- must be IMMUTABLE and cannot read system_settings). Relax to a generic
-- charset/length bound: single-spaced uppercase/lowercase alphanumeric groups,
-- 3..50 chars. The generator remains the real format enforcer; this stays as a
-- defence-in-depth bound and still accepts every prior code shape. NOT VALID +
-- VALIDATE avoids an ACCESS EXCLUSIVE rewrite; every existing row already
-- matches this superset.
ALTER TABLE public.orders DROP CONSTRAINT orders_payment_code_format_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_code_format_check
  CHECK (
    char_length(payment_code) BETWEEN 3 AND 50
    AND payment_code ~ '^[A-Za-z0-9]+( [A-Za-z0-9]+)*$'
  )
  NOT VALID;
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_payment_code_format_check;

-- Receipt enqueue: select the VietQR payment ref for the receipt QR. The
-- configured-prefix branch is built from vietqr_payment_code_prefix() (sanitised
-- to [A-Z0-9 ], no regex metacharacters); the three prior shapes stay as
-- grandfather branches so reprints of already-settled orders still render a QR.
-- Reproduced verbatim from the deployed definition except that one predicate.
CREATE OR REPLACE FUNCTION public.enqueue_receipt_print(p_order_id bigint, p_cash_received numeric DEFAULT NULL::numeric, p_cash_change numeric DEFAULT NULL::numeric)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid          UUID;
  v_is_service   BOOLEAN := (auth.role() = 'service_role');
  v_actor        UUID;
  v_order        public.orders%ROWTYPE;
  v_branch       public.branches%ROWTYPE;
  v_table_no     INT;
  v_printer_id   BIGINT;
  v_cashier_name TEXT;
  v_branch_tax   TEXT;
  v_qr_type      TEXT;
  v_vietqr_bank  TEXT;
  v_vietqr_acc   TEXT;
  v_vietqr_name  TEXT;
  v_payment_ref  TEXT;
  v_qr_content   TEXT;
  v_payment_qr   JSONB;
  v_items        JSONB;
  v_payload      JSONB;
  v_idempotency  TEXT;
  v_job_id       BIGINT;
  v_now          TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL AND NOT v_is_service THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_is_service THEN
    IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
      RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
    END IF;

    IF NOT (
      public.has_permission(v_order.branch_id, 'pos:print')
      OR public.has_permission(v_order.branch_id, 'pos:reprint_receipt')
    ) THEN
      RAISE EXCEPTION 'permission denied: pos:print' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_actor := COALESCE(v_uid, v_order.created_by);

  SELECT * INTO v_branch FROM public.branches WHERE id = v_order.branch_id;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_order.created_by;

  SELECT value INTO v_branch_tax
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'branch_tax_code';

  v_printer_id := public.resolve_branch_printer_for_type(
    v_order.tenant_id,
    v_order.branch_id,
    'receipt'
  );

  IF v_printer_id IS NULL THEN
    RAISE EXCEPTION 'no active receipt printer for branch %', v_order.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_cash_received IS NOT NULL OR p_cash_change IS NOT NULL THEN
    UPDATE public.orders
       SET cash_received = p_cash_received,
           cash_change   = p_cash_change
     WHERE id = p_order_id;
  END IF;

  SELECT provider_ref INTO v_payment_ref
  FROM public.payments
  WHERE order_id = p_order_id
    AND tenant_id = v_order.tenant_id
    AND status <> 'failed'
    AND provider_ref ~* ('^(' || public.vietqr_payment_code_prefix()
          || ' [A-Z0-9]{12}|VQRLOAMB20260626100157757 [A-Z0-9]{12}|VQRLOAMB[0-9]{17}|DH[A-Z0-9]{3,12})$')
  ORDER BY id DESC
  LIMIT 1;

  SELECT value INTO v_qr_type
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'payment_qr_type';
  v_qr_type := COALESCE(v_qr_type, 'vietqr');

  IF v_qr_type = 'vietqr' AND v_payment_ref IS NOT NULL THEN
    SELECT value INTO v_vietqr_bank FROM public.system_settings
     WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_bank_code';
    SELECT value INTO v_vietqr_acc FROM public.system_settings
     WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_no';
    SELECT value INTO v_vietqr_name FROM public.system_settings
     WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_name';

    BEGIN
      v_qr_content := public.print_vietqr_emvco(
        v_vietqr_bank,
        v_vietqr_acc,
        v_vietqr_name,
        v_order.total_amount,
        v_payment_ref
      );
    EXCEPTION WHEN OTHERS THEN
      v_qr_content := NULL;
      RAISE WARNING '[enqueue_receipt_print] vietqr emv build failed for order %: %',
        p_order_id, SQLERRM;
    END;

    IF v_qr_content IS NOT NULL THEN
      v_payment_qr := jsonb_build_object(
        'type',         'vietqr',
        'content',      v_qr_content,
        'header_label', upper(COALESCE(v_vietqr_bank, ''))
                          || ' (BIN ' || public.print_vietqr_bank_bin(v_vietqr_bank) || ')',
        'account_no',   v_vietqr_acc,
        'account_name', v_vietqr_name,
        'amount',       v_order.total_amount,
        'description',  v_payment_ref
      );
    END IF;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'item_name',     oi.item_name,
      'variant_name',  oi.variant_name,
      'category_type', mc.type,
      'quantity',      oi.quantity,
      'unit_price',    oi.unit_price,
      'modifiers',     oi.modifiers,
      'sides',         oi.sides,
      'subtotal',      oi.subtotal,
      'note',          oi.note
    )
    ORDER BY oi.id
  )
  INTO v_items
  FROM public.order_items oi
  LEFT JOIN public.menu_items mi
    ON mi.id = oi.menu_item_id
   AND mi.tenant_id = oi.tenant_id
  LEFT JOIN public.menu_categories mc
    ON mc.id = mi.category_id
   AND mc.tenant_id = oi.tenant_id
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  v_payload := jsonb_build_object(
    'kind',             'receipt',
    'branch_name',      COALESCE(v_branch.name, ''),
    'branch_address',   COALESCE(v_branch.address, ''),
    'branch_phone',     COALESCE(v_branch.phone, ''),
    'branch_tax_code',  COALESCE(v_branch_tax, ''),
    'order_number',     v_order.order_number,
    'order_type',       v_order.order_type,
    'table_number',     v_table_no,
    'cashier_name',     COALESCE(v_cashier_name, ''),
    'note',             v_order.note,
    'items',            COALESCE(v_items, '[]'::jsonb),
    'subtotal',         v_order.subtotal,
    'tax_amount',       v_order.tax_amount,
    'service_charge',   v_order.service_charge,
    'discount_amount',  v_order.discount_amount,
    'total_amount',     v_order.total_amount,
    'payment_method',   v_order.payment_method,
    'payment_qr',       v_payment_qr,
    'cash_received',    p_cash_received,
    'cash_change',      p_cash_change,
    'created_at',       to_char(v_order.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS'),
    'printed_at',       to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || p_order_id::TEXT || ':receipt';

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  )
  VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'receipt',
    p_order_id, v_payload, v_idempotency, v_actor
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    payload    = EXCLUDED.payload,
    printer_id = EXCLUDED.printer_id,
    status = CASE
               WHEN public.print_jobs.status IN ('failed','expired')
               THEN 'pending'
               WHEN public.print_jobs.status = 'printed' AND NOT v_is_service
               THEN 'pending'
               ELSE public.print_jobs.status
             END,
    last_error       = NULL,
    claimed_by_agent = NULL,
    claimed_at       = NULL
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'order_id',   p_order_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id
  );
END;
$$;
