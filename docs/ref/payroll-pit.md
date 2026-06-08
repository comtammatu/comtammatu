# Thuế TNCN & Lương — Personal Income Tax & Payroll

> ## ⚠️ LEAN HKD — engine lương đã CUT
>
> Lean Hộ Kinh Doanh baseline đã **CUT engine tiền lương / TNCN / BHXH** (tính toán + payslip). Với hộ kinh doanh dưới ~5 nhân sự, lương xử lý ngoài hệ thống. Tài liệu này là **tham chiếu pháp lý lịch sử** từ mô hình CTCP cũ, không phải spec tính năng đang chạy. Các bảng `payroll_periods` / `payroll_entries` chỉ giữ ở mức rollup tối thiểu, không phải engine.

> Áp dụng: Hộ Kinh Doanh Cơm Tấm Má Tư (tham chiếu pháp lý — engine CUT)
> Khung pháp lý: Luật Thuế TNCN 2007 (sửa đổi 2012, 2014), TT 111/2013, TT 92/2015, NĐ 65/2013

---

## 1. Cấu trúc lương tháng

### 1.1 Thu nhập chịu thuế vs miễn thuế

| Khoản                | Chịu thuế TNCN?        | Đóng BHXH? | Ghi chú                    |
| -------------------- | ---------------------- | ---------- | -------------------------- |
| Lương cơ bản         | ✅ Có                  | ✅ Có      |                            |
| Phụ cấp chức vụ      | ✅ Có                  | ✅ Có      | Nếu ghi trong HĐ           |
| Phụ cấp độc hại      | ❌ Miễn                | ❌ Không   | Theo quy định Nhà nước     |
| Tiền ăn ca           | ❌ Miễn (≤ 730k/tháng) | ❌ Không   | Vượt → chịu thuế phần vượt |
| Tiền xăng xe, gửi xe | ❌ Miễn (theo thực tế) | ❌ Không   | Phải có hóa đơn chứng từ   |
| Tiền điện thoại      | ❌ Miễn (theo thực tế) | ❌ Không   |                            |
| Tiền thưởng cuối năm | ✅ Có                  | ❌ Không   | Không nằm trong lương HĐ   |
| Tiền làm thêm giờ    | ✅ Phần vượt 150%      | ❌ Không   | 150% ngày thường miễn      |

### 1.2 Công thức tính thu nhập chịu thuế

```
Thu nhập chịu thuế = Lương gross + Phụ cấp chịu thuế - Các khoản miễn thuế

Thu nhập tính thuế = Thu nhập chịu thuế
                   - Giảm trừ bản thân (11 triệu)
                   - Giảm trừ người phụ thuộc (4.4 triệu × số người)
                   - BHXH + BHYT + BHTN do NLĐ đóng (10.5% lương BH)
                   - Đóng góp từ thiện, nhân đạo (nếu có)
```

---

## 2. Biểu thuế TNCN lũy tiến (Thu nhập từ tiền lương, tiền công)

| Bậc | Thu nhập tính thuế/tháng   | Thuế suất | Số thuế tính nhanh       |
| --- | -------------------------- | --------- | ------------------------ |
| 1   | Đến 5 triệu                | 5%        | = TNTT × 5%              |
| 2   | Trên 5 triệu đến 10 triệu  | 10%       | = TNTT × 10% − 250,000   |
| 3   | Trên 10 triệu đến 18 triệu | 15%       | = TNTT × 15% − 750,000   |
| 4   | Trên 18 triệu đến 32 triệu | 20%       | = TNTT × 20% − 1,650,000 |
| 5   | Trên 32 triệu đến 52 triệu | 25%       | = TNTT × 25% − 3,250,000 |
| 6   | Trên 52 triệu đến 80 triệu | 30%       | = TNTT × 30% − 5,850,000 |
| 7   | Trên 80 triệu              | 35%       | = TNTT × 35% − 9,850,000 |

> **Số thuế tính nhanh** giúp tính trực tiếp mà không cần tính từng bậc.

### Ví dụ tính thuế

```
Branch Manager, lương gross: 25,000,000 VND/tháng
Phụ cấp ăn ca: 730,000 (miễn thuế)
Lương BH: 25,000,000 (đăng ký đóng toàn phần)
1 người phụ thuộc

BHXH NLĐ đóng = 25,000,000 × 10.5% = 2,625,000

Thu nhập chịu thuế = 25,000,000 (lương không tính phụ cấp miễn)
Thu nhập tính thuế = 25,000,000 - 11,000,000 (bản thân) - 4,400,000 (1 NP thuộc) - 2,625,000
                   = 6,975,000

Thuế = 6,975,000 × 10% - 250,000 = 447,500 VND
```

---

## 3. Giảm trừ gia cảnh

