-- Treat printer role as a branch slot label only.
-- Every configured printer may select the same print types and menu categories.

DROP TRIGGER IF EXISTS trg_enforce_printer_print_type_role
  ON public.printer_print_types;

DROP FUNCTION IF EXISTS public.enforce_printer_print_type_role();

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

COMMENT ON FUNCTION public.upsert_printer_with_routes(
  BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, TEXT, SMALLINT, TEXT, BOOLEAN, TEXT[], BIGINT[]
) IS 'Upsert a branch printer and its print-type/category routes. Printer role is a slot label only; routing choices are not role-restricted.';
