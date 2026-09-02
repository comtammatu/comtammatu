-- Wave 1.1: order-anchored feedback from Self-Order after payment.
-- Keeps qr_code_id NOT NULL; Self-Order path attaches an active table or
-- branch-wide feedback QR. Standalone /r/{token} submit_feedback unchanged.

ALTER TABLE public.feedbacks
  ADD COLUMN IF NOT EXISTS order_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS order_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS table_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS table_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS order_created_at TIMESTAMPTZ NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'feedbacks_order_id_fkey'
  ) THEN
    ALTER TABLE public.feedbacks
      ADD CONSTRAINT feedbacks_order_id_fkey
      FOREIGN KEY (order_id)
      REFERENCES public.orders (id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'feedbacks_table_id_fkey'
  ) THEN
    ALTER TABLE public.feedbacks
      ADD CONSTRAINT feedbacks_table_id_fkey
      FOREIGN KEY (table_id)
      REFERENCES public.tables (id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_feedbacks_order_id_unique
  ON public.feedbacks (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feedbacks_table_id_created
  ON public.feedbacks (table_id, created_at DESC)
  WHERE table_id IS NOT NULL;

COMMENT ON TABLE public.feedbacks IS
  'Customer feedback submissions. INSERT via submit_feedback() or submit_self_order_feedback().';

COMMENT ON COLUMN public.feedbacks.order_id IS
  'Paid order that this Self-Order feedback anchors to; NULL for standalone QR.';
COMMENT ON COLUMN public.feedbacks.order_number IS
  'Snapshot of orders.order_number at submit time.';
COMMENT ON COLUMN public.feedbacks.table_id IS
  'Table at submit time for Self-Order feedback; NULL for standalone QR.';
COMMENT ON COLUMN public.feedbacks.table_number IS
  'Snapshot of tables.number as text at submit time.';
COMMENT ON COLUMN public.feedbacks.order_created_at IS
  'Snapshot of orders.created_at at submit time.';

CREATE OR REPLACE FUNCTION public.submit_self_order_feedback(
  p_token TEXT,
  p_order_id BIGINT,
  p_client_submission_id UUID,
  p_rating SMALLINT,
  p_comment TEXT,
  p_ip_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_table public.tables%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_qr public.feedback_qr_codes%ROWTYPE;
  v_comment TEXT;
  v_token_hash TEXT;
  v_token_ip_hash TEXT;
  v_existing_id BIGINT;
  v_feedback_id BIGINT;
  v_window_seconds INTEGER := 1800;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden_service_role_only' USING ERRCODE = '42501';
  END IF;

  IF p_token IS NULL
     OR char_length(p_token) < 24
     OR char_length(p_token) > 128
     OR p_token !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION 'feedback_token_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_order_id IS NULL OR p_order_id < 1 THEN
    RAISE EXCEPTION 'feedback_order_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_client_submission_id IS NULL THEN
    RAISE EXCEPTION 'feedback_client_submission_required' USING ERRCODE = '22023';
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'feedback_rating_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_ip_hash IS NOT NULL AND p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'feedback_ip_hash_invalid' USING ERRCODE = '22023';
  END IF;

  v_comment := NULLIF(btrim(COALESCE(p_comment, '')), '');
  IF v_comment IS NOT NULL AND char_length(v_comment) > 2000 THEN
    RAISE EXCEPTION 'feedback_comment_too_long' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_table
  FROM public.tables t
  WHERE t.self_order_token = p_token
    AND t.self_order_enabled = true
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback_token_invalid' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_branch
  FROM public.branches b
  WHERE b.id = v_table.branch_id
    AND b.tenant_id = v_table.tenant_id
  FOR SHARE;

  IF NOT FOUND
     OR NOT COALESCE(v_branch.is_active, false)
     OR v_branch.branch_kind IS DISTINCT FROM 'branch' THEN
    RAISE EXCEPTION 'feedback_branch_inactive' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.tenant_id = v_table.tenant_id
    AND o.branch_id = v_table.branch_id
    AND o.table_id = v_table.id
  FOR SHARE;

  IF NOT FOUND
     OR v_order.payment_status IS DISTINCT FROM 'paid'
     OR v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'feedback_order_invalid' USING ERRCODE = 'P0002';
  END IF;

  -- Prefer table-linked active QR, else branch-wide active QR.
  SELECT *
  INTO v_qr
  FROM public.feedback_qr_codes q
  WHERE q.tenant_id = v_table.tenant_id
    AND q.branch_id = v_table.branch_id
    AND q.is_active = true
    AND q.table_id = v_table.id
  ORDER BY q.id
  LIMIT 1
  FOR SHARE;

  IF NOT FOUND THEN
    SELECT *
    INTO v_qr
    FROM public.feedback_qr_codes q
    WHERE q.tenant_id = v_table.tenant_id
      AND q.branch_id = v_table.branch_id
      AND q.is_active = true
      AND q.table_id IS NULL
    ORDER BY q.id
    LIMIT 1
    FOR SHARE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback_qr_required' USING ERRCODE = 'P0002';
  END IF;

  SELECT f.id
  INTO v_existing_id
  FROM public.feedbacks f
  WHERE f.qr_code_id = v_qr.id
    AND f.client_submission_id = p_client_submission_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'feedbackId', v_existing_id,
      'duplicate', true
    );
  END IF;

  SELECT f.id
  INTO v_existing_id
  FROM public.feedbacks f
  WHERE f.order_id = v_order.id;

  IF FOUND THEN
    RAISE EXCEPTION 'feedback_order_already_submitted' USING ERRCODE = 'P0001';
  END IF;

  v_token_hash := public.self_order_scope_hash(
    v_table.tenant_id::text || ':self_order:' || v_table.id::text || ':' || p_token
  );

  PERFORM public.feedback_take_rate_bucket('token', v_token_hash, 100, v_window_seconds);

  IF p_ip_hash IS NOT NULL THEN
    v_token_ip_hash := public.self_order_scope_hash(v_token_hash || ':' || p_ip_hash);
    PERFORM public.feedback_take_rate_bucket('token_ip', v_token_ip_hash, 5, v_window_seconds);
  END IF;

  BEGIN
    INSERT INTO public.feedbacks (
      tenant_id,
      branch_id,
      qr_code_id,
      client_submission_id,
      rating,
      comment,
      order_id,
      order_number,
      table_id,
      table_number,
      order_created_at
    )
    VALUES (
      v_table.tenant_id,
      v_table.branch_id,
      v_qr.id,
      p_client_submission_id,
      p_rating,
      v_comment,
      v_order.id,
      v_order.order_number,
      v_table.id,
      v_table.number::text,
      v_order.created_at
    )
    ON CONFLICT (qr_code_id, client_submission_id)
    DO NOTHING
    RETURNING id INTO v_feedback_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT f.id
      INTO v_feedback_id
      FROM public.feedbacks f
      WHERE f.qr_code_id = v_qr.id
        AND f.client_submission_id = p_client_submission_id;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'ok', true,
          'feedbackId', v_feedback_id,
          'duplicate', true
        );
      END IF;

      SELECT f.id
      INTO v_existing_id
      FROM public.feedbacks f
      WHERE f.order_id = v_order.id;

      IF FOUND THEN
        RAISE EXCEPTION 'feedback_order_already_submitted' USING ERRCODE = 'P0001';
      END IF;

      RAISE;
  END;

  IF v_feedback_id IS NULL THEN
    SELECT f.id
    INTO v_feedback_id
    FROM public.feedbacks f
    WHERE f.qr_code_id = v_qr.id
      AND f.client_submission_id = p_client_submission_id;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'feedbackId', v_feedback_id,
        'duplicate', true
      );
    END IF;

    SELECT f.id
    INTO v_feedback_id
    FROM public.feedbacks f
    WHERE f.order_id = v_order.id;

    IF FOUND THEN
      RAISE EXCEPTION 'feedback_order_already_submitted' USING ERRCODE = 'P0001';
    END IF;

    RAISE EXCEPTION 'feedback_insert_failed' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'feedbackId', v_feedback_id,
    'duplicate', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_self_order_feedback(
  TEXT, BIGINT, UUID, SMALLINT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_self_order_feedback(
  TEXT, BIGINT, UUID, SMALLINT, TEXT, TEXT
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_self_order_feedback(
  TEXT, BIGINT, UUID, SMALLINT, TEXT, TEXT
) TO service_role;
