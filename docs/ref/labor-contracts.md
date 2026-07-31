# Hợp Đồng Lao Động — Labor Contracts

> Áp dụng: doanh nghiệp Cơm Tấm Má Tư
> Khung pháp lý: Bộ luật Lao động 2019 (BLLĐ), NĐ 145/2020, TT 10/2020

---

## 1. Phân loại hợp đồng lao động

### 1.1 Theo thời hạn (Điều 20 BLLĐ 2019)

| Loại                        | Thời hạn          | Ghi chú |
| --------------------------- | ----------------- | ------- |
| **Không xác định thời hạn** | Không xác định    | Không có ngày chấm dứt hiệu lực |
| **Xác định thời hạn**       | Không quá 36 tháng | Khi hết hạn và tiếp tục làm việc, áp quy tắc ký lại/chuyển loại tại Điều 20 |

> ⚠️ **Rule**: Nếu NLĐ đã ký 2 HĐ xác định thời hạn liên tiếp → hợp đồng thứ 3 bắt buộc là không xác định thời hạn. Hệ thống phải **cảnh báo** HR trước khi ký HĐ thứ 3.

### 1.2 Hợp đồng thử việc (Điều 24–27 BLLĐ 2019)

| Nhóm công việc theo luật | Thời gian thử việc tối đa |
| --- | ---: |
| Người quản lý doanh nghiệp theo Luật Doanh nghiệp | 180 ngày |
| Chức danh cần trình độ cao đẳng trở lên | 60 ngày |
| Chức danh cần trình độ trung cấp, công nhân kỹ thuật, nhân viên nghiệp vụ | 30 ngày |
| Công việc khác | 6 ngày làm việc |

Không suy thời hạn chỉ từ application role; HR phải map theo chức danh và yêu
cầu trình độ thực tế.

- Lương thử việc ≥ **85%** lương chính thức của vị trí đó
- Không đóng BHXH trong thời gian thử việc (nếu HĐ thử việc riêng)
- Có thể ký chung 1 HĐ gồm điều khoản thử việc (khi đó đóng BHXH ngay)

---

## 2. Nội dung bắt buộc của HĐLĐ (Điều 21 BLLĐ 2019)

```
1. Tên, địa chỉ của NSDLĐ và họ tên, chức danh người giao kết
2. Họ tên, ngày sinh, giới tính, nơi cư trú, CCCD/CMND của NLĐ
3. Công việc và địa điểm làm việc
4. Thời hạn hợp đồng
5. Mức lương theo công việc hoặc chức danh, hình thức trả lương,
   thời hạn trả lương, phụ cấp, các khoản bổ sung khác
6. Chế độ nâng bậc, nâng lương
7. Thời giờ làm việc, thời giờ nghỉ ngơi
8. Trang bị BHLĐ cho NLĐ
9. Bảo hiểm xã hội, bảo hiểm y tế, bảo hiểm thất nghiệp
10. Đào tạo, bồi dưỡng, nâng cao trình độ
```

---

## 3. Bảo hiểm bắt buộc (BHXH/BHYT/BHTN)

### 3.1 Tỷ lệ đóng

| Loại     | NLĐ đóng  | NSDLĐ đóng | Tổng    |
| -------- | --------- | ---------- | ------- |
| BHXH     | 8%        | 17.5%      | 25.5%   |
| BHYT     | 1.5%      | 3%         | 4.5%    |
| BHTN     | 1%        | 1%         | 2%      |
| **Tổng** | **10.5%** | **21.5%**  | **32%** |

**Mức lương đóng BH** = Lương cơ bản + phụ cấp lương (không tính tiền thưởng, tiền hỗ trợ ăn uống, xăng xe, nhà ở)

**Mức trần BHXH** = 20 × Lương cơ sở nhà nước: **46,800,000 VND/tháng** (lương cơ
sở 2,34tr, NĐ 73/2024) đến 30/06/2026, **50,600,000 VND/tháng** (lương cơ sở
2,53tr, NĐ 161/2026) từ 01/07/2026. SSoT: `docs/ref/legal-framework-2026.md` §6 +
`packages/shared/src/payroll/legal-versions.ts` (cap version-aware theo `effectiveFrom`).

> ⚠️ **Dev note**: Khi tính lương, trường `insurance_base_salary` trong bảng `employees` là căn cứ đóng BH, có thể khác với `base_salary`.

### 3.2 Điều kiện đóng BHXH

- HĐ từ **1 tháng trở lên** → bắt buộc đóng BHXH
- HĐ thử việc riêng < 1 tháng → không đóng
- Người lao động nước ngoài có HĐ từ 1 năm trở lên → đóng BHXH từ 01/12/2018

### 3.3 Kỳ đóng và hạn nộp

- Đóng **hàng tháng**, hạn nộp: ngày **cuối tháng** của tháng phát sinh
- Nộp qua cổng BHXH điện tử (baohiemxahoi.gov.vn) hoặc ngân hàng liên kết.
  Trong docs nội bộ, doanh nghiệp ở phía thuê lao động được gọi là **NSDLĐ**.

