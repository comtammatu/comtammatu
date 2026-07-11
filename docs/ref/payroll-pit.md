# Thuế TNCN & Lương — Personal Income Tax & Payroll

> Áp dụng: Hộ kinh doanh Cơm Tấm Má Tư
> Khung pháp lý (đến 07/2026): Luật Thuế TNCN 2025 (109/2025/QH15, hiệu lực
> chung 01/07/2026, biểu thuế + giảm trừ mới áp dụng **từ kỳ tính thuế 2026 =
> 01/01/2026**) + NĐ 253/2026/NĐ-CP + TT 87/2026/TT-BTC; NQ 110/2025/UBTVQH15
> (giảm trừ gia cảnh mới từ kỳ tính thuế 2026); Luật BHXH 2024 (41/2024/QH15) +
> NĐ 158/2025 (BHXH bắt buộc, gồm chủ
> hộ kinh doanh); NĐ 73/2024 (lương cơ sở 2,34tr → trần BHXH 46,8tr, đến
> 30/06/2026) → **NĐ 161/2026 (lương cơ sở 2,53tr → trần BHXH 50,6tr từ
> 01/07/2026)**; NĐ 293/2025 (lương tối thiểu vùng từ 01/01/2026). Luật Thuế
> TNCN 2007/TT 111/2013 chỉ còn dùng cho quyết toán các kỳ ≤ 2025.
>
> `legal-versions.ts` đã áp biểu 5 bậc cho cả kỳ tính thuế 2026 và bước trần BHXH
> 46,8tr → 50,6tr tại 01/07/2026 (quy tắc regression
> `PAYROLL-2026-FIVE-BRACKET-AND-BHXH-CAP-STEP`).

---

## 1. Cấu trúc lương tháng

### 1.1 Thu nhập chịu thuế vs miễn thuế

| Khoản                | Chịu thuế TNCN?        | Đóng BHXH? | Ghi chú                    |
| -------------------- | ---------------------- | ---------- | -------------------------- |
| Lương cơ bản         | ✅ Có                  | ✅ Có      |                            |
| Phụ cấp chức vụ      | ✅ Có                  | ✅ Có      | Nếu ghi trong HĐ           |
| Phụ cấp độc hại      | ❌ Miễn                | ❌ Không   | Theo quy định Nhà nước     |
| Tiền ăn ca           | ❌ Miễn (≤ 1,2tr/tháng nếu chi tiền từ 01/07/2026) | ❌ Không   | Vượt → chịu thuế phần vượt; bữa ăn tổ chức trực tiếp/mua suất/cấp phiếu ăn không tính vào thu nhập chịu thuế |
| Tiền xăng xe, gửi xe | ❌ Miễn (theo thực tế) | ❌ Không   | Phải có hóa đơn chứng từ   |
| Tiền điện thoại      | ❌ Miễn (theo thực tế) | ❌ Không   |                            |
| Tiền thưởng cuối năm | ✅ Có                  | ❌ Không   | Không nằm trong lương HĐ   |
| Tiền làm thêm giờ    | ✅ Phần vượt 150%      | ❌ Không   | 150% ngày thường miễn      |

### 1.2 Công thức tính thu nhập chịu thuế

```
Thu nhập chịu thuế = Lương gross + Phụ cấp chịu thuế - Các khoản miễn thuế

Thu nhập tính thuế = Thu nhập chịu thuế
                   - Giảm trừ bản thân (15.5 triệu — kỳ tính thuế 2026)
                   - Giảm trừ người phụ thuộc (6.2 triệu × số người)
                   - BHXH + BHYT + BHTN do NLĐ đóng (10.5% lương BH)
                   - Đóng góp từ thiện, nhân đạo (nếu có)
```

---

## 2. Biểu thuế TNCN lũy tiến (Thu nhập từ tiền lương, tiền công)

Biểu 5 bậc theo Luật Thuế TNCN 2025 (109/2025/QH15), áp dụng từ kỳ tính thuế
2026:

| Bậc | Thu nhập tính thuế/tháng    | Thuế suất | Số thuế tính nhanh        |
| --- | --------------------------- | --------- | ------------------------- |
| 1   | Đến 10 triệu                | 5%        | = TNTT × 5%               |
| 2   | Trên 10 triệu đến 30 triệu  | 10%       | = TNTT × 10% − 500,000    |
| 3   | Trên 30 triệu đến 60 triệu  | 20%       | = TNTT × 20% − 3,500,000  |
| 4   | Trên 60 triệu đến 100 triệu | 30%       | = TNTT × 30% − 9,500,000  |
| 5   | Trên 100 triệu              | 35%       | = TNTT × 35% − 14,500,000 |

