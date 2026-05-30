-- Lane D: GPS + HMAC daily code attendance clock-in/out system
-- PWA attendance with branch_attendance_config (secrets), GPS columns, audit columns

-- ─── 1. branch_attendance_config (secrets, separate from branches for RLS) ───

CREATE TABLE public.branch_attendance_config (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id         BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id         BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  attendance_secret TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(branch_id, tenant_id)
);

CREATE TRIGGER trg_branch_attendance_config_updated_at
  BEFORE UPDATE ON public.branch_attendance_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_bac_tenant ON public.branch_attendance_config(tenant_id);
CREATE INDEX idx_bac_branch ON public.branch_attendance_config(branch_id);

ALTER TABLE public.branch_attendance_config ENABLE ROW LEVEL SECURITY;

-- Only owner + super_manager can read/manage secrets
CREATE POLICY "bac_manager_all" ON public.branch_attendance_config
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.branch_attendance_config TO authenticated;


-- ─── 2. Add geolocation columns to branches ───

ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS latitude NUMERIC(10,7);
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS longitude NUMERIC(10,7);


-- ─── 3. Add audit columns to attendance_records ───

ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS lat NUMERIC(10,7);
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS lng NUMERIC(10,7);
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS method TEXT
  CHECK (method IN ('pwa', 'manual', 'admin')) DEFAULT 'manual';
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS code_verified BOOLEAN DEFAULT false;


-- ─── 4. RLS: employee self clock-in (INSERT) ───
-- Allows any authenticated employee to insert their own attendance record
-- Cross-branch OK: validate against shift_assignments.branch_id, not auth_branch_id()

CREATE POLICY "attendance_self_checkin" ON public.attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id IN (
      SELECT e.id FROM public.employees e
      WHERE e.profile_id = auth.uid()
        AND e.tenant_id = public.auth_tenant_id()
    )
    AND tenant_id = public.auth_tenant_id()
  );


-- ─── 5. RLS: employee self clock-out (UPDATE own record's check_out) ───
-- Only allow updating records where check_out IS NULL (open clock-in)

CREATE POLICY "attendance_self_checkout" ON public.attendance_records
  FOR UPDATE TO authenticated
  USING (
    employee_id IN (
      SELECT e.id FROM public.employees e
      WHERE e.profile_id = auth.uid()
        AND e.tenant_id = public.auth_tenant_id()
    )
    AND tenant_id = public.auth_tenant_id()
    AND check_out IS NULL
  )
  WITH CHECK (
    employee_id IN (
      SELECT e.id FROM public.employees e
      WHERE e.profile_id = auth.uid()
        AND e.tenant_id = public.auth_tenant_id()
    )
    AND tenant_id = public.auth_tenant_id()
  );
