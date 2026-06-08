-- =========================================================================
-- POS Payment janitor — mark abandoned pending payments as failed.
--
-- Problem: cashier mở QR/MoMo flow → tạo payments row status='pending' →
-- khách bỏ đi / network drop / cashier đóng tab → row stuck pending forever.
-- Tích lũy theo thời gian: query reconciliation chậm, "tổng giao dịch" lệch
-- nếu báo cáo không filter status, audit trail mơ hồ ("khi nào hết hạn?").
--
-- Strategy: hourly cron flips pending rows older than 24h → status='failed'
-- (closest semantic in CHECK enum {pending,completed,failed,refunded}).
-- Cleanup metadata appended to provider_data so audit can distinguish
-- "real failure" vs "janitor timeout".
--
-- Idempotent: already-cleaned rows are no longer status='pending' so won't
-- be re-touched. Threshold parameterized for ad-hoc admin runs.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.cleanup_abandoned_payments(
  p_threshold INTERVAL DEFAULT '24 hours'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.payments
  SET
    status = 'failed',
    provider_data = COALESCE(provider_data, '{}'::jsonb) || jsonb_build_object(
      'cleanup_reason', 'abandoned',
      'cleanup_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'cleanup_threshold', extract(epoch FROM p_threshold)::int
    ),
    updated_at = now()
  WHERE status = 'pending'
    AND created_at < now() - p_threshold;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_abandoned_payments(INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_abandoned_payments(INTERVAL)
  TO postgres, service_role;

COMMENT ON FUNCTION public.cleanup_abandoned_payments(INTERVAL) IS
  'POS payment janitor: marks pending rows older than p_threshold (default '
  '24h) as failed and stamps cleanup metadata into provider_data. '
  'Cron-scheduled hourly; safe to call manually for ad-hoc cleanup.';

-- Schedule hourly cron. Idempotent via existence check — re-running this
-- migration on a DB that already has the schedule is a no-op rather than
-- a duplicate-name error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cleanup-abandoned-payments'
  ) THEN
    PERFORM cron.schedule(
      'cleanup-abandoned-payments',
      '0 * * * *',
      $cron$ SELECT public.cleanup_abandoned_payments() $cron$
    );
  END IF;
END $$;
