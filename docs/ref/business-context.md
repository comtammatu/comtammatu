# Bối cảnh nghiệp vụ — Hộ kinh doanh Cơm Tấm Má Tư

> Last verified: 2026-07-08.

## Sản phẩm

**Bộ phần mềm quản lý vận hành và bán hàng** cho Hộ kinh doanh Cơm Tấm
Má Tư, mô hình F&B single-tenant, multi-branch.

Phạm vi sản phẩm: POS, KDS, thực đơn, nhân sự, kho hàng, thanh toán, HĐĐT
HKD, đối soát tiền, báo cáo vận hành, và xuất dữ liệu cho kế toán/thuế.
Nhiệm vụ hệ thống: bán đúng, bếp nhận đúng, thu tiền đúng, in/hóa đơn đúng,
kho trừ đúng, và chủ/quản lý nhìn được tình trạng vận hành thật theo ngày.
Đây là hệ thống quản lý vận hành nhà hàng chuyên biệt: gom lớp nền, báo cáo,
và các domain vận hành vào một kiến trúc thống nhất.
Không phải nền tảng nhiều merchant, không phải hệ thống quản lý khách hàng độc lập, không phải ERP đa ngành, không phải phần mềm bán hàng đại trà.

## Mô hình pháp lý hiện hành

Cơm Tấm Má Tư vận hành theo mô hình **Hộ kinh doanh (HKD)**, không phải
Công ty Cổ phần. Trong docs hiện hành, `HKD` là thuật ngữ pháp lý mặc định;
`CTCP`, `JSC`, `cổ phần`, `báo cáo tài chính doanh nghiệp`, và `VAS/TT200`
chỉ được dùng khi nói về lịch sử, năng lực nâng cấp sau này, hoặc trường hợp
chuyển đổi sang doanh nghiệp.

Các nguyên tắc vận hành đến ngày 08/07/2026:

- HKD do chủ hộ hoặc thành viên hộ gia đình đăng ký; chủ hộ/chủ thể đăng ký
  chịu trách nhiệm với hoạt động kinh doanh theo quy định về HKD.
- Không mặc định coi HKD là pháp nhân doanh nghiệp. Trong DB, `tenant` là
  hồ sơ chủ thể kinh doanh single-tenant, không phải "công ty mẹ".
- Từ 01/01/2026, HKD/cá nhân kinh doanh không áp dụng phương pháp thuế khoán
  và không còn nộp lệ phí môn bài theo NQ 198/2025/QH15; hệ thống phải ưu tiên
  số liệu doanh thu, hóa đơn, chứng từ và sổ theo dõi đủ để kê khai.
- HKD doanh thu ≥ 1 tỷ/năm bán trực tiếp đến người tiêu dùng (gồm ăn uống) thuộc
  diện bắt buộc HĐĐT khởi tạo từ máy tính tiền kết nối CQT; từ 01/07/2026 văn bản
  hiện hành cho HĐĐT/chứng từ điện tử là NĐ 254/2026/NĐ-CP. NĐ 68/2026 phân HKD
  thành 4 nhóm doanh thu với nghĩa vụ sổ sách/kê khai khác nhau — chi tiết ở
  `einvoice-tax.md` §1.
- Chế độ kế toán HKD theo TT 152/2025/TT-BTC (thay TT 88/2021 từ 01/01/2026),
  bộ sổ tổ chức theo nhóm doanh thu; export của hệ thống phải đối chiếu được
  với bộ sổ này.
- Báo cáo tài chính VAS/BCTC doanh nghiệp không phải requirement mặc định cho
  HKD. Finance mặc định là báo cáo vận hành: doanh thu, tiền đã thu, chi phí,
  giá vốn món, tồn kho, công nợ NCC, HĐĐT, và export cho kế toán.

## Nghĩa vụ nghiệp vụ chính

### 1. HĐĐT và thuế HKD

- HĐĐT bán ra theo cấu hình HKD đã đăng ký với cơ quan thuế/provider, không
  hardcode assumption "doanh nghiệp GTGT khấu trừ".