### 3.1 Mức giảm trừ (áp dụng từ 01/07/2020)

| Loại                | Mức giảm trừ/tháng | Mức giảm trừ/năm |
| ------------------- | ------------------ | ---------------- |
| Bản thân NLĐ        | **11,000,000 VND** | 132,000,000 VND  |
| Mỗi người phụ thuộc | **4,400,000 VND**  | 52,800,000 VND   |

### 3.2 Điều kiện người phụ thuộc hợp lệ

| Đối tượng               | Điều kiện                                                            |
| ----------------------- | -------------------------------------------------------------------- |
| Con dưới 18 tuổi        | Không yêu cầu thu nhập                                               |
| Con từ 18 tuổi đang học | Học đại học, cao đẳng, dạy nghề                                      |
| Vợ/chồng                | Thu nhập < 1 triệu/tháng hoặc không có khả năng lao động             |
| Cha/mẹ                  | Thu nhập < 1 triệu/tháng hoặc ≥ 60 tuổi / không có khả năng lao động |

> ⚠️ **Rule**: Một người phụ thuộc chỉ được đăng ký giảm trừ tại **1 nơi làm việc** duy nhất. NLĐ tự khai và chịu trách nhiệm về thông tin.

### 3.3 Đăng ký người phụ thuộc

NLĐ nộp Mẫu 02/ĐK-TNCN cho HR. HR lưu hồ sơ và cập nhật vào hệ thống. Việc xác minh thuộc trách nhiệm của NLĐ.

---

## 4. Bảng lương tháng

### 4.1 Quy trình tính lương

```
1. Tổng hợp ngày công (từ chấm công / ca làm việc)
2. Tính lương ngày công thực tế
3. Tính các khoản phụ cấp và thưởng
4. Tính BHXH/BHYT/BHTN phần NLĐ đóng (10.5%)
5. Tính thuế TNCN theo biểu lũy tiến
6. Lương thực lĩnh = Gross - BHXH/BHYT/BHTN - Thuế TNCN - Khấu trừ khác
7. Duyệt bảng lương → Thanh toán
```

### 4.2 Database — bảng `payroll_periods` và `payroll_entries`

```sql
CREATE TABLE payroll_periods (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES tenants(id),

  period_month        INT NOT NULL,              -- 1-12
  period_year         INT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft',
  -- 'draft' | 'calculated' | 'approved' | 'paid'

  approved_by         UUID REFERENCES profiles(id),
  approved_at         TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(period_month, period_year, tenant_id)
);

CREATE TABLE payroll_entries (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id           BIGINT NOT NULL REFERENCES tenants(id),
  payroll_period_id   BIGINT NOT NULL REFERENCES payroll_periods(id),
  employee_id         BIGINT NOT NULL REFERENCES employees(id),

  -- Công
  working_days        NUMERIC(5,1) NOT NULL,     -- Ngày công thực tế
  standard_days       NUMERIC(5,1) NOT NULL,     -- Ngày công chuẩn tháng
  overtime_hours      NUMERIC(6,2) DEFAULT 0,

  -- Thu nhập
  base_salary         NUMERIC(15,2) NOT NULL,    -- Lương cơ bản × (công thực tế / công chuẩn)
  allowances          NUMERIC(15,2) DEFAULT 0,   -- Phụ cấp chịu thuế
  tax_exempt_allowances NUMERIC(15,2) DEFAULT 0, -- Phụ cấp miễn thuế (ăn ca, xăng xe, ...)
  overtime_pay        NUMERIC(15,2) DEFAULT 0,
  bonus               NUMERIC(15,2) DEFAULT 0,
  gross_total         NUMERIC(15,2) NOT NULL,    -- Tổng thu nhập chịu thuế

  -- Bảo hiểm NLĐ đóng
  bhxh_employee       NUMERIC(15,2) NOT NULL,    -- gross_insurance × 8%
  bhyt_employee       NUMERIC(15,2) NOT NULL,    -- gross_insurance × 1.5%
  bhtn_employee       NUMERIC(15,2) NOT NULL,    -- gross_insurance × 1%
  total_insurance_employee NUMERIC(15,2) NOT NULL,

  -- Bảo hiểm NSDLĐ đóng (chi phí công ty)
  bhxh_employer       NUMERIC(15,2) NOT NULL,    -- gross_insurance × 17.5%
  bhyt_employer       NUMERIC(15,2) NOT NULL,    -- gross_insurance × 3%
  bhtn_employer       NUMERIC(15,2) NOT NULL,    -- gross_insurance × 1%
  total_insurance_employer NUMERIC(15,2) NOT NULL,

  -- Giảm trừ thuế TNCN
  personal_deduction  NUMERIC(15,2) NOT NULL DEFAULT 11000000,
  dependent_count     INT NOT NULL DEFAULT 0,
  dependent_deduction NUMERIC(15,2) NOT NULL DEFAULT 0,  -- 4,400,000 × dependent_count
  charity_deduction   NUMERIC(15,2) DEFAULT 0,

  -- Thuế TNCN
  taxable_income      NUMERIC(15,2) NOT NULL,    -- Sau giảm trừ
  pit_tax             NUMERIC(15,2) NOT NULL,    -- Thuế TNCN phải nộp
  pit_tax_rate        NUMERIC(5,2),              -- Bậc thuế hiệu dụng (informational)

  -- Khấu trừ khác
  advance_deduction   NUMERIC(15,2) DEFAULT 0,   -- Tạm ứng lương
  other_deductions    NUMERIC(15,2) DEFAULT 0,

  -- Lương thực lĩnh
  net_salary          NUMERIC(15,2) NOT NULL,    -- gross_total - insurance_employee - pit_tax - deductions

  -- Metadata
  insurance_base      NUMERIC(15,2) NOT NULL,    -- Mức lương đóng BH tháng này
  notes               TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(payroll_period_id, employee_id, tenant_id)
);
```

