-- Fix production valuation allocation_bucket and receipt print re-enqueue regressions.
-- 1) post_stock_movement_valuation used event_type bucket 'production_input' on
--    inventory_value_allocations, which only allows 'production_inventory'.
-- 2) enqueue_receipt_print ON CONFLICT referenced print_jobs.updated_at, which
--    does not exist on the table.

DO $fix_production_allocation_bucket$
DECLARE
  v_def text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'post_stock_movement_valuation';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'post_stock_movement_valuation missing';
  END IF;

  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  v_updated := replace(
    v_def,
    $old$WHEN NEW.type = 'production_consumption' THEN 'production_input'
          ELSE v_terminal_bucket$old$,
    $new$WHEN NEW.type = 'production_consumption' THEN 'production_inventory'
          ELSE v_terminal_bucket$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'post_stock_movement_valuation production allocation bucket pattern missing';
  END IF;

  EXECUTE v_updated;
END;
$fix_production_allocation_bucket$;

DO $fix_wac_equalize_terminal_buckets$
DECLARE
  v_def text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
  INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'private'
    AND p.proname = 'propagate_inventory_origin_reprice';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'propagate_inventory_origin_reprice missing';
  END IF;

  v_def := regexp_replace(
    v_def,
    '^CREATE (OR REPLACE )?FUNCTION',
    'CREATE OR REPLACE FUNCTION'
  );

  v_updated := replace(
    v_def,
    $old$allocation.allocation_bucket IN ('cost_of_goods_sold', 'waste_loss')$old$,
    $new$allocation.allocation_bucket IN ('food_cost', 'waste', 'stocktake_loss', 'transfer_loss')$new$
  );
  IF v_updated = v_def THEN
    RAISE EXCEPTION 'propagate_inventory_origin_reprice terminal bucket pattern missing';
  END IF;

  EXECUTE v_updated;
END;
$fix_wac_equalize_terminal_buckets$;

CREATE OR REPLACE FUNCTION public.enqueue_receipt_print(
  p_order_id bigint,
  p_cash_received numeric DEFAULT NULL::numeric,
  p_cash_change numeric DEFAULT NULL::numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $_$
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
  v_tax_breakdowns JSONB;
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

  IF v_order.payment_method = 'vietqr' THEN
    SELECT provider_ref INTO v_payment_ref
    FROM public.payments
    WHERE order_id = p_order_id
      AND tenant_id = v_order.tenant_id
      AND method = 'vietqr'
      AND status = 'completed'
      AND provider_ref ~* ('^(' || public.vietqr_payment_code_prefix()
            || ' [A-Z0-9]{12}|VQRLOAMB20260626100157757 [A-Z0-9]{12}|VQRLOAMB[0-9]{17}|DH[A-Z0-9]{3,12})$')
    ORDER BY id DESC
    LIMIT 1;
  END IF;

  SELECT value INTO v_qr_type
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'payment_qr_type';
  v_qr_type := COALESCE(v_qr_type, 'vietqr');

  IF v_qr_type = 'vietqr' AND v_payment_ref IS NOT NULL THEN
    SELECT NULLIF(btrim(value), '') INTO v_vietqr_bank
    FROM public.system_settings
    WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_bank_code';
    SELECT NULLIF(btrim(value), '') INTO v_vietqr_acc
    FROM public.system_settings
    WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_no';
    SELECT NULLIF(btrim(value), '') INTO v_vietqr_name
    FROM public.system_settings
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

  v_items := public.bill_line_items(p_order_id);
  v_tax_breakdowns := public.bill_tax_breakdowns(p_order_id);

  v_payload := jsonb_build_object(
    'kind',               'receipt',
    'branch_name',        COALESCE(v_branch.name, ''),
    'branch_address',     COALESCE(v_branch.address, ''),
    'branch_phone',       COALESCE(v_branch.phone, ''),
    'branch_tax_code',    COALESCE(v_branch_tax, ''),
    'order_number',       v_order.order_number,
    'order_type',         v_order.order_type,
    'delivery_platform',  v_order.delivery_platform,
    'external_order_ref', v_order.external_order_ref,
    'table_number',       v_table_no,
    'cashier_name',       COALESCE(v_cashier_name, ''),
    'note',               v_order.note,
    'items',              COALESCE(v_items, '[]'::jsonb),
    'subtotal',           v_order.subtotal,
    'tax_amount',         v_order.tax_amount,
    'tax_breakdowns',     COALESCE(v_tax_breakdowns, '[]'::jsonb),
    'service_charge',     v_order.service_charge,
    'discount_amount',    v_order.discount_amount,
    'total_amount',       v_order.total_amount,
    'payment_method',     v_order.payment_method,
    'payment_qr',         v_payment_qr,
    'cash_received',      p_cash_received,
    'cash_change',        p_cash_change,
    'created_at',         to_char(v_order.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                  'YYYY-MM-DD"T"HH24:MI:SS'),
    'printed_at',         to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
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
    'job_id',     v_job_id,
    'printer_id', v_printer_id
  );
END;
$_$;
