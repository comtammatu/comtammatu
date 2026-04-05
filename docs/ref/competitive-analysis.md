# Phân Tích Cạnh Tranh — Phần Mềm Quản Lý F&B Việt Nam

> Cập nhật: 2026-04-01
> Phạm vi: Thị trường phần mềm quản lý nhà hàng / F&B nội địa Việt Nam
> Mục đích: Xác định lợi thế cạnh tranh và feature gaps của hệ thống Cơm Tấm Má Tư

---

## 1. Bức tranh thị trường

### Các đối thủ trực tiếp (cùng phân khúc F&B chain, Việt Nam)

| Đối thủ                     | Thành lập | Quy mô               | Phân khúc chính          | Giá từ                        |
| --------------------------- | --------- | -------------------- | ------------------------ | ----------------------------- |
| **iPOS** (ipos.vn)          | ~2010     | 100,000+ thương hiệu | SMB → Chain cao cấp      | ~$69/tháng (~1.7M VND)        |
| **KiotViet** (kiotviet.vn)  | 2014      | 300,000+ cửa hàng    | SMB, siêu nhỏ → vừa      | 200,000 – 490,000 VND/tháng   |
| **MISA CukCuk** (cukcuk.vn) | 2016      | Không công bố        | SMB → Chain nhỏ          | 199,000 VND/tháng             |
| **Sapo FnB** (sapo.vn)      | 2018      | Không công bố        | Quán nhỏ → Multi-channel | 119,000 – 1,499,000 VND/tháng |
| **bePOS** (bepos.io)        | 2018      | 12,000+ cửa hàng     | SMB, mobile-first        | ~1,700,000 VND/tháng          |

### Định vị thị trường

```
GIÁ CAO / TÍNH NĂNG PHỨC TẠP
           │
 iPOS ─────┤──── [Cơm Tấm Má Tư System]
 bePOS     │     (Custom-built, single tenant)
           │
MISA CukCuk┤
           │
 Sapo FnB ─┤
           │
 KiotViet ─┤
           │
GIÁ THẤP / ĐƠN GIẢN
  │───────────────────│
 CHAIN              ĐƠN LẺ
```

---

## 2. Feature Comparison Matrix

**Thang điểm:**

- ✅ **Mạnh** — Tính năng đầy đủ, được thực hiện tốt
- 🟡 **Cơ bản** — Có tính năng nhưng không nổi bật
- ⚠️ **Yếu** — Tồn tại nhưng nhiều hạn chế
- ❌ **Không có** — Chưa có tính năng này

### 2.1 POS & Order Management

| Tính năng                       | Cơm Tấm Má Tư | iPOS | KiotViet | MISA CukCuk | Sapo FnB | bePOS |
| ------------------------------- | ------------- | ---- | -------- | ----------- | -------- | ----- |
| POS bàn (Table management)      | ✅            | ✅   | ✅       | ✅          | ✅       | ✅    |
| POS di động (tablet/mobile)     | ✅            | ✅   | ✅       | ✅          | ✅       | ✅    |
| Quản lý trạng thái bàn realtime | ✅            | ✅   | 🟡       | ✅          | 🟡       | ✅    |
| Tách / gộp bàn                  | 🟡            | ✅   | 🟡       | ✅          | ✅       | ✅    |
| Tách / gộp bill                 | ❌            | ✅   | 🟡       | ✅          | ✅       | ✅    |
| QR self-order                   | ⏳ Post-v1.0  | ✅   | ⚠️       | ✅          | 🟡       | ✅    |
| Kết nối GrabFood / ShopeeFood   | ❌            | ✅   | 🟡       | ✅          | ✅       | ✅    |
| Kết nối Baemin                  | ❌            | ✅   | ❌       | ❌          | ❌       | 🟡    |
| Offline mode                    | ❌            | 🟡   | ✅       | 🟡          | 🟡       | ✅    |

### 2.2 KDS (Kitchen Display System)

