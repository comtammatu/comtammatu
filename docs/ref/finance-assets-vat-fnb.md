# Tài chính, tài sản, GTGT và lợi nhuận cho CTCP Chén Sứ

> Kiểm tra: 2026-07-30 (Asia/Ho_Chi_Minh). Khung nghiệp vụ F&B — không phải tư
> vấn kế toán/thuế/pháp lý. GTGT, chế độ kế toán, vốn hóa, khấu hao, CCDC, TNDN
> phải được đại diện/kế toán/tư vấn xác nhận trước Production.
>
> Map: `docs/modules/finance.md` · HĐ/thuế: `docs/ref/einvoice-tax.md` · Sổ
> TT133/TT99: `docs/ref/accounting-books-tt133-tt99.md`.

## 1. Nhận định cuối

1. Một sổ **Tài sản & công cụ** cấp Công ty (`Tài chính > Tài sản & công cụ`).
   Chi nhánh chỉ là nơi giữ/sử dụng/chịu chi phí — không phải chủ sở hữu pháp lý.
2. Inventory chỉ quản lý nguyên liệu, bao bì, hàng hóa, vật tư, phụ tùng tồn kho.
   Không biến máy móc, bàn ghế, POS, dụng cụ bếp thành tồn kho nguyên liệu.
3. Mua thiết bị không tự động là chi phí vận hành. Phân loại trước khi tham gia
   kết quả: TSCĐ, CCDC/chi phí chờ phân bổ, chi phí kỳ, hàng tồn kho, dở dang,
   thuê/mượn.
4. GTGT đầu vào qua trạng thái độc lập: **đã ghi nhận → chờ kiểm tra →
   đủ/không đủ điều kiện khấu trừ → đã đưa vào kỳ kê khai/đã điều chỉnh**. Có
   hóa đơn hoặc đã thanh toán ≠ được khấu trừ.
5. GTGT đầu ra lấy từ hóa đơn đầu ra có hiệu lực, không từ tiền thu hay tổng giá
   thanh toán. MTT là kênh phát hành; loại chứng từ và nội dung pháp lý quyết
   định cách xử lý.
6. Card tổng hợp chỉ ghi:

   ```text
   GTGT tạm tính
   = GTGT đầu ra trong kỳ
   - GTGT đầu vào đủ điều kiện đã đưa vào kỳ
   ± điều chỉnh được duyệt
   ```

   Thiếu kỳ khai, chứng từ, trạng thái khấu trừ hoặc điều chỉnh → `Chưa đủ
   dữ liệu`, không gọi `GTGT phải nộp`.
7. Công thức vận hành hiện tại chỉ tạo **Kết quả vận hành**. Chỉ hiển thị
   **Lợi nhuận sau thuế** khi có giá vốn đầy đủ, khấu hao/phân bổ, kết quả tài
   chính, thu nhập/chi phí khác, đối chiếu TNDN và khóa sổ kỳ.
8. Không hard-code thuế suất TNDN 15%/17%/20%, không tự bật miễn/ưu đãi. Chỉ dùng
   chính sách có ngày hiệu lực đã được kế toán duyệt.

## 2. Bốn lớp dữ liệu không được trộn

| Lớp | Trả lời câu hỏi | Ví dụ | Không được suy ra |
| --- | --- | --- | --- |
| Vận hành | Hôm nay bán, xuất kho, chi và thu thế nào? | Đơn hàng, tiêu hao NL, điện nước | Nghĩa vụ thuế cuối kỳ hoặc BCTC đầy đủ |
| Tài sản và custody | Sở hữu/kiểm soát gì, ở đâu, ai giữ? | Lò, tủ đông, POS, chén đĩa | TSCĐ chỉ từ tên món hoặc giá mua |
| GTGT và hồ sơ thuế | Thuế nào đã ghi nhận, đủ điều kiện, thuộc kỳ nào? | HĐ GTGT, chứng từ TT, điều chỉnh | Khấu trừ chỉ từ file đính kèm hoặc đã trả tiền |
| Kế toán và khóa sổ | Giá trị nào lên BCTC và lợi nhuận kỳ? | Nguyên giá, khấu hao, giá vốn, TNDN | Lợi nhuận từ dòng tiền hoặc số dư tồn kho |

Một giao dịch có thể tạo dữ liệu ở nhiều lớp nhưng mỗi lớp giữ một sự thật
riêng. Không bước nào cho phép hệ thống tự kết luận các bước còn lại đã hợp lệ.

