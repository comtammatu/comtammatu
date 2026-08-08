-- Wire per-rate VAT into receipt / provisional bill print payloads.
-- print-render already renders tax_breakdowns; enqueue RPCs never populated them
-- after the single "Thuế VAT" line was removed.

CREATE OR REPLACE FUNCTION public.bill_tax_breakdowns(p_order_id bigint)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'rate', vat.vat_rate,
        'amount', vat.line_vat
      )
      ORDER BY vat.vat_rate DESC
    ),
    '[]'::jsonb
  )
  FROM public._compute_vat_breakdown(ARRAY[p_order_id]) AS vat
  WHERE vat.vat_rate IS NOT NULL
    AND vat.line_vat > 0;
$$;

COMMENT ON FUNCTION public.bill_tax_breakdowns(p_order_id bigint) IS
  'Payment-bill VAT lines for print payloads: [{rate, amount}] from _compute_vat_breakdown, descending by rate, positive VAT only.';

REVOKE ALL ON FUNCTION public.bill_tax_breakdowns(p_order_id bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.bill_tax_breakdowns(p_order_id bigint) TO authenticated;
GRANT ALL ON FUNCTION public.bill_tax_breakdowns(p_order_id bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_provisional_bill(
  p_order_id bigint,
  p_qr_content text DEFAULT NULL::text,
  p_qr_header_label text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_branch       public.branches%ROWTYPE;
  v_table_no     INT;
  v_printer_id   BIGINT;
  v_cashier_name TEXT;
  v_branch_tax   TEXT;
  v_qr_type      TEXT;
  v_flag_enabled TEXT;
  v_vietqr_bank  TEXT;
  v_vietqr_acc   TEXT;
  v_vietqr_name  TEXT;
  v_payment_qr   JSONB;
  v_items        JSONB;
  v_tax_breakdowns JSONB;
  v_payload      JSONB;
  v_idempotency  TEXT;
  v_job_id       BIGINT;
  v_now          TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('pos:print') THEN
    RAISE EXCEPTION 'permission denied: pos:print' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_provisional_bill_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RAISE EXCEPTION 'provisional bill printing is disabled' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'order already paid; cannot print provisional bill' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'order is cancelled; cannot print provisional bill' USING ERRCODE = 'P0001';
  END IF;

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
    'provisional_bill'
  );

  IF v_printer_id IS NULL THEN
    RAISE EXCEPTION 'no active receipt printer for branch %', v_order.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_qr_content IS NOT NULL AND length(trim(p_qr_content)) > 0 THEN
    SELECT value INTO v_qr_type
    FROM public.system_settings
    WHERE tenant_id = v_order.tenant_id AND key = 'payment_qr_type';
    v_qr_type := COALESCE(v_qr_type, 'vietqr');

    IF v_qr_type = 'vietqr' THEN
      SELECT value INTO v_vietqr_bank FROM public.system_settings
       WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_bank_code';
      SELECT value INTO v_vietqr_acc FROM public.system_settings
       WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_no';
      SELECT value INTO v_vietqr_name FROM public.system_settings
       WHERE tenant_id = v_order.tenant_id AND key = 'payment_vietqr_account_name';
    END IF;

    v_payment_qr := jsonb_build_object(
      'type',          v_qr_type,
      'content',       p_qr_content,
      'header_label',  COALESCE(p_qr_header_label, UPPER(v_qr_type)),
      'account_no',    v_vietqr_acc,
      'account_name',  v_vietqr_name,
      'amount',        v_order.total_amount,
      'description',   'DH ' || v_order.order_number
    );
  END IF;

  v_items := public.bill_line_items(p_order_id);
  v_tax_breakdowns := public.bill_tax_breakdowns(p_order_id);

  v_payload := jsonb_build_object(
    'kind',             'provisional_bill',
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
    'tax_breakdowns',   COALESCE(v_tax_breakdowns, '[]'::jsonb),
    'service_charge',   v_order.service_charge,
    'discount_amount',  v_order.discount_amount,
    'total_amount',     v_order.total_amount,
    'payment_qr',       v_payment_qr,
    'created_at',       to_char(v_order.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS'),
    'printed_at',       to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || p_order_id::TEXT
    || ':provisional:' || extract(epoch from v_now)::BIGINT::TEXT;

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  )
  VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'provisional_bill',
    p_order_id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET payload = EXCLUDED.payload
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'order_id',   p_order_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id,
    'qr_type',    v_qr_type
  );
END;
$$;

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

  v_items := public.bill_line_items(p_order_id);
  v_tax_breakdowns := public.bill_tax_breakdowns(p_order_id);

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
    'tax_breakdowns',   COALESCE(v_tax_breakdowns, '[]'::jsonb),
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
$_$;

CREATE OR REPLACE FUNCTION public.materialize_print_document(
  p_kind text,
  p_payload jsonb,
  p_template_id bigint,
  p_template_version integer,
  p_paper_width_mm integer,
  p_font_profile text,
  p_content jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_blocks JSONB;
  v_block JSONB;
  v_render_block JSONB;
  v_type TEXT;
  v_left TEXT;
  v_right TEXT;
  v_out JSONB := '[]'::jsonb;
BEGIN
  v_blocks := p_content->'blocks';
  IF v_blocks IS NULL
     OR jsonb_typeof(v_blocks) <> 'array'
     OR COALESCE(jsonb_array_length(v_blocks), 0) = 0 THEN
    v_blocks := public.print_template_default_content(p_kind)->'blocks';
  END IF;

  FOR v_block IN SELECT value FROM jsonb_array_elements(v_blocks)
  LOOP
    v_type := v_block->>'type';
    IF v_type IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT public.print_template_block_visible(v_block, p_payload) THEN
      CONTINUE;
    END IF;

    v_render_block := v_block
      - 'when_field'
      - 'when_equals'
      - 'when_not_equals'
      - 'when_not_equals_field'
      - 'when_not_empty'
      - 'when_min';

    CASE v_type
      WHEN 'text' THEN
        v_out := v_out || jsonb_build_array(
          jsonb_set(
            v_render_block,
            '{text}',
            to_jsonb(public.print_template_interpolate(v_block->>'text', p_payload)),
            true
          )
        );
      WHEN 'row' THEN
        v_left := public.print_template_interpolate(v_block->>'left', p_payload);
        v_right := public.print_template_interpolate(v_block->>'right', p_payload);
        v_out := v_out || jsonb_build_array(
          jsonb_set(
            jsonb_set(v_render_block, '{left}', to_jsonb(v_left), true),
            '{right}',
            to_jsonb(v_right),
            true
          )
        );
      WHEN 'branchInfo' THEN
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object(
            'branch_name', COALESCE(p_payload->>'branch_name', ''),
            'branch_address', COALESCE(p_payload->>'branch_address', ''),
            'branch_phone', COALESCE(p_payload->>'branch_phone', ''),
            'branch_tax_code', COALESCE(p_payload->>'branch_tax_code', '')
          )
        );
      WHEN 'billMeta' THEN
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object(
            'order_number', COALESCE(p_payload->>'order_number', ''),
            'order_type', COALESCE(p_payload->>'order_type', ''),
            'table_number', p_payload->'table_number',
            'cashier_name', COALESCE(p_payload->>'cashier_name', ''),
            'created_at', COALESCE(p_payload->>'created_at', '')
          )
        );
      WHEN 'paymentMethod' THEN
        IF COALESCE(p_payload->>'payment_method', '') = '' THEN
          CONTINUE;
        END IF;
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object('method', p_payload->>'payment_method')
        );
      WHEN 'itemsTable' THEN
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object('items', COALESCE(p_payload->'items', '[]'::jsonb))
        );
      WHEN 'totals' THEN
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object(
            'subtotal', p_payload->'subtotal',
            'tax_amount', p_payload->'tax_amount',
            'tax_breakdowns', COALESCE(p_payload->'tax_breakdowns', '[]'::jsonb),
            'service_charge', p_payload->'service_charge',
            'discount_amount', p_payload->'discount_amount',
            'total_amount', p_payload->'total_amount'
          )
        );
      WHEN 'cashChange' THEN
        IF NOT (p_payload ? 'cash_received' OR p_payload ? 'cash_change') THEN
          CONTINUE;
        END IF;
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object(
            'cash_received', p_payload->'cash_received',
            'cash_change', p_payload->'cash_change',
            'total_amount', p_payload->'total_amount'
          )
        );
      WHEN 'note' THEN
        IF COALESCE(NULLIF(trim(p_payload->>'note'), ''), '') = '' THEN
          CONTINUE;
        END IF;
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object('text', p_payload->>'note')
        );
      WHEN 'paymentQr' THEN
        IF jsonb_typeof(p_payload->'payment_qr') <> 'object'
           OR COALESCE(p_payload#>>'{payment_qr,content}', '') = '' THEN
          CONTINUE;
        END IF;
        v_out := v_out || jsonb_build_array(
          v_render_block || jsonb_build_object('qr', p_payload->'payment_qr')
        );
      WHEN 'kitchenItems' THEN
        v_out := v_out || public.print_template_kitchen_item_blocks(p_payload, false);
      WHEN 'cancelItems' THEN
        v_out := v_out || public.print_template_kitchen_item_blocks(p_payload, true);
      WHEN 'shiftCashReconciliation' THEN
        v_out := v_out || public.print_template_shift_cash_blocks(p_payload);
      WHEN 'paymentBreakdown' THEN
        v_out := v_out || public.print_template_payment_breakdown_blocks(p_payload);
      WHEN 'shiftOrderSummary' THEN
        v_out := v_out || public.print_template_shift_summary_blocks(p_payload);
      WHEN 'shiftItemBreakdown' THEN
        v_out := v_out || public.print_template_shift_item_breakdown_blocks(p_payload);
      WHEN 'shiftVarianceNotice' THEN
        v_out := v_out || public.print_template_shift_variance_notice_blocks(p_payload);
      WHEN 'shiftSignature' THEN
        v_out := v_out || public.print_template_shift_signature_blocks();
      WHEN 'varianceApproval' THEN
        v_out := v_out || public.print_template_variance_approval_blocks(p_payload);
      WHEN 'kitchenTicket' THEN
        v_out := v_out || (
          public.materialize_print_document(
            'kitchen_ticket',
            p_payload,
            p_template_id,
            p_template_version,
            p_paper_width_mm,
            p_font_profile,
            public.print_template_default_content('kitchen_ticket')
          )->'blocks'
        );
      WHEN 'cancelTicket' THEN
        v_out := v_out || (
          public.materialize_print_document(
            'cancel_ticket',
            p_payload,
            p_template_id,
            p_template_version,
            p_paper_width_mm,
            p_font_profile,
            public.print_template_default_content('cancel_ticket')
          )->'blocks'
        );
      WHEN 'shiftCloseReport' THEN
        v_out := v_out || (
          public.materialize_print_document(
            'shift_close_report',
            p_payload,
            p_template_id,
            p_template_version,
            p_paper_width_mm,
            p_font_profile,
            public.print_template_default_content('shift_close_report')
          )->'blocks'
        );
      ELSE
        v_out := v_out || jsonb_build_array(v_render_block);
    END CASE;
  END LOOP;

  IF jsonb_array_length(v_out) = 0 THEN
    v_out := jsonb_build_array(
      jsonb_build_object('type', 'text', 'text', COALESCE(p_payload->>'kind', p_kind))
    );
  END IF;

  RETURN jsonb_build_object(
    'schema_version', 1,
    'template_id', COALESCE(p_template_id, 0),
    'template_version', COALESCE(p_template_version, 1),
    'paper_width_mm', COALESCE(p_paper_width_mm, 80),
    'font_profile', COALESCE(p_font_profile, 'thermal_vietnamese'),
    'blocks', v_out
  );
END;
$$;
