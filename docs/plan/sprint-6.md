# Sprint 6: Finance VAS + HR/Payroll CTCP

> Depends on: Sprint 2 (orders), Sprint 3 (procurement, invoices)
> Sessions: 7 | Estimate: 6-8 ngày
> Legal: BHXH bắt buộc, thuế TNCN lũy tiến, BCTC theo VAS

---

## Goal

CTCP compliance đầy đủ: HR management (hợp đồng, ca làm, chấm công), payroll (lương gộp → BHXH → thuế TNCN → lương thực nhận), và báo cáo tài chính theo chuẩn VAS.

---

## Schema

### employees (extends profiles with HR details)

```sql
CREATE TABLE public.employees (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  employee_code TEXT NOT NULL,           -- "NV001"
  contract_type TEXT NOT NULL CHECK (contract_type IN ('full_time','part_time','seasonal')),
  base_salary NUMERIC(15,2) NOT NULL DEFAULT 0,
  bank_account TEXT,
  bank_name TEXT,
  social_insurance_number TEXT,          -- Số sổ BHXH
  tax_code TEXT,                         -- MST cá nhân (thuế TNCN)
  start_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_code, tenant_id),
  UNIQUE(profile_id)
);
```

### shifts

```sql
CREATE TABLE public.shifts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  name TEXT NOT NULL,                    -- "Ca sáng", "Ca chiều", "Ca tối"
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, name)
);
```

### attendance_records

```sql
CREATE TABLE public.attendance_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id),
  shift_id BIGINT NOT NULL REFERENCES public.shifts(id),
  branch_id BIGINT NOT NULL REFERENCES public.branches(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  work_date DATE NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'present'
    CHECK (status IN ('present','absent','late','leave','holiday')),
  overtime_hours NUMERIC(5,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, work_date, shift_id)
);
```

### payroll_periods

```sql
CREATE TABLE public.payroll_periods (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  period_name TEXT NOT NULL,             -- "Tháng 04/2026"
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','calculated','approved','paid')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(start_date, end_date, tenant_id)
);
```

### payroll_entries

```sql
CREATE TABLE public.payroll_entries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_id BIGINT NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id),
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id),
  -- Earnings
  base_salary NUMERIC(15,2) NOT NULL,
  overtime_pay NUMERIC(15,2) NOT NULL DEFAULT 0,
  allowances NUMERIC(15,2) NOT NULL DEFAULT 0,
  gross_salary NUMERIC(15,2) NOT NULL,   -- base + overtime + allowances
  -- Employee deductions
  bhxh_employee NUMERIC(15,2) NOT NULL,  -- 8% of gross (capped)
  bhyt_employee NUMERIC(15,2) NOT NULL,  -- 1.5% of gross
  bhtn_employee NUMERIC(15,2) NOT NULL,  -- 1% of gross
  tax_tncn NUMERIC(15,2) NOT NULL,       -- Thuế TNCN lũy tiến
  other_deductions NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Employer contributions (not deducted from employee)
  bhxh_employer NUMERIC(15,2) NOT NULL,  -- 17.5% of gross
  bhyt_employer NUMERIC(15,2) NOT NULL,  -- 3% of gross
  bhtn_employer NUMERIC(15,2) NOT NULL,  -- 1% of gross
  -- Net
  net_salary NUMERIC(15,2) NOT NULL,     -- gross - employee deductions
  paid_at TIMESTAMPTZ,
  UNIQUE(period_id, employee_id)
);
```

### Thuế TNCN lũy tiến (reference, implement in code)

```
Bậc 1:  <= 5 triệu       5%
Bậc 2:  5-10 triệu       10%
Bậc 3:  10-18 triệu      15%
Bậc 4:  18-32 triệu      20%
Bậc 5:  32-52 triệu      25%
Bậc 6:  52-80 triệu      30%
Bậc 7:  > 80 triệu       35%

Thu nhập chịu thuế = Gross - BHXH employee - Giảm trừ bản thân (11 triệu)
                     - Giảm trừ người phụ thuộc (4.4 triệu/người)
```

---

## Sessions

### S1: Employee Records

**Acceptance Criteria:**

- [ ] CRUD employees (link to profile, contract type, salary, bank, BHXH number)
- [ ] Employee list with search + filter by branch

### S2: Shifts + Attendance

**Acceptance Criteria:**

- [ ] CRUD shifts per branch
- [ ] Attendance recording (check_in, check_out, status)
- [ ] Monthly attendance summary
- [ ] Overtime calculation

### S3: Payroll Calculation Engine

**Acceptance Criteria:**

- [ ] Calculate gross = base + overtime + allowances
- [ ] BHXH employee: 8% (capped at 20x base salary)
- [ ] BHYT: 1.5%, BHTN: 1%
- [ ] Thuế TNCN lũy tiến (7 bậc) with giảm trừ
- [ ] Net = gross - all employee deductions
- [ ] Employer contributions calculated separately

### S4: Payroll Processing + Payslips

**Acceptance Criteria:**

- [ ] Create payroll period (month)
- [ ] Auto-calculate all entries from attendance data
- [ ] Review + adjust individual entries
- [ ] Approve payroll (owner/super_manager only)
- [ ] Export payslips (per employee)

### S5: Chart of Accounts (VAS)

**Schema:** `chart_of_accounts`, `journal_entries`
**Acceptance Criteria:**

- [ ] Standard VAS chart of accounts (Hệ thống tài khoản theo TT200)
- [ ] Auto journal entries from: orders (revenue), payments, procurement, payroll
- [ ] Manual journal entries

### S6: Financial Statements

**Acceptance Criteria:**

- [ ] Bảng cân đối kế toán (Balance sheet)
- [ ] Báo cáo kết quả kinh doanh (Income statement)
- [ ] Báo cáo lưu chuyển tiền tệ (Cash flow statement)
- [ ] Filter by period

### S7: Payroll Reports

**Acceptance Criteria:**

- [ ] Bảng lương tổng hợp (all employees)
- [ ] Bảng tổng hợp BHXH (employer + employee contributions)
- [ ] Bảng thuế TNCN (per employee)
- [ ] Export to Excel

---

## Definition of Done

- [ ] Payroll: gross → BHXH → thuế TNCN → net calculation correct
- [ ] VAS financial statements generate from journal entries
- [ ] Attendance → payroll pipeline works end-to-end
- [ ] `/cso` pass (salary data, PII handling)
