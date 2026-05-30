-- =============================================================
-- Feedback hardening: one-shot token for public photo uploads
--
-- ISSUE-002: the public photo upload action previously needed the QR token
-- and a recent feedback_id. A guessed feedback_id from the same QR could still
-- pass ownership checks inside the fresh window. The submit RPC now mints a
-- per-submission upload token; the browser receives the raw token once, while
-- the DB stores only SHA-256 plus expiry/consumption state.
--
-- This migration intentionally sorts after the M5 observability migration so
-- the runtime submit_feedback() body keeps the dish-name RAISE WARNING.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.feedbacks
  ADD COLUMN IF NOT EXISTS photo_upload_token_sha256 TEXT NULL,
  ADD COLUMN IF NOT EXISTS photo_upload_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS photo_upload_consumed_at TIMESTAMPTZ NULL;

ALTER TABLE public.feedbacks
  DROP CONSTRAINT IF EXISTS feedbacks_photo_upload_token_sha256_chk,
  ADD CONSTRAINT feedbacks_photo_upload_token_sha256_chk
    CHECK (
      photo_upload_token_sha256 IS NULL
      OR photo_upload_token_sha256 ~ '^[a-f0-9]{64}$'
    );

ALTER TABLE public.feedbacks
  DROP CONSTRAINT IF EXISTS feedbacks_photo_upload_token_state_chk,
  ADD CONSTRAINT feedbacks_photo_upload_token_state_chk
    CHECK (
      (
        photo_upload_token_sha256 IS NULL
        AND photo_upload_expires_at IS NULL
        AND photo_upload_consumed_at IS NULL
      )
      OR (
        photo_upload_token_sha256 IS NOT NULL
        AND photo_upload_expires_at IS NOT NULL
        AND (
          photo_upload_consumed_at IS NULL
          OR photo_upload_consumed_at <= photo_upload_expires_at
        )
      )
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_feedbacks_photo_upload_token_sha256
  ON public.feedbacks (photo_upload_token_sha256)
  WHERE photo_upload_token_sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feedbacks_photo_upload_pending
  ON public.feedbacks (photo_upload_expires_at)
  WHERE photo_upload_token_sha256 IS NOT NULL
    AND photo_upload_consumed_at IS NULL;

COMMENT ON COLUMN public.feedbacks.photo_upload_token_sha256 IS
  'SHA-256 hex digest of the one-shot public photo upload token minted by submit_feedback(). Raw token is returned once and never stored.';
COMMENT ON COLUMN public.feedbacks.photo_upload_expires_at IS
  'Expiry timestamp for the one-shot public photo upload token.';
COMMENT ON COLUMN public.feedbacks.photo_upload_consumed_at IS
  'Set when uploadFeedbackPhotos atomically links photo_paths using the one-shot token.';

DROP FUNCTION IF EXISTS public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT);

CREATE FUNCTION public.submit_feedback(
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

  -- 3. Best-effort order snapshot
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
  'v3: returns JSONB {feedback_id, photo_upload_token, photo_upload_expires_at}; respects feedback_settings push_mode for Telegram alerts; M5 dish-name RAISE WARNING preserved.';

REVOKE ALL ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) TO service_role;