## 3. Phạm vi pháp nhân Công ty và chi nhánh

- CTCP Chén Sứ là chủ thể sở hữu tài sản, công nợ, doanh thu, chi phí, GTGT, TNDN.
- Chi nhánh/site là chiều phân tích vận hành: nơi đặt tài sản, custodian, trung
  tâm chi phí, nơi tạo doanh thu hoặc hưởng lợi.
- Điều chuyển nội bộ chỉ đổi custody/địa điểm — không tạo doanh thu, giá vốn,
  GTGT đầu ra hoặc chi phí mới.
- Không nhân đôi tài sản dùng chung theo chi nhánh. Một `asset_id`; có thể có
  custodian và quy tắc phân bổ lợi ích/chi phí riêng.
- Tài sản đứng tên cổ đông/nhân viên không tự thành tài sản Công ty — cần hồ sơ
  góp vốn, chuyển giao, mua bán, thuê/mượn hoặc hoàn ứng hợp pháp.
- Đơn vị trực thuộc kê khai/xuất HĐ riêng là cấu hình pháp lý phải xác nhận;
  không suy ra từ `branch_id`.

## 4. Phân loại thiết bị, dụng cụ và khoản đầu tư

### 4.1 Cây quyết định tối thiểu

```text
Khoản mua có giữ lại để bán, chế biến hoặc tiêu hao?
├─ Có → Hàng tồn kho/vật tư/phụ tùng (Inventory)
└─ Không
   ├─ Công trình/hệ thống chưa nghiệm thu, chưa sẵn sàng?
   │  └─ Có → Chi phí đầu tư/xây dựng dở dang
   └─ Đã sẵn sàng sử dụng
      ├─ Đủ đồng thời tiêu chí TSCĐ? → TSCĐ
      └─ Không
         ├─ Lợi ích qua nhiều kỳ? → CCDC/chi phí chờ phân bổ
         ├─ Không → Chi phí kỳ
         └─ Thuê/mượn? → Theo dõi quyền sử dụng + custody riêng
```

TSCĐ hữu hình khi đồng thời: (1) chắc chắn thu lợi ích kinh tế tương lai;
(2) thời gian sử dụng > 1 năm; (3) nguyên giá xác định tin cậy và ≥ 30.000.000 đ.

Mốc 30 triệu không phải quy tắc duy nhất. Hệ thống nhiều bộ phận xét theo bản
chất hệ thống — không tách dòng HĐ chỉ để mỗi phần < 30 triệu. Cải tạo mặt bằng
thuê tách khỏi kết cấu chủ nhà; phân loại theo hợp đồng và kết luận kế toán.

| Khoản mục | Phân loại ban đầu | Ảnh hưởng kết quả |
| --- | --- | --- |
| Lò, tủ đông, hút khói | TSCĐ hoặc dở dang | Khấu hao sau sẵn sàng sử dụng |
| POS, tablet, máy in; bàn ghế, quầy | TSCĐ/CCDC/chi phí kỳ; có thể thuộc gói thi công | Không đưa toàn bộ vào chi phí khi TT |
| Chén, đĩa, dao, thớt | CCDC / chờ phân bổ / chi phí kỳ | Phân bổ hoặc chi phí; vẫn kiểm kê |
| Gas, hóa chất; linh kiện dự phòng | Vật tư/tiêu hao hoặc phụ tùng tồn | Chi phí khi xuất; sửa/vốn hóa khi dùng + duyệt |
| Cọc thuê; sửa chữa thông thường | Phải thu/đặt cọc; chi phí sửa chữa | Không phải chi phí thuê ngay; chi phí theo kỳ |
| Nâng cấp tăng công suất/tuổi thọ | Xem xét tăng nguyên giá | Khấu hao phần vốn hóa |
| Thi công chưa nghiệm thu | Tài sản dở dang | Chưa khấu hao, chưa đẩy hết vào chi phí |

### 4.2 Nguyên giá được công nhận

```text
Nguyên giá = giá mua/phần việc đủ điều kiện vốn hóa sau giảm trừ
  + chi phí trực tiếp để đưa vào trạng thái sẵn sàng sử dụng
  + GTGT không được khấu trừ (nếu policy/pháp luật cho phép vào nguyên giá)
  - chiết khấu, giảm giá, tín dụng/hoàn trả liên quan
```

GTGT đủ điều kiện khấu trừ không nằm trong nguyên giá. GTGT không được khấu trừ
không tự vốn hóa — kế toán duyệt vào nguyên giá hoặc chi phí theo hồ sơ.

