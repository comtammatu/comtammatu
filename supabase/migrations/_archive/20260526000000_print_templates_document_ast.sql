-- ============================================================================
-- Print templates + immutable document AST snapshot
--
-- Goal:
-- - Template content lives in DB and can be changed without deploying/resetting
--   the print-agent.
-- - Every new print_jobs row receives a payload.document snapshot at enqueue
--   time. Reprints keep the original document/version.
-- - Legacy jobs without payload.document still print through the old agent
--   renderers.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.print_template_versions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id BIGINT REFERENCES public.branches(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'receipt',
      'provisional_bill',
      'kitchen_ticket',
      'cancel_ticket',
      'shift_close_report'
    )
  ),
  version INT NOT NULL CHECK (version > 0),
  name TEXT NOT NULL,
  paper_width_mm INT NOT NULL DEFAULT 80 CHECK (paper_width_mm IN (58, 80)),
  font_profile TEXT NOT NULL DEFAULT 'thermal_vietnamese',
  content JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (tenant_id IS NULL AND branch_id IS NULL)
    OR tenant_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_print_template_versions_scope_version
  ON public.print_template_versions (
    COALESCE(tenant_id, 0),
    COALESCE(branch_id, 0),
    kind,
    version
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_print_template_versions_active_scope
  ON public.print_template_versions (
    COALESCE(tenant_id, 0),
    COALESCE(branch_id, 0),
    kind
  )
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_print_template_versions_resolve
  ON public.print_template_versions (kind, is_active, tenant_id, branch_id, version DESC);

ALTER TABLE public.print_template_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "print_template_versions_select" ON public.print_template_versions;
CREATE POLICY "print_template_versions_select" ON public.print_template_versions
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    OR (
      tenant_id = public.auth_tenant_id()
      AND (
        branch_id IS NULL
        OR public.auth_branch_id() IS NULL
        OR branch_id = public.auth_branch_id()
      )
    )
  );

DROP POLICY IF EXISTS "print_template_versions_insert" ON public.print_template_versions;
CREATE POLICY "print_template_versions_insert" ON public.print_template_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      (
        branch_id IS NULL
        AND public.auth_role() IN ('owner', 'super_manager', 'area_manager')
        AND public.has_permission_any('printer:manage')
      )
      OR (
        branch_id IS NOT NULL
        AND public.has_permission(branch_id, 'printer:manage')
      )
    )
  );

DROP POLICY IF EXISTS "print_template_versions_update" ON public.print_template_versions;
CREATE POLICY "print_template_versions_update" ON public.print_template_versions
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      (
        branch_id IS NULL
        AND public.auth_role() IN ('owner', 'super_manager', 'area_manager')
        AND public.has_permission_any('printer:manage')
      )
      OR (
        branch_id IS NOT NULL
        AND public.has_permission(branch_id, 'printer:manage')
      )
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      (
        branch_id IS NULL
        AND public.auth_role() IN ('owner', 'super_manager', 'area_manager')
        AND public.has_permission_any('printer:manage')
      )
      OR (
        branch_id IS NOT NULL
        AND public.has_permission(branch_id, 'printer:manage')
      )
    )
  );

DROP POLICY IF EXISTS "print_template_versions_delete" ON public.print_template_versions;
CREATE POLICY "print_template_versions_delete" ON public.print_template_versions
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      (
        branch_id IS NULL
        AND public.auth_role() IN ('owner', 'super_manager', 'area_manager')
        AND public.has_permission_any('printer:manage')
      )
      OR (
        branch_id IS NOT NULL
        AND public.has_permission(branch_id, 'printer:manage')
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.print_template_versions TO authenticated;

CREATE OR REPLACE FUNCTION public.set_print_template_versions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_print_template_versions_updated_at
  ON public.print_template_versions;
CREATE TRIGGER trg_print_template_versions_updated_at
  BEFORE INSERT OR UPDATE ON public.print_template_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_print_template_versions_updated_at();

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
          jsonb_build_object('type', 'kitchenTicket')
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
  seed.kind,
  1,
  seed.name,
  80,
  'thermal_vietnamese',
  public.print_template_default_content(seed.kind),
  true
FROM (
  VALUES
    ('receipt', 'Mặc định - hóa đơn thanh toán'),
    ('provisional_bill', 'Mặc định - phiếu tạm tính'),
    ('kitchen_ticket', 'Mặc định - phiếu bếp'),
    ('cancel_ticket', 'Mặc định - phiếu hủy món'),
    ('shift_close_report', 'Mặc định - phiếu chốt ca')
) AS seed(kind, name)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.print_template_versions existing
  WHERE existing.tenant_id IS NULL
    AND existing.branch_id IS NULL
    AND existing.kind = seed.kind
    AND existing.version = 1
);