| Tính năng                         | Cơm Tấm Má Tư | iPOS | KiotViet | MISA CukCuk | Sapo FnB | bePOS |
| --------------------------------- | ------------- | ---- | -------- | ----------- | -------- | ----- |
| KDS màn hình bếp                  | ✅            | ✅   | ✅       | ✅          | ✅       | ✅    |
| Realtime order queue              | ✅            | ✅   | 🟡       | ✅          | 🟡       | ✅    |
| Bump / hoàn thành món             | ✅            | ✅   | 🟡       | ✅          | 🟡       | ✅    |
| Phân loại theo trạm bếp (Station) | ✅            | ✅   | ⚠️       | 🟡          | ⚠️       | 🟡    |
| Cảnh báo âm thanh                 | ❌            | 🟡   | ❌       | ✅          | ❌       | 🟡    |
| Thời gian chế biến tracking       | ❌            | 🟡   | ❌       | ✅          | ❌       | 🟡    |

### 2.3 Thanh toán (Payments)

| Tính năng                         | Cơm Tấm Má Tư | iPOS | KiotViet | MISA CukCuk | Sapo FnB | bePOS |
| --------------------------------- | ------------- | ---- | -------- | ----------- | -------- | ----- |
| Tiền mặt                          | ✅            | ✅   | ✅       | ✅          | ✅       | ✅    |
| VietQR / chuyển khoản             | ✅            | ✅   | ✅       | ✅          | ✅       | ✅    |
| MoMo                              | ✅ M4         | ✅   | 🟡       | ✅          | ✅       | ✅    |
| VNPay                             | ❌ Post-v1    | 🟡   | ✅       | 🟡          | ✅       | ✅    |
| Visa/Mastercard                   | ❌            | 🟡   | ✅       | 🟡          | ✅       | ✅    |
| Thanh toán chia nhiều phương thức | ❌            | ✅   | ✅       | ✅          | ✅       | ✅    |

### 2.4 HĐĐT & Thuế (E-Invoice & Tax)

| Tính năng                          | Cơm Tấm Má Tư | iPOS              | KiotViet         | MISA CukCuk         | Sapo FnB | bePOS |
| ---------------------------------- | ------------- | ----------------- | ---------------- | ------------------- | -------- | ----- |
| Xuất HĐĐT đầu ra                   | ✅ M6         | ✅ (iPOS Invoice) | ✅ (KV-EINVOICE) | ✅ (MISA meInvoice) | 🟡       | ⚠️    |
| Multi-provider (Viettel/MISA/VNPT) | ✅            | ✅ (tự có)        | ✅ (tự có)       | ✅ (tự có)          | 🟡       | ⚠️    |
| Hóa đơn đầu vào / Supplier         | ✅ M6         | 🟡                | ❌               | 🟡                  | ❌       | ❌    |
| 3-way matching (PO/GRN/HĐ)         | ✅ M6         | ❌                | ❌               | ❌                  | ❌       | ❌    |
| VAT khấu trừ đầu vào               | ✅ M6         | ❌                | ❌               | 🟡                  | ❌       | ❌    |
| Báo cáo thuế GTGT hàng tháng       | ✅ M6         | 🟡                | 🟡               | ✅                  | ❌       | ❌    |

### 2.5 Kho hàng (Inventory)

| Tính năng                      | Cơm Tấm Má Tư    | iPOS | KiotViet | MISA CukCuk | Sapo FnB | bePOS |
| ------------------------------ | ---------------- | ---- | -------- | ----------- | -------- | ----- |
| Quản lý nguyên liệu            | ✅               | ✅   | ✅       | ✅          | ✅       | 🟡    |
| Công thức món (Recipe costing) | ✅               | ✅   | 🟡       | ✅          | 🟡       | ❌    |
| Xuất kho tự động theo order    | ✅               | ✅   | ✅       | ✅          | ✅       | 🟡    |
| Cảnh báo tồn kho min/max       | ✅               | ✅   | ✅       | ✅          | ✅       | 🟡    |
| Kiểm kê kho                    | ✅               | ✅   | ✅       | ✅          | 🟡       | ❌    |
| Phiếu nhập kho GRN             | ✅ M5            | 🟡   | ✅       | ✅          | ✅       | ❌    |
| Purchase Order (PO)            | ✅ M5            | 🟡   | ✅       | 🟡          | 🟡       | ❌    |
| FIFO / FEFO                    | 🟡 giá bình quân | ❌   | ❌       | ❌          | ❌       | ❌    |
| Phân tích Food cost            | ✅ M6            | ✅   | 🟡       | ✅          | 🟡       | ❌    |

