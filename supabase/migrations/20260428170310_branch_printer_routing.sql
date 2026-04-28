-- ============================================================================
-- Branch-scoped printer routing
--
-- Problem:
-- `menu_categories.kitchen_printer` is tenant-wide, so one menu category decides
-- the kitchen printer for every branch. Real branches have different floor and
-- kitchen layouts, so printer routing must live on each branch's printer setup.
--
-- New source of truth:
-- - printer_print_types: which document/ticket types each branch printer handles
-- - printer_menu_categories: which menu categories each branch kitchen printer handles
--
-- The legacy menu_categories.kitchen_printer column is left in place for
-- compatibility, but no new print routing code should read it.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'printers_id_tenant_branch_unique'
      AND conrelid = 'public.printers'::regclass
  ) THEN
    ALTER TABLE public.printers
      ADD CONSTRAINT printers_id_tenant_branch_unique
      UNIQUE (id, tenant_id, branch_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.printer_print_types (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  printer_id BIGINT NOT NULL,
  print_type TEXT NOT NULL CHECK (
    print_type IN (
      'receipt',
      'provisional_bill',
      'shift_close_report',
      'kitchen_ticket',
      'cancel_ticket'
    )
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, printer_id, print_type),
  FOREIGN KEY (printer_id, tenant_id, branch_id)
    REFERENCES public.printers(id, tenant_id, branch_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_printer_print_types_branch_type
  ON public.printer_print_types (tenant_id, branch_id, print_type);

CREATE TABLE IF NOT EXISTS public.printer_menu_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  printer_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL REFERENCES public.menu_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, category_id),
  UNIQUE (tenant_id, branch_id, printer_id, category_id),
  FOREIGN KEY (printer_id, tenant_id, branch_id)
    REFERENCES public.printers(id, tenant_id, branch_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_printer_menu_categories_printer
  ON public.printer_menu_categories (tenant_id, branch_id, printer_id);

ALTER TABLE public.printer_print_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.printer_menu_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "printer_print_types_select" ON public.printer_print_types;
CREATE POLICY "printer_print_types_select" ON public.printer_print_types
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_branch_id() IS NULL
      OR branch_id = public.auth_branch_id()
    )
  );

DROP POLICY IF EXISTS "printer_print_types_insert" ON public.printer_print_types;
CREATE POLICY "printer_print_types_insert" ON public.printer_print_types
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'printer:manage')
  );

DROP POLICY IF EXISTS "printer_print_types_update" ON public.printer_print_types;
CREATE POLICY "printer_print_types_update" ON public.printer_print_types
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'printer:manage')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'printer:manage')
  );

DROP POLICY IF EXISTS "printer_print_types_delete" ON public.printer_print_types;
CREATE POLICY "printer_print_types_delete" ON public.printer_print_types
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'printer:manage')
  );

DROP POLICY IF EXISTS "printer_menu_categories_select" ON public.printer_menu_categories;
CREATE POLICY "printer_menu_categories_select" ON public.printer_menu_categories
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_branch_id() IS NULL
      OR branch_id = public.auth_branch_id()
    )
  );

DROP POLICY IF EXISTS "printer_menu_categories_insert" ON public.printer_menu_categories;
CREATE POLICY "printer_menu_categories_insert" ON public.printer_menu_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'printer:manage')
  );

DROP POLICY IF EXISTS "printer_menu_categories_update" ON public.printer_menu_categories;
CREATE POLICY "printer_menu_categories_update" ON public.printer_menu_categories
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'printer:manage')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'printer:manage')
  );

DROP POLICY IF EXISTS "printer_menu_categories_delete" ON public.printer_menu_categories;
CREATE POLICY "printer_menu_categories_delete" ON public.printer_menu_categories
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission(branch_id, 'printer:manage')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.printer_print_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.printer_menu_categories TO authenticated;

-- Seed old role-based behavior into the new branch-scoped routing tables.
INSERT INTO public.printer_print_types (tenant_id, branch_id, printer_id, print_type)
SELECT p.tenant_id, p.branch_id, p.id, x.print_type
FROM public.printers p
CROSS JOIN LATERAL (
  VALUES ('receipt'), ('provisional_bill'), ('shift_close_report')
) AS x(print_type)
WHERE p.role = 'receipt'
ON CONFLICT (tenant_id, branch_id, printer_id, print_type) DO NOTHING;

