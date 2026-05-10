-- ============================================================================
-- Print agent LAN + Bluetooth transport and richer DB-managed print templates.
--
-- Goals:
-- - Keep rendering responsibility inside apps/print-agent.
-- - Allow branch printer rows to target LAN TCP or an OS-bound Bluetooth serial
--   endpoint (COM5, /dev/rfcomm0, /dev/tty.*) without native Node deps.
-- - Add tax_invoice/HĐĐT print job/template support.
-- - Expose modular kitchen + HĐĐT document blocks so template layout can be
--   adjusted through print_template_versions instead of redeploying agents.
--
-- Apply order note: deploy print-agent >= 0.4.0 before activating templates that
-- use kitchenHeader/kitchenMeta/kitchenItems/kitchenNote/taxInvoice* blocks.
-- ============================================================================

-- ─── 1. Transport: printers.connection_type = lan | bluetooth ─────────────

ALTER TABLE public.printers
  DROP CONSTRAINT IF EXISTS printers_connection_type_lan_only;

ALTER TABLE public.printers
  DROP CONSTRAINT IF EXISTS printers_lan_host_required;

ALTER TABLE public.printers
  ADD CONSTRAINT printers_connection_type_lan_bt
    CHECK (connection_type IN ('lan', 'bluetooth'));

ALTER TABLE public.printers
  ADD CONSTRAINT printers_transport_endpoint_required
    CHECK (
      (connection_type = 'lan' AND NULLIF(trim(lan_host), '') IS NOT NULL)
      OR
      (connection_type = 'bluetooth' AND NULLIF(trim(lan_host), '') IS NOT NULL)
    );

COMMENT ON COLUMN public.printers.connection_type IS
  'Print transport used by print-agent. lan = TCP raw socket; bluetooth = OS-bound serial endpoint.';

COMMENT ON COLUMN public.printers.lan_host IS
  'For LAN: printer IP/hostname. For Bluetooth: paired serial endpoint such as COM5, /dev/rfcomm0, or /dev/tty.*.';

-- ─── 2. Print type enums/checks: add tax_invoice ───────────────────────────

ALTER TABLE public.print_jobs
  DROP CONSTRAINT IF EXISTS print_jobs_job_type_check;

ALTER TABLE public.print_jobs
  ADD CONSTRAINT print_jobs_job_type_check CHECK (
    job_type IN (
      'kitchen_ticket',
      'receipt',
      'reprint',
      'cancel_ticket',
      'provisional_bill',
      'shift_close_report',
      'tax_invoice'
    )
  );

ALTER TABLE public.printer_print_types
  DROP CONSTRAINT IF EXISTS printer_print_types_print_type_check;

ALTER TABLE public.printer_print_types
  ADD CONSTRAINT printer_print_types_print_type_check CHECK (
    print_type IN (
      'receipt',
      'provisional_bill',
      'shift_close_report',
      'tax_invoice',
      'kitchen_ticket',
      'cancel_ticket'
    )
  );

ALTER TABLE public.print_template_versions
  DROP CONSTRAINT IF EXISTS print_template_versions_kind_check;

ALTER TABLE public.print_template_versions
  ADD CONSTRAINT print_template_versions_kind_check CHECK (
    kind IN (
      'receipt',
      'provisional_bill',
      'kitchen_ticket',
      'cancel_ticket',
      'shift_close_report',
      'tax_invoice'
    )
  );

-- ─── 3. Fleet status tracks LAN+BT capable agent version ───────────────────

CREATE OR REPLACE VIEW public.v_print_agent_fleet AS
SELECT
  b.id                                AS branch_id,
  b.tenant_id,
  b.name                              AS branch_name,
  pa.agent_id,
  pa.version,
  pa.last_seen_at,
  EXTRACT(EPOCH FROM (now() - pa.last_seen_at))::INT AS seconds_since_seen,
  CASE
    WHEN pa.branch_id IS NULL THEN 'never_started'
    WHEN pa.last_seen_at < now() - INTERVAL '5 minutes' THEN 'offline'
    WHEN pa.version IS NULL OR pa.version = '' THEN 'active_unknown_version'
    WHEN string_to_array(pa.version, '.')::INT[] < ARRAY[0,4,0]
      THEN 'legacy'
    ELSE 'current'
  END                                 AS status