### 2.6 Loyalty & Khách hàng thân thiết (Post-v1.0)

| Tính năng                    | Cơm Tấm Má Tư | iPOS | KiotViet | MISA CukCuk | Sapo FnB | bePOS |
| ---------------------------- | ------------- | ---- | -------- | ----------- | -------- | ----- |
| Cơ sở dữ liệu khách hàng     | ⏳ Post-v1.0  | ✅   | ✅       | ✅          | ✅       | ✅    |
| Loyalty points / tích điểm   | ⏳ Post-v1.0  | ✅   | ✅       | ✅          | 🟡       | ✅    |
| Voucher / mã giảm giá        | ⏳ Post-v1.0  | ✅   | ✅       | ✅          | ✅       | ✅    |
| Hạng thành viên (Tier)       | ⏳ Post-v1.0  | ✅   | 🟡       | 🟡          | ❌       | 🟡    |
| Chiến dịch marketing tự động | ❌            | ✅   | 🟡       | 🟡          | 🟡       | 🟡    |
| Phân tích hành vi khách hàng | ❌            | ✅   | ✅       | ✅          | 🟡       | 🟡    |

### 2.7 HR & Nhân sự

| Tính năng                 | Cơm Tấm Má Tư | iPOS             | KiotViet | MISA CukCuk | Sapo FnB | bePOS |
| ------------------------- | ------------- | ---------------- | -------- | ----------- | -------- | ----- |
| Quản lý nhân viên / hồ sơ | ✅ M7         | ✅               | ✅       | ✅          | ✅       | 🟡    |
| Ca làm / lịch trực        | ✅ M7         | ✅               | ✅       | ✅          | ✅       | 🟡    |
| Chấm công                 | ✅ M7         | ✅ (FaceID/WiFi) | ✅       | ✅          | 🟡       | 🟡    |
| Tính lương tự động        | ✅ M7         | ✅               | ✅       | ✅          | 🟡       | ❌    |
| BHXH/BHYT/BHTN            | ✅ M7         | ⚠️               | ❌       | ⚠️          | ❌       | ❌    |
| Thuế TNCN lũy tiến        | ✅ M7         | ⚠️               | ❌       | ⚠️          | ❌       | ❌    |
| Hợp đồng lao động         | ✅ M7         | ❌               | ❌       | ❌          | ❌       | ❌    |
| Quyết toán thuế TNCN      | ✅ M7         | ❌               | ❌       | ❌          | ❌       | ❌    |

### 2.8 Báo cáo & Analytics

| Tính năng                    | Cơm Tấm Má Tư | iPOS | KiotViet | MISA CukCuk       | Sapo FnB | bePOS |
| ---------------------------- | ------------- | ---- | -------- | ----------------- | -------- | ----- |
| Dashboard doanh thu realtime | ✅ M6         | ✅   | ✅       | ✅                | ✅       | ✅    |
| Báo cáo theo chi nhánh       | ✅            | ✅   | ✅       | ✅                | ✅       | ✅    |
| Phân tích menu / top món     | ✅ M6         | ✅   | ✅       | ✅                | ✅       | 🟡    |
| Food cost analysis           | ✅ M6         | ✅   | 🟡       | ✅                | 🟡       | ❌    |
| Báo cáo tài chính (VAS)      | ✅ M6         | ❌   | ❌       | ✅ (MISA kế toán) | ❌       | ❌    |
| Báo cáo lương & thuế TNCN    | ✅ M7         | ⚠️   | ❌       | ⚠️                | ❌       | ❌    |
| Báo cáo thuế GTGT            | ✅ M6         | 🟡   | 🟡       | ✅                | ❌       | ❌    |
| Materialized Views / OLAP    | ✅ M6         | ❌   | ❌       | ❌                | ❌       | ❌    |

### 2.9 Multi-Branch & Vận hành chuỗi

