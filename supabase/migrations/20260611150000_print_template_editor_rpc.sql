-- Admin template editor save path. Deactivate-current + insert-new must be
-- atomic (uq_print_template_versions_active_scope allows one active row per
-- scope+kind), so the two writes live in one SECURITY INVOKER function —
-- RLS on print_template_versions still gates who can save.

CREATE OR REPLACE FUNCTION public.save_print_template_version(
  p_kind text,
  p_name text,
  p_paper_width_mm integer,
  p_content jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant  BIGINT := public.auth_tenant_id();
  v_uid     UUID := auth.uid();
  v_name    TEXT := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_version INT;
  v_id      BIGINT;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_kind NOT IN (
    'receipt', 'provisional_bill', 'kitchen_ticket',
    'cancel_ticket', 'shift_close_report'
  ) THEN
    RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
  END IF;

  IF p_paper_width_mm NOT IN (58, 80) THEN
    RAISE EXCEPTION 'invalid paper width' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_content) <> 'object'
     OR jsonb_typeof(p_content->'blocks') <> 'array' THEN
    RAISE EXCEPTION 'invalid content' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_content->'blocks') > 160 THEN
    RAISE EXCEPTION 'too many blocks' USING ERRCODE = '22023';
  END IF;

  UPDATE public.print_template_versions
     SET is_active = false,
         updated_by = v_uid,
         updated_at = now()
   WHERE tenant_id = v_tenant
     AND branch_id IS NULL
     AND kind = p_kind
     AND is_active;

  SELECT COALESCE(MAX(version), 0) + 1
    INTO v_version
    FROM public.print_template_versions
   WHERE tenant_id = v_tenant
     AND branch_id IS NULL
     AND kind = p_kind;

  INSERT INTO public.print_template_versions (
    tenant_id, branch_id, kind, version, name,
    paper_width_mm, content, is_active, created_by, updated_by
  )
  VALUES (
    v_tenant, NULL, p_kind, v_version,
    COALESCE(v_name, 'Bản tùy chỉnh v' || v_version::TEXT),
    p_paper_width_mm, p_content, true, v_uid, v_uid
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'version', v_version);
END;
$$;

REVOKE ALL ON FUNCTION public.save_print_template_version(text, text, integer, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_print_template_version(text, text, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_print_template_version(text, text, integer, jsonb) TO service_role;

COMMENT ON FUNCTION public.save_print_template_version(text, text, integer, jsonb) IS
  'Template editor save: deactivates the active tenant-scope template for the kind and inserts the next version atomically. SECURITY INVOKER — RLS policies on print_template_versions decide authorization.';