FROM public.branches b
LEFT JOIN public.printer_agents pa
  ON pa.branch_id = b.id
WHERE b.is_active = TRUE;

ALTER VIEW public.v_print_agent_fleet SET (security_invoker = true);

GRANT SELECT ON public.v_print_agent_fleet TO authenticated;

COMMENT ON VIEW public.v_print_agent_fleet IS
  'Fleet-wide print-agent status. Status = legacy if version < 0.4.0 (LAN+BT + tax invoice templates), current otherwise.';

-- ─── 4. Default template content including modular blocks ─────────────────

CREATE OR REPLACE FUNCTION public.print_template_default_content(p_kind TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
BEGIN
  CASE p_kind
    WHEN 'receipt' THEN
      RETURN jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object('type', 'brandHeader', 'eyebrow', 'TIỆM CƠM TẤM', 'name', 'MÁ TƯ', 'tagline', 'Thịt tươi 100%'),
          jsonb_build_object('type', 'branchInfo'),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', 'HÓA ĐƠN THANH TOÁN', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'billMeta'),
          jsonb_build_object('type', 'paymentMethod'),
          jsonb_build_object('type', 'itemsTable'),
          jsonb_build_object('type', 'totals'),
          jsonb_build_object('type', 'cashChange'),
          jsonb_build_object('type', 'note', 'prefix', 'Ghi chú: '),
          jsonb_build_object('type', 'footer', 'lines', jsonb_build_array('Thịt tươi 100%'))
        )
      );
    WHEN 'provisional_bill' THEN
      RETURN jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object('type', 'brandHeader', 'eyebrow', 'TIỆM CƠM TẤM', 'name', 'MÁ TƯ', 'tagline', 'Thịt tươi 100%'),
          jsonb_build_object('type', 'branchInfo'),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', 'PHIẾU TẠM TÍNH', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'billMeta'),
          jsonb_build_object('type', 'itemsTable'),
          jsonb_build_object('type', 'totals'),
          jsonb_build_object('type', 'note', 'prefix', 'Ghi chú: '),
          jsonb_build_object('type', 'paymentQr', 'heading', 'QUÉT QR THANH TOÁN'),
          jsonb_build_object('type', 'footer', 'lines', jsonb_build_array('Thịt tươi 100%'))
        )
      );
    WHEN 'kitchen_ticket' THEN
      RETURN jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object('type', 'kitchenHeader'),
          jsonb_build_object('type', 'kitchenMeta'),
          jsonb_build_object('type', 'kitchenItems'),
          jsonb_build_object('type', 'kitchenNote')
        )
      );
    WHEN 'tax_invoice' THEN
      RETURN jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object('type', 'brandHeader', 'eyebrow', 'TIỆM CƠM TẤM', 'name', 'MÁ TƯ', 'tagline', 'Thịt tươi 100%'),
          jsonb_build_object('type', 'branchInfo'),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'text', 'text', 'THÔNG TIN HĐĐT', 'align', 'center', 'bold', true, 'double', true),
          jsonb_build_object('type', 'divider', 'char', '='),
          jsonb_build_object('type', 'taxInvoiceMeta'),
          jsonb_build_object('type', 'taxInvoiceBuyer'),
          jsonb_build_object('type', 'itemsTable'),
          jsonb_build_object('type', 'totals'),
          jsonb_build_object('type', 'taxInvoiceLookup'),
          jsonb_build_object('type', 'footer', 'lines', jsonb_build_array('HĐĐT gốc lưu trên hệ thống/nhà cung cấp.'))
        )
      );
    WHEN 'cancel_ticket' THEN
      RETURN jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object('type', 'cancelTicket')
        )
      );
    WHEN 'shift_close_report' THEN
      RETURN jsonb_build_object(
        'blocks', jsonb_build_array(
          jsonb_build_object('type', 'shiftCloseReport')
        )
      );
    ELSE
      RETURN jsonb_build_object('blocks', '[]'::jsonb);
  END CASE;