- POS phải lưu đủ dữ liệu order/payment/buyer để phát hành, tra cứu, hủy/thay
  thế, và xuất lại HĐĐT.
- HĐĐT thất bại không được làm mất trạng thái đã thu tiền; Finance xử lý hàng
  đợi HĐĐT sau.

### 2. Nhân sự và tiền lương

- HKD vẫn là người sử dụng lao động khi thuê nhân viên; thuật ngữ chuẩn là
  `NSDLĐ`, `NLĐ`, `HĐLĐ`, `BHXH/BHYT/BHTN`, `TNCN`.
- Sản phẩm hiện tại ưu tiên ngày công, ca làm, phiếu lương, và export dữ liệu cho
  kế toán/thuế. Payroll pháp lý đầy đủ là capability hỗ trợ, không phải mặt
  bằng mặc định cho mọi operator.

### 3. Báo cáo vận hành F&B

- Báo cáo mặc định: doanh thu theo ngày/chi nhánh, lợi nhuận gộp trước VAT,
  giá vốn món, tồn kho, chênh lệch kiểm kê, thanh toán, HĐĐT cần xử lý.
- Advanced COA/Journal/BCTC không thuộc UX hiện tại cho HKD; chỉ xem xét lại
  khi mô hình pháp lý/chuyển đổi doanh nghiệp thay đổi bằng quyết định riêng.

## Yêu cầu đăng ký cho `tenants` table

```
legal_name TEXT       — Tên hộ kinh doanh / tên đăng ký người bán
tax_code TEXT UNIQUE  — Mã số hộ kinh doanh / mã số thuế người bán
legal_address TEXT    — Địa chỉ trụ sở HKD đã đăng ký
representative TEXT   — Chủ hộ kinh doanh / người đại diện đăng ký
```

Các field này phục vụ HĐĐT, in chứng từ, export kế toán, và đối soát thuế. Không
được đồng bộ tự động `representative` với `owner_user_id`; một bên là thông tin
đăng ký HKD, một bên là tài khoản auth owner trong hệ thống.

## Căn cứ pháp lý theo dõi (đến 07/2026)

Danh mục văn bản pháp lý đầy đủ (căn cứ + hiệu lực + tác động) là **SSoT** ở
[`legal-framework-2026.md`](legal-framework-2026.md) — gồm đăng ký HKD, thuế
HKD (NQ 198/2025, NĐ 68/2026, NĐ 141/2026), quản lý thuế (Luật QLT 108/2025,
NĐ 252/2026), GTGT, HĐĐT/chứng từ điện tử (NĐ 254/2026, TT 32/2025), kế toán
HKD (TT 152/2025), TNCN (Luật 109/2025, NĐ 253/2026, TT 87/2026, NQ 110/2025),
và lao động/BHXH.
Chi tiết áp dụng: thuế/hóa đơn ở `einvoice-tax.md`; lương/TNCN/BHXH ở
`payroll-pit.md`; HĐLĐ ở `labor-contracts.md`.

## Domain: chuỗi nhà hàng F&B

### Luồng mua hàng

```
PO (intent) → GRN (actual received) → Supplier Invoice / chứng từ NCC
                                        ↓
                                   3-way matching → cost/tax evidence
```

- **PO** = Purchase Order (đặt hàng)
- **GRN** = Goods Received Note (phiếu nhập kho — hàng thực nhận)
- **Supplier Invoice** = hóa đơn/chứng từ đầu vào để đối soát chi phí, giá vốn,
  và hồ sơ thuế
- Giá vốn thực tế lấy từ GRN, KHÔNG lấy từ PO

### Luồng bán hàng

```
Cashier (POS/service) → KDS (realtime) → Chef bumps → Cashier pays → completed
```

### Vai trò nhân sự (7 access bucket active)

```
owner, branch_manager, warehouse_manager, production_manager,
cashier, chef, office
```

Nguồn chuẩn: `ACCESS_BUCKETS` trong `packages/shared/src/auth/types.ts`.

### Phương thức thanh toán

- Tiền mặt
- VietQR (bank transfer)
- Momo (e-wallet)
