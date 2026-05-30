-- =========================================================================
-- feedback module — Slice 2: submit_feedback() RPC v2
--
-- Changes from v1:
--   - Reads feedback_settings.push_mode + threshold_rating to decide
--     whether to enqueue Telegram alert.
--   - push_mode='all'       : always insert outbox
--   - push_mode='threshold' : insert outbox WHERE rating <= threshold_rating
--   - push_mode='none'      : never insert outbox
--   - Cold-start: if no row in feedback_settings, falls back to v1 behavior
--     (threshold mode, threshold=3).
-- =========================================================================

CREATE OR REPLACE FUNCTION public.submit_feedback(
  p_token            TEXT,
  p_rating           SMALLINT,
  p_comment          TEXT,
  p_phone            TEXT     DEFAULT NULL,
  p_photo_paths      TEXT[]   DEFAULT '{}',
  p_ip_hash          TEXT     DEFAULT NULL,
  p_user_agent_short TEXT     DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_qr              feedback_qr_codes%ROWTYPE;
  v_feedback_id     BIGINT;
  v_order_id        BIGINT;
  v_order_total     NUMERIC(15,2);
  v_dish_names      TEXT[];
  v_push_mode       TEXT    := 'threshold';
  v_threshold       SMALLINT := 3;
  v_should_notify   BOOLEAN;
BEGIN
  -- ── 1. Validate token ─────────────────────────────────────────────────
  SELECT * INTO v_qr
  FROM public.feedback_qr_codes
  WHERE token = p_token
    AND is_active = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_not_found_or_inactive'
      USING ERRCODE = 'P0002';
  END IF;

  -- ── 2. Load push settings (best-effort, defaults if missing) ─────────
  SELECT push_mode, threshold_rating
  INTO v_push_mode, v_threshold
  FROM public.feedback_settings
  WHERE tenant_id = v_qr.tenant_id;
  -- NOT FOUND = use defaults already set above

  -- ── 3. Best-effort order snapshot ────────────────────────────────────
  IF v_qr.table_id IS NOT NULL THEN
    SELECT id, total_amount
    INTO v_order_id, v_order_total
    FROM public.orders
    WHERE tenant_id = v_qr.tenant_id
      AND branch_id = v_qr.branch_id
      AND table_id  = v_qr.table_id
      AND status IN ('new', 'confirmed', 'preparing', 'ready', 'served')
    ORDER BY created_at DESC NULLS LAST
    LIMIT 1;

    IF v_order_id IS NOT NULL THEN
      BEGIN
        SELECT array_agg(mi.name ORDER BY mi.name)
        INTO v_dish_names
        FROM public.order_items oi
        JOIN public.menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = v_order_id;
      EXCEPTION WHEN OTHERS THEN
        v_dish_names := NULL;
      END;
    END IF;
  END IF;

  -- ── 4. Insert feedback ────────────────────────────────────────────────
  INSERT INTO public.feedbacks (
    tenant_id, branch_id, table_id, qr_code_id, rating, comment,
    photo_paths, phone, channel, order_id_snapshot, order_total_snapshot,
    dish_names_snapshot, submit_ip_hash, user_agent_short
  ) VALUES (
    v_qr.tenant_id, v_qr.branch_id, v_qr.table_id, v_qr.id,
    p_rating, p_comment, COALESCE(p_photo_paths, '{}'), p_phone,
    'qr_scan', v_order_id, v_order_total, v_dish_names,
    p_ip_hash, p_user_agent_short
  )
  RETURNING id INTO v_feedback_id;

  -- ── 5. Conditionally enqueue Telegram alert ───────────────────────────
  v_should_notify := CASE v_push_mode
    WHEN 'all'       THEN TRUE
    WHEN 'none'      THEN FALSE
    ELSE /* threshold */ p_rating <= v_threshold
  END;

  IF v_should_notify THEN
    INSERT INTO public.telegram_outbox (feedback_id, status, next_retry_at)
    VALUES (v_feedback_id, 'pending', NOW())
    ON CONFLICT (feedback_id) DO NOTHING;
  END IF;

  RETURN v_feedback_id;
END;
$$;

COMMENT ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) IS
  'v2: respects feedback_settings push_mode (all/threshold/none) for Telegram alerts.';

-- Permissions unchanged from v1
REVOKE ALL ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) TO service_role;