## 5. Custody và sổ tối thiểu

| Bề mặt | Quyền sở hữu dữ liệu | Chức năng |
| --- | --- | --- |
| `Tài chính > Tài sản & công cụ` | Sổ Công ty | Phân loại, nguyên giá, VAT, ngày dùng, khấu hao/phân bổ, còn lại, thanh lý |
| Màn hình chi nhánh | View custody | Thiết bị đang giữ, tình trạng, custodian, chuyển/sửa, kiểm kê |
| Procurement/AP | Hồ sơ mua | PO, nhận/nghiệm thu, HĐ NCC, công nợ, thanh toán |
| Inventory | Vật tư tồn kho | NL, bao bì, hàng hóa, vật tư, phụ tùng trước khi dùng |
| `Tài chính > GTGT` | Workpaper Công ty | Đầu ra, đầu vào, review khấu trừ, kỳ kê khai, điều chỉnh |

Một `asset_id`. Chi nhánh không tạo bản sao sổ — chỉ subset theo địa điểm/
custodian, link về hồ sơ Công ty.

| Nhóm | Dữ liệu tối thiểu |
| --- | --- |
| Định danh | Mã, tên, nhóm, serial, tag/QR, ảnh |
| Chủ thể | Sở hữu/kiểm soát, nguồn hình thành, quyền sở hữu/thuê/mượn |
| Chứng từ | Yêu cầu mua, PO, nghiệm thu, HĐ NCC, thanh toán |
| Custody | Site, khu vực, custodian, ngày bàn giao, tình trạng |
| Phân loại | Chờ duyệt, dở dang, TSCĐ, CCDC, chi phí kỳ, thuê/mượn |
| Giá trị | Giá trước thuế, GTGT ghi nhận, nguyên giá duyệt, giảm trừ |
| Sử dụng | Ngày sẵn sàng, đưa vào dùng, tạm ngừng, ngừng ghi nhận |
| Khấu hao/phân bổ | Policy, thời gian, còn lại, đích chi phí, posting đã duyệt |
| Thuế | GTGT chờ/được/không được khấu trừ; khấu hao được trừ TNDN |
| Vòng đời | Chuyển, sửa, nâng cấp, hỏng/mất, thu hồi, bán/thanh lý |

Trục trạng thái độc lập — không dùng một `approved` cho cả ownership, nghiệm
thu, khấu trừ, vốn hóa và thanh toán:

```text
classification: pending_review | construction_in_progress | fixed_asset
  | tool_equipment | period_expense | leased_or_borrowed
evidence: incomplete | under_review | verified | rejected
service: not_ready | in_service | out_of_service | derecognized
VAT declaration: unassigned | draft | declared | adjusted
```

Gate vòng đời (tóm tắt): đề nghị → PO → nhận/nghiệm thu → nhận HĐ → review GTGT
→ phân loại → thanh toán → sẵn sàng sử dụng → khấu hao/phân bổ → custody/kiểm
kê → sửa/nâng cấp → hỏng/mất → bán/thanh lý. Chi tiết surface/RPC:
`docs/modules/finance.md`.

## 6. Luồng GTGT đầu vào

Năm giá trị phân biệt: (1) trên chứng từ, (2) đã ghi nhận, (3) chờ kiểm tra,
(4) đủ điều kiện khấu trừ, (5) đã đưa vào kỳ kê khai.

```text
GTGT đầu vào đã ghi nhận
= chờ kiểm tra + đủ điều kiện khấu trừ + không đủ điều kiện khấu trừ
```

Đây là đối chiếu số tiền, không phải một enum. Một HĐ dùng hỗn hợp có thể chia
nhiều phần. Review khấu trừ phải xét: phương pháp GTGT kỳ; loại chứng từ hợp
pháp; MST/tên người mua; mục đích chịu thuế; hiệu lực HĐ; khớp nghiệm thu;
ngưỡng ≥ 5 triệu và chứng từ thanh toán không dùng tiền mặt (kể cả cộng cùng
ngày cùng người bán); trả chậm/trả góp; ủy quyền nhân viên; mixed-use; kỳ/
điều chỉnh. Chi tiết HĐĐT/MTT: `docs/ref/einvoice-tax.md`.

Từ 2026-06-20: mua trả chậm/trả góp ≥ 5 triệu có thể khấu trừ trước hạn nếu đủ
hợp đồng/HĐ; đến hạn thiếu chứng từ TT không dùng tiền mặt phải điều chỉnh giảm;
có thể kê khai lại khi có chứng từ. Trạng thái thanh toán ≠ trạng thái khấu trừ.

