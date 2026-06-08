-- =============================================================
-- M5 — Observability: add RAISE WARNING to documented fail-silent
--                     EXCEPTION WHEN OTHERS sites
--
-- Driver: 4-agent security audit 2026-05-07. M5 audit verified 17
-- EXCEPTION WHEN OTHERS sites — 14 had appropriate severity (re-raise,
-- WARNING, NOTICE), 3 were documented fail-silent. Pattern was correct
-- (intentional fail-soft for non-critical paths) but operationally
-- silent — no log when triggered, no data to debug recurring issues.
--
-- This migration adds `RAISE WARNING` (with structured context: function
-- name, identifier, SQLERRM) to 2 sites:
--
--   1. submit_feedback (v2) at `20260511070000_submit_feedback_rpc_v2.sql:76`
--      — dish_names lookup. NULL fallback OK; warning surfaces when
--        order_items query fails so we can debug data integrity issues.
--   2. print_jobs_attach_document_trigger at
--      `20260526000000_print_templates_document_ast.sql:605` — template
--      apply fail-soft. Returns NEW (legacy payload) when custom template
--      malformed; warning surfaces template config issues for ops.
--
-- Skipped: submit_feedback v1 (`20260511030000_submit_feedback_rpc.sql:80`)
-- — superseded by v2 via CREATE OR REPLACE; runtime-dead.
--
-- Behavior change: ZERO functional change. Only adds log lines via
-- RAISE WARNING (severity > NOTICE; surfaces in Vercel/Postgres logs).
-- All callers continue to receive same return values.
--
-- See: tasks/regressions.md EXCEPTION-WHEN-OTHERS-MUST-LOG-OR-RERAISE
-- =============================================================

-- ─── 1. submit_feedback v2 — add WARNING to dish_names catch ──
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
        -- M5 observability: surface dish-names lookup failures so ops
        -- can debug recurring order_items/menu_items integrity issues.
        -- NULL fallback unchanged (feedback row still inserted without
        -- dish names snapshot).
        RAISE WARNING '[submit_feedback] dish_names lookup failed for order %: %',
          v_order_id, SQLERRM;
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
  'v2 + M5 observability: respects feedback_settings push_mode (all/threshold/none) for Telegram alerts. Dish-names lookup failures emit RAISE WARNING (NULL fallback preserved).';

REVOKE ALL ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_feedback(TEXT, SMALLINT, TEXT, TEXT, TEXT[], TEXT, TEXT) TO service_role;

-- ─── 2. print_jobs_attach_document_trigger — add WARNING to template apply catch ──
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
    --
    -- M5 observability: surface template-apply failures so ops can debug
    -- malformed templates / missing template versions. RETURN NEW preserves
    -- legacy payload (agent fallback unchanged).
    RAISE WARNING '[print_jobs_attach_document_trigger] template apply failed for tenant=% branch=% job_type=%: %',
      NEW.tenant_id, NEW.branch_id, NEW.job_type, SQLERRM;
    RETURN NEW;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.print_jobs_attach_document_trigger() IS
  'M5 observability (2026-05-07): template apply fail-soft now emits RAISE WARNING. Behavior unchanged — RETURN NEW preserves legacy payload for agent fallback.';