END;
$$;

INSERT INTO public.print_template_versions (
  tenant_id,
  branch_id,
  kind,
  version,
  name,
  paper_width_mm,
  font_profile,
  content,
  is_active
)
SELECT
  NULL,
  NULL,
  'tax_invoice',
  1,
  'Mặc định - thông tin HĐĐT',
  80,
  'thermal_vietnamese',
  public.print_template_default_content('tax_invoice'),
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.print_template_versions existing
  WHERE existing.tenant_id IS NULL
    AND existing.branch_id IS NULL
    AND existing.kind = 'tax_invoice'
    AND existing.version = 1
);

DO $$
DECLARE
  v_template_id BIGINT;
  v_next_version INT;
BEGIN
  SELECT id
    INTO v_template_id
  FROM public.print_template_versions
  WHERE tenant_id IS NULL
    AND branch_id IS NULL
    AND kind = 'kitchen_ticket'
    AND content = public.print_template_default_content('kitchen_ticket')
  ORDER BY version DESC, id DESC
  LIMIT 1;

  IF v_template_id IS NULL THEN
    SELECT COALESCE(MAX(version), 0) + 1
      INTO v_next_version
    FROM public.print_template_versions
    WHERE tenant_id IS NULL
      AND branch_id IS NULL
      AND kind = 'kitchen_ticket';

    INSERT INTO public.print_template_versions (
      tenant_id,
      branch_id,
      kind,
      version,
      name,
      paper_width_mm,
      font_profile,
      content,
      is_active
    )
    VALUES (
      NULL,
      NULL,
      'kitchen_ticket',
      v_next_version,
      'Mặc định - phiếu bếp modular',
      80,
      'thermal_vietnamese',
      public.print_template_default_content('kitchen_ticket'),
      false
    )
    RETURNING id INTO v_template_id;
  END IF;

  UPDATE public.print_template_versions
     SET is_active = false
   WHERE tenant_id IS NULL
     AND branch_id IS NULL
     AND kind = 'kitchen_ticket'
     AND id <> v_template_id
     AND is_active = true;

  UPDATE public.print_template_versions
     SET name = 'Mặc định - phiếu bếp modular',
         content = public.print_template_default_content('kitchen_ticket'),
         is_active = true
   WHERE id = v_template_id;
END;
$$;

-- ─── 5. Materializer: pass payload to modular blocks ─────────────────────