| Tính năng                      | Cơm Tấm Má Tư | iPOS | KiotViet | MISA CukCuk | Sapo FnB | bePOS |
| ------------------------------ | ------------- | ---- | -------- | ----------- | -------- | ----- |
| Quản lý nhiều chi nhánh        | ✅            | ✅   | ✅       | ✅          | ✅       | ✅    |
| RLS bảo mật theo tenant/branch | ✅            | ⚠️   | ⚠️       | ⚠️          | ⚠️       | ⚠️    |
| Phân quyền 8 cấp nhân viên     | ✅            | 🟡   | 🟡       | 🟡          | 🟡       | 🟡    |
| Menu khác nhau theo chi nhánh  | ✅            | ✅   | ✅       | ✅          | ✅       | 🟡    |
| Giá khác nhau theo chi nhánh   | ❌            | ✅   | 🟡       | ✅          | 🟡       | 🟡    |
| ACL module-level               | ✅            | 🟡   | ❌       | 🟡          | ❌       | ❌    |

### 2.10 Kỹ thuật & Tùy biến

| Tính năng                         | Cơm Tấm Má Tư | iPOS | KiotViet | MISA CukCuk | Sapo FnB | bePOS |
| --------------------------------- | ------------- | ---- | -------- | ----------- | -------- | ----- |
| Cloud-native (Supabase/PostgREST) | ✅            | ✅   | ✅       | ✅          | ✅       | ✅    |
| API mở / webhook                  | ✅            | ⚠️   | ⚠️       | ⚠️          | ⚠️       | ⚠️    |
| Custom-built cho 1 tenant         | ✅ (lợi thế)  | ❌   | ❌       | ❌          | ❌       | ❌    |
| Không vendor lock-in              | ✅            | ❌   | ❌       | ❌          | ❌       | ❌    |
| Offline mode                      | ❌            | 🟡   | ✅       | 🟡          | 🟡       | ✅    |
| In hóa đơn (printer)              | ✅ M2+M3      | ✅   | ✅       | ✅          | ✅       | ✅    |

---

## 3. Phân tích Positioning

### 3.1 Claim của từng đối thủ

| Đối thủ                  | Tagline / Positioning chính     | Điểm nhấn                                   |
| ------------------------ | ------------------------------- | ------------------------------------------- |
| **iPOS**                 | "Hệ sinh thái F&B toàn diện"    | All-in-one, 15 năm kinh nghiệm, ecosystem   |
| **KiotViet**             | "Phần mềm bán hàng #1 Việt Nam" | Dễ dùng, giá rẻ, 300k+ cửa hàng             |
| **MISA CukCuk**          | "Quản lý nhà hàng thông minh"   | Tích hợp kế toán MISA, e-invoice miễn phí   |
| **Sapo FnB**             | "Quản lý đa kênh cho F&B"       | Online + offline, Facebook orders           |
| **bePOS**                | "Zero learning curve POS"       | Mobile-first, siêu dễ dùng                  |
| **Cơm Tấm Má Tư System** | Internal tool — custom-built    | Tùy biến 100%, pháp lý CTCP, không phí/user |

### 3.2 Khoảng trống chưa ai chiếm (Positioning Gaps)

Sau khi phân tích, có **3 khoảng trắng** rõ ràng mà không đối thủ nào lấp đầy tốt:

**Gap 1 — Tuân thủ pháp lý CTCP đầy đủ**
Không đối thủ nào hỗ trợ đồng bộ: HĐLĐ đúng BLLĐ 2019 + BHXH/BHYT/BHTN đúng tỷ lệ + thuế TNCN lũy tiến + quyết toán năm + báo cáo tài chính VAS. Đây là **lợi thế cạnh tranh lớn nhất** của hệ thống khi phục vụ CTCP.

**Gap 2 — 3-way matching Procurement**
Không ai có PO → GRN → Supplier Invoice với VAT khấu trừ đầu vào tự động. Chuỗi F&B lớn phải làm thủ công hoặc dùng thêm phần mềm kế toán riêng.

**Gap 3 — Audit trail & RLS bảo mật cấp DB**
Các phần mềm SaaS dùng logic phân quyền ở application layer. Hệ thống này dùng Row Level Security ở PostgreSQL → không thể bị bypass dù có bug ở tầng app.