---

## 4. Chấm dứt hợp đồng lao động

### 4.1 Thời gian báo trước (Điều 35, 36 BLLĐ 2019)

| Loại HĐ                         | NLĐ nghỉ việc | NSDLĐ sa thải |
| ------------------------------- | ------------- | ------------- |
| Không xác định thời hạn         | **45 ngày**   | **45 ngày**   |
| Xác định thời hạn (12–36 tháng) | **30 ngày**   | **30 ngày**   |
| Xác định thời hạn < 12 tháng    | **3 ngày làm việc** | **3 ngày làm việc** |

**Các trường hợp không cần báo trước** (NLĐ được nghỉ ngay):

- NSDLĐ không bố trí theo HĐ, không trả lương đúng hạn
- Bị ngược đãi, cưỡng bức lao động
- Không được bảo đảm điều kiện về ATVSLĐ

### 4.2 Trợ cấp thôi việc / mất việc

| Loại              | Điều kiện                                      | Mức                                                      |
| ----------------- | ---------------------------------------------- | -------------------------------------------------------- |
| Trợ cấp thôi việc | Đã làm ≥ 12 tháng, NLĐ tự nghỉ hoặc thỏa thuận | 0.5 tháng lương × mỗi năm làm việc (phần chưa đóng BHTN) |
| Trợ cấp mất việc  | Thay đổi cơ cấu, công nghệ, sáp nhập           | 1 tháng lương × mỗi năm làm việc, tối thiểu 2 tháng      |

---

## 5. Database — bảng liên quan

### 5.1 Bảng `employees`

```sql
CREATE TABLE employees (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id               BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  profile_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, -- tài khoản đăng nhập
  employee_code           TEXT,
  id_number               TEXT,                                     -- CCCD/CMND
  bank_account            TEXT,
  bank_name               TEXT,

  -- Lương & BH
  base_salary             NUMERIC(15,2),                            -- Lương gộp; payroll fallback đọc trực tiếp
  insurance_base_salary   NUMERIC(15,2) NOT NULL DEFAULT 0,         -- Mức lương đóng BH (0 = BHXH off)

  -- Việc làm
  start_date              DATE,
  contract_type           TEXT,                                     -- 'probation' | 'fixed_term' | 'indefinite'
  dependents_count        INT NOT NULL DEFAULT 0 CHECK (dependents_count >= 0),
  is_active               BOOLEAN NOT NULL DEFAULT true,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(employee_code, tenant_id),
  UNIQUE(profile_id, tenant_id)
);
```

### 5.2 Bảng `employment_contracts`

```sql
CREATE TABLE employment_contracts (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id               BIGINT NOT NULL REFERENCES tenants(id),
  employee_id             BIGINT NOT NULL REFERENCES employees(id),

  contract_type           TEXT NOT NULL,                           -- 'indefinite' | 'fixed_term' | 'seasonal' | 'probation'
  contract_number         TEXT NOT NULL,
  signed_date             DATE NOT NULL,
  start_date              DATE NOT NULL,
  end_date                DATE,                                    -- NULL nếu không xác định thời hạn
  probation_end_date      DATE,

  gross_salary            NUMERIC(15,2) NOT NULL,
  insurance_base_salary   NUMERIC(15,2) NOT NULL,
  position                TEXT NOT NULL,
  work_location           TEXT,                                    -- Tên chi nhánh

  -- Lần ký thứ mấy (cảnh báo khi = 2 với fixed_term)
  contract_sequence       INT NOT NULL DEFAULT 1,

  -- Tài liệu
  document_url            TEXT,                                    -- Link file HĐ đã ký scan

  status                  TEXT NOT NULL DEFAULT 'active',         -- 'active' | 'expired' | 'terminated'
  terminated_at           DATE,
  termination_notice_date DATE,                                    -- Ngày thông báo
  termination_reason      TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(contract_number, tenant_id)
);
```

### 5.3 Nhất quán `insurance_base_salary` giữa 3 bảng

Theo luật VN, **mức lương đóng BH** ≠ **lương gross**:

```
Mức đóng BH = Lương cơ bản + phụ cấp lương (KHÔNG tính: thưởng, hỗ trợ ăn, xăng xe, nhà ở)
Trần BHXH   = 20 × Lương cơ sở = 46,800,000 VND/tháng đến 30/06/2026,
              50,600,000 VND/tháng từ 01/07/2026 (NĐ 161/2026; cap version-aware)
```

Trường này tồn tại ở 3 bảng với vai trò khác nhau:

| Bảng                   | Trường                  | Vai trò                                                              |
| ---------------------- | ----------------------- | -------------------------------------------------------------------- |
| `employment_contracts` | `insurance_base_salary` | **Source of truth** — HR nhập khi ký HĐ                              |
| `employees`            | `insurance_base_salary` | **Derived** — auto sync từ HĐ active mới nhất                        |
| `payroll_entries`      | `insurance_base`        | **Immutable snapshot** — lock lúc tính lương, không đổi sau approved |

