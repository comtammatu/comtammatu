# Hợp Đồng Lao Động — Labor Contracts

> Áp dụng: doanh nghiệp Cơm Tấm Má Tư
> Khung pháp lý: Bộ luật Lao động 2019 (BLLĐ), NĐ 145/2020, TT 10/2020

---

## 1. Phân loại hợp đồng lao động

### 1.1 Theo thời hạn (Điều 20 BLLĐ 2019)

| Loại                        | Thời hạn          | Ghi chú |
| --------------------------- | ----------------- | ------- |
| **Không xác định thời hạn** | Không xác định    | Không có ngày chấm dứt hiệu lực |
| **Xác định thời hạn**       | Không quá 36 tháng | Hết hạn + tiếp tục làm → quy tắc ký lại/chuyển loại Điều 20 |

> ⚠️ Đã ký 2 HĐ xác định thời hạn liên tiếp → HĐ thứ 3 bắt buộc không xác định
> thời hạn. Hệ thống **cảnh báo** HR trước khi ký HĐ thứ 3.

### 1.2 Hợp đồng thử việc (Điều 24–27 BLLĐ 2019)

| Nhóm công việc theo luật | Thời gian thử việc tối đa |
| --- | ---: |
| Người quản lý doanh nghiệp theo Luật Doanh nghiệp | 180 ngày |
| Chức danh cần trình độ cao đẳng trở lên | 60 ngày |
| Chức danh cần trình độ trung cấp, công nhân kỹ thuật, nhân viên nghiệp vụ | 30 ngày |
| Công việc khác | 6 ngày làm việc |

Không suy thời hạn từ app role — HR map chức danh/trình độ thực tế. Lương thử
≥ **85%** lương chính thức. HĐ thử việc riêng → không đóng BHXH; ký chung 1 HĐ
có điều khoản thử việc → đóng BHXH ngay.

---

## 2. Nội dung bắt buộc HĐLĐ (Điều 21 BLLĐ 2019)

NSDLĐ (tên, địa chỉ, người giao kết); NLĐ (họ tên, ngày sinh, giới tính, cư
trú, CCCD); công việc + địa điểm; thời hạn; lương / hình thức / kỳ trả / phụ
cấp / bổ sung; nâng bậc–lương; giờ làm–nghỉ; BHLĐ; BHXH/BHYT/BHTN; đào tạo.

---

## 3. Bảo hiểm bắt buộc (BHXH/BHYT/BHTN)

| Loại     | NLĐ đóng  | NSDLĐ đóng | Tổng    |
| -------- | --------- | ---------- | ------- |
| BHXH     | 8%        | 17.5%      | 25.5%   |
| BHYT     | 1.5%      | 3%         | 4.5%    |
| BHTN     | 1%        | 1%         | 2%      |
| **Tổng** | **10.5%** | **21.5%**  | **32%** |

**Mức đóng BH** = lương cơ bản + phụ cấp lương (không: thưởng, ăn, xăng, nhà ở).

**Trần BHXH** = 20 × lương cơ sở: **46,800,000** (đến 30/06/2026, NĐ 73/2024) →
**50,600,000** (từ 01/07/2026, NĐ 161/2026). SSoT:
`docs/ref/legal-framework-2026.md` §6 +
`packages/shared/src/payroll/legal-versions.ts`.

- HĐ ≥ **1 tháng** → bắt buộc BHXH; HĐ thử việc riêng < 1 tháng → không đóng
- NLĐ nước ngoài HĐ ≥ 1 năm → đóng từ 01/12/2018
- Đóng hàng tháng, hạn **cuối tháng** phát sinh (cổng BHXH / ngân hàng)

---

## 4. Chấm dứt hợp đồng

| Loại HĐ                         | NLĐ nghỉ việc | NSDLĐ sa thải |
| ------------------------------- | ------------- | ------------- |
| Không xác định thời hạn         | **45 ngày**   | **45 ngày**   |
| Xác định thời hạn (12–36 tháng) | **30 ngày**   | **30 ngày**   |
| Xác định thời hạn < 12 tháng    | **3 ngày làm việc** | **3 ngày làm việc** |

Không cần báo trước: NSDLĐ không bố trí theo HĐ / không trả lương đúng hạn; bị
ngược đãi, cưỡng bức LĐ; không bảo đảm ATVSLĐ. (Điều 35, 36 BLLĐ 2019)

| Loại              | Điều kiện                                      | Mức                                                      |
| ----------------- | ---------------------------------------------- | -------------------------------------------------------- |
| Trợ cấp thôi việc | Đã làm ≥ 12 tháng, NLĐ tự nghỉ hoặc thỏa thuận | 0.5 tháng lương × mỗi năm (phần chưa đóng BHTN) |
| Trợ cấp mất việc  | Thay đổi cơ cấu, công nghệ, sáp nhập           | 1 tháng lương × mỗi năm, tối thiểu 2 tháng      |