### 4.3 Nhất quán `insurance_base` giữa 3 bảng

Trường `insurance_base` trong `payroll_entries` là **immutable snapshot** của mức lương đóng BH tại thời điểm tính lương. Source of truth nằm ở `employment_contracts.insurance_base_salary`.

```
employment_contracts.insurance_base_salary  (source of truth — HR nhập khi ký HĐ)
        │  auto sync khi HĐ active
        ▼
employees.insurance_base_salary             (derived/cache — giá trị hiện tại)
        │  snapshot khi tính lương
        ▼
payroll_entries.insurance_base              (immutable — KHÔNG đổi sau approved)
```

Khi tính lương, logic phải:

1. Lấy `insurance_base` từ `employees.insurance_base_salary` (đã sync từ HĐ active)
2. Apply trần BHXH: `MIN(insurance_base, 46_800_000)`
3. Ghi snapshot vào `payroll_entries.insurance_base`

> Xem chi tiết rủi ro và luồng dữ liệu tại `docs/ref/labor-contracts.md` § 5.3

---

## 5. Logic tính thuế TNCN (TypeScript)

```typescript
/**
 * Tính thuế TNCN theo biểu lũy tiến 7 bậc
 * @param taxableIncome - Thu nhập tính thuế (sau giảm trừ), đơn vị VND/tháng
 * @returns Số thuế TNCN phải nộp
 */
export function calculatePIT(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;

  // Công thức tính nhanh: tax = income * rate - deduction
  const brackets = [
    { limit: 5_000_000, rate: 0.05, deduction: 0 },
    { limit: 10_000_000, rate: 0.1, deduction: 250_000 },
    { limit: 18_000_000, rate: 0.15, deduction: 750_000 },
    { limit: 32_000_000, rate: 0.2, deduction: 1_650_000 },
    { limit: 52_000_000, rate: 0.25, deduction: 3_250_000 },
    { limit: 80_000_000, rate: 0.3, deduction: 5_850_000 },
    { limit: Infinity, rate: 0.35, deduction: 9_850_000 },
  ] as const;

  for (const bracket of brackets) {
    if (taxableIncome <= bracket.limit) {
      return Math.round(taxableIncome * bracket.rate - bracket.deduction);
    }
  }
  return 0; // unreachable
}

/**
 * Tính đầy đủ một dòng payroll cho 1 nhân viên
 */
export function calculatePayrollEntry(params: {
  grossSalary: number; // Tổng thu nhập chịu thuế
  insuranceBaseSalary: number; // Mức lương đóng BH
  taxExemptAllowances: number; // Phụ cấp miễn thuế
  dependentCount: number; // Số người phụ thuộc
  charityDeduction: number; // Đóng góp từ thiện
}) {
  const {
    grossSalary,
    insuranceBaseSalary,
    taxExemptAllowances,
    dependentCount,
    charityDeduction,
  } = params;

  // BH NLĐ đóng
  const insuranceCap = 46_800_000; // Mức trần BH 2024
  const insuranceBase = Math.min(insuranceBaseSalary, insuranceCap);
  const bhxh = Math.round(insuranceBase * 0.08);
  const bhyt = Math.round(insuranceBase * 0.015);
  const bhtn = Math.round(insuranceBase * 0.01);
  const totalInsuranceEmployee = bhxh + bhyt + bhtn;

  // Giảm trừ thuế
  const personalDeduction = 11_000_000;
  const dependentDeduction = dependentCount * 4_400_000;

  // Thu nhập tính thuế
  const taxableIncome = Math.max(
    0,
    grossSalary -
      totalInsuranceEmployee -
      personalDeduction -
      dependentDeduction -
      charityDeduction,
  );

  const pit = calculatePIT(taxableIncome);

  return {
    totalInsuranceEmployee,
    bhxh,
    bhyt,
    bhtn,
    personalDeduction,
    dependentDeduction,
    taxableIncome,
    pitTax: pit,
    netSalary: grossSalary + taxExemptAllowances - totalInsuranceEmployee - pit,
  };
}
```

