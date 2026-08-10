# Thuế TNCN & Lương — Personal Income Tax & Payroll

> Áp dụng: doanh nghiệp Cơm Tấm Má Tư
> Khung pháp lý (đến 07/2026): Luật Thuế TNCN 2025 (109/2025/QH15, hiệu lực
> chung 01/07/2026, biểu thuế + giảm trừ mới áp dụng **từ kỳ tính thuế 2026 =
> 01/01/2026**) + NĐ 253/2026/NĐ-CP + TT 87/2026/TT-BTC; NQ 110/2025/UBTVQH15
> (giảm trừ gia cảnh mới từ kỳ tính thuế 2026); Luật BHXH 2024 (41/2024/QH15) +
> NĐ 158/2025 (BHXH bắt buộc); NĐ 73/2024 (lương cơ sở 2,34tr → trần BHXH 46,8tr, đến
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

> Biểu 7 bậc cũ (Luật 2007) chỉ còn dùng khi quyết toán các kỳ ≤ 2025.
>
> **Đồng bộ mã nguồn:** `packages/shared/src/payroll/calculate.ts` +
> `legal-versions.ts` (versioned theo `effectiveFrom`). Mọi kỳ từ 2026-01 dùng
> biểu 5 bậc (`PIT_BRACKETS_2026`). Giảm trừ 15.5M/6.2M từ 2026-01; trần BHXH
> 46.8M đến 30/06/2026, 50.6M từ 01/07/2026. Test:
> `packages/shared/src/payroll/__tests__/legal-versions.test.ts`; quy tắc
> `PAYROLL-2026-FIVE-BRACKET-AND-BHXH-CAP-STEP` (`tasks/regressions.md`).
>
> **Lưu ý kế toán:** khấu trừ H1-2026 có thể giữ biểu 7 bậc chờ true-up quyết
> toán (NĐ 253/2026). Phương án bảo thủ: trỏ version `effectiveFrom: "2026-01-01"`
> về `PIT_BRACKETS_2007` — không đổi giảm trừ/trần.

---

## 3. Giảm trừ gia cảnh

### 3.1 Mức giảm trừ (từ kỳ tính thuế 2026 — NQ 110/2025/UBTVQH15)

| Loại                | Mức giảm trừ/tháng | Mức giảm trừ/năm |
| ------------------- | ------------------ | ---------------- |
| Bản thân NLĐ        | **15,500,000 VND** | 186,000,000 VND  |
| Mỗi người phụ thuộc | **6,200,000 VND**  | 74,400,000 VND   |

> Mức cũ 11,000,000 / 4,400,000 chỉ dùng cho quyết toán kỳ ≤ 2025.

### 3.2 Điều kiện người phụ thuộc hợp lệ

| Đối tượng               | Điều kiện                                                            |
| ----------------------- | -------------------------------------------------------------------- |
| Con dưới 18 tuổi        | Không yêu cầu thu nhập                                               |
| Con từ 18 tuổi đang học | Học đại học, cao đẳng, dạy nghề                                      |
| Vợ/chồng                | Thu nhập bình quân tháng trong năm không quá 3 triệu hoặc không có khả năng lao động |
| Cha/mẹ                  | Thu nhập bình quân tháng trong năm không quá 3 triệu hoặc ≥ 60 tuổi / không có khả năng lao động |

> ⚠️ Một người phụ thuộc chỉ đăng ký giảm trừ tại **1 nơi làm việc**. Từ
> 01/07/2026, ngưỡng thu nhập NP thuộc = **3 triệu/tháng** (TT 87/2026/TT-BTC);
> mức cũ 1 triệu chỉ cho kỳ trước quy định mới. NLĐ nộp Mẫu 02/ĐK-TNCN; HR lưu
> hồ sơ — xác minh thuộc trách nhiệm NLĐ.

---

## 4. Bảng lương tháng

### 4.1 Quy trình

Công → phụ cấp/thưởng → BH NLĐ 10.5% → TNCN → dự kiến thực lĩnh → chốt →
Finance thanh toán + evidence.

### 4.2 Hợp đồng dữ liệu lương live và snapshot

`/hr/payroll` xem **lương live** theo tháng (tháng, chi nhánh, nhân viên,
`standard_days` mặc định 26). Không tạo `payroll_period` trước khi xem/tính.

| Dữ liệu hiển thị | Nguồn live | Quy tắc |
| --- | --- | --- |
| Công làm | `attendance_records` có `check_out` | D027: ca đã kết thúc quy đổi ngày công; không suy diễn ca vắng. |
| Phép có lương / nghỉ không lương | `leave_requests` đã `approved` | Phép năm theo entitlement; vượt quyền lợi và loại khác = không lương. |
| Lương tháng / mức đóng BH | HĐLĐ hiệu lực trong kỳ, fallback `employees` | Thiếu lương → trạng thái thiếu dữ liệu, không im lặng = 0. `pay_basis` từ HĐLĐ, snapshot khi chốt — không suy từ JWT role. |
| Thưởng, phụ cấp, tạm ứng, khấu trừ | `payroll_adjustments` | Loại, số dương, ghi chú, người tạo; nguồn live duy nhất cho khoản nhập bổ sung. |
| Dự kiến thực lĩnh | Nguồn trên + engine version-aware | Tính khi mở/lọc; không ghi `payroll_entries`. |

Chốt bảng lương: một transaction tạo/cập nhật snapshot tháng → `payroll_entries`,
khóa nguồn. UI: **Thực lĩnh đã chốt** / **Dự kiến thực lĩnh**. Chốt lại chỉ khi
state machine cho phép; không sửa snapshot đã giao Finance.

Công mỗi ca đã kết (ADR 0019 / D027):

`công = min(1.0, round_1dp(|(check_in, check_out) ∩ scheduled_window| / scheduled_len))`.

Chưa kết ca → không cộng. `working_days = Σ công`.

`payable_days = min(standard_days, working_days + paid_leave_days)`
`base = monthly_salary × payable_days / standard_days`.

Không khấu trừ thêm nghỉ không lương trùng phần đã thiếu trong `working_days`.

Preflight (chỉ đọc) chặn snapshot khi thiếu mức lương, ca quá giờ chưa giờ ra,
hoặc nghỉ chờ duyệt. Không tự sửa dữ liệu. Ngoại lệ Owner cần cơ chế phê duyệt
có lưu vết.

**Ranh giới Finance:** chốt ≠ đã trả. Chi lương/evidence ở Finance `expenses`
category `salary`. HR không tự set `payroll_periods.status = 'paid'`.

### 4.3 Database — `payroll_periods` và `payroll_entries`

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
  working_days        NUMERIC(5,1) NOT NULL,
  standard_days       NUMERIC(5,1) NOT NULL,
  overtime_hours      NUMERIC(6,2) DEFAULT 0,
  base_salary         NUMERIC(15,2) NOT NULL,
  allowances          NUMERIC(15,2) DEFAULT 0,
  tax_exempt_allowances NUMERIC(15,2) DEFAULT 0,
  overtime_pay        NUMERIC(15,2) DEFAULT 0,
  bonus               NUMERIC(15,2) DEFAULT 0,
  gross_total         NUMERIC(15,2) NOT NULL,
  bhxh_employee       NUMERIC(15,2) NOT NULL,    -- × 8%
  bhyt_employee       NUMERIC(15,2) NOT NULL,    -- × 1.5%
  bhtn_employee       NUMERIC(15,2) NOT NULL,    -- × 1%
  total_insurance_employee NUMERIC(15,2) NOT NULL,
  bhxh_employer       NUMERIC(15,2) NOT NULL,    -- × 17.5%
  bhyt_employer       NUMERIC(15,2) NOT NULL,    -- × 3%
  bhtn_employer       NUMERIC(15,2) NOT NULL,    -- × 1%
  total_insurance_employer NUMERIC(15,2) NOT NULL,
  -- DEFAULT 11000000 = fallback legacy (kỳ ≤ 2025). Engine ghi đè versioned
  -- từ kỳ 2026: 15.500.000 / 6.200.000 (legal-versions.ts).
  personal_deduction  NUMERIC(15,2) NOT NULL DEFAULT 11000000,
  dependent_count     INT NOT NULL DEFAULT 0,
  dependent_deduction NUMERIC(15,2) NOT NULL DEFAULT 0,
  charity_deduction   NUMERIC(15,2) DEFAULT 0,
  taxable_income      NUMERIC(15,2) NOT NULL,
  pit_tax             NUMERIC(15,2) NOT NULL,
  pit_tax_rate        NUMERIC(5,2),
  advance_deduction   NUMERIC(15,2) DEFAULT 0,
  other_deductions    NUMERIC(15,2) DEFAULT 0,
  net_salary          NUMERIC(15,2) NOT NULL,
  insurance_base      NUMERIC(15,2) NOT NULL,    -- snapshot mức đóng BH
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(payroll_period_id, employee_id, tenant_id)
);
```

### 4.4 `insurance_base`

Immutable snapshot lúc tính lương. Source of truth + luồng 3 bảng: xem
`docs/ref/labor-contracts.md` §5.3. Khi tính: lấy mức từ HĐ/`employees`, áp
trần version-aware `MIN(base, version.insuranceCap)` — **46,8tr đến 30/06/2026**,
**50,6tr từ 01/07/2026** — ghi `payroll_entries.insurance_base`.

---

## 5. Logic tính thuế TNCN (TypeScript)

Engine version-aware — không hardcode tỷ lệ/bậc/trần. Gọi
`calculatePayrollEntry` với `effectiveDate` (ngày cuối kỳ) để resolve
`legal-versions.ts`:

- `packages/shared/src/payroll/calculate.ts`
- `packages/shared/src/payroll/legal-versions.ts`

Biểu 5 bậc kỳ 2026 ở §2; biểu 7 bậc chỉ cho quyết toán kỳ ≤ 2025
(`effectiveFrom` ≤ `2024-07-01`).

---

## 6. Quyết toán thuế TNCN cuối năm

NLĐ chỉ có thu nhập 1 nơi → có thể ủy quyền quyết toán cho NSDLĐ. Hạn: **31/3**
năm kế tiếp.

| Tờ khai         | Nội dung                            | Hạn nộp                                          |
| --------------- | ----------------------------------- | ------------------------------------------------ |
| **05/KK-TNCN**  | Kê khai thuế TNCN khấu trừ từ lương | Ngày 20 tháng sau (hoặc ngày 30 quý sau nếu quý) |
| **05/QTT-TNCN** | Quyết toán thuế năm                 | 31/3 năm kế tiếp                                 |
| **05/BK-TNCN**  | Bảng kê thu nhập từng cá nhân       | Kèm theo 05/QTT-TNCN                             |

Nộp qua eTax / phần mềm kế toán — hệ thống chỉ cung cấp dữ liệu xuất. Xuất năm:
`SUM` các trường `gross_total`, `total_insurance_employee`,
`dependent_deduction`, `taxable_income`, `pit_tax` từ `payroll_entries` join
`employees`/`profiles`, lọc `period_year` và `status = 'paid'`.

---

## 7. Chi phí lương NSDLĐ

```
Total labor cost ≈ Gross × 1.215
  (= Gross + BHXH 17.5% + BHYT 3% + BHTN 1% employer)
```

Người quản lý DN / HĐQT / Giám đốc: căn cứ đóng theo chức danh, hưởng lương và
quan hệ LĐ thực tế (Luật BHXH 41/2024, NĐ 158/2025) — không suy từ app role
`owner` hay cổ đông. HR/kế toán xác nhận từng hồ sơ.

---

## 8. Mức lương tham chiếu

**Lương tối thiểu vùng từ 01/01/2026** (NĐ 293/2025 — Vùng I, gồm TP.HCM):
**5,310,000 VND/tháng** (Vùng II 4,730,000; Vùng III 4,140,000). HĐ ≥ tối thiểu
vùng.

> ⚠️ Đừng nhầm: *lương tối thiểu vùng* (sàn HĐLĐ, NĐ 293/2025) ≠ *lương cơ sở*
> (căn cứ trần BHXH = 20×: 2,34tr đến 30/06/2026, **2,53tr từ 01/07/2026**,
> NĐ 73/2024 → NĐ 161/2026).

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