| Nguồn | Ghi nhận đúng |
| --- | --- |
| NL/bao bì | Tồn kho theo giá chưa GTGT được khấu trừ; GTGT → workpaper |
| Điện, nước, thuê, DV | Chi phí/phải trả theo bản chất; GTGT review riêng |
| TSCĐ / CCDC | Nguyên giá/giá trị chờ phân bổ không gồm GTGT được khấu trừ |
| Thi công chi nhánh | Theo khối lượng nghiệm thu vào dở dang — không vốn hóa cả HĐ tự động |
| Nhập khẩu | Tách hồ sơ HQ, thuế nhập khẩu, chứng từ nộp |
| HĐ bán hàng / phương pháp trực tiếp | Không tự tạo GTGT đầu vào được khấu trừ |
| Phiếu thu, bill, order slip | Bằng chứng thương mại — không tự là HĐ GTGT |

MTT = kênh khởi tạo, không phải kết luận thuế. Tách `document_kind` khỏi
`issuance_channel = cash_register`. QR/ảnh bill không thay XML/dữ liệu HĐ và
hồ sơ thanh toán.

## 7. Luồng GTGT đầu ra

```text
Đơn hàng/line → mã hàng + thuế suất có ngày hiệu lực
→ lập HĐĐT/HĐĐT MTT → CQT tiếp nhận/cấp mã
→ HĐ có hiệu lực tham gia GTGT đầu ra
→ thay thế/điều chỉnh/hủy bằng sự kiện tham chiếu gốc
→ khóa workpaper theo kỳ
```

- Doanh thu ≠ GTGT đầu ra (DT = giá chưa GTGT). Thuế suất gắn hàng + ngày hiệu lực.
- Giảm 10%→8% đến hết 2026 cho nhóm đủ điều kiện; không mọi món F&B = 8%.
- HĐ nháp/lỗi/thay thế/chưa hiệu lực không cộng. Snapshot `vat_breakdown` bất biến;
  thay thế/điều chỉnh từ snapshot gốc, không tính lại menu/order mutable.
- Provider chưa rõ → đối chiếu; không auto-retry/cộng đầu ra. KM/biếu/tặng/nội bộ/
  suất NV/hoàn/hủy: rule riêng. Chi tiết: `docs/ref/einvoice-tax.md`.

## 8. Card GTGT và workpaper kỳ

```text
GTGT tạm tính = đầu ra kỳ − đầu vào đủ điều kiện đã vào kỳ ± điều chỉnh duyệt
```

Số `đã ghi nhận` chỉ để đối chiếu; chỉ phần đủ điều kiện đã vào kỳ mới trừ.
Carry-forward, hoàn thuế, phân bổ hỗn hợp, khai bổ sung → dòng riêng, không
giấu trong “điều chỉnh” không truy vết. Kết quả âm → `Còn được khấu trừ tạm
tính`, không suy ra được hoàn thuế.

Chỉ Accountant review và đưa số vào kỳ; Owner duyệt policy/khóa kỳ. Vận hành
bổ sung chứng từ nhưng không tự đổi `deductible_amount`. Surface `/finance/vat`
và card overview: `docs/modules/finance.md`.

## 9. Khấu hao TSCĐ và phân bổ CCDC

| Nội dung | TSCĐ | CCDC/chi phí chờ phân bổ |
| --- | --- | --- |
| Giá trị theo dõi | Nguyên giá, KH lũy kế, còn lại | Chờ phân bổ, đã phân bổ, còn lại |
| Ghi nhận kỳ | Khấu hao | Phân bổ hoặc chi phí trực tiếp |
| Điều kiện bắt đầu | Sẵn sàng/đưa vào sử dụng theo policy | Bắt đầu hưởng lợi theo policy |
| Thuế TNDN | KH kế toán và phần được trừ có thể khác | Phần phân bổ được trừ vẫn cần hồ sơ |

```text
Khấu hao lũy kế = tổng posting KH sổ sách đã duyệt
Giá trị còn lại = nguyên giá được công nhận − khấu hao lũy kế
Khấu hao/phân bổ kỳ = bán hàng/QL + sản xuất + đích khác đã duyệt
Điều chỉnh KH TNDN = KH sổ sách − KH được xác nhận đủ điều kiện tính thuế
```