---

## 6. Quyết toán thuế TNCN cuối năm

### 6.1 Quyết toán theo ủy quyền

Nếu NLĐ chỉ có thu nhập từ 1 nơi → **ủy quyền quyết toán** cho công ty. Công ty quyết toán thay và gửi tờ khai QT-TNCN.

**Hạn quyết toán**: ngày 31/3 năm kế tiếp (ví dụ: quyết toán năm 2025 → 31/3/2026).

### 6.2 Tờ khai cần nộp hàng tháng (hoặc quý)

| Tờ khai         | Nội dung                            | Hạn nộp                                          |
| --------------- | ----------------------------------- | ------------------------------------------------ |
| **05/KK-TNCN**  | Kê khai thuế TNCN khấu trừ từ lương | Ngày 20 tháng sau (hoặc ngày 30 quý sau nếu quý) |
| **05/QTT-TNCN** | Quyết toán thuế năm                 | 31/3 năm kế tiếp                                 |
| **05/BK-TNCN**  | Bảng kê thu nhập từng cá nhân       | Kèm theo 05/QTT-TNCN                             |

> Việc nộp tờ khai thực hiện qua **eTax** hoặc phần mềm kế toán — không nộp trực tiếp từ hệ thống này. Hệ thống cung cấp **dữ liệu xuất** để kế toán khai báo.

### 6.3 Dữ liệu xuất cho kế toán

```sql
-- Tổng hợp thu nhập và thuế TNCN đã khấu trừ theo năm
SELECT
  e.full_name,
  e.tax_code_personal,
  e.id_number,
  SUM(pe.gross_total) AS total_gross,
  SUM(pe.total_insurance_employee) AS total_insurance,
  SUM(pe.dependent_deduction) AS total_dependent_deduction,
  SUM(pe.taxable_income) AS total_taxable_income,
  SUM(pe.pit_tax) AS total_pit_withheld
FROM payroll_entries pe
JOIN employees e ON e.id = pe.employee_id
JOIN payroll_periods pp ON pp.id = pe.payroll_period_id
WHERE pe.tenant_id = $1
  AND pp.period_year = $2
  AND pp.status = 'paid'
GROUP BY e.id, e.full_name, e.tax_code_personal, e.id_number
ORDER BY e.full_name;
```

---

## 7. Chi phí lương của công ty (Total Labor Cost)

Khi lập kế hoạch ngân sách, tổng chi phí lao động NSDLĐ phải chịu = Lương gross + Bảo hiểm phần công ty đóng:

```
Total labor cost = Gross salary
                 + BHXH employer (17.5%)
                 + BHYT employer (3%)
                 + BHTN employer (1%)
                 = Gross × (1 + 21.5%) ≈ Gross × 1.215
```

Ví dụ: Nhân viên lương gross 10 triệu → công ty thực tế chi ~12.15 triệu/tháng.

---

## 8. Các mức lương tham chiếu

| Vị trí (ví dụ Cơm Tấm Má Tư) | Lương gross tham chiếu | Ghi chú                   |
| ---------------------------- | ---------------------- | ------------------------- |
| Chef (bếp trưởng)            | 12–18 triệu            | Theo kinh nghiệm          |
| Cashier / Waiter             | 6–9 triệu              | + % service charge nếu có |
| Branch Manager               | 20–35 triệu            |                           |
| Area Manager                 | 35–55 triệu            |                           |

**Lương tối thiểu vùng 2025** (Hà Nội, TP.HCM — Vùng I): **4,960,000 VND/tháng**.

> Lương trong HĐ phải ≥ lương tối thiểu vùng.

---

## 9. Quyền truy cập (ACL)

| Hành động                    | Roles được phép                                     |
| ---------------------------- | --------------------------------------------------- |
| Xem bảng lương của mình      | Tất cả nhân viên (employee portal)                  |
| Xem bảng lương chi nhánh     | `branch_manager`                                    |
| Tạo / tính bảng lương        | `super_manager`, `owner` (và `office` với quyền HR) |
| Duyệt bảng lương             | `owner`                                             |
| Xuất dữ liệu quyết toán thuế | `owner`, `super_manager`                            |

---

## Tài liệu liên quan

- `docs/ref/labor-contracts.md` — Hợp đồng lao động, BHXH
- `tasks/todo.md` — phạm vi nhân sự và tiền lương hiện tại
