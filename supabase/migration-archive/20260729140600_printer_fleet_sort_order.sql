-- P1 printer fleet: drop 3-slot role topology, add sort_order routing.

ALTER TABLE public.printers
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

UPDATE public.printers
   SET sort_order = CASE role
     WHEN 'receipt' THEN 0
     WHEN 'kitchen_1' THEN 1
     WHEN 'kitchen_2' THEN 2
     ELSE 9
   END
 WHERE sort_order = 0;

-- Resolve duplicate names before unique constraint (keep lowest id, suffix others).
WITH ranked AS (
  SELECT id,
         tenant_id,
         branch_id,
         name,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, branch_id, lower(trim(name))
           ORDER BY id
         ) AS rn
  FROM public.printers
)
UPDATE public.printers p
   SET name = p.name || ' (' || ranked.rn::text || ')'
  FROM ranked
 WHERE p.id = ranked.id
   AND ranked.rn > 1;

ALTER TABLE public.printers DROP CONSTRAINT IF EXISTS printers_role_check;

ALTER TABLE public.printers DROP CONSTRAINT IF EXISTS printers_branch_id_role_tenant_id_key;

ALTER TABLE public.printers
  ADD CONSTRAINT printers_tenant_branch_name_key
  UNIQUE (tenant_id, branch_id, name);

-- public.resolve_branch_printer_for_type
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
  ORDER BY p.sort_order, p.id
  LIMIT 1;
$$;

-- public.upsert_printer_with_routes
CREATE OR REPLACE FUNCTION public.upsert_printer_with_routes(p_printer_id bigint DEFAULT NULL::bigint, p_branch_id bigint DEFAULT NULL::bigint, p_role text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_lan_host text DEFAULT NULL::text, p_lan_port integer DEFAULT NULL::integer, p_paper_width_mm smallint DEFAULT 80, p_code_page text DEFAULT 'CP1258'::text, p_is_active boolean DEFAULT true, p_print_types text[] DEFAULT ARRAY[]::text[], p_category_ids bigint[] DEFAULT ARRAY[]::bigint[]) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid UUID;
  v_tenant_id BIGINT;
  v_claim_branch_id BIGINT;
  v_existing RECORD;
  v_printer_id BIGINT;
  v_print_type TEXT;
  v_category_id BIGINT;
  v_role TEXT;
  v_sort_order INT;
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

  IF p_branch_id IS NULL OR p_name IS NULL THEN
    RAISE EXCEPTION 'invalid_printer_payload' USING ERRCODE = '22023';
  END IF;

  IF v_claim_branch_id IS NOT NULL AND v_claim_branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'branch mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_permission(p_branch_id, 'printer:manage') THEN
    RAISE EXCEPTION 'permission denied: printer:manage' USING ERRCODE = '42501';
  END IF;

  v_role := COALESCE(NULLIF(trim(COALESCE(p_role, '')), ''), 'custom');

  PERFORM 1
  FROM public.branches
  WHERE id = p_branch_id
    AND tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch not found' USING ERRCODE = 'P0002';
  END IF;