> **Số thuế tính nhanh** giúp tính trực tiếp mà không cần tính từng bậc.
> Biểu 7 bậc cũ (Luật 2007) chỉ còn dùng khi quyết toán các kỳ ≤ 2025; cách
> khấu trừ chuyển tiếp trong năm 2026 theo hướng dẫn của cơ quan thuế.

> **Đồng bộ với mã nguồn:** payroll engine = `packages/shared/src/payroll/calculate.ts` + `legal-versions.ts` (versioned theo `effectiveFrom`). Code tính **mọi kỳ từ 2026-01** bằng **biểu 5 bậc** ở §2 (`PIT_BRACKETS_2026`) — cả version `effectiveFrom: 2026-01-01` lẫn `2026-07-01`. Giảm trừ 15.5M/6.2M áp dụng từ 2026-01; trần BHXH 46.8M đến 30/06/2026 rồi bước lên 50.6M từ 01/07/2026 (NĐ 161/2026). Test khoá: `packages/shared/src/payroll/__tests__/legal-versions.test.ts`; quy tắc `PAYROLL-2026-FIVE-BRACKET-AND-BHXH-CAP-STEP` (`tasks/regressions.md`).
>
> **Lưu ý kế toán (không phải lỗi code):** mức khấu trừ hàng tháng H1-2026 có thể chọn giữ biểu 7 bậc cũ chờ ngày hiệu lực chung 01/07/2026 rồi true-up khi quyết toán — nghĩa vụ cả năm không đổi. Theo NĐ 253/2026, hồ sơ khai tháng/quý đã nộp cho kỳ 2026 trước 01/07/2026 không phải nộp lại, điều chỉnh vào quyết toán năm 2026. Nếu kế toán chốt phương án bảo thủ cho H1 thì trỏ version `effectiveFrom: "2026-01-01"` về `PIT_BRACKETS_2007` (một dòng), không đổi giảm trừ/trần.

### Ví dụ tính thuế

```
Branch Manager, lương gross: 25,000,000 VND/tháng
Phụ cấp ăn ca: 1,200,000 (miễn thuế nếu chi tiền từ 01/07/2026)
Lương BH: 25,000,000 (đăng ký đóng toàn phần)
1 người phụ thuộc

BHXH NLĐ đóng = 25,000,000 × 10.5% = 2,625,000

Thu nhập chịu thuế = 25,000,000 (lương không tính phụ cấp miễn)
Thu nhập tính thuế = 25,000,000 - 15,500,000 (bản thân) - 6,200,000 (1 NP thuộc) - 2,625,000
                   = 675,000

Thuế = 675,000 × 5% = 33,750 VND
```

> Với mức giảm trừ 15,5 triệu từ kỳ 2026, đa số vị trí vận hành của quán
> (cashier/chef/kitchen_helper 6–12 triệu) không phát sinh thuế TNCN phải khấu trừ.

---

## 3. Giảm trừ gia cảnh

### 3.1 Mức giảm trừ (từ kỳ tính thuế 2026 — NQ 110/2025/UBTVQH15)

| Loại                | Mức giảm trừ/tháng | Mức giảm trừ/năm |
| ------------------- | ------------------ | ---------------- |
| Bản thân NLĐ        | **15,500,000 VND** | 186,000,000 VND  |
| Mỗi người phụ thuộc | **6,200,000 VND**  | 74,400,000 VND   |

> Mức cũ 11,000,000 / 4,400,000 (từ 01/07/2020) chỉ dùng cho quyết toán các
> kỳ tính thuế ≤ 2025.

### 3.2 Điều kiện người phụ thuộc hợp lệ

| Đối tượng               | Điều kiện                                                            |
| ----------------------- | -------------------------------------------------------------------- |
| Con dưới 18 tuổi        | Không yêu cầu thu nhập                                               |
| Con từ 18 tuổi đang học | Học đại học, cao đẳng, dạy nghề                                      |
| Vợ/chồng                | Thu nhập bình quân tháng trong năm không quá 3 triệu hoặc không có khả năng lao động |
| Cha/mẹ                  | Thu nhập bình quân tháng trong năm không quá 3 triệu hoặc ≥ 60 tuổi / không có khả năng lao động |