INSERT INTO public.printer_print_types (tenant_id, branch_id, printer_id, print_type)
SELECT p.tenant_id, p.branch_id, p.id, x.print_type
FROM public.printers p
CROSS JOIN LATERAL (
  VALUES ('kitchen_ticket'), ('cancel_ticket')
) AS x(print_type)
WHERE p.role IN ('kitchen_1', 'kitchen_2')
ON CONFLICT (tenant_id, branch_id, printer_id, print_type) DO NOTHING;

INSERT INTO public.printer_menu_categories (tenant_id, branch_id, printer_id, category_id)
SELECT p.tenant_id, p.branch_id, p.id, mc.id
FROM public.printers p
JOIN public.menu_categories mc
  ON mc.tenant_id = p.tenant_id
WHERE p.role = 'kitchen_' || mc.kitchen_printer::TEXT
ON CONFLICT (tenant_id, branch_id, category_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.resolve_branch_printer_for_type(
  p_tenant_id BIGINT,
  p_branch_id BIGINT,
  p_print_type TEXT
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
    AND p_tenant_id = public.auth_tenant_id()
    AND (
      public.auth_branch_id() IS NULL
      OR p_branch_id = public.auth_branch_id()
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

REVOKE ALL ON FUNCTION public.resolve_branch_printer_for_type(BIGINT, BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_branch_printer_for_type(BIGINT, BIGINT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_printer_with_routes(
  p_printer_id BIGINT DEFAULT NULL,
  p_branch_id BIGINT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_connection_type TEXT DEFAULT NULL,
  p_lan_host TEXT DEFAULT NULL,
  p_lan_port INT DEFAULT NULL,
  p_usb_vendor_id TEXT DEFAULT NULL,
  p_usb_product_id TEXT DEFAULT NULL,
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
  v_allowed_print_types TEXT[] := ARRAY[
    'receipt',
    'provisional_bill',
    'shift_close_report',
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

  IF p_branch_id IS NULL OR p_role IS NULL OR p_name IS NULL OR p_connection_type IS NULL THEN
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

  IF p_connection_type NOT IN ('lan', 'usb') THEN
    RAISE EXCEPTION 'invalid connection type' USING ERRCODE = '22023';
  END IF;

  IF p_connection_type = 'lan' AND NULLIF(trim(COALESCE(p_lan_host, '')), '') IS NULL THEN
    RAISE EXCEPTION 'lan host required' USING ERRCODE = '22023';
  END IF;

  IF p_connection_type = 'usb' AND NULLIF(trim(COALESCE(p_usb_vendor_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'usb vendor id required' USING ERRCODE = '22023';
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

  IF COALESCE(array_length(p_category_ids, 1), 0) > 0
     AND p_role NOT IN ('kitchen_1', 'kitchen_2') THEN
    RAISE EXCEPTION 'categories can only be assigned to kitchen printers' USING ERRCODE = '22023';
  END IF;

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
           connection_type = p_connection_type,
           lan_host = CASE WHEN p_connection_type = 'lan' THEN trim(p_lan_host) ELSE NULL END,
           lan_port = CASE WHEN p_connection_type = 'lan' THEN COALESCE(p_lan_port, 9100) ELSE NULL END,
           usb_vendor_id = CASE WHEN p_connection_type = 'usb' THEN trim(p_usb_vendor_id) ELSE NULL END,
           usb_product_id = CASE WHEN p_connection_type = 'usb' THEN NULLIF(trim(COALESCE(p_usb_product_id, '')), '') ELSE NULL END,
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
      usb_vendor_id,
      usb_product_id,
      paper_width_mm,
      code_page,
      is_active
    ) VALUES (
      v_tenant_id,
      p_branch_id,
      p_role,
      trim(p_name),
      p_connection_type,
      CASE WHEN p_connection_type = 'lan' THEN trim(p_lan_host) ELSE NULL END,
      CASE WHEN p_connection_type = 'lan' THEN COALESCE(p_lan_port, 9100) ELSE NULL END,
      CASE WHEN p_connection_type = 'usb' THEN trim(p_usb_vendor_id) ELSE NULL END,
      CASE WHEN p_connection_type = 'usb' THEN NULLIF(trim(COALESCE(p_usb_product_id, '')), '') ELSE NULL END,
      p_paper_width_mm,
      COALESCE(NULLIF(trim(p_code_page), ''), 'CP1258'),
      COALESCE(p_is_active, TRUE)
    )
    RETURNING id INTO v_printer_id;
  END IF;

  -- Keep non-kitchen document routing unambiguous per branch: assigning one of
  -- these types to this printer removes that type from other branch printers.
  DELETE FROM public.printer_print_types ppt
  WHERE ppt.tenant_id = v_tenant_id
    AND ppt.branch_id = p_branch_id
    AND ppt.printer_id <> v_printer_id
    AND ppt.print_type = ANY(COALESCE(p_print_types, ARRAY[]::TEXT[]))
    AND ppt.print_type IN ('receipt', 'provisional_bill', 'shift_close_report');

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
  BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, TEXT, SMALLINT, TEXT, BOOLEAN, TEXT[], BIGINT[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_printer_with_routes(
  BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, TEXT, SMALLINT, TEXT, BOOLEAN, TEXT[], BIGINT[]
) TO authenticated;

-- Kitchen print: group unsent order items by the branch-specific printer that
-- owns their menu category. Unassigned categories do not print and are not
-- marked sent_to_kitchen_at.
CREATE OR REPLACE FUNCTION public.enqueue_kitchen_print(
  p_order_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID;
  v_order           public.orders%ROWTYPE;
  v_table_no        INT;
  v_send_seq        INT;
  v_route           RECORD;
  v_payload         JSONB;
  v_idempotency     TEXT;
  v_job_id          BIGINT;
  v_jobs            JSONB := '[]'::jsonb;
  v_mapped_pending  INT;
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

  IF NOT public.has_permission_any('pos:send_kitchen') THEN
    RAISE EXCEPTION 'permission denied: pos:send_kitchen' USING ERRCODE = '42501';
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT COUNT(*)
  INTO v_mapped_pending
  FROM public.order_items oi
  JOIN public.menu_items mi ON mi.id = oi.menu_item_id
  JOIN public.printer_menu_categories pmc
    ON pmc.category_id = mi.category_id
   AND pmc.tenant_id = v_order.tenant_id
   AND pmc.branch_id = v_order.branch_id
  WHERE oi.order_id = p_order_id
    AND oi.sent_to_kitchen_at IS NULL;

  IF v_mapped_pending = 0 THEN
    RETURN jsonb_build_object(
      'order_id', p_order_id,
      'send_seq', v_order.kitchen_send_count,
      'jobs', v_jobs
    );
  END IF;

  UPDATE public.orders
     SET kitchen_send_count = kitchen_send_count + 1
   WHERE id = p_order_id
   RETURNING kitchen_send_count INTO v_send_seq;

  FOR v_route IN
    SELECT
      p.id AS printer_id,
      CASE WHEN p.role = 'kitchen_2' THEN 2 ELSE 1 END AS slot,
      array_agg(oi.id ORDER BY oi.id) AS item_ids,
      jsonb_agg(
        jsonb_build_object(
          'item_name',    oi.item_name,
          'variant_name', oi.variant_name,
          'quantity',     oi.quantity,
          'modifiers',    oi.modifiers,
          'sides',        oi.sides,
          'note',         oi.note
        )
        ORDER BY oi.id
      ) AS items
    FROM public.order_items oi
    JOIN public.menu_items mi ON mi.id = oi.menu_item_id
    JOIN public.printer_menu_categories pmc
      ON pmc.category_id = mi.category_id
     AND pmc.tenant_id = v_order.tenant_id
     AND pmc.branch_id = v_order.branch_id
    JOIN public.printers p
      ON p.id = pmc.printer_id
     AND p.tenant_id = pmc.tenant_id
     AND p.branch_id = pmc.branch_id
     AND p.is_active = TRUE
    JOIN public.printer_print_types ppt
      ON ppt.printer_id = p.id
     AND ppt.tenant_id = p.tenant_id
     AND ppt.branch_id = p.branch_id
     AND ppt.print_type = 'kitchen_ticket'
    WHERE oi.order_id = p_order_id
      AND oi.sent_to_kitchen_at IS NULL
    GROUP BY p.id, p.role
    ORDER BY p.role, p.id
  LOOP
    v_payload := jsonb_build_object(
      'kind',         'kitchen_ticket',
      'order_number', v_order.order_number,
      'order_type',   v_order.order_type,
      'table_number', v_table_no,
      'send_seq',     v_send_seq,
      'slot',         v_route.slot,
      'note',         v_order.note,
      'items',        v_route.items,
      'printed_at',   to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
                              'YYYY-MM-DD"T"HH24:MI:SS')
    );

    v_idempotency := 'order:' || p_order_id::TEXT
      || ':kitchen:printer:' || v_route.printer_id::TEXT
      || ':send:' || v_send_seq::TEXT;

    INSERT INTO public.print_jobs (
      tenant_id, branch_id, printer_id, job_type,
      order_id, payload, idempotency_key, created_by
    )
    VALUES (
      v_order.tenant_id, v_order.branch_id, v_route.printer_id, 'kitchen_ticket',
      p_order_id, v_payload, v_idempotency, v_uid
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;

    IF v_job_id IS NULL THEN
      SELECT id INTO v_job_id FROM public.print_jobs
      WHERE idempotency_key = v_idempotency;
    END IF;

    UPDATE public.order_items
       SET sent_to_kitchen_at = now()
     WHERE id = ANY(v_route.item_ids)
       AND sent_to_kitchen_at IS NULL;

    v_jobs := v_jobs || jsonb_build_object(
      'slot', v_route.slot,
      'printer_id', v_route.printer_id,
      'job_id', v_job_id,
      'item_count', jsonb_array_length(v_route.items)
    );
  END LOOP;

  IF jsonb_array_length(v_jobs) = 0 THEN
    RAISE EXCEPTION 'no active kitchen printer for branch %', v_order.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'send_seq', v_send_seq,
    'jobs', v_jobs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_kitchen_print(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_kitchen_print(BIGINT) TO authenticated;

-- Receipt print now follows branch printer document assignments instead of
-- assuming every branch has exactly one role='receipt' printer that handles all
-- receipt-like documents.
CREATE OR REPLACE FUNCTION public.enqueue_receipt_print(
  p_order_id       bigint,
  p_cash_received  numeric DEFAULT NULL,
  p_cash_change    numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          UUID;
  v_order        public.orders%ROWTYPE;
  v_branch       public.branches%ROWTYPE;
  v_table_no     INT;
  v_printer_id   BIGINT;
  v_cashier_name TEXT;
  v_branch_tax   TEXT;
  v_items        JSONB;
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

  IF NOT (
    public.has_permission_any('pos:print')
    OR public.has_permission_any('pos:reprint_receipt')
  ) THEN
    RAISE EXCEPTION 'permission denied: pos:print' USING ERRCODE = '42501';
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

  SELECT jsonb_agg(
    jsonb_build_object(
      'item_name',    oi.item_name,
      'variant_name', oi.variant_name,
      'quantity',     oi.quantity,
      'unit_price',   oi.unit_price,
      'modifiers',    oi.modifiers,
      'sides',        oi.sides,
      'subtotal',     oi.subtotal,
      'note',         oi.note
    )
    ORDER BY oi.id
  )
  INTO v_items
  FROM public.order_items oi
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
    'customer_count',   v_order.customer_count,
    'cashier_name',     COALESCE(v_cashier_name, ''),
    'note',             v_order.note,
    'items',            COALESCE(v_items, '[]'::jsonb),
    'subtotal',         v_order.subtotal,
    'tax_amount',       v_order.tax_amount,
    'service_charge',   v_order.service_charge,
    'discount_amount',  v_order.discount_amount,
    'total_amount',     v_order.total_amount,
    'payment_method',   v_order.payment_method,
    'cash_received',    p_cash_received,
    'cash_change',      p_cash_change,
    'created_at',       to_char(v_order.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS'),
    'printed_at',       to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || p_order_id::TEXT
    || ':receipt:' || extract(epoch from v_now)::BIGINT::TEXT;

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  )
  VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'receipt',
    p_order_id, v_payload, v_idempotency, v_uid
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'order_id',   p_order_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.enqueue_receipt_print(bigint, numeric, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_provisional_bill(
  p_order_id         bigint,
  p_qr_content       text DEFAULT NULL,
  p_qr_header_label  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  SELECT jsonb_agg(
    jsonb_build_object(
      'item_name',    oi.item_name,
      'variant_name', oi.variant_name,
      'quantity',     oi.quantity,
      'unit_price',   oi.unit_price,
      'modifiers',    oi.modifiers,
      'sides',        oi.sides,
      'subtotal',     oi.subtotal,
      'note',         oi.note
    )
    ORDER BY oi.id
  )
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled';

  v_payload := jsonb_build_object(
    'kind',             'provisional_bill',
    'branch_name',      COALESCE(v_branch.name, ''),
    'branch_address',   COALESCE(v_branch.address, ''),
    'branch_phone',     COALESCE(v_branch.phone, ''),
    'branch_tax_code',  COALESCE(v_branch_tax, ''),
    'order_number',     v_order.order_number,
    'order_type',       v_order.order_type,
    'table_number',     v_table_no,
    'customer_count',   v_order.customer_count,
    'cashier_name',     COALESCE(v_cashier_name, ''),
    'note',             v_order.note,
    'items',            COALESCE(v_items, '[]'::jsonb),
    'subtotal',         v_order.subtotal,
    'tax_amount',       v_order.tax_amount,
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
$function$;

GRANT EXECUTE ON FUNCTION public.enqueue_provisional_bill(bigint, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_shift_close_print(
  p_session_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid             UUID;
  v_session         RECORD;
  v_branch          public.branches%ROWTYPE;
  v_cashier_name    TEXT;
  v_approver_name   TEXT;
  v_branch_tax      TEXT;
  v_printer_id      BIGINT;
  v_breakdown       JSONB;
  v_total_revenue   NUMERIC(15,2);
  v_payload         JSONB;
  v_idempotency     TEXT;
  v_job_id          BIGINT;
  v_now             TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, tenant_id, branch_id, status, opening_cash, closing_cash,
         expected_cash, cash_difference, opened_at, closed_at, closed_by,
         note, variance_approval_note, variance_approver_user_id
  INTO v_session
  FROM public.pos_sessions
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_session.status <> 'closed' THEN
    RAISE EXCEPTION 'session not closed yet' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_permission_any('pos:close_shift') THEN
    RAISE EXCEPTION 'permission denied: pos:close_shift' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_branch FROM public.branches WHERE id = v_session.branch_id;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_session.closed_by;

  IF v_session.variance_approver_user_id IS NOT NULL THEN
    SELECT full_name INTO v_approver_name
    FROM public.profiles WHERE id = v_session.variance_approver_user_id;
  END IF;

  SELECT value INTO v_branch_tax
  FROM public.system_settings
  WHERE tenant_id = v_session.tenant_id AND key = 'branch_tax_code';

  v_printer_id := public.resolve_branch_printer_for_type(
    v_session.tenant_id,
    v_session.branch_id,
    'shift_close_report'
  );

  IF v_printer_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_printer');
  END IF;

  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'method',  payment_method,
      'count',   cnt,
      'amount',  amount
    ) ORDER BY payment_method), '[]'::jsonb),
    COALESCE(SUM(amount), 0)
  INTO v_breakdown, v_total_revenue
  FROM (
    SELECT
      COALESCE(payment_method, 'unknown') AS payment_method,
      COUNT(*) AS cnt,
      SUM(total_amount) AS amount
    FROM public.orders
    WHERE pos_session_id = p_session_id
      AND payment_status = 'paid'
      AND status <> 'cancelled'
    GROUP BY payment_method
  ) AS grp;

  v_payload := jsonb_build_object(
    'kind',                  'shift_close_report',
    'branch_name',           COALESCE(v_branch.name, ''),
    'branch_address',        COALESCE(v_branch.address, ''),
    'branch_phone',          COALESCE(v_branch.phone, ''),
    'branch_tax_code',       COALESCE(v_branch_tax, ''),
    'session_id',            p_session_id,
    'cashier_name',          COALESCE(v_cashier_name, ''),
    'opened_at',             to_char(v_session.opened_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                     'YYYY-MM-DD"T"HH24:MI:SS'),
    'closed_at',             to_char(v_session.closed_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                     'YYYY-MM-DD"T"HH24:MI:SS'),
    'opening_cash',          v_session.opening_cash,
    'closing_cash',          v_session.closing_cash,
    'expected_cash',         v_session.expected_cash,
    'cash_difference',       v_session.cash_difference,
    'note',                  v_session.note,
    'variance_note',         v_session.variance_approval_note,
    'variance_approver',     v_approver_name,
    'paid_order_count',      (
      SELECT COUNT(*) FROM public.orders
       WHERE pos_session_id = p_session_id
         AND payment_status = 'paid'
         AND status <> 'cancelled'
    ),
    'unpaid_order_count',    (
      SELECT COUNT(*) FROM public.orders
       WHERE pos_session_id = p_session_id
         AND payment_status <> 'paid'
         AND status <> 'cancelled'
    ),
    'cancelled_order_count', (
      SELECT COUNT(*) FROM public.orders
       WHERE pos_session_id = p_session_id
         AND status = 'cancelled'
    ),
    'payment_breakdown',     v_breakdown,
    'total_revenue',         v_total_revenue,
    'printed_at',            to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                     'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'session:' || p_session_id::TEXT || ':shift_close';

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  ) VALUES (
    v_session.tenant_id, v_session.branch_id, v_printer_id, 'shift_close_report',
    NULL, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    payload = EXCLUDED.payload,
    status  = CASE WHEN public.print_jobs.status IN ('failed', 'expired')
                   THEN 'pending' ELSE public.print_jobs.status END,
    last_error = NULL,
    claimed_by_agent = NULL,
    claimed_at = NULL
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'job_id',     v_job_id,
    'printer_id', v_printer_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_shift_close_print(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_shift_close_print(BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_cancel_ticket_print(
  p_order_item_id BIGINT,
  p_reason        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid           UUID;
  v_item          public.order_items%ROWTYPE;
  v_order         public.orders%ROWTYPE;
  v_table_no      INT;
  v_slot          SMALLINT;
  v_printer_id    BIGINT;
  v_category_id   BIGINT;
  v_voided_by     TEXT;
  v_flag_enabled  TEXT;
  v_items_payload JSONB;
  v_payload       JSONB;
  v_idempotency   TEXT;
  v_job_id        BIGINT;
  v_now           TIMESTAMPTZ := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('pos:send_kitchen') THEN
    RAISE EXCEPTION 'permission denied: pos:send_kitchen' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_cancel_ticket_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'feature_disabled');
  END IF;

  IF v_item.sent_to_kitchen_at IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_sent');
  END IF;

  SELECT mi.category_id INTO v_category_id
  FROM public.menu_items mi
  WHERE mi.id = v_item.menu_item_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.printer_menu_categories pmc
    WHERE pmc.tenant_id = v_order.tenant_id
      AND pmc.branch_id = v_order.branch_id
      AND pmc.category_id = v_category_id
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_slot');
  END IF;

  SELECT p.id, CASE WHEN p.role = 'kitchen_2' THEN 2 ELSE 1 END
  INTO v_printer_id, v_slot
  FROM public.printer_menu_categories pmc
  JOIN public.printers p
    ON p.id = pmc.printer_id
   AND p.tenant_id = pmc.tenant_id
   AND p.branch_id = pmc.branch_id
   AND p.is_active = TRUE
  JOIN public.printer_print_types ppt
    ON ppt.printer_id = p.id
   AND ppt.tenant_id = p.tenant_id
   AND ppt.branch_id = p.branch_id
   AND ppt.print_type = 'cancel_ticket'
  WHERE pmc.tenant_id = v_order.tenant_id
    AND pmc.branch_id = v_order.branch_id
    AND pmc.category_id = v_category_id
  ORDER BY p.id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_printer');
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_voided_by
  FROM public.profiles WHERE id = v_uid;

  v_items_payload := jsonb_build_array(jsonb_build_object(
    'item_name',    v_item.item_name,
    'variant_name', v_item.variant_name,
    'quantity',     v_item.quantity,
    'modifiers',    v_item.modifiers,
    'sides',        v_item.sides
  ));

  v_payload := jsonb_build_object(
    'kind',          'cancel_ticket',
    'order_number',  v_order.order_number,
    'order_type',    v_order.order_type,
    'table_number',  v_table_no,
    'slot',          v_slot,
    'items',         v_items_payload,
    'reason',        COALESCE(NULLIF(trim(p_reason), ''), v_item.cancel_reason, ''),
    'voided_by',     COALESCE(v_voided_by, ''),
    'printed_at',    to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                             'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || v_order.id::TEXT
    || ':cancel:' || p_order_item_id::TEXT;

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  ) VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'cancel_ticket',
    v_order.id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'job_id',     v_job_id,
    'printer_id', v_printer_id,
    'slot',       v_slot
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_cancel_ticket_print(BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_cancel_ticket_print(BIGINT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_partial_cancel_ticket_print(
  p_order_item_id BIGINT,
  p_old_quantity  INT,
  p_new_quantity  INT,
  p_reason        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID;
  v_item            public.order_items%ROWTYPE;
  v_order           public.orders%ROWTYPE;
  v_table_no        INT;
  v_slot            SMALLINT;
  v_printer_id      BIGINT;
  v_category_id     BIGINT;
  v_voided_by       TEXT;
  v_flag_enabled    TEXT;
  v_items_payload   JSONB;
  v_payload         JSONB;
  v_idempotency     TEXT;
  v_job_id          BIGINT;
  v_now             TIMESTAMPTZ := now();
  v_reason_prefixed TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission_any('pos:send_kitchen') THEN
    RAISE EXCEPTION 'permission denied: pos:send_kitchen' USING ERRCODE = '42501';
  END IF;

  SELECT value INTO v_flag_enabled
  FROM public.system_settings
  WHERE tenant_id = v_order.tenant_id AND key = 'pos_reduce_qty_enabled';
  IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'feature_disabled');
  END IF;

  IF v_item.sent_to_kitchen_at IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_sent');
  END IF;

  IF p_new_quantity >= p_old_quantity THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_reduction');
  END IF;

  SELECT mi.category_id INTO v_category_id
  FROM public.menu_items mi
  WHERE mi.id = v_item.menu_item_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.printer_menu_categories pmc
    WHERE pmc.tenant_id = v_order.tenant_id
      AND pmc.branch_id = v_order.branch_id
      AND pmc.category_id = v_category_id
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_slot');
  END IF;

  SELECT p.id, CASE WHEN p.role = 'kitchen_2' THEN 2 ELSE 1 END
  INTO v_printer_id, v_slot
  FROM public.printer_menu_categories pmc
  JOIN public.printers p
    ON p.id = pmc.printer_id
   AND p.tenant_id = pmc.tenant_id
   AND p.branch_id = pmc.branch_id
   AND p.is_active = TRUE
  JOIN public.printer_print_types ppt
    ON ppt.printer_id = p.id
   AND ppt.tenant_id = p.tenant_id
   AND ppt.branch_id = p.branch_id
   AND ppt.print_type = 'cancel_ticket'
  WHERE pmc.tenant_id = v_order.tenant_id
    AND pmc.branch_id = v_order.branch_id
    AND pmc.category_id = v_category_id
  ORDER BY p.id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_printer');
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_voided_by
  FROM public.profiles WHERE id = v_uid;

  v_items_payload := jsonb_build_array(jsonb_build_object(
    'item_name',     v_item.item_name,
    'variant_name',  v_item.variant_name,
    'quantity',      p_old_quantity - p_new_quantity,
    'modifiers',     v_item.modifiers,
    'sides',         v_item.sides
  ));

  v_reason_prefixed := 'GIAM SL ' || p_old_quantity::TEXT
    || ' -> ' || p_new_quantity::TEXT
    || ': ' || COALESCE(NULLIF(trim(p_reason), ''), '');

  v_payload := jsonb_build_object(
    'kind',          'cancel_ticket',
    'order_number',  v_order.order_number,
    'order_type',    v_order.order_type,
    'table_number',  v_table_no,
    'slot',          v_slot,
    'items',         v_items_payload,
    'reason',        v_reason_prefixed,
    'voided_by',     COALESCE(v_voided_by, ''),
    'printed_at',    to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                             'YYYY-MM-DD"T"HH24:MI:SS')
  );

  v_idempotency := 'order:' || v_order.id::TEXT
    || ':reduce:' || p_order_item_id::TEXT
    || ':' || p_old_quantity::TEXT || '->' || p_new_quantity::TEXT;

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  ) VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, 'cancel_ticket',
    v_order.id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'job_id',     v_job_id,
    'printer_id', v_printer_id,
    'slot',       v_slot
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_partial_cancel_ticket_print(BIGINT, INT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_partial_cancel_ticket_print(BIGINT, INT, INT, TEXT) TO authenticated;

COMMENT ON TABLE public.printer_print_types IS
  'Branch printer routing: document/ticket types handled by each printer.';

COMMENT ON TABLE public.printer_menu_categories IS
  'Branch printer routing: menu categories handled by each branch kitchen printer.';

COMMENT ON FUNCTION public.enqueue_kitchen_print(BIGINT) IS
  'Enqueue kitchen tickets using branch-scoped printer_menu_categories, not tenant-wide menu_categories.kitchen_printer.';
