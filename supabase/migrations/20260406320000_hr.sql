-- =============================================================
-- M7 HR MVP: employees, shifts, shift_assignments, attendance
-- Employee records extend profiles. Manual check-in/out.
-- =============================================================

-- ─── employees ───
-- Extended employee info beyond profiles (which handles auth/role).

CREATE TABLE public.employees (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id        BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  profile_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_code    TEXT,
  id_number        TEXT,                       -- CCCD/CMND
  bank_account     TEXT,
  bank_name        TEXT,
  base_salary      NUMERIC(15,2),
  start_date       DATE,
  contract_type    TEXT CHECK (contract_type IN ('probation', 'fixed_term', 'indefinite')),
  dependents_count INT NOT NULL DEFAULT 0 CHECK (dependents_count >= 0),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(profile_id, tenant_id),
  UNIQUE(employee_code, tenant_id)
);

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_employees_tenant ON public.employees(tenant_id);
CREATE INDEX idx_employees_profile ON public.employees(profile_id);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_select" ON public.employees
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      -- Self: see own employee record
      profile_id = auth.uid()
      -- Managers: see all in tenant
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'office')
      -- Branch manager: see employees in own branch (via profiles join)
      OR (public.auth_role() = 'branch_manager'
          AND profile_id IN (
            SELECT id FROM public.profiles
            WHERE branch_id = public.auth_branch_id()
              AND tenant_id = public.auth_tenant_id()
          ))
    )
  );

CREATE POLICY "employees_manage" ON public.employees
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.auth_role() IN ('owner', 'super_manager')
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.employees TO authenticated;


-- ─── shifts ───

CREATE TABLE public.shifts (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id   BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                   -- 'Ca sáng', 'Ca chiều', 'Ca tối'
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(branch_id, name, tenant_id)
);

CREATE TRIGGER trg_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_shifts_tenant ON public.shifts(tenant_id);
CREATE INDEX idx_shifts_branch ON public.shifts(branch_id);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shifts_select" ON public.shifts
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "shifts_manage" ON public.shifts
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (public.auth_role() = 'branch_manager' AND branch_id = public.auth_branch_id())
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (public.auth_role() = 'branch_manager' AND branch_id = public.auth_branch_id())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.shifts TO authenticated;


-- ─── shift_assignments ───

CREATE TABLE public.shift_assignments (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id   BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_id    BIGINT NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(employee_id, date, tenant_id)
);

CREATE INDEX idx_shift_assignments_tenant ON public.shift_assignments(tenant_id);
CREATE INDEX idx_shift_assignments_branch ON public.shift_assignments(branch_id);
CREATE INDEX idx_shift_assignments_employee ON public.shift_assignments(employee_id);
CREATE INDEX idx_shift_assignments_date ON public.shift_assignments(branch_id, date);

ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_assignments_select" ON public.shift_assignments
  FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());

CREATE POLICY "shift_assignments_manage" ON public.shift_assignments
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (public.auth_role() = 'branch_manager' AND branch_id = public.auth_branch_id())
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (public.auth_role() = 'branch_manager' AND branch_id = public.auth_branch_id())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.shift_assignments TO authenticated;


-- ─── attendance_records ───

CREATE TABLE public.attendance_records (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id   BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_id    BIGINT REFERENCES public.shifts(id) ON DELETE SET NULL,
  date        DATE NOT NULL,
  check_in    TIMESTAMPTZ,
  check_out   TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'absent'
    CHECK (status IN ('present', 'absent', 'late', 'half_day')),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(employee_id, date, tenant_id)
);

CREATE TRIGGER trg_attendance_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_attendance_tenant ON public.attendance_records(tenant_id);
CREATE INDEX idx_attendance_branch ON public.attendance_records(branch_id);
CREATE INDEX idx_attendance_employee ON public.attendance_records(employee_id);
CREATE INDEX idx_attendance_date ON public.attendance_records(branch_id, date);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_select" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      -- Self: via employee record
      employee_id IN (
        SELECT id FROM public.employees WHERE profile_id = auth.uid()
      )
      OR public.auth_role() IN ('owner', 'super_manager', 'area_manager', 'office')
      OR (public.auth_role() = 'branch_manager' AND branch_id = public.auth_branch_id())
    )
  );

CREATE POLICY "attendance_manage" ON public.attendance_records
  FOR ALL TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (public.auth_role() = 'branch_manager' AND branch_id = public.auth_branch_id())
    )
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND (
      public.auth_role() IN ('owner', 'super_manager', 'area_manager')
      OR (public.auth_role() = 'branch_manager' AND branch_id = public.auth_branch_id())
    )
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.attendance_records TO authenticated;