> ⚠️ **Rule**: Một người phụ thuộc chỉ được đăng ký giảm trừ tại **1 nơi làm việc** duy nhất. NLĐ tự khai và chịu trách nhiệm về thông tin.
> Từ 01/07/2026, mức thu nhập làm căn cứ xác định người phụ thuộc là không quá
> **3 triệu đồng/tháng** theo TT 87/2026/TT-BTC; mức cũ 1 triệu chỉ dùng cho
> kỳ trước khi quy định mới có hiệu lực.

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

  -- Bảo hiểm NSDLĐ đóng (chi phí hộ kinh doanh)
  bhxh_employer       NUMERIC(15,2) NOT NULL,    -- gross_insurance × 17.5%
  bhyt_employer       NUMERIC(15,2) NOT NULL,    -- gross_insurance × 3%
  bhtn_employer       NUMERIC(15,2) NOT NULL,    -- gross_insurance × 1%
  total_insurance_employer NUMERIC(15,2) NOT NULL,

  -- Giảm trừ thuế TNCN
  -- ⚠️ DEFAULT 11000000 là fallback legacy (kỳ ≤ 2025). Engine luôn GHI ĐÈ bằng
  --    giá trị versioned: từ kỳ 2026 là 15.500.000 / 6.200.000 (legal-versions.ts).
  personal_deduction  NUMERIC(15,2) NOT NULL DEFAULT 11000000,
  dependent_count     INT NOT NULL DEFAULT 0,
  dependent_deduction NUMERIC(15,2) NOT NULL DEFAULT 0,  -- 6.200.000 × count (kỳ 2026); 4.400.000 cho kỳ ≤ 2025
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
2. Apply trần BHXH version-aware: `MIN(insurance_base, version.insuranceCap)` —
   **46,8tr đến 30/06/2026**, **50,6tr từ 01/07/2026** (NĐ 161/2026). KHÔNG
   hardcode `46_800_000` cho mọi kỳ; cap bước theo `legal-versions.ts` (quy tắc
   `PAYROLL-2026-FIVE-BRACKET-AND-BHXH-CAP-STEP`).
3. Ghi snapshot vào `payroll_entries.insurance_base`

> Xem chi tiết rủi ro và luồng dữ liệu tại `docs/ref/labor-contracts.md` § 5.3

---

## 5. Logic tính thuế TNCN (TypeScript)

Engine thật là **version-aware** — KHÔNG hardcode tỷ lệ/bậc/trần trong app. Gọi
`calculatePayrollEntry`, truyền `effectiveDate` (ngày cuối kỳ lương) để resolve
đúng version theo `legal-versions.ts`:

- `packages/shared/src/payroll/calculate.ts` — `calculatePayrollEntry(input)`
- `packages/shared/src/payroll/legal-versions.ts` — bảng hằng số theo `effectiveFrom`
  (biểu thuế, giảm trừ, trần BHXH, tỷ lệ BH). Số thật nằm ở đây.

```typescript
import { calculatePayrollEntry } from "@comtammatu/shared/payroll";

const row = calculatePayrollEntry({
  grossTotal,            // tổng thu nhập chịu thuế
  insuranceBaseSalary,   // mức lương đóng BH (trần áp theo version)
  taxExemptAllowances,
  dependentCount,
  charityDeduction,
  advanceDeduction,
  otherDeductions,
  effectiveDate: "2026-07-31", // T7/2026 → biểu 5 bậc + trần BHXH 50,6tr
});
// row.pitTax, row.totalInsuranceEmployee, row.netSalary
// row.legalVersionEffectiveFrom is helper audit metadata; payroll_entries snapshots the money fields.
```

Công thức biểu 5 bậc (kỳ tính thuế 2026) ở §2; biểu 7 bậc cũ chỉ dùng khi quyết
toán các kỳ ≤ 2025 (version `effectiveFrom` ≤ `2024-07-01`).

---

## 6. Quyết toán thuế TNCN cuối năm

### 6.1 Quyết toán theo ủy quyền

Nếu NLĐ chỉ có thu nhập từ 1 nơi → có thể **ủy quyền quyết toán** cho NSDLĐ
theo điều kiện pháp luật thuế hiện hành. Với Cơm Tấm Má Tư, NSDLĐ là Hộ kinh
doanh/chủ hộ, không phải CTCP.

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
  p.full_name,
  e.id_number,
  SUM(pe.gross_total) AS total_gross,
  SUM(pe.total_insurance_employee) AS total_insurance,
  SUM(pe.dependent_deduction) AS total_dependent_deduction,
  SUM(pe.taxable_income) AS total_taxable_income,
  SUM(pe.pit_tax) AS total_pit_withheld
FROM payroll_entries pe
JOIN employees e ON e.id = pe.employee_id
JOIN profiles p ON p.id = e.profile_id
JOIN payroll_periods pp ON pp.id = pe.payroll_period_id
WHERE pe.tenant_id = $1
  AND pp.period_year = $2
  AND pp.status = 'paid'