---

## 5. Database

### 5.1 `employees`

```sql
CREATE TABLE employees (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  employee_code TEXT, id_number TEXT, bank_account TEXT, bank_name TEXT,
  base_salary NUMERIC(15,2),
  insurance_base_salary NUMERIC(15,2) NOT NULL DEFAULT 0, -- 0 = BHXH off
  start_date DATE,
  contract_type TEXT, -- 'probation' | 'fixed_term' | 'indefinite'
  dependents_count INT NOT NULL DEFAULT 0 CHECK (dependents_count >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_code, tenant_id), UNIQUE(profile_id, tenant_id)
);
```

### 5.2 `employment_contracts`

```sql
CREATE TABLE employment_contracts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id),
  employee_id BIGINT NOT NULL REFERENCES employees(id),
  contract_type TEXT NOT NULL, -- 'indefinite'|'fixed_term'|'seasonal'|'probation'
  contract_number TEXT NOT NULL, signed_date DATE NOT NULL, start_date DATE NOT NULL,
  end_date DATE, -- NULL nếu không xác định thời hạn
  probation_end_date DATE,
  gross_salary NUMERIC(15,2) NOT NULL,
  insurance_base_salary NUMERIC(15,2) NOT NULL,
  position TEXT NOT NULL, work_location TEXT,
  contract_sequence INT NOT NULL DEFAULT 1, -- cảnh báo khi = 2 với fixed_term
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active'|'expired'|'terminated'
  terminated_at DATE, termination_notice_date DATE, termination_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contract_number, tenant_id)
);
```

### 5.3 `insurance_base_salary` (canonical) + runtime payroll

| Bảng                   | Trường                  | Vai trò |
| ---------------------- | ----------------------- | ------- |
| `employment_contracts` | `insurance_base_salary` | **Source of truth** — HR nhập khi ký HĐ |
| `employees`            | `insurance_base_salary` | **Derived** — sync từ HĐ active mới nhất |
| `payroll_entries`      | `insurance_base`        | **Immutable snapshot** — lock lúc tính lương |

```
employment_contracts (SoT) → sync khi active → employees (cache)
  → payroll snapshot → payroll_entries.insurance_base
```

Payroll lấy từ HĐ active, fallback `employees` (legacy). Snapshot không đổi sau
approved. Không sửa `employees` bỏ qua HĐ. `calculatePayroll`
(`apps/web/app/(protected)/hr/payroll-actions.ts`): ưu tiên
`gross_salary` / `insurance_base_salary` HĐ; BH qua `calculatePayrollEntry` +
`legal-versions.ts`. Prorate/ngày công: `docs/ref/payroll-pit.md` §4.

---

## 6. Onboarding / offboarding

**On:** `employees` → loại HĐ + `contract_sequence` (cảnh báo lần 3 fixed_term)
→ ký/upload → tài khoản + phân quyền → đăng ký BHXH (ngoài hệ thống) → NP thuộc
TNCN (`payroll-pit.md`).

**Off:** đơn/QĐ → `termination_notice_date` → báo trước? → trợ cấp → lương cuối
→ `employment_status = 'terminated'` → báo giảm BHXH.

---

## 7. Ngày nghỉ lễ bắt buộc (Điều 112 BLLĐ 2019)

| Ngày nghỉ           | Số ngày | Ghi chú                      |
| ------------------- | ------- | ---------------------------- |
| Tết Dương lịch      | 1 ngày  | 1/1                          |
| Tết Nguyên Đán      | 5 ngày  | 30 Tết + 1–4 tháng 1 âm lịch |
| Giỗ Tổ Hùng Vương   | 1 ngày  | 10/3 âm lịch                 |
| Giải phóng miền Nam | 1 ngày  | 30/4                         |
| Quốc tế Lao động    | 1 ngày  | 1/5                          |
| Quốc khánh          | 2 ngày  | 2/9 + 1 ngày liền kề         |

Trùng T7/CN → nghỉ bù ngày làm việc tiếp theo.

---

## 8. Quyền truy cập (ACL)

| Hành động            | Roles được phép                            |
| -------------------- | ------------------------------------------ |
| Xem hồ sơ nhân viên  | `branch_manager` (chi nhánh mình), `owner` |
| Tạo / sửa hợp đồng   | `owner`                                    |
| Xem tất cả chi nhánh | `owner`                                    |
| Terminate nhân viên  | `owner`                                    |

---

## Tài liệu liên quan

- `docs/ref/payroll-pit.md` — Tính lương & thuế TNCN
- `tasks/todo.md` — phạm vi nhân sự và tiền lương hiện tại