---

## 4. Phân tích Giá

| Đối thủ                  | Giá/tháng (VND)       | Mô hình                   | Chi nhánh thêm       |
| ------------------------ | --------------------- | ------------------------- | -------------------- |
| KiotViet                 | 200k – 490k           | Per-plan, unlimited users | +180k/branch         |
| MISA CukCuk              | 199k – nhiều tầng     | Per-plan                  | Included / cùng tầng |
| Sapo FnB                 | 119k – 1,499k         | Per-plan                  | Varies               |
| iPOS                     | ~1,700k ($69)         | Per-outlet                | Liên hệ              |
| bePOS                    | ~1,700k               | Per-outlet                | Liên hệ              |
| **Cơm Tấm Má Tư System** | **Chi phí dev 1 lần** | **Internal tool**         | **Không phí/branch** |

**Insight về chi phí**: Nếu chuỗi có 5 chi nhánh:

- KiotViet: ~490k + 180k × 4 = **1,210,000 VND/tháng** = **14,520,000 VND/năm**
- iPOS: $69 × 5 = $345/tháng ≈ **8,600,000 VND/tháng** = **103,000,000 VND/năm**
- Cơm Tấm Má Tư System: Chi phí dev một lần + hosting Supabase ~$25/tháng = **~600,000 VND/tháng**

→ ROI dương sau ~3–6 tháng so với iPOS với chuỗi 5 chi nhánh.

---

## 5. Điểm yếu của hệ thống Cơm Tấm Má Tư (vs đối thủ)

| Điểm yếu hiện tại                  | Mức độ ảnh hưởng             | Roadmap giải quyết          |
| ---------------------------------- | ---------------------------- | --------------------------- |
| Không có offline mode              | 🔴 Cao — mất điện / mất mạng | Post-v1.0 (PWA + IndexedDB) |
| Chưa kết nối GrabFood / ShopeeFood | 🟠 Trung bình                | Post-v1.0 (nếu có)          |
| QR Self-order chưa live            | 🟡 Thấp                      | Post-v1.0                   |
| Chưa có app mobile native          | 🟡 Thấp                      | PWA đủ dùng trước mắt       |
| Chưa có tách bill                  | 🟡 Thấp                      | M2 hoặc backlog             |
| Chưa có marketing automation       | 🟢 Thấp                      | Post-v1.0                   |

---

## 6. Lợi thế cạnh tranh (Unfair Advantages)

Hệ thống Cơm Tấm Má Tư không cần cạnh tranh trực tiếp với SaaS — đây là **internal tool cho 1 tenant duy nhất**. Lợi thế:

1. **Zero per-user, per-branch cost** — Không phí theo số user hay chi nhánh khi scale.
2. **Full data ownership** — Không phụ thuộc vendor, không lo chính sách thay đổi, không data lock-in.
3. **Tuân thủ pháp lý CTCP hoàn chỉnh** — HĐLĐ + BHXH + TNCN + HĐĐT + VAS reporting theo đúng pháp luật VN.
4. **Có thể tùy biến 100%** — Workflow đặc thù của Cơm Tấm Má Tư được xây từ đầu, không ép vào template generic.
5. **Security-first (RLS tầng DB)** — Không phần mềm SaaS nào có bảo mật dữ liệu ở tầng DB như PostgreSQL RLS.

---

## 7. Sources

- [ipos.vn](https://ipos.vn/en/) — Official site + Capterra reviews
- [kiotviet.vn](https://www.kiotviet.vn/) — Official site + G2 reviews
- [cukcuk.vn](https://www.cukcuk.vn/) + [cukcuk.com](https://cukcuk.com/) — Official + financesonline reviews
- [sapo.vn/bang-gia](https://www.sapo.vn/bang-gia.html) — Pricing page
- [bepos.io](https://www.bepos.io/) — Official site
- [ibos.io — Top 15+ POS Software Vietnam](https://ibos.io/top-15-pos-software-in-vietnam/)
- [tracxn.com — iPOS.vn profile](https://tracxn.com/d/companies/ipos.vn/)
- Ngày nghiên cứu: 2026-04-01