GROUP BY e.id, p.full_name, e.id_number
ORDER BY p.full_name;
```

---

## 7. Chi phí lương của NSDLĐ (Total Labor Cost)

Khi lập kế hoạch ngân sách, tổng chi phí lao động NSDLĐ phải chịu = Lương
gross + Bảo hiểm phần NSDLĐ đóng:

```
Total labor cost = Gross salary
                 + BHXH employer (17.5%)
                 + BHYT employer (3%)
                 + BHTN employer (1%)
                 = Gross × (1 + 21.5%) ≈ Gross × 1.215
```

Ví dụ: Nhân viên lương gross 10 triệu → HKD/NSDLĐ thực tế chi khoảng 12.15 triệu/tháng.

### 7.1 BHXH bắt buộc của chủ hộ kinh doanh (từ 01/07/2025)

Theo Luật BHXH 2024 + NĐ 158/2025/NĐ-CP: chủ hộ của HKD có đăng ký kinh
doanh **nộp thuế theo phương pháp kê khai** thuộc diện BHXH bắt buộc từ
01/07/2025 (chủ hộ HKD khác: từ 01/07/2029; trừ người đang hưởng lương
hưu/trợ cấp BHXH hoặc đã đủ tuổi nghỉ hưu). Chủ hộ tự chọn mức tiền lương làm
căn cứ đóng, không thấp hơn mức tham chiếu và không quá 20 lần mức tham chiếu.

Tỷ lệ tự đóng toàn bộ (chủ hộ chịu cả phần NLĐ lẫn NSDLĐ):

| Khoản | Tỷ lệ | Ghi chú |
| --- | --- | --- |
| BHXH | **25%** | 3% ốm đau-thai sản + 22% hưu trí-tử tuất |
| BHYT | **4,5%** | |
| **Tổng** | **29,5%** | trên mức tiền lương đã chọn |

- Mức tham chiếu = lương cơ sở: **2,34tr đến 30/06/2026** → **2,53tr từ
  01/07/2026** (NĐ 161/2026). BHXH tối thiểu = 25% × mức tham chiếu (585.000đ →
  632.500đ); trần = 20× mức tham chiếu (46,8tr → 50,6tr).
- Khoản này nằm **ngoài bảng lương nhân viên** — theo dõi như chi phí của chủ hộ.
  Lưu ý: lương chủ hộ **không** là chi phí được trừ khi tính TNCN theo (doanh thu
  − chi phí) ở nhóm > 3 tỷ (NĐ 68/2026 — xem `einvoice-tax.md` §4).

---

## 8. Các mức lương tham chiếu

| Vị trí (ví dụ Cơm Tấm Má Tư) | Lương gross tham chiếu | Ghi chú                   |
| ---------------------------- | ---------------------- | ------------------------- |
| Chef (bếp trưởng)            | 12–18 triệu            | Theo kinh nghiệm          |
| Cashier / Waiter             | 6–9 triệu              | + % service charge nếu có |
| Branch Manager               | 20–35 triệu            |                           |
| Area Manager                 | 35–55 triệu            |                           |

**Lương tối thiểu vùng từ 01/01/2026** (NĐ 293/2025/NĐ-CP — Vùng I, gồm
TP.HCM): **5,310,000 VND/tháng** (Vùng II 4,730,000; Vùng III 4,140,000).

> Lương trong HĐ phải ≥ lương tối thiểu vùng.

> ⚠️ **Đừng nhầm 2 mức:** *lương tối thiểu vùng* (sàn lương HĐLĐ, theo NĐ
> 293/2025) khác *lương cơ sở* (căn cứ tính **trần BHXH** = 20×, theo NĐ 73/2024
> → NĐ 161/2026). Lương cơ sở: 2,34tr đến 30/06/2026, **2,53tr từ 01/07/2026**.

---

## 9. Quyền truy cập (ACL)

| Hành động                    | Roles được phép                                     |
| ---------------------------- | --------------------------------------------------- |
| Xem bảng lương của mình      | Tất cả nhân viên (employee portal)                  |
| Xem bảng lương chi nhánh     | `branch_manager`                                    |
| Tạo / tính bảng lương        | `owner`                                              |
| Duyệt bảng lương             | `owner`                                             |
| Xuất dữ liệu quyết toán thuế | `owner`                                             |

---

## Tài liệu liên quan

- `docs/ref/labor-contracts.md` — Hợp đồng lao động, BHXH
- `tasks/todo.md` — phạm vi nhân sự và tiền lương hiện tại