CREATE OR REPLACE FUNCTION public.resolve_print_template_version(
  p_tenant_id BIGINT,
  p_branch_id BIGINT,
  p_kind TEXT
)
RETURNS TABLE (
  template_id BIGINT,
  template_version INT,
  paper_width_mm INT,
  font_profile TEXT,
  content JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    pt.id,
    pt.version,
    pt.paper_width_mm,
    pt.font_profile,
    pt.content
  FROM public.print_template_versions pt
  WHERE pt.is_active = true
    AND pt.kind = p_kind
    AND (
      (pt.tenant_id = p_tenant_id AND pt.branch_id = p_branch_id)
      OR (pt.tenant_id = p_tenant_id AND pt.branch_id IS NULL)
      OR (pt.tenant_id IS NULL AND pt.branch_id IS NULL)
    )
  ORDER BY
    CASE
      WHEN pt.tenant_id = p_tenant_id AND pt.branch_id = p_branch_id THEN 1
      WHEN pt.tenant_id = p_tenant_id AND pt.branch_id IS NULL THEN 2
      WHEN pt.tenant_id IS NULL AND pt.branch_id IS NULL THEN 3
      ELSE 4
    END,
    pt.version DESC,
    pt.id DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.print_template_interpolate(
  p_text TEXT,
  p_payload JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_text TEXT := COALESCE(p_text, '');
BEGIN
  v_text := replace(v_text, '{{order_number}}', COALESCE(p_payload->>'order_number', ''));
  v_text := replace(v_text, '{{branch_name}}', COALESCE(p_payload->>'branch_name', ''));
  v_text := replace(v_text, '{{cashier_name}}', COALESCE(p_payload->>'cashier_name', ''));
  v_text := replace(v_text, '{{printed_at}}', COALESCE(p_payload->>'printed_at', ''));
  v_text := replace(v_text, '{{total_amount}}', COALESCE(p_payload->>'total_amount', ''));
  RETURN v_text;
END;
$$;

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
            'tax_amount', p_payload->'tax_amount',
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
      WHEN 'kitchenTicket' THEN
        v_out := v_out || jsonb_build_array(
          v_block || jsonb_build_object('payload', p_payload)
        );
      WHEN 'cancelTicket' THEN
        v_out := v_out || jsonb_build_array(
          v_block || jsonb_build_object('payload', p_payload)
        );
      WHEN 'shiftCloseReport' THEN
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

CREATE OR REPLACE FUNCTION public.attach_print_document_to_payload(
  p_tenant_id BIGINT,
  p_branch_id BIGINT,
  p_kind TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_template RECORD;
  v_template_id BIGINT := 0;
  v_template_version INT := 1;
  v_paper_width_mm INT := 80;
  v_font_profile TEXT := 'thermal_vietnamese';
  v_content JSONB := public.print_template_default_content(p_kind);
  v_document JSONB;
BEGIN
  IF p_payload ? 'document' THEN
    RETURN p_payload;
  END IF;

  SELECT *
  INTO v_template
  FROM public.resolve_print_template_version(p_tenant_id, p_branch_id, p_kind);

  IF FOUND THEN
    v_template_id := v_template.template_id;
    v_template_version := v_template.template_version;
    v_paper_width_mm := v_template.paper_width_mm;
    v_font_profile := v_template.font_profile;
    v_content := v_template.content;
  END IF;

  v_document := public.materialize_print_document(
    p_kind,
    p_payload,
    v_template_id,
    v_template_version,
    v_paper_width_mm,
    v_font_profile,
    v_content
  );

  RETURN p_payload || jsonb_build_object(
    'template_version', v_template_id::TEXT || ':' || v_template_version::TEXT,
    'document', v_document
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
    'shift_close_report'
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
    -- Printing must remain best-effort. If a custom template is malformed,
    -- keep the legacy payload so the agent can fall back instead of blocking
    -- payment/send-kitchen flows.
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_print_jobs_attach_document ON public.print_jobs;
CREATE TRIGGER trg_print_jobs_attach_document
  BEFORE INSERT OR UPDATE OF payload ON public.print_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.print_jobs_attach_document_trigger();

COMMENT ON TABLE public.print_template_versions IS
  'Versioned print templates. Editing an active template only affects new print_jobs; existing payload.document snapshots remain immutable.';

COMMENT ON FUNCTION public.attach_print_document_to_payload(BIGINT, BIGINT, TEXT, JSONB) IS
  'Resolve active print template and materialize a schema_version=1 document AST into the print payload.';

REVOKE ALL ON FUNCTION public.set_print_template_versions_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_default_content(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_print_template_version(BIGINT, BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_template_interpolate(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.materialize_print_document(TEXT, JSONB, BIGINT, INT, INT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_print_document_to_payload(BIGINT, BIGINT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.print_jobs_attach_document_trigger() FROM PUBLIC;
