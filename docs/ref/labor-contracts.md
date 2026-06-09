# Hợp Đồng Lao Động — Labor Contracts

> Áp dụng: Hộ kinh doanh Cơm Tấm Má Tư
> Khung pháp lý: Bộ luật Lao động 2019 (BLLĐ), NĐ 145/2020, TT 10/2020

---

## 1. Phân loại hợp đồng lao động

### 1.1 Theo thời hạn (Điều 20 BLLĐ 2019)

| Loại                               | Thời hạn    | Ký tối đa | Ghi chú                                        |
| ---------------------------------- | ----------- | --------- | ---------------------------------------------- |
| **Không xác định thời hạn**        | Vô thời hạn | —         | Mặc định sau khi hết 2 HĐ có thời hạn          |
| **Xác định thời hạn**              | 12–36 tháng | 2 lần     | Lần 3 → phải ký không xác định thời hạn        |
| **Theo mùa vụ / công việc cụ thể** | < 12 tháng  | 1 lần     | Không gia hạn được — ký loại khác nếu tiếp tục |

> ⚠️ **Rule**: Nếu NLĐ đã ký 2 HĐ xác định thời hạn liên tiếp → hợp đồng thứ 3 bắt buộc là không xác định thời hạn. Hệ thống phải **cảnh báo** HR trước khi ký HĐ thứ 3.

### 1.2 Hợp đồng thử việc (Điều 24–27 BLLĐ 2019)

| Vị trí                                      | Thời gian thử việc tối đa |
| ------------------------------------------- | ------------------------- |
| Quản lý (branch_manager trở lên)            | 60 ngày                   |
| Nhân viên kỹ thuật / chuyên môn             | 60 ngày                   |
| Nhân viên phổ thông (waiter, chef, cashier) | 30 ngày                   |

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

**Mức trần BHXH** = 20 × Lương cơ sở nhà nước = 20 × 2,340,000 = **46,800,000 VND/tháng** (năm 2024)

> ⚠️ **Dev note**: Khi tính lương, trường `insurance_base_salary` trong bảng `employees` là căn cứ đóng BH, có thể khác với `gross_salary`.

### 3.2 Điều kiện đóng BHXH

- HĐ từ **1 tháng trở lên** → bắt buộc đóng BHXH
- HĐ thử việc riêng < 1 tháng → không đóng
- Người lao động nước ngoài có HĐ từ 1 năm trở lên → đóng BHXH từ 01/12/2018

### 3.3 Kỳ đóng và hạn nộp

- Đóng **hàng tháng**, hạn nộp: ngày **cuối tháng** của tháng phát sinh
- Nộp qua cổng BHXH điện tử (baohiemxahoi.gov.vn) hoặc ngân hàng liên kết.
  Trong docs nội bộ, phía Hộ kinh doanh được gọi bằng thuật ngữ pháp lý chung
  là **NSDLĐ** thay vì "công ty".

---

## 4. Chấm dứt hợp đồng lao động

### 4.1 Thời gian báo trước (Điều 35, 36 BLLĐ 2019)

| Loại HĐ                         | NLĐ nghỉ việc | NSDLĐ sa thải |
| ------------------------------- | ------------- | ------------- |
| Không xác định thời hạn         | **45 ngày**   | **45 ngày**   |
| Xác định thời hạn (12–36 tháng) | **30 ngày**   | **30 ngày**   |
| Mùa vụ < 12 tháng               | **3 ngày**    | **3 ngày**    |

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
  tenant_id               BIGINT NOT NULL REFERENCES tenants(id),
  branch_id               BIGINT REFERENCES branches(id),          -- NULL = văn phòng trung tâm
  profile_id              UUID REFERENCES profiles(id),            -- tài khoản đăng nhập (nullable)

  -- Thông tin cá nhân
  full_name               TEXT NOT NULL,
  date_of_birth           DATE,
  gender                  TEXT,                                     -- 'male' | 'female' | 'other'
  id_number               TEXT,                                     -- CCCD/CMND
  id_issued_date          DATE,
  id_issued_place         TEXT,
  phone                   TEXT,
  address                 TEXT,
  tax_code_personal       TEXT,                                     -- MST cá nhân (PIT)

  -- Việc làm
  position                TEXT NOT NULL,                           -- Chức danh
  department              TEXT,
  staff_role              TEXT NOT NULL,                           -- waiter|chef|cashier|...

  -- Lương & BH
  gross_salary            NUMERIC(15,2) NOT NULL,                  -- Lương thỏa thuận (gộp)
  insurance_base_salary   NUMERIC(15,2) NOT NULL,                  -- Mức lương đóng BH
  salary_type             TEXT NOT NULL DEFAULT 'monthly',         -- 'monthly' | 'hourly'
  bank_account_number     TEXT,
  bank_name               TEXT,

  -- Trạng thái
  employment_status       TEXT NOT NULL DEFAULT 'active',          -- 'probation' | 'active' | 'terminated'
  hire_date               DATE NOT NULL,
  probation_end_date      DATE,
  termination_date        DATE,
  termination_reason      TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(id_number, tenant_id),
  UNIQUE(tax_code_personal, tenant_id)
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
Trần BHXH   = 20 × Lương cơ sở = 46,800,000 VND/tháng (2024)
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

> ⚠️ **Dev note**: Khi implement M7 (Nhân sự & tiền lương), `employees.insurance_base_salary` PHẢI được sync tự động từ `employment_contracts` active. KHÔNG cho phép update trực tiếp. `payroll_entries.insurance_base` là snapshot — KHÔNG bao giờ thay đổi sau khi payroll approved.

---

## 6. Quy trình onboarding nhân viên

```
1. HR nhập hồ sơ nhân viên (employees table)
2. Chọn loại hợp đồng → hệ thống kiểm tra contract_sequence
   - Nếu contract_sequence = 3 và type = 'fixed_term' → cảnh báo: "Phải ký HĐ không xác định thời hạn"
3. Ký HĐ → upload scan → lưu document_url
4. Cài đặt tài khoản hệ thống (profiles + staff_role)
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

| Hành động            | Roles được phép                                                             |
| -------------------- | --------------------------------------------------------------------------- |
| Xem hồ sơ nhân viên  | `branch_manager` (chi nhánh mình), ``, `super_manager`, `owner` |
| Tạo / sửa hợp đồng   | `super_manager`, `owner` (và HR với role `office`)                          |
| Xem tất cả chi nhánh | `` trở lên                                                      |
| Terminate nhân viên  | `super_manager`, `owner`                                                    |

---

## Tài liệu liên quan

- `docs/ref/payroll-pit.md` — Tính lương & thuế TNCN
- `tasks/todo.md` — phạm vi nhân sự và tiền lương hiện tại
