-- Remove the retired customer-response module end-to-end.
-- Production apply remains owner-gated: this migration deletes old rows,
-- permission grants, storage policies, and schema objects.
-- Supabase Storage blocks direct DELETE from storage.objects/storage.buckets;
-- remove the old photo bucket via the Storage API after this migration.

DROP POLICY IF EXISTS "feedback_photos_authenticated_select" ON storage.objects;
DROP POLICY IF EXISTS "feedback_photos_service_role_all" ON storage.objects;

DELETE FROM public.permission_audit_log
WHERE permission_key LIKE 'feedback:%';

DELETE FROM public.staff_permissions
WHERE permission_key LIKE 'feedback:%';

UPDATE public.role_templates
SET permission_keys = COALESCE(
  ARRAY(
    SELECT entry.permission_key
    FROM unnest(permission_keys) WITH ORDINALITY AS entry(permission_key, ord)
    WHERE entry.permission_key NOT LIKE 'feedback:%'
    ORDER BY entry.ord
  ),
  '{}'::text[]
)
WHERE EXISTS (
  SELECT 1
  FROM unnest(permission_keys) AS key
  WHERE key LIKE 'feedback:%'
);

DELETE FROM public.permission_keys
WHERE key LIKE 'feedback:%' OR module = 'feedback';

DROP VIEW IF EXISTS public.feedbacks_with_masked_phone;

DROP FUNCTION IF EXISTS public.bulk_mark_feedback_suspect(bigint[], boolean);
DROP FUNCTION IF EXISTS public.feedback_retention_cleanup();
DROP FUNCTION IF EXISTS public.submit_feedback(
  text,
  smallint,
  text,
  text,
  text[],
  text,
  text
);

DROP TABLE IF EXISTS public.telegram_outbox;
DROP TABLE IF EXISTS public.telegram_destinations;
DROP TABLE IF EXISTS public.feedback_daily_reports;
DROP TABLE IF EXISTS public.feedback_photo_cleanup_queue;
DROP TABLE IF EXISTS public.feedback_branch_review_settings;
DROP TABLE IF EXISTS public.feedbacks;
DROP TABLE IF EXISTS public.feedback_qr_codes;
DROP TABLE IF EXISTS public.feedback_settings;

DROP FUNCTION IF EXISTS public.feedback_validate_categories(text[]);
