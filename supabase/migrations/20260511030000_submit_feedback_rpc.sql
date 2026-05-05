-- =========================================================================
-- feedback module — Slice 1: submit_feedback() RPC
--
-- Called by the Next.js Server Action (service_role key) when a customer
-- submits feedback via QR scan. Authenticated users (staff) cannot call
-- this directly — EXECUTE granted to service_role only.
--
-- Flow:
--   1. Validate token is active
--   2. Best-effort order snapshot (fail-silent if no active order found)
--   3. INSERT into feedbacks
--   4. If rating <= 3, INSERT into telegram_outbox (pending alert)
--
-- Returns: newly created feedback id (BIGINT)
--
-- Error codes:
--   P0002 — token_not_found_or_inactive
--   23514 — constraint violation (rating, comment length, phone format, etc.)
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
  v_qr             feedback_qr_codes%ROWTYPE;
  v_feedback_id    BIGINT;
  v_order_id       BIGINT;
  v_order_total    NUMERIC(15,2);
  v_dish_names     TEXT[];
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

  -- ── 2. Best-effort order snapshot ────────────────────────────────────
  -- Only attempted when QR is table-specific. Silently skipped if no active
  -- order found — feedback is still recorded without snapshot context.
  -- orders.status values: new, confirmed, preparing, ready, served, completed, cancelled
  -- We consider an order "active" if it hasn't been completed or cancelled yet.

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

    -- Dish names snapshot: best-effort aggregation from order_items + menu_items
    -- Skipped silently on any error — snapshot is informational only.
    IF v_order_id IS NOT NULL THEN
      BEGIN
        SELECT array_agg(mi.name ORDER BY mi.name)
        INTO v_dish_names
        FROM public.order_items oi
        JOIN public.menu_items mi ON mi.id = oi.menu_item_id
        WHERE oi.order_id = v_order_id;
      EXCEPTION WHEN OTHERS THEN
        v_dish_names := NULL;  -- fail-silent
      END;
    END IF;
  END IF;

  -- ── 3. Insert feedback ────────────────────────────────────────────────
  -- tenant_id and branch_id are taken from the QR record — callers cannot
  -- supply or spoof them. channel is hardcoded to 'qr_scan'.

  INSERT INTO public.feedbacks (
    tenant_id,
    branch_id,
    table_id,
    qr_code_id,
    rating,
    comment,
    photo_paths,
    phone,
    channel,
    order_id_snapshot,
    order_total_snapshot,
    dish_names_snapshot,
    submit_ip_hash,
    user_agent_short
  ) VALUES (
    v_qr.tenant_id,
    v_qr.branch_id,
    v_qr.table_id,
    v_qr.id,
    p_rating,
    p_comment,
    COALESCE(p_photo_paths, '{}'),
    p_phone,
    'qr_scan',
    v_order_id,
    v_order_total,
    v_dish_names,
    p_ip_hash,
    p_user_agent_short
  )
  RETURNING id INTO v_feedback_id;

  -- ── 4. Enqueue Telegram alert for negative ratings ────────────────────
  -- Threshold: rating <= 3 triggers an alert. ON CONFLICT DO NOTHING is a
  -- defensive guard against hypothetical double-call races (feedback_id UNIQUE).

  IF p_rating <= 3 THEN
    INSERT INTO public.telegram_outbox (feedback_id, status, next_retry_at)
    VALUES (v_feedback_id, 'pending', NOW())
    ON CONFLICT (feedback_id) DO NOTHING;
  END IF;

  RETURN v_feedback_id;
END;
$$;

COMMENT ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) IS
  'Record a customer feedback submission. tenant_id/branch_id are derived from the QR token — callers cannot spoof them. Enqueues a Telegram alert when rating <= 3. Called via service_role only.';

-- Lock down to service_role — app Server Actions use the service_role key.
-- authenticated users (staff) must NOT be able to bypass QR validation.
REVOKE ALL ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) TO service_role;