CREATE OR REPLACE FUNCTION public.materialize_print_document(
  p_kind TEXT,
  p_payload JSONB,
  p_template_id BIGINT,
  p_template_version INT,
  p_paper_width_mm INT,
  p_font_profile TEXT,
  p_content JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_blocks JSONB;
  v_block JSONB;
  v_type TEXT;
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

    CASE v_type
      WHEN 'text' THEN
        v_out := v_out || jsonb_build_array(
          jsonb_set(
            v_block,
            '{text}',
            to_jsonb(public.print_template_interpolate(v_block->>'text', p_payload)),
            true
          )
        );
      WHEN 'row' THEN
        v_out := v_out || jsonb_build_array(
          jsonb_set(
            jsonb_set(
              v_block,
              '{left}',
              to_jsonb(public.print_template_interpolate(v_block->>'left', p_payload)),
              true
            ),
            '{right}',
            to_jsonb(public.print_template_interpolate(v_block->>'right', p_payload)),
            true
          )
        );
      WHEN 'branchInfo' THEN
        v_out := v_out || jsonb_build_array(
          v_block || jsonb_build_object(
            'branch_name', COALESCE(p_payload->>'branch_name', ''),
            'branch_address', COALESCE(p_payload->>'branch_address', ''),
            'branch_phone', COALESCE(p_payload->>'branch_phone', ''),
            'branch_tax_code', COALESCE(p_payload->>'branch_tax_code', '')
          )
        );
      WHEN 'billMeta' THEN
        v_out := v_out || jsonb_build_array(
          v_block || jsonb_build_object(
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
          v_block || jsonb_build_object('method', p_payload->>'payment_method')
        );
      WHEN 'itemsTable' THEN
        v_out := v_out || jsonb_build_array(
          v_block || jsonb_build_object('items', COALESCE(p_payload->'items', '[]'::jsonb))
        );
      WHEN 'totals' THEN
        v_out := v_out || jsonb_build_array(
          v_block || jsonb_build_object(
            'subtotal', p_payload->'subtotal',
            'tax_amount', COALESCE(p_payload->'tax_amount', p_payload->'vat_amount'),
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
          v_block || jsonb_build_object(
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
          v_block || jsonb_build_object('text', p_payload->>'note')
        );
      WHEN 'paymentQr' THEN
        IF jsonb_typeof(p_payload->'payment_qr') <> 'object'
           OR COALESCE(p_payload#>>'{payment_qr,content}', '') = '' THEN
          CONTINUE;
        END IF;
        v_out := v_out || jsonb_build_array(
          v_block || jsonb_build_object('qr', p_payload->'payment_qr')
        );
      WHEN 'kitchenHeader', 'kitchenMeta', 'kitchenItems', 'kitchenNote',
           'kitchenTicket', 'cancelTicket', 'shiftCloseReport',
           'taxInvoice', 'taxInvoiceMeta', 'taxInvoiceBuyer', 'taxInvoiceLookup' THEN
        v_out := v_out || jsonb_build_array(
          v_block || jsonb_build_object('payload', p_payload)
        );
      ELSE
        v_out := v_out || jsonb_build_array(v_block);
    END CASE;
  END LOOP;

  IF jsonb_array_length(v_out) = 0 THEN
    v_out := jsonb_build_array(
      jsonb_build_object(
        'type',
        CASE
          WHEN p_kind = 'kitchen_ticket' THEN 'kitchenTicket'
          WHEN p_kind = 'cancel_ticket' THEN 'cancelTicket'
          WHEN p_kind = 'shift_close_report' THEN 'shiftCloseReport'
          WHEN p_kind = 'tax_invoice' THEN 'taxInvoice'
          ELSE 'text'
        END,
        'payload', p_payload,
        'text', COALESCE(p_payload->>'kind', p_kind)
      )
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

CREATE OR REPLACE FUNCTION public.print_jobs_attach_document_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.payload IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.job_type NOT IN (
    'receipt',
    'provisional_bill',
    'kitchen_ticket',
    'cancel_ticket',
    'shift_close_report',
    'tax_invoice'
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.payload ? 'document' THEN
      NEW.payload := NEW.payload - 'document' - 'template_version';
      NEW.payload := NEW.payload || jsonb_build_object('document', OLD.payload->'document');
      IF OLD.payload ? 'template_version' THEN
        NEW.payload := NEW.payload || jsonb_build_object(
          'template_version',
          OLD.payload->'template_version'
        );
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.payload ? 'document' THEN
    RETURN NEW;
  END IF;

  BEGIN
    NEW.payload := public.attach_print_document_to_payload(
      NEW.tenant_id,
      NEW.branch_id,
      NEW.job_type,
      NEW.payload
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[print_jobs_attach_document_trigger] template apply failed for tenant=% branch=% job_type=%: %',
      NEW.tenant_id, NEW.branch_id, NEW.job_type, SQLERRM;
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$;

-- ─── 6. Printer upsert RPC: accept connection_type ───────────────────────

DROP FUNCTION IF EXISTS public.upsert_printer_with_routes(
  BIGINT, BIGINT, TEXT, TEXT, TEXT, INT, SMALLINT, TEXT, BOOLEAN, TEXT[], BIGINT[]
);

CREATE OR REPLACE FUNCTION public.upsert_printer_with_routes(
  p_printer_id BIGINT DEFAULT NULL,
  p_branch_id BIGINT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_connection_type TEXT DEFAULT 'lan',
  p_lan_host TEXT DEFAULT NULL,
  p_lan_port INT DEFAULT NULL,
  p_paper_width_mm SMALLINT DEFAULT 80,
  p_code_page TEXT DEFAULT 'CP1258',
  p_is_active BOOLEAN DEFAULT TRUE,
  p_print_types TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_category_ids BIGINT[] DEFAULT ARRAY[]::BIGINT[]
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_tenant_id BIGINT;
  v_claim_branch_id BIGINT;
  v_existing RECORD;
  v_printer_id BIGINT;
  v_print_type TEXT;
  v_category_id BIGINT;
  v_connection_type TEXT := COALESCE(NULLIF(trim(p_connection_type), ''), 'lan');
  v_allowed_print_types TEXT[] := ARRAY[
    'receipt',
    'provisional_bill',
    'shift_close_report',
    'tax_invoice',
    'kitchen_ticket',
    'cancel_ticket'
  ];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  v_tenant_id := public.auth_tenant_id();
  v_claim_branch_id := public.auth_branch_id();

  IF p_branch_id IS NULL OR p_role IS NULL OR p_name IS NULL THEN
    RAISE EXCEPTION 'invalid_printer_payload' USING ERRCODE = '22023';
  END IF;

  IF v_claim_branch_id IS NOT NULL AND v_claim_branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'printer:manage') THEN
    RAISE EXCEPTION 'permission denied: printer:manage' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.branches
  WHERE id = p_branch_id
    AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_role NOT IN ('receipt', 'kitchen_1', 'kitchen_2') THEN
    RAISE EXCEPTION 'invalid printer role' USING ERRCODE = '22023';
  END IF;

  IF v_connection_type NOT IN ('lan', 'bluetooth') THEN
    RAISE EXCEPTION 'invalid printer connection_type' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(trim(COALESCE(p_lan_host, '')), '') IS NULL THEN
    RAISE EXCEPTION 'printer endpoint required' USING ERRCODE = '22023';
  END IF;

  IF p_paper_width_mm NOT IN (58, 80) THEN
    RAISE EXCEPTION 'invalid paper width' USING ERRCODE = '22023';
  END IF;

  FOREACH v_print_type IN ARRAY COALESCE(p_print_types, ARRAY[]::TEXT[])
  LOOP
    IF NOT v_print_type = ANY(v_allowed_print_types) THEN
      RAISE EXCEPTION 'invalid print type: %', v_print_type USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOREACH v_category_id IN ARRAY COALESCE(p_category_ids, ARRAY[]::BIGINT[])
  LOOP
    PERFORM 1
    FROM public.menu_categories
    WHERE id = v_category_id
      AND tenant_id = v_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'category not found: %', v_category_id USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  IF p_printer_id IS NOT NULL THEN
    SELECT id, branch_id, role
    INTO v_existing
    FROM public.printers
    WHERE id = p_printer_id
      AND tenant_id = v_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'printer not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_existing.branch_id <> p_branch_id THEN
      RAISE EXCEPTION 'cannot move printer across branches' USING ERRCODE = '22023';
    END IF;

    UPDATE public.printers
       SET role = p_role,
           name = trim(p_name),
           connection_type = v_connection_type,
           lan_host = trim(p_lan_host),
           lan_port = CASE WHEN v_connection_type = 'lan' THEN COALESCE(p_lan_port, 9100) ELSE NULL END,
           paper_width_mm = p_paper_width_mm,
           code_page = COALESCE(NULLIF(trim(p_code_page), ''), 'CP1258'),
           is_active = COALESCE(p_is_active, TRUE)
     WHERE id = p_printer_id
       AND tenant_id = v_tenant_id
     RETURNING id INTO v_printer_id;
  ELSE
    INSERT INTO public.printers (
      tenant_id,
      branch_id,
      role,
      name,
      connection_type,
      lan_host,
      lan_port,
      paper_width_mm,
      code_page,
      is_active
    ) VALUES (
      v_tenant_id,
      p_branch_id,
      p_role,
      trim(p_name),
      v_connection_type,
      trim(p_lan_host),
      CASE WHEN v_connection_type = 'lan' THEN COALESCE(p_lan_port, 9100) ELSE NULL END,
      p_paper_width_mm,
      COALESCE(NULLIF(trim(p_code_page), ''), 'CP1258'),
      COALESCE(p_is_active, TRUE)
    )
    RETURNING id INTO v_printer_id;
  END IF;

  DELETE FROM public.printer_print_types ppt
  WHERE ppt.tenant_id = v_tenant_id
    AND ppt.branch_id = p_branch_id
    AND ppt.printer_id <> v_printer_id
    AND ppt.print_type = ANY(COALESCE(p_print_types, ARRAY[]::TEXT[]))
    AND ppt.print_type IN ('receipt', 'provisional_bill', 'shift_close_report', 'tax_invoice');

  DELETE FROM public.printer_print_types
  WHERE tenant_id = v_tenant_id
    AND branch_id = p_branch_id
    AND printer_id = v_printer_id;

  INSERT INTO public.printer_print_types (tenant_id, branch_id, printer_id, print_type)
  SELECT v_tenant_id, p_branch_id, v_printer_id, unnest(COALESCE(p_print_types, ARRAY[]::TEXT[]))
  ON CONFLICT (tenant_id, branch_id, printer_id, print_type) DO NOTHING;

  DELETE FROM public.printer_menu_categories
  WHERE tenant_id = v_tenant_id
    AND branch_id = p_branch_id
    AND printer_id = v_printer_id;

  IF COALESCE(array_length(p_category_ids, 1), 0) > 0 THEN
    DELETE FROM public.printer_menu_categories
    WHERE tenant_id = v_tenant_id
      AND branch_id = p_branch_id
      AND category_id = ANY(p_category_ids);

    INSERT INTO public.printer_menu_categories (
      tenant_id,
      branch_id,
      printer_id,
      category_id
    )
    SELECT DISTINCT v_tenant_id, p_branch_id, v_printer_id, x.category_id
    FROM unnest(p_category_ids) AS x(category_id)
    ON CONFLICT (tenant_id, branch_id, category_id) DO UPDATE
      SET printer_id = EXCLUDED.printer_id;
  END IF;

  RETURN v_printer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_printer_with_routes(
  BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, INT, SMALLINT, TEXT, BOOLEAN, TEXT[], BIGINT[]
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_printer_with_routes(
  BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, INT, SMALLINT, TEXT, BOOLEAN, TEXT[], BIGINT[]
) TO authenticated;

COMMENT ON FUNCTION public.upsert_printer_with_routes(
  BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, INT, SMALLINT, TEXT, BOOLEAN, TEXT[], BIGINT[]
) IS 'Upsert a branch printer (LAN or Bluetooth) and its print-type/category routes. Bluetooth endpoint is stored in lan_host as an OS-bound serial device path.';

-- ─── 7. Template editor RPCs: atomic version save / activate ─────────────

CREATE OR REPLACE FUNCTION public.save_print_template_version(
  p_kind TEXT,
  p_scope_branch_id BIGINT DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_paper_width_mm INT DEFAULT 80,
  p_font_profile TEXT DEFAULT 'thermal_vietnamese',
  p_content JSONB DEFAULT NULL,
  p_activate BOOLEAN DEFAULT TRUE
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID;
  v_tenant_id BIGINT;
  v_role TEXT;
  v_next_version INT;
  v_template_id BIGINT;
  v_allowed_kinds TEXT[] := ARRAY[
    'receipt',
    'provisional_bill',
    'kitchen_ticket',
    'cancel_ticket',
    'shift_close_report',
    'tax_invoice'
  ];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  v_tenant_id := public.auth_tenant_id();
  v_role := public.auth_role();

  IF v_role NOT IN ('owner', 'super_manager')
     OR NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'permission denied: settings:tenant' USING ERRCODE = '42501';
  END IF;

  IF NOT p_kind = ANY(v_allowed_kinds) THEN
    RAISE EXCEPTION 'invalid print template kind' USING ERRCODE = '22023';
  END IF;

  IF p_scope_branch_id IS NOT NULL THEN
    PERFORM 1
    FROM public.branches
    WHERE id = p_scope_branch_id
      AND tenant_id = v_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF p_paper_width_mm NOT IN (58, 80) THEN
    RAISE EXCEPTION 'invalid paper width' USING ERRCODE = '22023';
  END IF;

  IF p_content IS NULL
     OR jsonb_typeof(p_content) <> 'object'
     OR jsonb_typeof(p_content->'blocks') <> 'array' THEN
    RAISE EXCEPTION 'invalid print template content' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1
    INTO v_next_version
  FROM public.print_template_versions
  WHERE tenant_id = v_tenant_id
    AND branch_id IS NOT DISTINCT FROM p_scope_branch_id
    AND kind = p_kind;

  IF COALESCE(p_activate, TRUE) THEN
    UPDATE public.print_template_versions
       SET is_active = false,
           updated_by = v_uid,
           updated_at = now()
     WHERE tenant_id = v_tenant_id
       AND branch_id IS NOT DISTINCT FROM p_scope_branch_id
       AND kind = p_kind
       AND is_active = true;
  END IF;

  INSERT INTO public.print_template_versions (
    tenant_id,
    branch_id,
    kind,
    version,
    name,
    paper_width_mm,
    font_profile,
    content,
    is_active,
    created_by,
    updated_by
  )
  VALUES (
    v_tenant_id,
    p_scope_branch_id,
    p_kind,
    v_next_version,
    COALESCE(NULLIF(trim(p_name), ''), 'Mẫu in ' || p_kind || ' v' || v_next_version::TEXT),
    p_paper_width_mm,
    COALESCE(NULLIF(trim(p_font_profile), ''), 'thermal_vietnamese'),
    p_content,
    COALESCE(p_activate, TRUE),
    v_uid,
    v_uid
  )
  RETURNING id INTO v_template_id;

  RETURN v_template_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_print_template_version(
  p_template_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID;
  v_tenant_id BIGINT;
  v_role TEXT;
  v_template RECORD;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  v_tenant_id := public.auth_tenant_id();
  v_role := public.auth_role();

  IF v_role NOT IN ('owner', 'super_manager')
     OR NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'permission denied: settings:tenant' USING ERRCODE = '42501';
  END IF;

  SELECT id, tenant_id, branch_id, kind
    INTO v_template
  FROM public.print_template_versions
  WHERE id = p_template_id
    AND tenant_id = v_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'print template not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.print_template_versions
     SET is_active = false,
         updated_by = v_uid,
         updated_at = now()
   WHERE tenant_id = v_template.tenant_id
     AND branch_id IS NOT DISTINCT FROM v_template.branch_id
     AND kind = v_template.kind
     AND id <> v_template.id
     AND is_active = true;

  UPDATE public.print_template_versions
     SET is_active = true,
         updated_by = v_uid,
         updated_at = now()
   WHERE id = v_template.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.save_print_template_version(TEXT, BIGINT, TEXT, INT, TEXT, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_print_template_version(TEXT, BIGINT, TEXT, INT, TEXT, JSONB, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.activate_print_template_version(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_print_template_version(BIGINT) TO authenticated;

COMMENT ON FUNCTION public.save_print_template_version(TEXT, BIGINT, TEXT, INT, TEXT, JSONB, BOOLEAN) IS
  'Create a new tenant-owned print template version for tenant or branch scope, optionally activating it atomically.';

COMMENT ON FUNCTION public.activate_print_template_version(BIGINT) IS
  'Activate an existing tenant-owned print template version atomically within its kind/scope.';

REVOKE ALL ON FUNCTION public.print_template_default_content(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.materialize_print_document(TEXT, JSONB, BIGINT, INT, INT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_jobs_attach_document_trigger() FROM PUBLIC;