**Luồng dữ liệu:**

```
employment_contracts (source of truth)
        │
        │  Khi HĐ mới → status = 'active' → auto sync
        ▼
employees.insurance_base_salary (derived/cache)
        │
        │  Payroll calc: snapshot vào payroll_entries
        ▼
payroll_entries.insurance_base (immutable snapshot)
```

**Rủi ro nếu không nhất quán:**

1. Ký HĐ mới mà quên sync `employees` → payroll tính BH theo mức cũ → sai BHXH → bị phạt
2. Sửa `employees` trực tiếp không qua HĐ → mất audit trail, cơ quan BHXH kiểm tra không khớp
3. Payroll lấy từ `employees` thay vì HĐ hiện hành → HĐ mới có hiệu lực giữa tháng sẽ lấy sai mức

> **Runtime contract**: Payroll lấy `insurance_base_salary` từ `employment_contracts` active khi có HĐLĐ, rồi fallback về `employees` cho dữ liệu legacy chưa chuẩn hóa. `payroll_entries.insurance_base` là snapshot — KHÔNG bao giờ thay đổi sau khi payroll approved.

### 5.4 Mô hình tính lương doanh nghiệp có HĐLĐ/BHXH tối thiểu

Theo cập nhật owner ngày 26/06/2026, payroll trong app dùng HĐLĐ khi có nhưng
vẫn giữ fallback hồ sơ nhân viên để không làm gãy dữ liệu legacy:

- `calculatePayroll` (`apps/web/app/(protected)/hr/payroll-actions.ts`) đọc
  `employment_contracts` active trong kỳ và ưu tiên:
  - `gross_salary` làm lương gộp tháng.
  - `insurance_base_salary` làm mức lương đóng BH.
- Nếu nhân viên chưa có HĐ active, payroll fallback `employees.base_salary` và
  `employees.insurance_base_salary`.
- Lương theo ngày công + phép năm có lương → prorate theo `standard_days`.
- BHXH/BHYT/BHTN tính qua `calculatePayrollEntry` + `legal-versions.ts`; không
  hardcode tỷ lệ trong app action.
- `payroll_entries.insurance_base` là snapshot bất biến tại lúc tính lương.

Slice này chưa làm upload file HĐ, cảnh báo ký HĐ lần 3, gia hạn/chấm dứt nâng
cao, hay workflow kế toán BHXH. Những phần đó mở sau khi owner/kế toán chốt
quy trình hồ sơ thật.

---

## 6. Quy trình onboarding nhân viên

```
1. HR nhập hồ sơ nhân viên (employees table)
2. Chọn loại hợp đồng → hệ thống kiểm tra contract_sequence
   - Nếu contract_sequence = 3 và type = 'fixed_term' → cảnh báo: "Phải ký HĐ không xác định thời hạn"
3. Ký HĐ → upload scan → lưu document_url
4. Cài đặt tài khoản hệ thống (profiles + position_id; phân quyền qua staff_permissions/role_templates)
5. Đăng ký BHXH tại cơ quan BHXH địa phương (ngoài hệ thống)
6. Khai báo người phụ thuộc giảm trừ thuế TNCN (xem payroll-pit.md)
```

---

## 7. Quy trình offboarding

```
1. Nhận đơn nghỉ việc / quyết định chấm dứt
2. Ghi nhận ngày thông báo (termination_notice_date)
3. Kiểm tra đủ thời gian báo trước?
   - Thiếu → tính bồi thường thay thế thời gian báo trước
4. Tính trợ cấp thôi việc (nếu có)
5. Xử lý lương cuối cùng + các khoản còn lại
6. Đóng tài khoản hệ thống (employment_status = 'terminated')
7. Báo giảm BHXH tại cơ quan BHXH
```

---

## 8. Ngày nghỉ lễ bắt buộc (Điều 112 BLLĐ 2019)

| Ngày nghỉ           | Số ngày | Ghi chú                      |
| ------------------- | ------- | ---------------------------- |
| Tết Dương lịch      | 1 ngày  | 1/1                          |
| Tết Nguyên Đán      | 5 ngày  | 30 Tết + 1–4 tháng 1 âm lịch |
| Giỗ Tổ Hùng Vương   | 1 ngày  | 10/3 âm lịch                 |
| Giải phóng miền Nam | 1 ngày  | 30/4                         |
| Quốc tế Lao động    | 1 ngày  | 1/5                          |
| Quốc khánh          | 2 ngày  | 2/9 + 1 ngày liền kề         |

Nếu ngày nghỉ trùng Thứ 7 hoặc CN → được nghỉ bù ngày làm việc tiếp theo.

---

## 9. Quyền truy cập (ACL)

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
