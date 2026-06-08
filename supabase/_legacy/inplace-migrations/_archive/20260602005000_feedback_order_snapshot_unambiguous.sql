-- =============================================================
-- Feedback hardening: unambiguous order snapshot for table QR feedback
--
-- ISSUE-011: with multi-order-per-table enabled, a table QR can map to more
-- than one active unpaid order. The previous "latest order wins" heuristic
-- could attach feedback to the wrong bill. Keep snapshots best-effort, but
-- only populate them when the table has exactly one active unpaid order.
-- =============================================================

CREATE OR REPLACE FUNCTION public.submit_feedback(
  p_token            TEXT,
  p_rating           SMALLINT,
  p_comment          TEXT,
  p_phone            TEXT     DEFAULT NULL,
  p_photo_paths      TEXT[]   DEFAULT '{}',
  p_ip_hash          TEXT     DEFAULT NULL,
  p_user_agent_short TEXT     DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_qr                         feedback_qr_codes%ROWTYPE;
  v_feedback_id                BIGINT;
  v_order_id                   BIGINT;
  v_order_total                NUMERIC(15,2);
  v_dish_names                 TEXT[];
  v_active_order_count         BIGINT := 0;
  v_push_mode                  TEXT     := 'threshold';
  v_threshold                  SMALLINT := 3;
  v_should_notify              BOOLEAN;
  v_photo_upload_token         TEXT;
  v_photo_upload_token_sha256  TEXT;
  v_photo_upload_expires_at    TIMESTAMPTZ;
BEGIN
  -- 1. Validate token
  SELECT * INTO v_qr
  FROM public.feedback_qr_codes
  WHERE token = p_token
    AND is_active = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_not_found_or_inactive'
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Load push settings (best-effort, defaults if missing)
  SELECT push_mode, threshold_rating
  INTO v_push_mode, v_threshold
  FROM public.feedback_settings
  WHERE tenant_id = v_qr.tenant_id;

  -- 3. Best-effort order snapshot, but only when unambiguous.
  IF v_qr.table_id IS NOT NULL THEN
    WITH active_orders AS (
      SELECT o.id, o.total_amount
      FROM public.orders o
      WHERE o.tenant_id = v_qr.tenant_id
        AND o.branch_id = v_qr.branch_id
        AND o.table_id = v_qr.table_id
        AND o.status IN ('new', 'confirmed', 'preparing', 'ready', 'served')
        AND COALESCE(o.payment_status, 'unpaid') <> 'paid'
    )
    SELECT
      COUNT(*)::BIGINT,
      CASE WHEN COUNT(*) = 1 THEN MAX(id) ELSE NULL::BIGINT END,
      CASE
        WHEN COUNT(*) = 1 THEN MAX(total_amount)
        ELSE NULL::NUMERIC(15,2)
      END
    INTO v_active_order_count, v_order_id, v_order_total
    FROM active_orders;

    IF v_active_order_count > 1 THEN
      RAISE WARNING '[submit_feedback] ambiguous active order snapshot for tenant %, branch %, table %: % active orders',
        v_qr.tenant_id, v_qr.branch_id, v_qr.table_id, v_active_order_count;
    END IF;

    IF v_order_id IS NOT NULL THEN
      BEGIN
        SELECT array_agg(mi.name ORDER BY mi.name)
        INTO v_dish_names
        FROM public.order_items oi
        JOIN public.menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = v_order_id;
      EXCEPTION WHEN OTHERS THEN
        v_dish_names := NULL;
        -- M5 observability: surface dish-names lookup failures so ops
        -- can debug recurring order_items/menu_items integrity issues.
        -- NULL fallback unchanged (feedback row still inserted without
        -- dish names snapshot).
        RAISE WARNING '[submit_feedback] dish_names lookup failed for order %: %',
          v_order_id, SQLERRM;
      END;
    END IF;
  END IF;

  v_photo_upload_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_photo_upload_token_sha256 := encode(
    extensions.digest(v_photo_upload_token, 'sha256'),
    'hex'
  );
  v_photo_upload_expires_at := NOW() + INTERVAL '10 minutes';

  -- 4. Insert feedback
  INSERT INTO public.feedbacks (
    tenant_id, branch_id, table_id, qr_code_id, rating, comment,
    photo_paths, phone, channel, order_id_snapshot, order_total_snapshot,
    dish_names_snapshot, submit_ip_hash, user_agent_short,
    photo_upload_token_sha256, photo_upload_expires_at
  ) VALUES (
    v_qr.tenant_id, v_qr.branch_id, v_qr.table_id, v_qr.id,
    p_rating, p_comment, COALESCE(p_photo_paths, '{}'), p_phone,
    'qr_scan', v_order_id, v_order_total, v_dish_names,
    p_ip_hash, p_user_agent_short,
    v_photo_upload_token_sha256, v_photo_upload_expires_at
  )
  RETURNING id INTO v_feedback_id;

  -- 5. Conditionally enqueue Telegram alert
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

  RETURN jsonb_build_object(
    'feedback_id', v_feedback_id,
    'photo_upload_token', v_photo_upload_token,
    'photo_upload_expires_at', v_photo_upload_expires_at
  );
END;
$$;

COMMENT ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) IS
  'v4: returns JSONB one-shot photo upload token; order snapshots only when table QR maps to exactly one active unpaid order; ambiguous multi-order tables warn and leave snapshot null.';

REVOKE ALL ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) TO service_role;
