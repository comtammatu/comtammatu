-- =========================================================================
-- feedback module — Slice 3C: retention cleanup RPC
-- =========================================================================

CREATE OR REPLACE FUNCTION public.feedback_retention_cleanup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phone_nulled INT;
  v_ip_nulled INT;
  v_text_deleted INT;
  v_outbox_deleted INT;
BEGIN
  -- Phone retention 6 months — auto-NULL
  UPDATE feedbacks
  SET phone = NULL
  WHERE phone IS NOT NULL
    AND created_at < NOW() - INTERVAL '6 months';
  GET DIAGNOSTICS v_phone_nulled = ROW_COUNT;

  -- IP hash retention 3 months — auto-NULL
  UPDATE feedbacks
  SET submit_ip_hash = NULL
  WHERE submit_ip_hash IS NOT NULL
    AND created_at < NOW() - INTERVAL '3 months';
  GET DIAGNOSTICS v_ip_nulled = ROW_COUNT;

  -- Comment text retention 24 months — DELETE feedback row
  DELETE FROM feedbacks
  WHERE created_at < NOW() - INTERVAL '24 months';
  GET DIAGNOSTICS v_text_deleted = ROW_COUNT;

  -- Outbox sent rows: delete after 30 days
  DELETE FROM telegram_outbox
  WHERE status = 'sent'
    AND sent_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_outbox_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'phone_nulled', v_phone_nulled,
    'ip_nulled', v_ip_nulled,
    'text_deleted', v_text_deleted,
    'outbox_deleted', v_outbox_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.feedback_retention_cleanup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feedback_retention_cleanup() TO service_role;