Không KH từ tháng HĐ/TT nếu chưa sẵn sàng. Không đẩy toàn bộ KH vào OPEX; vị trí
đặt không tự quyết đích chi phí. Thiết bị SX thiếu mô hình giá vốn → `Chưa phân
bổ/Chưa đủ mô hình giá vốn` — không tạm OPEX rồi cộng trùng. Chênh lệch thuế
không sửa nguyên giá/còn lại — đi bảng đối chiếu thu nhập tính thuế. Không cron
tự ghi KH; lịch dự kiến + Accountant duyệt posting.

## 10. Lợi nhuận: gọi đúng tên và tính đúng tầng

Runtime hiện tại:

```text
Doanh thu thuần trước GTGT − Giá vốn NL có dữ liệu = Lợi nhuận gộp vận hành
Lợi nhuận gộp vận hành − Chi phí vận hành đã ghi nhận
  + Biến động tồn kho (cuối − đầu) = Kết quả kinh doanh
```

Giữ tên `Kết quả kinh doanh`; hiển thị coverage/confidence; không đổi nhãn
`Lợi nhuận ròng`; chỉ cộng **biến động** tồn, không cộng tồn cuối vào kết quả.

Thang đầy đủ (chỉ khi Accounting close đủ):

```text
Doanh thu thuần − Giá vốn đầy đủ = Lợi nhuận gộp
→ Kết quả HĐKD chính (± tài chính, thu nhập/chi phí khác)
→ Lợi nhuận kế toán trước thuế
→ Thu nhập tính thuế (± điều chỉnh thuế, lỗ chuyển)
→ Thuế TNDN hiện hành (× suất đã duyệt − miễn/giảm/ưu đãi)
→ Lợi nhuận sau thuế
```

`Thu nhập tính thuế` ≠ mặc định `Lợi nhuận trước thuế`. Không dùng
`Lợi nhuận trước thuế × 20%` cho mọi Công ty.

| Candidate policy từ 2026 | Điều kiện cấp cao cần kiểm tra |
| --- | --- |
| Miễn TNDN | Doanh thu năm ≤ 1 tỷ theo cách xác định/loại trừ tại NĐ 141/2026 |
| 15% | Doanh thu năm ≤ 3 tỷ và không thuộc trường hợp loại trừ |
| 17% | Doanh thu năm > 3 tỷ đến ≤ 50 tỷ và không thuộc loại trừ |
| 20% | Mức chung khi không thuộc mức khác/ưu đãi hợp lệ |

Hệ thống chỉ tạo candidate; Accountant duyệt `revenue_basis_period`,
`revenue_basis_amount`, `exemption_status`, `statutory_rate`, căn cứ và ngày
hiệu lực. Tách: `Chi phí kế toán` / `Chi phí được trừ TNDN` /
`Chi phí không được trừ/điều chỉnh tăng`. Không dùng nhãn mơ hồ `Chi phí hợp lý`.

Chỉ hiển thị `Lợi nhuận sau thuế` khi kỳ đã có: HĐĐT đầu ra đối chiếu; giá vốn
đầy đủ + coverage; chi phí đã phân loại (không còn mua tài sản sai OPEX); KH/
phân bổ đã posting; tài chính/khác; đối chiếu GTGT/công nợ/NH/tiền; workpaper
TNDN + policy duyệt; khóa sổ có người và thời điểm. Trước đó: `Kết quả vận hành`
hoặc `Lợi nhuận kế toán tạm tính` kèm phạm vi loại trừ.

## 11. Sự kiện không đổi lợi nhuận ngay · Vai trò · Gate

| Sự kiện | Ảnh hưởng đúng |
| --- | --- |
| Nhập NL chưa dùng | Tăng tồn + công nợ/giảm tiền |
| Thanh toán NCC | Giảm công nợ và tiền |
| Mua TSCĐ/CCDC vốn hóa/phân bổ | Tăng tài sản/chờ phân bổ + công nợ/giảm tiền |
| Điều chuyển nội bộ | Đổi địa điểm/custody |
| Tồn cuối còn nguyên | Tài sản — không cộng vào lợi nhuận |
| GTGT đầu vào được khấu trừ | Tăng khoản thuế được khấu trừ — không phải doanh thu |
| Thu GTGT đầu ra | Tăng nghĩa vụ thuế — không phải doanh thu Công ty |

