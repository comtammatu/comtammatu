-- feedback module — review conversion setting
--
-- Stores the Google review link inside Feedback-owned configuration, not
-- deployment env. The first rollout is tenant-wide because the current
-- comtammatu feedback model is QR-token based, not a dynamic form-builder.

ALTER TABLE public.feedback_settings
  ADD COLUMN google_review_url TEXT NULL,
  ADD CONSTRAINT feedback_settings_google_review_url_chk
    CHECK (
      google_review_url IS NULL
      OR (
        length(google_review_url) <= 2048
        AND google_review_url ~* '^https://'
      )
    );

COMMENT ON COLUMN public.feedback_settings.google_review_url IS
  'Tenant-wide Google Maps review URL used by the public feedback sentiment gate. NULL means review conversion is not configured.';