IF NULLIF(trim(COALESCE(p_lan_host, '')), '') IS NULL THEN
    RAISE EXCEPTION 'lan host required' USING ERRCODE = '22023';
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
       SET role = v_role,
           name = trim(p_name),
           connection_type = 'lan',
           lan_host = trim(p_lan_host),
           lan_port = COALESCE(p_lan_port, 9100),
           paper_width_mm = p_paper_width_mm,
           code_page = COALESCE(NULLIF(trim(p_code_page), ''), 'CP1258'),
           is_active = COALESCE(p_is_active, TRUE)
     WHERE id = p_printer_id
       AND tenant_id = v_tenant_id
     RETURNING id INTO v_printer_id;
  ELSE
    SELECT COALESCE(MAX(sort_order), -1) + 1
      INTO v_sort_order
      FROM public.printers
     WHERE tenant_id = v_tenant_id
       AND branch_id = p_branch_id;

    INSERT INTO public.printers (
      tenant_id,
      branch_id,
      role,
      name,
      sort_order,
      connection_type,
      lan_host,
      lan_port,
      paper_width_mm,
      code_page,
      is_active
    ) VALUES (
      v_tenant_id,
      p_branch_id,
      v_role,
      trim(p_name),
      v_sort_order,
      'lan',
      trim(p_lan_host),
      COALESCE(p_lan_port, 9100),
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

-- public.enqueue_cancel_ticket_print
CREATE OR REPLACE FUNCTION public.enqueue_cancel_ticket_print(p_order_item_id bigint, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

  SELECT p.id, (p.sort_order + 1)::smallint
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
    'sides',        v_item.sides,
    'note',         v_item.note
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

-- public.enqueue_edit_pending_order_item_quantity_print
CREATE OR REPLACE FUNCTION public.enqueue_edit_pending_order_item_quantity_print(p_order_item_id bigint, p_old_quantity integer, p_new_quantity integer, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_uid             UUID;
  v_item            public.order_items%ROWTYPE;
  v_order           public.orders%ROWTYPE;
  v_table_no        INT;
  v_slot            SMALLINT;
  v_printer_id      BIGINT;
  v_category_id     BIGINT;
  v_staff_name      TEXT;
  v_flag_enabled    TEXT;
  v_delta           INT;
  v_print_type      TEXT;
  v_items_payload   JSONB;
  v_payload         JSONB;
  v_idempotency     TEXT;
  v_job_id          BIGINT;
  v_now             TIMESTAMPTZ := now();
  v_change_note     TEXT;
  v_item_note       TEXT;
  v_event_token     TEXT;
  v_batch_ticket_number TEXT;
  v_batch_send_seq      INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_old_quantity IS NULL OR p_new_quantity IS NULL
     OR p_old_quantity < 1 OR p_new_quantity < 1
  THEN
    RAISE EXCEPTION 'quantity must be >= 1' USING ERRCODE = '22023';
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

  IF v_item.sent_to_kitchen_at IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_sent');
  END IF;

  IF p_old_quantity = p_new_quantity THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_quantity_change');
  END IF;

  IF p_new_quantity < p_old_quantity THEN
    SELECT value INTO v_flag_enabled
    FROM public.system_settings
    WHERE tenant_id = v_order.tenant_id AND key = 'pos_reduce_qty_enabled';
    IF COALESCE(v_flag_enabled, 'true') = 'false' THEN
      RETURN jsonb_build_object('skipped', true, 'reason', 'feature_disabled');
    END IF;
  END IF;

  SELECT mi.category_id INTO v_category_id
  FROM public.menu_items mi
  WHERE mi.id = v_item.menu_item_id
    AND mi.tenant_id = v_order.tenant_id;

  IF v_category_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_slot');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.printer_menu_categories pmc
    WHERE pmc.tenant_id = v_order.tenant_id
      AND pmc.branch_id = v_order.branch_id
      AND pmc.category_id = v_category_id
  ) THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'no_slot');
  END IF;

  v_delta := abs(p_new_quantity - p_old_quantity);
  v_print_type := CASE
    WHEN p_new_quantity > p_old_quantity THEN 'kitchen_ticket'
    ELSE 'cancel_ticket'
  END;

  SELECT p.id, (p.sort_order + 1)::smallint
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
   AND ppt.print_type = v_print_type
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

  SELECT full_name INTO v_staff_name
  FROM public.profiles WHERE id = v_uid;

  SELECT ksb.kitchen_ticket_number, ksb.send_seq
  INTO v_batch_ticket_number, v_batch_send_seq
  FROM public.kds_tickets kt
  JOIN public.kitchen_send_batches ksb
    ON ksb.id = kt.kitchen_send_batch_id
  WHERE kt.tenant_id = v_order.tenant_id
    AND kt.order_item_id = v_item.id
  ORDER BY ksb.created_at DESC
  LIMIT 1;

  v_change_note := CASE
    WHEN p_new_quantity > p_old_quantity THEN
      'TANG SL ' || p_old_quantity::TEXT || ' -> ' || p_new_quantity::TEXT
    ELSE
      'GIAM SL ' || p_old_quantity::TEXT || ' -> ' || p_new_quantity::TEXT
  END;

  v_item_note := v_change_note
    || CASE
      WHEN NULLIF(trim(COALESCE(v_item.note, '')), '') IS NULL THEN ''
      ELSE ': ' || trim(v_item.note)
    END;

  v_items_payload := jsonb_build_array(jsonb_build_object(
    'item_name',    v_item.item_name,
    'variant_name', v_item.variant_name,
    'quantity',     v_delta,
    'modifiers',    v_item.modifiers,
    'sides',        v_item.sides,
    'note',         v_item_note
  ));

  v_event_token := replace(
    COALESCE(extract(epoch from v_item.updated_at)::NUMERIC(20,6)::TEXT, ''),
    '.',
    ''
  );

  IF p_new_quantity > p_old_quantity THEN
    v_payload := jsonb_build_object(
      'kind',                  'kitchen_ticket',
      'kitchen_ticket_number', COALESCE(v_batch_ticket_number, v_order.order_number),
      'source_order_number',   v_order.order_number,
      'order_number',          v_order.order_number,
      'order_type',            v_order.order_type,
      'table_number',          v_table_no,
      'cashier_name',          COALESCE(v_staff_name, ''),
      'send_seq',              COALESCE(v_batch_send_seq, v_order.kitchen_send_count, 1),
      'send_kind',             'append',
      'slot',                  v_slot,
      'note',                  v_change_note,
      'items',                 v_items_payload,
      'printed_at',            to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                       'YYYY-MM-DD"T"HH24:MI:SS')
    );
  ELSE
    v_payload := jsonb_build_object(
      'kind',         'cancel_ticket',
      'order_number', v_order.order_number,
      'order_type',   v_order.order_type,
      'table_number', v_table_no,
      'slot',         v_slot,
      'items',        v_items_payload,
      'reason',       v_change_note || ': '
                      || COALESCE(NULLIF(trim(p_reason), ''), 'Sua so luong mon'),
      'voided_by',    COALESCE(v_staff_name, ''),
      'printed_at',   to_char(v_now AT TIME ZONE 'Asia/Ho_Chi_Minh',
                              'YYYY-MM-DD"T"HH24:MI:SS')
    );
  END IF;

  v_idempotency := 'order:' || v_order.id::TEXT
    || ':edit-qty:' || p_order_item_id::TEXT
    || ':' || p_old_quantity::TEXT || '->' || p_new_quantity::TEXT
    || ':printer:' || v_printer_id::TEXT
    || ':at:' || v_event_token;

  INSERT INTO public.print_jobs (
    tenant_id, branch_id, printer_id, job_type,
    order_id, payload, idempotency_key, created_by
  ) VALUES (
    v_order.tenant_id, v_order.branch_id, v_printer_id, v_print_type,
    v_order.id, v_payload, v_idempotency, v_uid
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    SELECT id INTO v_job_id
    FROM public.print_jobs
    WHERE idempotency_key = v_idempotency;
  END IF;

  RETURN jsonb_build_object(
    'job_id',     v_job_id,
    'printer_id', v_printer_id,
    'slot',       v_slot,
    'job_type',   v_print_type,
    'delta',      v_delta
  );
END;
$$;

-- public.enqueue_partial_cancel_ticket_print
CREATE OR REPLACE FUNCTION public.enqueue_partial_cancel_ticket_print(p_order_item_id bigint, p_old_quantity integer, p_new_quantity integer, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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

  SELECT p.id, (p.sort_order + 1)::smallint
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
    'sides',         v_item.sides,
    'note',          v_item.note
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

-- private.enqueue_kitchen_completion_print_internal
CREATE OR REPLACE FUNCTION private.enqueue_kitchen_completion_print_internal(p_branch_id bigint, p_ticket_ids bigint[], p_actor uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    SET join_collapse_limit TO '1'
    SET from_collapse_limit TO '1'
    AS $$
DECLARE
  v_ticket_ids bigint[] := ARRAY[]::bigint[];
  v_requested_count integer := 0;
  v_printed_ticket_count integer := 0;
  v_route record;
  v_payload jsonb;
  v_idempotency text;
  v_job_id bigint;
  v_jobs jsonb := '[]'::jsonb;
BEGIN
  SELECT COALESCE(
    array_agg(DISTINCT ticket_id),
    ARRAY[]::bigint[]
  )
  INTO v_ticket_ids
  FROM unnest(
    COALESCE(p_ticket_ids, ARRAY[]::bigint[])
  ) AS input(ticket_id)
  WHERE ticket_id IS NOT NULL
    AND ticket_id > 0;

  v_requested_count := COALESCE(array_length(v_ticket_ids, 1), 0);

  IF v_requested_count = 0 THEN
    RETURN jsonb_build_object(
      'jobs', v_jobs,
      'requested_ticket_count', 0,
      'printed_ticket_count', 0,
      'skipped_ticket_count', 0
    );
  END IF;

  FOR v_route IN
    WITH routed_items AS (
      SELECT
        ticket.id AS ticket_id,
        ticket.order_id,
        ticket.order_item_id,
        orders.tenant_id,
        orders.branch_id,
        orders.order_number,
        orders.order_type,
        orders.note AS order_note,
        dining_table.number AS table_number,
        COALESCE(profile.full_name, '') AS cashier_name,
        printer.id AS printer_id,
        printer.role AS printer_role,
        (printer.sort_order + 1)::smallint AS slot,
        COALESCE(
          batch.kitchen_ticket_number,
          orders.order_number
        ) AS kitchen_ticket_number,
        COALESCE(batch.send_seq, orders.kitchen_send_count) AS send_seq,
        COALESCE(batch.kind, 'manual') AS send_kind,
        jsonb_build_object(
          'order_item_id', item.id,
          'ticket_id', ticket.id,
          'item_name', item.item_name,
          'variant_name', item.variant_name,
          'quantity', item.quantity,
          'modifiers', item.modifiers,
          'sides', item.sides,
          'note', item.note
        ) AS item_payload
      FROM public.kds_tickets ticket
      JOIN public.order_items item
        ON item.tenant_id = ticket.tenant_id
       AND item.id = ticket.order_item_id
      JOIN public.orders orders
        ON orders.tenant_id = ticket.tenant_id
       AND orders.id = ticket.order_id
      LEFT JOIN public.tables dining_table
        ON dining_table.id = orders.table_id
      LEFT JOIN public.profiles profile
        ON profile.id = orders.created_by
      JOIN public.menu_items menu_item
        ON menu_item.id = item.menu_item_id
      JOIN LATERAL (
        SELECT
          candidate.id,
          candidate.role
        FROM public.printers candidate
        JOIN public.printer_print_types print_type
          ON print_type.printer_id = candidate.id
         AND print_type.tenant_id = candidate.tenant_id
         AND print_type.branch_id = candidate.branch_id
         AND print_type.print_type = 'kitchen_ticket'
        LEFT JOIN public.printer_menu_categories route
          ON route.printer_id = candidate.id
         AND route.tenant_id = candidate.tenant_id
         AND route.branch_id = candidate.branch_id
         AND route.category_id = menu_item.category_id
        WHERE candidate.tenant_id = orders.tenant_id
          AND candidate.branch_id = orders.branch_id
          AND candidate.is_active IS TRUE
          AND (
            route.id IS NOT NULL
            OR NOT EXISTS (
              SELECT 1
              FROM public.printer_menu_categories route_any
              WHERE route_any.tenant_id = orders.tenant_id
                AND route_any.branch_id = orders.branch_id
                AND route_any.category_id = menu_item.category_id
            )
          )
        ORDER BY
          CASE WHEN route.id IS NOT NULL THEN 0 ELSE 1 END,
          candidate.sort_order,
          candidate.id
        LIMIT 1
      ) printer ON true
      LEFT JOIN public.kitchen_send_batches batch
        ON batch.id = ticket.kitchen_send_batch_id
      WHERE ticket.id = ANY(v_ticket_ids)
        AND ticket.branch_id = p_branch_id
        AND item.sent_to_kitchen_at IS NULL
    ),
    grouped_routes AS (
      SELECT
        tenant_id,
        branch_id,
        order_id,
        printer_id,
        printer_role,
        slot,
        kitchen_ticket_number,
        order_number,
        order_type,
        table_number,
        cashier_name,
        send_seq,
        send_kind,
        order_note,
        array_agg(order_item_id ORDER BY order_item_id) AS item_ids,
        array_agg(ticket_id ORDER BY order_item_id) AS ticket_ids,
        jsonb_agg(item_payload ORDER BY order_item_id) AS items
      FROM routed_items
      GROUP BY
        tenant_id,
        branch_id,
        order_id,
        printer_id,
        printer_role,
        slot,
        kitchen_ticket_number,
        order_number,
        order_type,
        table_number,
        cashier_name,
        send_seq,
        send_kind,
        order_note
    )
    SELECT *
    FROM grouped_routes
    ORDER BY order_id, printer_role, printer_id
  LOOP
    v_job_id := NULL;

    v_payload := jsonb_build_object(
      'kind', 'kitchen_ticket',
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'source_order_number', v_route.order_number,
      'order_number', v_route.order_number,
      'order_type', v_route.order_type,
      'table_number', v_route.table_number,
      'cashier_name', v_route.cashier_name,
      'send_seq', v_route.send_seq,
      'send_kind', v_route.send_kind,
      'slot', v_route.slot,
      'note', v_route.order_note,
      'order_item_ids', to_jsonb(v_route.item_ids),
      'ticket_ids', to_jsonb(v_route.ticket_ids),
      'items', v_route.items,
      'printed_at', to_char(
        now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
        'YYYY-MM-DD"T"HH24:MI:SS'
      )
    );

    v_idempotency := 'order:' || v_route.order_id::text
      || ':kds-complete:printer:' || v_route.printer_id::text
      || ':tickets:' || md5(array_to_string(v_route.ticket_ids, ','));

    INSERT INTO public.print_jobs (
      tenant_id,
      branch_id,
      printer_id,
      job_type,
      order_id,
      payload,
      idempotency_key,
      created_by
    ) VALUES (
      v_route.tenant_id,
      v_route.branch_id,
      v_route.printer_id,
      'kitchen_ticket',
      v_route.order_id,
      v_payload,
      v_idempotency,
      p_actor
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;

    IF v_job_id IS NULL THEN
      SELECT job.id
      INTO v_job_id
      FROM public.print_jobs job
      WHERE job.idempotency_key = v_idempotency;
    END IF;

    UPDATE public.order_items
    SET sent_to_kitchen_at = COALESCE(sent_to_kitchen_at, now())
    WHERE id = ANY(v_route.item_ids)
      AND sent_to_kitchen_at IS NULL;

    v_printed_ticket_count := v_printed_ticket_count
      + COALESCE(array_length(v_route.ticket_ids, 1), 0);

    v_jobs := v_jobs || jsonb_build_object(
      'printer_id', v_route.printer_id,
      'job_id', v_job_id,
      'item_count', jsonb_array_length(v_route.items),
      'ticket_count', COALESCE(
        array_length(v_route.ticket_ids, 1),
        0
      ),
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'send_seq', v_route.send_seq
    );
  END LOOP;

  RETURN jsonb_build_object(
    'jobs', v_jobs,
    'requested_ticket_count', v_requested_count,
    'printed_ticket_count', v_printed_ticket_count,
    'skipped_ticket_count', GREATEST(
      v_requested_count - v_printed_ticket_count,
      0
    )
  );
END;
$$;

-- private.enqueue_kitchen_print_internal
CREATE OR REPLACE FUNCTION private.enqueue_kitchen_print_internal(p_order_id bigint, p_actor_override uuid DEFAULT NULL::uuid, p_enforce_request_auth boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_request_uid            UUID;
  v_uid                    UUID;
  v_order                  public.orders%ROWTYPE;
  v_table_no               INT;
  v_cashier_name           TEXT;
  v_route                  RECORD;
  v_payload                JSONB;
  v_idempotency            TEXT;
  v_job_id                 BIGINT;
  v_jobs                   JSONB := '[]'::jsonb;
  v_mapped_pending         INT;
  v_null_batch_pending     INT;
  v_fallback_batch_id      BIGINT;
  v_fallback_ticket_number TEXT;
  v_fallback_send_seq      INT;
  v_fallback_kind          TEXT;
  v_ticket_seq             INT;
  v_order_number_clean     TEXT;
  v_order_number_match     TEXT[];
  v_ticket_base            TEXT;
BEGIN
  v_request_uid := auth.uid();

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_enforce_request_auth THEN
    IF v_request_uid IS NULL THEN
      RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
    END IF;

    IF v_order.tenant_id IS DISTINCT FROM public.auth_tenant_id() THEN
      RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission_any('pos:send_kitchen') THEN
      RAISE EXCEPTION 'permission denied: pos:send_kitchen' USING ERRCODE = '42501';
    END IF;

    v_uid := v_request_uid;
  ELSE
    v_uid := COALESCE(p_actor_override, v_request_uid, v_order.created_by);
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
    END IF;
  END IF;

  IF v_order.table_id IS NOT NULL THEN
    SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
  END IF;

  SELECT full_name INTO v_cashier_name
  FROM public.profiles WHERE id = v_order.created_by;

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

  SELECT COUNT(*)
  INTO v_null_batch_pending
  FROM public.order_items oi
  JOIN public.menu_items mi ON mi.id = oi.menu_item_id
  JOIN public.printer_menu_categories pmc
    ON pmc.category_id = mi.category_id
   AND pmc.tenant_id = v_order.tenant_id
   AND pmc.branch_id = v_order.branch_id
  LEFT JOIN public.kds_tickets kt
    ON kt.tenant_id = v_order.tenant_id
   AND kt.order_item_id = oi.id
  LEFT JOIN public.kitchen_send_batches ksb
    ON ksb.id = kt.kitchen_send_batch_id
  WHERE oi.order_id = p_order_id
    AND oi.sent_to_kitchen_at IS NULL
    AND ksb.id IS NULL;

  IF v_null_batch_pending > 0 THEN
    SELECT ksb.id, ksb.kitchen_ticket_number, ksb.send_seq, ksb.kind
    INTO v_fallback_batch_id, v_fallback_ticket_number, v_fallback_send_seq, v_fallback_kind
    FROM public.order_items oi
    JOIN public.kds_tickets kt
      ON kt.tenant_id = v_order.tenant_id
     AND kt.order_item_id = oi.id
    JOIN public.kitchen_send_batches ksb
      ON ksb.id = kt.kitchen_send_batch_id
    WHERE oi.order_id = p_order_id
      AND oi.sent_to_kitchen_at IS NULL
    ORDER BY ksb.created_at DESC, ksb.id DESC
    LIMIT 1;

    IF v_fallback_batch_id IS NULL THEN
      UPDATE public.orders
         SET kitchen_send_count = kitchen_send_count + 1
       WHERE id = p_order_id
       RETURNING kitchen_send_count INTO v_fallback_send_seq;

      INSERT INTO public.kitchen_daily_counters (
        tenant_id, branch_id, counter_date, last_seq
      )
      VALUES (
        v_order.tenant_id,
        v_order.branch_id,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
        1
      )
      ON CONFLICT (tenant_id, branch_id, counter_date)
      DO UPDATE SET
        last_seq = public.kitchen_daily_counters.last_seq + 1,
        updated_at = now()
      RETURNING last_seq INTO v_ticket_seq;

      v_order_number_clean := regexp_replace(
        btrim(COALESCE(v_order.order_number, '')),
        '^#+',
        ''
      );
      v_order_number_match := regexp_match(
        v_order_number_clean,
        '^(?:TC|MV)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,5})(?:-.+)?$',
        'i'
      );
      v_ticket_base := COALESCE(
        v_order_number_match[1],
        NULLIF(v_order_number_clean, ''),
        p_order_id::TEXT
      );
      v_fallback_ticket_number := '#' || v_ticket_base
        || CASE
             WHEN v_fallback_send_seq > 1
               THEN '-' || v_fallback_send_seq::TEXT
             ELSE ''
           END;
      v_fallback_kind := CASE WHEN v_fallback_send_seq = 1 THEN 'initial' ELSE 'append' END;

      INSERT INTO public.kitchen_send_batches (
        tenant_id, branch_id, order_id, counter_date, ticket_seq,
        kitchen_ticket_number, send_seq, kind, created_by
      )
      VALUES (
        v_order.tenant_id,
        v_order.branch_id,
        p_order_id,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
        v_ticket_seq,
        v_fallback_ticket_number,
        v_fallback_send_seq,
        v_fallback_kind,
        v_uid
      )
      RETURNING id INTO v_fallback_batch_id;
    END IF;

    UPDATE public.kds_tickets kt
       SET kitchen_send_batch_id = v_fallback_batch_id,
           updated_at = now()
      FROM public.order_items oi
      JOIN public.menu_items mi ON mi.id = oi.menu_item_id
      JOIN public.printer_menu_categories pmc
        ON pmc.category_id = mi.category_id
       AND pmc.tenant_id = v_order.tenant_id
       AND pmc.branch_id = v_order.branch_id
     WHERE kt.tenant_id = v_order.tenant_id
       AND kt.order_item_id = oi.id
       AND oi.order_id = p_order_id
       AND oi.sent_to_kitchen_at IS NULL
       AND kt.kitchen_send_batch_id IS NULL;
  END IF;

  FOR v_route IN
    WITH routed_items AS (
      SELECT
        p.id AS printer_id,
        p.role AS printer_role,
        (p.sort_order + 1)::smallint AS slot,
        COALESCE(ksb.id, v_fallback_batch_id) AS batch_id,
        COALESCE(ksb.kitchen_ticket_number, v_fallback_ticket_number) AS kitchen_ticket_number,
        COALESCE(ksb.send_seq, v_fallback_send_seq) AS send_seq,
        COALESCE(ksb.kind, v_fallback_kind) AS send_kind,
        COALESCE(ksb.created_at, now()) AS batch_created_at,
        oi.id AS order_item_id,
        jsonb_build_object(
          'item_name',    oi.item_name,
          'variant_name', oi.variant_name,
          'quantity',     oi.quantity,
          'modifiers',    oi.modifiers,
          'sides',        oi.sides,
          'note',         oi.note
        ) AS item_payload
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
      LEFT JOIN public.kds_tickets kt
        ON kt.tenant_id = v_order.tenant_id
       AND kt.order_item_id = oi.id
      LEFT JOIN public.kitchen_send_batches ksb
        ON ksb.id = kt.kitchen_send_batch_id
      WHERE oi.order_id = p_order_id
        AND oi.sent_to_kitchen_at IS NULL
    ),
    grouped_routes AS (
      SELECT
        printer_id,
        printer_role,
        slot,
        batch_id,
        kitchen_ticket_number,
        send_seq,
        send_kind,
        batch_created_at,
        array_agg(order_item_id ORDER BY order_item_id) AS item_ids,
        jsonb_agg(item_payload ORDER BY order_item_id) AS items
      FROM routed_items
      GROUP BY
        printer_id,
        printer_role,
        slot,
        batch_id,
        kitchen_ticket_number,
        send_seq,
        send_kind,
        batch_created_at
    )
    SELECT
      gr.*,
      EXISTS (
        SELECT 1
        FROM public.order_items sent_oi
        JOIN public.kds_tickets sent_kt
          ON sent_kt.tenant_id = v_order.tenant_id
         AND sent_kt.order_item_id = sent_oi.id
        WHERE sent_oi.order_id = p_order_id
          AND sent_oi.sent_to_kitchen_at IS NOT NULL
          AND sent_kt.kitchen_send_batch_id = gr.batch_id
      ) AS batch_has_sent_items
    FROM grouped_routes gr
    ORDER BY gr.batch_created_at, gr.printer_role, gr.printer_id
  LOOP
    v_job_id := NULL;

    v_payload := jsonb_build_object(
      'kind',                  'kitchen_ticket',
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'source_order_number',   v_order.order_number,
      'order_number',          v_order.order_number,
      'order_type',            v_order.order_type,
      'table_number',          v_table_no,
      'cashier_name',          COALESCE(v_cashier_name, ''),
      'send_seq',              v_route.send_seq,
      'send_kind',             CASE
                                  WHEN v_route.batch_has_sent_items THEN 'append'
                                  ELSE v_route.send_kind
                                END,
      'slot',                  v_route.slot,
      'note',                  v_order.note,
      'items',                 v_route.items,
      'printed_at',            to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
                                       'YYYY-MM-DD"T"HH24:MI:SS')
    );

    v_idempotency := 'order:' || p_order_id::TEXT
      || ':kitchen:printer:' || v_route.printer_id::TEXT
      || ':batch:' || v_route.batch_id::TEXT
      || ':items:' || md5(array_to_string(v_route.item_ids, ','));

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
      SELECT id INTO v_job_id
      FROM public.print_jobs
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
      'item_count', jsonb_array_length(v_route.items),
      'kitchen_ticket_number', v_route.kitchen_ticket_number,
      'send_seq', v_route.send_seq
    );
  END LOOP;

  IF jsonb_array_length(v_jobs) = 0 THEN
    RAISE EXCEPTION 'no active kitchen printer for branch %', v_order.branch_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'send_seq', COALESCE(v_fallback_send_seq, v_order.kitchen_send_count),
    'jobs', v_jobs
  );
END;
$_$;

-- public.route_order_to_kds
CREATE OR REPLACE FUNCTION public.route_order_to_kds(p_order_id bigint) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_station_id BIGINT;
  v_has_printer_route BOOLEAN := FALSE;
  v_batch_id BIGINT;
  v_send_seq INT;
  v_ticket_seq INT;
  v_order_number_clean TEXT;
  v_order_number_match TEXT[];
  v_ticket_base TEXT;
  v_ticket_number TEXT;
  v_ticket_id BIGINT;
  v_table_no INT;
  v_cashier_name TEXT;
  v_route RECORD;
  v_payload JSONB;
  v_idempotency TEXT;
  v_job_id BIGINT;
  v_unrouted INT;
BEGIN
  SELECT tenant_id, branch_id, order_number, order_type, note, created_by,
         table_id, kitchen_send_count
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND tenant_id = public.auth_tenant_id()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR v_item IN
    SELECT oi.id AS order_item_id, mi.category_id
    FROM public.order_items oi
    JOIN public.menu_items mi
      ON mi.id = oi.menu_item_id
     AND mi.tenant_id = oi.tenant_id
    WHERE oi.order_id = p_order_id
      AND oi.sent_to_kitchen_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_tickets kt
        WHERE kt.tenant_id = v_order.tenant_id
          AND kt.order_item_id = oi.id
      )
    ORDER BY oi.id
  LOOP
    v_station_id := NULL;
    v_has_printer_route := FALSE;

    SELECT sc.station_id INTO v_station_id
    FROM public.kds_station_categories sc
    JOIN public.kds_stations s ON s.id = sc.station_id
    WHERE sc.category_id = v_item.category_id
      AND s.branch_id = v_order.branch_id
      AND s.tenant_id = v_order.tenant_id
      AND s.is_active = TRUE
    ORDER BY s.position, s.id
    LIMIT 1;

    SELECT EXISTS (
      SELECT 1
      FROM public.printers p
      JOIN public.printer_print_types ppt
        ON ppt.printer_id = p.id
       AND ppt.tenant_id = p.tenant_id
       AND ppt.branch_id = p.branch_id
       AND ppt.print_type = 'kitchen_ticket'
      LEFT JOIN public.printer_menu_categories pmc
        ON pmc.printer_id = p.id
       AND pmc.tenant_id = p.tenant_id
       AND pmc.branch_id = p.branch_id
       AND pmc.category_id = v_item.category_id
      WHERE p.tenant_id = v_order.tenant_id
        AND p.branch_id = v_order.branch_id
        AND p.is_active = TRUE
        AND (
          pmc.id IS NOT NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.printer_menu_categories pmc_any
            WHERE pmc_any.tenant_id = v_order.tenant_id
              AND pmc_any.branch_id = v_order.branch_id
              AND pmc_any.category_id = v_item.category_id
          )
        )
    ) INTO v_has_printer_route;

    IF v_station_id IS NULL AND v_has_printer_route THEN
      CONTINUE;
    END IF;

    IF v_station_id IS NOT NULL THEN
      IF v_batch_id IS NULL THEN
        UPDATE public.orders
           SET kitchen_send_count = kitchen_send_count + 1
         WHERE id = p_order_id
         RETURNING kitchen_send_count INTO v_send_seq;

        INSERT INTO public.kitchen_daily_counters (
          tenant_id, branch_id, counter_date, last_seq
        )
        VALUES (
          v_order.tenant_id,
          v_order.branch_id,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
          1
        )
        ON CONFLICT (tenant_id, branch_id, counter_date)
        DO UPDATE SET
          last_seq = public.kitchen_daily_counters.last_seq + 1,
          updated_at = now()
        RETURNING last_seq INTO v_ticket_seq;

        v_order_number_clean := regexp_replace(
          btrim(COALESCE(v_order.order_number, '')),
          '^#+',
          ''
        );
        v_order_number_match := regexp_match(
          v_order_number_clean,
          '^(?:TC|MV)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,5})(?:-.+)?$',
          'i'
        );
        v_ticket_base := COALESCE(
          v_order_number_match[1],
          NULLIF(v_order_number_clean, ''),
          p_order_id::TEXT
        );
        v_ticket_number := '#' || v_ticket_base
          || CASE WHEN v_send_seq > 1 THEN '-' || v_send_seq::TEXT ELSE '' END;

        INSERT INTO public.kitchen_send_batches (
          tenant_id, branch_id, order_id, counter_date, ticket_seq,
          kitchen_ticket_number, send_seq, kind, created_by
        )
        VALUES (
          v_order.tenant_id,
          v_order.branch_id,
          p_order_id,
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
          v_ticket_seq,
          v_ticket_number,
          v_send_seq,
          CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
          auth.uid()
        )
        RETURNING id INTO v_batch_id;
      END IF;

      INSERT INTO public.kds_tickets (
        tenant_id, branch_id, station_id, order_id, order_item_id,
        kitchen_send_batch_id
      )
      VALUES (
        v_order.tenant_id, v_order.branch_id, v_station_id,
        p_order_id, v_item.order_item_id, v_batch_id
      )
      ON CONFLICT (order_item_id, station_id, tenant_id) DO NOTHING
      RETURNING id INTO v_ticket_id;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.menu_items mi
      ON mi.id = oi.menu_item_id
     AND mi.tenant_id = oi.tenant_id
    JOIN LATERAL (
      SELECT p.id AS printer_id
      FROM public.printers p
      JOIN public.printer_print_types ppt
        ON ppt.printer_id = p.id
       AND ppt.tenant_id = p.tenant_id
       AND ppt.branch_id = p.branch_id
       AND ppt.print_type = 'kitchen_ticket'
      LEFT JOIN public.printer_menu_categories pmc
        ON pmc.printer_id = p.id
       AND pmc.tenant_id = p.tenant_id
       AND pmc.branch_id = p.branch_id
       AND pmc.category_id = mi.category_id
      WHERE p.tenant_id = v_order.tenant_id
        AND p.branch_id = v_order.branch_id
        AND p.is_active = TRUE
        AND (
          pmc.id IS NOT NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.printer_menu_categories pmc_any
            WHERE pmc_any.tenant_id = v_order.tenant_id
              AND pmc_any.branch_id = v_order.branch_id
              AND pmc_any.category_id = mi.category_id
          )
        )
      ORDER BY
        CASE WHEN pmc.id IS NOT NULL THEN 0 ELSE 1 END,
        p.sort_order, p.id
      LIMIT 1
    ) pr ON TRUE
    WHERE oi.order_id = p_order_id
      AND oi.sent_to_kitchen_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_tickets kt
        WHERE kt.tenant_id = v_order.tenant_id
          AND kt.order_item_id = oi.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_station_categories sc
        JOIN public.kds_stations s ON s.id = sc.station_id
        WHERE sc.category_id = mi.category_id
          AND s.branch_id = v_order.branch_id
          AND s.tenant_id = v_order.tenant_id
          AND s.is_active = TRUE
      )
    LIMIT 1
  ) THEN
    IF v_batch_id IS NULL THEN
      UPDATE public.orders
         SET kitchen_send_count = kitchen_send_count + 1
       WHERE id = p_order_id
       RETURNING kitchen_send_count INTO v_send_seq;

      INSERT INTO public.kitchen_daily_counters (
        tenant_id, branch_id, counter_date, last_seq
      )
      VALUES (
        v_order.tenant_id,
        v_order.branch_id,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
        1
      )
      ON CONFLICT (tenant_id, branch_id, counter_date)
      DO UPDATE SET
        last_seq = public.kitchen_daily_counters.last_seq + 1,
        updated_at = now()
      RETURNING last_seq INTO v_ticket_seq;

      v_order_number_clean := regexp_replace(
        btrim(COALESCE(v_order.order_number, '')),
        '^#+',
        ''
      );
      v_order_number_match := regexp_match(
        v_order_number_clean,
        '^(?:TC|MV)-(?:(?:[0-9]{6}|[0-9]{8})-)?([0-9]{1,5})(?:-.+)?$',
        'i'
      );
      v_ticket_base := COALESCE(
        v_order_number_match[1],
        NULLIF(v_order_number_clean, ''),
        p_order_id::TEXT
      );
      v_ticket_number := '#' || v_ticket_base
        || CASE WHEN v_send_seq > 1 THEN '-' || v_send_seq::TEXT ELSE '' END;

      INSERT INTO public.kitchen_send_batches (
        tenant_id, branch_id, order_id, counter_date, ticket_seq,
        kitchen_ticket_number, send_seq, kind, created_by
      )
      VALUES (
        v_order.tenant_id,
        v_order.branch_id,
        p_order_id,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
        v_ticket_seq,
        v_ticket_number,
        v_send_seq,
        CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
        auth.uid()
      )
      RETURNING id INTO v_batch_id;
    ELSE
      SELECT kitchen_ticket_number, send_seq
        INTO v_ticket_number, v_send_seq
      FROM public.kitchen_send_batches
      WHERE id = v_batch_id;
    END IF;

    IF v_order.table_id IS NOT NULL THEN
      SELECT number INTO v_table_no FROM public.tables WHERE id = v_order.table_id;
    END IF;

    SELECT full_name INTO v_cashier_name
    FROM public.profiles WHERE id = v_order.created_by;

    FOR v_route IN
      WITH routed_items AS (
        SELECT
          pr.printer_id,
          pr.printer_role,
          pr.slot,
          oi.id AS order_item_id,
          jsonb_build_object(
            'item_name', oi.item_name,
            'variant_name', oi.variant_name,
            'quantity', oi.quantity,
            'modifiers', oi.modifiers,
            'sides', oi.sides,
            'note', oi.note
          ) AS item_payload
        FROM public.order_items oi
        JOIN public.menu_items mi
          ON mi.id = oi.menu_item_id
         AND mi.tenant_id = oi.tenant_id
        JOIN LATERAL (
          SELECT
            p.id AS printer_id,
            p.role AS printer_role,
            (p.sort_order + 1)::smallint AS slot
          FROM public.printers p
          JOIN public.printer_print_types ppt
            ON ppt.printer_id = p.id
           AND ppt.tenant_id = p.tenant_id
           AND ppt.branch_id = p.branch_id
           AND ppt.print_type = 'kitchen_ticket'
          LEFT JOIN public.printer_menu_categories pmc
            ON pmc.printer_id = p.id
           AND pmc.tenant_id = p.tenant_id
           AND pmc.branch_id = p.branch_id
           AND pmc.category_id = mi.category_id
          WHERE p.tenant_id = v_order.tenant_id
            AND p.branch_id = v_order.branch_id
            AND p.is_active = TRUE
            AND (
              pmc.id IS NOT NULL
              OR NOT EXISTS (
                SELECT 1
                FROM public.printer_menu_categories pmc_any
                WHERE pmc_any.tenant_id = v_order.tenant_id
                  AND pmc_any.branch_id = v_order.branch_id
                  AND pmc_any.category_id = mi.category_id
              )
            )
          ORDER BY
            CASE WHEN pmc.id IS NOT NULL THEN 0 ELSE 1 END,
            p.sort_order, p.id
          LIMIT 1
        ) pr ON TRUE
        WHERE oi.order_id = p_order_id
          AND oi.sent_to_kitchen_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM public.kds_tickets kt
            WHERE kt.tenant_id = v_order.tenant_id
              AND kt.order_item_id = oi.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.kds_station_categories sc
            JOIN public.kds_stations s ON s.id = sc.station_id
            WHERE sc.category_id = mi.category_id
              AND s.branch_id = v_order.branch_id
              AND s.tenant_id = v_order.tenant_id
              AND s.is_active = TRUE
          )
      ),
      grouped_routes AS (
        SELECT
          printer_id,
          printer_role,
          slot,
          array_agg(order_item_id ORDER BY order_item_id) AS item_ids,
          jsonb_agg(item_payload ORDER BY order_item_id) AS items
        FROM routed_items
        GROUP BY printer_id, printer_role, slot
      )
      SELECT *
      FROM grouped_routes
      ORDER BY printer_role, printer_id
    LOOP
      v_job_id := NULL;

      v_payload := jsonb_build_object(
        'kind', 'kitchen_ticket',
        'kitchen_ticket_number', v_ticket_number,
        'source_order_number', v_order.order_number,
        'order_number', v_order.order_number,
        'order_type', v_order.order_type,
        'table_number', v_table_no,
        'cashier_name', COALESCE(v_cashier_name, ''),
        'send_seq', v_send_seq,
        'send_kind', CASE WHEN v_send_seq = 1 THEN 'initial' ELSE 'append' END,
        'slot', v_route.slot,
        'note', v_order.note,
        'items', v_route.items,
        'printed_at', to_char(now() AT TIME ZONE 'Asia/Ho_Chi_Minh',
                              'YYYY-MM-DD"T"HH24:MI:SS')
      );

      v_idempotency := 'order:' || p_order_id::TEXT
        || ':non-kds-dispatch:printer:' || v_route.printer_id::TEXT
        || ':batch:' || v_batch_id::TEXT
        || ':items:' || md5(array_to_string(v_route.item_ids, ','));

      INSERT INTO public.print_jobs (
        tenant_id, branch_id, printer_id, job_type,
        order_id, payload, idempotency_key, created_by
      )
      VALUES (
        v_order.tenant_id, v_order.branch_id, v_route.printer_id,
        'kitchen_ticket', p_order_id, v_payload, v_idempotency, auth.uid()
      )
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id INTO v_job_id;

      IF v_job_id IS NULL THEN
        SELECT id INTO v_job_id
        FROM public.print_jobs
        WHERE idempotency_key = v_idempotency;
      END IF;

      UPDATE public.order_items
         SET sent_to_kitchen_at = COALESCE(sent_to_kitchen_at, now())
       WHERE id = ANY(v_route.item_ids)
         AND sent_to_kitchen_at IS NULL;
    END LOOP;
  END IF;

  SELECT count(*)::int INTO v_unrouted
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.status <> 'cancelled'
    AND oi.sent_to_kitchen_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.kds_tickets kt
      WHERE kt.tenant_id = v_order.tenant_id
        AND kt.order_item_id = oi.id
    );

  IF v_unrouted > 0 THEN
    RAISE EXCEPTION 'kds_no_route: order % has % unroutable item(s)',
      p_order_id, v_unrouted
      USING ERRCODE = '22023';
  END IF;
END;
$_$;


--
-- Name: FUNCTION route_order_to_kds(p_order_id bigint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.route_order_to_kds(p_order_id bigint) IS $$Routes explicit KDS categories to KDS tickets; otherwise queues kitchen printer jobs from category-specific or default kitchen printer routing. Missing KDS and printer routing fails loud.$$;
