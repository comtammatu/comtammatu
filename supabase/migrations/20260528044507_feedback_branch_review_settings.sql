-- feedback module — branch-scoped Google review conversion settings
--
-- QR tokens are branch/table based, so review conversion needs a branch
-- override while preserving feedback_settings.google_review_url as the tenant
-- default. The public page reads this through the server-side service client
-- after validating an active QR token; authenticated access remains RLS-bound
-- for admin settings surfaces.

CREATE TABLE public.feedback_branch_review_settings (
  tenant_id         BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id         BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  google_review_url TEXT NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        BIGINT NULL,
  PRIMARY KEY (tenant_id, branch_id),
  CONSTRAINT feedback_branch_review_settings_google_review_url_chk
    CHECK (
      google_review_url IS NULL
      OR (
        length(google_review_url) <= 2048
        AND google_review_url ~* '^https://'
      )
    )
);

CREATE INDEX feedback_branch_review_settings_branch_idx
  ON public.feedback_branch_review_settings (branch_id);

ALTER TABLE public.feedback_branch_review_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_branch_review_settings FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.feedback_branch_review_settings TO authenticated;

CREATE POLICY fbrs_select ON public.feedback_branch_review_settings
  FOR SELECT TO authenticated
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::bigint
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = feedback_branch_review_settings.branch_id
        AND b.tenant_id = feedback_branch_review_settings.tenant_id
    )
  );

CREATE POLICY fbrs_insert ON public.feedback_branch_review_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::bigint
    AND public.has_permission(NULL::bigint, 'feedback:manage_settings')
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = feedback_branch_review_settings.branch_id
        AND b.tenant_id = feedback_branch_review_settings.tenant_id
    )
  );

CREATE POLICY fbrs_update ON public.feedback_branch_review_settings
  FOR UPDATE TO authenticated
  USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::bigint
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = feedback_branch_review_settings.branch_id
        AND b.tenant_id = feedback_branch_review_settings.tenant_id
    )
  )
  WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::bigint
    AND public.has_permission(NULL::bigint, 'feedback:manage_settings')
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = feedback_branch_review_settings.branch_id
        AND b.tenant_id = feedback_branch_review_settings.tenant_id
    )
  );

COMMENT ON TABLE public.feedback_branch_review_settings IS
  'Branch-scoped Google review URL overrides for the public feedback sentiment gate. Missing or NULL rows fall back to feedback_settings.google_review_url.';

COMMENT ON COLUMN public.feedback_branch_review_settings.google_review_url IS
  'Branch Google Maps review URL used before tenant default. NULL means use tenant default.';