| Vai trò | Được làm | Không tự được làm |
| --- | --- | --- |
| Người đề nghị mua | Tạo nhu cầu, mục đích/site | Duyệt vốn hóa hoặc khấu trừ |
| Người nhận/custodian | Xác nhận SL, serial, tình trạng, bàn giao | Sửa nguyên giá/policy |
| Quản lý chi nhánh | Xem tài sản đang giữ, báo hỏng, yêu cầu chuyển | Bán/thanh lý hoặc đổi ownership |
| Accountant | Review HĐ, phân loại, VAT, KH/phân bổ, kỳ thuế | Tự thay policy cần Owner/HĐQT |
| Owner/thẩm quyền | Duyệt policy, ngoại lệ, khóa kỳ, thanh lý | Xóa audit history |

Sự kiện phân loại/VAT/KH/chuyển/mất/thanh lý: append-only hoặc version/audit.
Điều chỉnh tham chiếu gốc, người duyệt, lý do, kỳ ảnh hưởng.

**Gate:** không thiết bị → OPEX khi chưa phân loại; không KH trước sẵn sàng/sau
ngừng ghi nhận; không cùng KH đi cả OPEX và tồn/COGS; không điều chuyển nội bộ
tạo DT/GTGT/chi phí; không file đính kèm tự khấu trừ; không HĐ thay thế từ data
mutable hoặc auto-retry khi provider chưa rõ; GTGT ghi nhận = chờ+được+không;
số kê khai có kỳ/duyệt/nguồn; điều chỉnh tham chiếu gốc; `GTGT tạm tính` fail
closed; không đổi nhãn `Kết quả vận hành` → `Lợi nhuận sau thuế`; tồn/công nợ/
tiền/tài sản không cộng trực tiếp vào LN. UI/hiện trạng/close:
`docs/modules/finance.md`, `docs/ref/accounting-books-tt133-tt99.md`.

## 12. Nguồn pháp lý chính

- [Luật GTGT 48/2024/QH15](https://vanban.chinhphu.vn/?classid=1&docid=212476&pageid=27160&typegroupid=3),
  [Luật 149/2025/QH15](https://vanban.chinhphu.vn/?docid=216588&orggroupid=1&pageid=27160)
  và [Luật 09/2026/QH16](https://vanban.chinhphu.vn/?classid=1&docid=218095&pageid=27160&typegroupid=3).
- [NĐ 181/2025/NĐ-CP](https://vanban.chinhphu.vn/?docid=214336&pageid=27160),
  [NĐ 359/2025/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=216388&orggroupid=2&pageid=27160)
  và [NĐ 144/2026/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=218020&pageid=27160&typegroupid=4).
- [NQ 204/2025/QH15](https://vanban.chinhphu.vn/?classid=1&docid=214209&pageid=27160)
  và [NĐ 174/2025/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=214310&pageid=27160&typegroupid=4)
  về giảm GTGT đến hết 2026 cho nhóm đủ điều kiện.
- [NĐ 254/2026/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=218689&orggroupid=2&pageid=27160)
  về hóa đơn điện tử/chứng từ điện tử, gồm nội dung HĐĐT MTT.
- [Luật TNDN 67/2025/QH15](https://vanban.chinhphu.vn/?docid=214607&pageid=27160),
  [NĐ 320/2025/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=216219&pageid=27160&typegroupid=4),
  [NĐ 141/2026/NĐ-CP](https://vanban.chinhphu.vn/?classid=1&docid=217960&pageid=27160&typegroupid=4)
  và [TT 20/2026/TT-BTC](https://vanban.chinhphu.vn/?docid=217191&orggroupid=4&pageid=27160).
- [TT 99/2025/TT-BTC](https://congbao.chinhphu.vn/van-ban/thong-tu-so-99-2025-tt-btc-46529/59634.htm)
  về chế độ kế toán doanh nghiệp từ năm tài chính áp dụng.
- [TT 45/2013/TT-BTC, đã được sửa đổi](https://congbao.chinhphu.vn/van-ban/thong-tu-so-45-2013-tt-btc-4118/2275.htm),
  [TT 30/2025/TT-BTC](https://vanban.chinhphu.vn/?classid=1&docid=213853&orggroupid=4&pageid=27160)
  và [QĐ 1760/QĐ-BTC](https://vanban.chinhphu.vn/?classid=0&docid=218751&pageid=27160)
  về quản lý, sử dụng và trích khấu hao TSCĐ.

Nguồn chi tiết trong repo: `legal-framework-2026.md`, `einvoice-tax.md`,
`accounting-books-tt133-tt99.md`, `operational-data-contract.md`,
`business-context.md`, `inventory.md`, `docs/modules/finance.md`.
