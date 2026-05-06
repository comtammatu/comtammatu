-- =========================================================================
-- feedback module — Slice 1: feedbacks_with_masked_phone view
--
-- PURPOSE: Column-level phone masking. The feedbacks table stores the raw
-- phone number, but Supabase/PostgREST does not support native column-level
-- RLS. This view is the ONLY sanctioned way for app code to SELECT feedbacks.
--
-- Masking rule:
--   - has_permission(branch_id, 'feedback:view_phone') → full phone
--   - phone IS NOT NULL + no view_phone perm → show first 3 + *** + last 3
--   - phone IS NULL → NULL
--
-- submit_ip_hash is never exposed — replaced with has_ip_hash boolean flag.
--
-- security_invoker = true: the view runs with the CALLER's privileges, so
-- the underlying feedbacks RLS policies still apply. Requires Postgres 15+
-- (Supabase platform is on Postgres 15/16 as of 2025).
-- =========================================================================

CREATE OR REPLACE VIEW public.feedbacks_with_masked_phone
WITH (security_invoker = true)
AS
SELECT
  id,
  tenant_id,
  branch_id,
  table_id,
  qr_code_id,
  rating,
  comment,
  photo_paths,
  CASE
    WHEN public.has_permission(branch_id, 'feedback:view_phone') THEN phone
    WHEN phone IS NOT NULL THEN
      CASE
        WHEN length(phone) >= 6
          THEN substr(phone, 1, 3) || '***' || substr(phone, length(phone) - 2, 3)
        ELSE '***'
      END
    ELSE NULL
  END AS phone,
  channel,
  order_id_snapshot,
  order_total_snapshot,
  dish_names_snapshot,
  server_user_id_snapshot,
  -- Expose presence flag, not raw hash — raw hash could be used for
  -- cross-session correlation attacks even without reversing it.
  (submit_ip_hash IS NOT NULL) AS has_ip_hash,
  is_suspect,
  alert_sent_telegram_at,
  alert_priority,
  ai_processed_at,
  ai_categories,
  ai_severity,
  ai_summary_vi,
  ai_sentiment_score,
  created_at
FROM public.feedbacks;

COMMENT ON VIEW public.feedbacks_with_masked_phone IS
  'Safe projection of feedbacks with phone masking. Always query this view instead of feedbacks directly. Requires feedback:view_phone permission to see unmasked phone. submit_ip_hash is replaced by has_ip_hash boolean.';

-- Grant SELECT on the view. The underlying RLS on feedbacks still applies
-- because security_invoker = true.
GRANT SELECT ON public.feedbacks_with_masked_phone TO authenticated;
