# Nghiên cứu HĐĐT Greenfield — CTCP Chén Sứ / Viettel S-invoice

> Tài liệu bằng chứng hỗ trợ. Hợp đồng nghiệp vụ hiện hành vẫn thuộc
> `docs/ref/einvoice-tax.md`; action đang làm thuộc `tasks/todo.md`.
>
> Ngày kiểm tra: 2026-07-27 (Asia/Ho_Chi_Minh).
>
> Phạm vi: Greenfield hiện tại của chính repo `comtammatu`; không có repo,
> project thứ ba, dữ liệu nhập từ target đã nghỉ hoặc lớp tương thích. Chủ sở
> hữu đã xác nhận cấu hình đăng ký `SINVOICE_TEMPLATE_CODE=1/001` và
> `SINVOICE_INVOICE_SERIES=C26TCS`. Không kiểm tra hoặc ghi lại credential,
> MST và dữ liệu đăng ký riêng tư khác.
>
> Đây là nghiên cứu kỹ thuật dựa trên nguồn sơ cấp, không thay thế xác nhận của
> kế toán, cơ quan thuế hoặc Viettel.

## Kết luận

Luồng đích phải là một luồng duy nhất: hóa đơn GTGT mẫu `1/001`, ký hiệu
`C26TCS`, mỗi dòng có thuế suất rõ ràng, tổng tiền được đối chiếu từ chính các
dòng sau chiết khấu và mọi trạng thái chưa rõ từ Viettel đều dừng để đối soát.
Không tạo snapshot `v2`, nhánh mô hình pháp nhân cũ hay lớp tương thích dữ liệu cũ. Trường
`version: 1` hiện có được giữ như metadata cố định, không dùng để phân nhánh.

Forward migration `20260727161500_invoice_profile_vat_snapshot.sql` và caller
cutover đã xử lý các lỗi snapshot, fallback VAT, drift cấu hình và replacement.
Migration đã được apply trực tiếp lên Greenfield `enloyfnuerqgaqderbwb`; ledger
Supabase ghi execution version `20260727104839` với name
`20260727161500_invoice_profile_vat_snapshot`. Đây là rollout forward-only,
không reset, rebaseline hoặc xóa Auth users hiện có. Profile hóa đơn vẫn ở
trạng thái `draft`; phát hành thật tiếp tục bị chặn cho đến khi hoàn tất
preflight và owner phê duyệt.

## 1. Yêu cầu chính thức

### 1.1. Khung pháp lý hiện hành

- Nghị định 254/2026/NĐ-CP được ban hành ngày 30/06/2026 và có hiệu lực từ
  01/07/2026. Nghị định yêu cầu người bán lập HĐĐT khi bán hàng/cung cấp dịch
  vụ; hóa đơn phải đúng định dạng, đầy đủ và trung thực với nghiệp vụ phát sinh.
  Nguồn:
  [Cổng TTĐT Chính phủ](https://vanban.chinhphu.vn/?docid=218689&pageid=27160),
  [bản ký chính thức](https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/7/254-ndcp.signed.pdf),
  [toàn văn/tóm lược chính thức](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-so-254-2026-nd-cp-ve-hoa-don-dien-tu-chung-tu-dien-tu-119260713164251972.htm).
- Với hóa đơn GTGT, nội dung phải có tên, đơn vị tính, số lượng, đơn giá,
  thành tiền chưa VAT, thuế suất VAT, tổng tiền VAT theo từng loại thuế suất,
  tổng VAT và tổng thanh toán có VAT. Chiết khấu thương mại/khuyến mại cũng
  phải được thể hiện nếu có. Nguồn:
  [NĐ 254/2026, nội dung hóa đơn](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-so-254-2026-nd-cp-ve-hoa-don-dien-tu-chung-tu-dien-tu-119260713164251972.htm).
- Các mức luật định cần mô hình hóa theo từng hàng hóa/dịch vụ gồm `0%`, `5%`,
  `10%`; nhóm đủ điều kiện từ mức `10%` được giảm còn `8%` đến hết
  31/12/2026. Không được suy một mức chung cho toàn đơn nếu các dòng khác
  thuế suất. Nguồn:
  [Luật Thuế GTGT 48/2024/QH15](https://vanban.chinhphu.vn/?classid=1&docid=212476&pageid=27160&typegroupid=3),
  [Nghị quyết 204/2025/QH15](https://vanban.chinhphu.vn/?classid=1&docid=214209&pageid=27160),
  [toàn văn NQ 204](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-quyet-so-204-2025-qh15-ve-giam-thue-gia-tri-gia-tang-119250628082120511.htm).
- Nghị định 254/2026 và Thông tư 91/2026 là khung hiện hành từ 01/07/2026;
  hướng dẫn cũ theo Nghị định 70/2025/Thông tư 32/2025 không còn đủ để xác
  quyết quy trình thay thế. Nguồn:
  [Cổng TTĐT Chính phủ về khung 2026](https://xaydungchinhsach.chinhphu.vn/nhung-diem-moi-cua-nghi-dinh-254-2026-nd-cp-va-thong-tu-91-2026-tt-btc-ve-hoa-don-dien-tu-chung-tu-dien-tu-119260717143502375.htm).

### 1.2. Ràng buộc từ Viettel công khai

- Viettel coi thông tin tài khoản, mẫu và ký hiệu hóa đơn là cấu hình đã đăng
  ký được lấy từ hệ thống `api-vinvoice.viettel.vn`; ứng dụng không nên tự suy
  hoặc thay thế các giá trị này. Nguồn:
  [Viettel S-invoice policy](https://vinvoice.viettel.vn/policy-sinvoice.html).
- Hướng dẫn Viettel công khai mô tả dòng hàng có tên, đơn vị, số lượng, đơn
  giá, thành tiền và thuế suất; hỗ trợ dòng chiết khấu. Với hóa đơn nhiều thuế
  suất, hướng dẫn cảnh báo không dùng cách “thuế tổng” lấy thuế suất dòng đầu
  cho cả hóa đơn, đồng thời nêu mẫu chiết khấu theo dòng giữ thuế suất/chiết
  khấu tương ứng. Nguồn:
  [Viettel Solutions — lập hóa đơn](https://solutions.viettel.vn/vi/hoa-don-dien-tu/cach-lap-hoa-don-dien-tu-viettel.html).
- Viettel có cổng tài liệu HĐĐT 2.0 và ví dụ API riêng. Bản tài liệu API công
  khai tìm được không đủ mới để xác nhận toàn bộ schema 2026 của mẫu `1/001`;
  hợp đồng API hiện hành phải lấy từ tài khoản/support Viettel và kiểm bằng
  smoke được ủy quyền. Nguồn:
  [Viettel SME Hub — tài liệu S-invoice](https://sme.viettel.vn/content_v2/guideline_v2/service/37/SINVOICE).

## 2. Bằng chứng lỗi trước cutover

### 2.1. Phần đang đúng và nên tái sử dụng

- `deriveInvoiceTypeFromTemplate()` ánh xạ tiền tố `1/` thành
  `invoiceType="1"` và truyền nguyên `templateCode`/`invoiceSeries` vào
  `generalInvoiceInfo`:
  `packages/shared/src/providers/impl/viettel-sinvoice.ts:117-141,533-599`.
- `buildSinvoiceItemInfo()` đã tính giá chưa VAT, VAT và chiết khấu theo từng
  dòng; `taxBreakdowns` được nhóm từ chính các dòng theo `taxPercentage`:
  `packages/shared/src/providers/impl/viettel-sinvoice.ts:239-391,543-586`.
- Tổng Viettel được dựng từ các dòng (`sumLineNet`, `sumLineDiscount`,
  `sumLineTax`, `totalGross`) thay vì tin tổng đầu vào:
  `packages/shared/src/providers/impl/viettel-sinvoice.ts:650-659`.
- `transactionUuid` là deterministic theo định danh nội bộ và luồng phát hành
  thường giữ trạng thái chưa rõ để đối soát, không tự gửi lại:
  `packages/shared/src/providers/impl/viettel-sinvoice.ts:101-115`;
  `apps/web/lib/hddt-per-order.ts:136-175`;
  `apps/web/lib/tax-invoice-issue-worker.ts:101-170`.
- Snapshot thanh toán đã có trigger bảo vệ bất biến và giữ source order,
  thời điểm thanh toán, buyer, dòng món cùng chiết khấu/modifier/side:
  `supabase/migrations/20260727120000_baseline.sql:2362-2391,2842-2852,2880-2972`.

### 2.2. Sai lệch phải sửa

1. **Snapshot làm mất VAT dòng.**

   `private.upsert_tax_invoice_issue_job` không ghi `item.vat_rate`, sau đó
   hardcode `subtotal=total_amount`, `vatRate=0`, `vatAmount=0` và tạo
   `tax_invoices` với VAT bằng `0`:
   `supabase/migrations/20260727120000_baseline.sql:2922-3018`.

2. **Thiếu VAT đang âm thầm biến thành `0`.**

   `vat_rate` là optional trong Zod/type, `toNumber(undefined)` trả `0`, và
   provider fallback từ `item.vatRate` sang VAT header:
   `apps/web/lib/hddt-per-order.ts:67-100`;
   `packages/shared/src/hddt/invoice-line-items.ts:3-13,28-35,247-277`;
   `packages/shared/src/providers/invoice.ts:14-24`;
   `packages/shared/src/providers/impl/viettel-sinvoice.ts:337-360`.

3. **Mức VAT menu có default `0`.**

   Migration thêm `menu_items.vat_rate NOT NULL DEFAULT 0`. Trong Greenfield,
   đây không phải fallback hợp lệ: `0%` chỉ được ghi khi món được phân loại rõ:
   `supabase/migrations/20260727121036_add_menu_vat_and_purchase_approval.sql:1-7`.

4. **Ràng buộc snapshot dòng quá rộng.**

   `order_items.vat_rate` cho phép mọi giá trị từ `0` đến `100`, không giới hạn
   ma trận `0/5/8/10`:
   `supabase/migrations/20260727120000_baseline.sql:47963-48002`.

5. **Phép nhận diện gross/net là heuristic và thiếu đối chiếu trước POST.**

   Provider suy gross/net theo khoảng cách tới tổng header. Chỉ nhánh hóa đơn
   bán hàng trực tiếp kiểm `totalGross === totalAmount`; nhánh GTGT không chặn
   mismatch trước khi gọi Viettel:
   `packages/shared/src/providers/impl/viettel-sinvoice.ts:513-557`.

6. **Hóa đơn thay thế dựng lại từ dữ liệu có thể đã đổi.**

   Luồng thay thế đọc `orders.order_items` hiện tại, tính lại VAT và dựng lại
   dòng thay vì dùng snapshot bất biến của hóa đơn gốc:
   `apps/web/app/(protected)/finance/replace-invoice-actions.ts:93-184,279-313`.

7. **Luồng thay thế xử lý trạng thái chưa rõ kém an toàn hơn luồng thường.**

   RPC chuyển hóa đơn cũ sang `replaced` trước khi Viettel chấp nhận hóa đơn
   mới. Lỗi/timeout provider có thể đưa hóa đơn mới về `draft`, trong khi luồng
   thường giữ `signing/reconcile_required` để tránh gửi trùng:
   `apps/web/app/(protected)/finance/replace-invoice-actions.ts:192-261,315-359`;
   `apps/web/lib/hddt-per-order.ts:136-175`.

8. **Test chưa chứng minh payload đầy đủ cho mẫu `1/001`.**

   Test hiện có chứng minh phép tính dòng mixed-rate và mapping `1/001`, nhưng
   các test body end-to-end chủ yếu dùng mẫu `2/001`; chưa có test body
   `1/001` khẳng định `generalInvoiceInfo`, từng dòng, `taxBreakdowns`,
   chiết khấu và tổng đều khớp:
   `packages/shared/src/providers/__tests__/viettel-sinvoice.test.ts:398-413,760-1044,1103-1125`.

## 3. Kết luận debate kỹ thuật

Hai review độc lập bằng `agy` (Gemini 3.6 Flash High) và `cursor-agent`
(Grok 4.5 High Fast) cùng xác nhận ba lỗi ưu tiên: snapshot làm mất VAT dòng,
replacement đọc dữ liệu mutable, và trạng thái chưa rõ của replacement có thể
cho phép gửi lại không an toàn.

Các điểm đã phân xử:

1. Giữ `version: 1` như literal bất biến; không tạo `v2`, router hay dual reader.
2. Xóa nhánh template khác; deployment fail-closed nếu profile không có tiền
   tố `1/`.
3. Thêm `invoice_profiles` versioned và snapshot profile, template, series cùng
   pháp nhân bán vào job/hóa đơn. Runtime env chỉ giữ credential và transport.
4. SQL snapshot/header tái sử dụng `_compute_vat_breakdown`; TypeScript tái sử
   dụng line builder hiện có. Trước POST phải đối chiếu chính xác sau khi chuẩn
   hóa về đơn vị VND: tổng gross bằng snapshot, tổng net cộng VAT bằng gross và
   breakdown bằng tổng các dòng cùng thuế suất.
5. Replacement chỉ tạo bản ghi pending trước khi gọi provider. Hóa đơn cũ chỉ
   chuyển `replaced` trong cùng transaction khi hóa đơn mới được xác nhận
   `issued`; kết quả chưa rõ đi `reconcile_required` và không tự gửi lại.
6. Bỏ `DEFAULT 0`; cả menu và order item dùng `NOT NULL` cùng check
   `IN (0, 5, 8, 10)`.

## 4. Phương án triển khai đề xuất

### P0 — Evidence gate

1. Migration ledger Greenfield đã được kiểm tra: baseline và các forward
   migration đến `20260727150000` đã apply. Chỉ thêm forward migration mới;
   không sửa baseline đã pin hash.
2. Forward migration phải giữ nguyên ACL, `SECURITY DEFINER`, `search_path` và
   các immutable guard hiện có.
3. Lấy tài liệu API Viettel hiện hành của chính tài khoản hoặc xác nhận bằng
   support cho mẫu `1/001`, đặc biệt các field:
   `invoiceType`, `templateCode`, `invoiceSeries`, `itemInfo`,
   `taxBreakdowns`, `adjustmentType`, original references và quy tắc rounding.
4. Không gọi provider thật trước khi có ủy quyền smoke cụ thể.

### P1 — Một nguồn VAT từ món bán đến snapshot

1. `menu_items.vat_rate`: bắt buộc nhập rõ, không `DEFAULT 0`, check
   `IN (0,5,8,10)`.
2. Trigger chép nguyên mức này sang `order_items.vat_rate`; không có resolver
   doanh thu và không có fallback.
3. `order_items.vat_rate`: `NOT NULL`, cùng check `IN (0,5,8,10)`.
4. Snapshot job phải ghi `vat_rate` của mọi dòng. Giữ literal `version: 1`,
   không thêm version mới hoặc nhánh compatibility.
5. Zod và TypeScript bắt buộc `vat_rate`; thiếu/sai mức thì `blocked` trước khi
   khóa hoặc gọi provider.

### P2 — Một phép tính và một gate đối chiếu

Tái sử dụng `buildInvoiceLineItemsFromOrderItems`,
`applyInvoiceLineDiscount` và `buildSinvoiceItemInfo`; không viết bộ tính VAT
thứ hai trong action thay thế.

Trước POST, bắt buộc kiểm:

```text
sum(item net after discount) == totalAmountWithoutTax
sum(item tax)                == totalTaxAmount
group item by vat rate       == taxBreakdowns
net + VAT                    == paid/order total
```

Sau khi chuẩn hóa theo quy tắc làm tròn VND, lệch bất kỳ invariant nào thì dừng
`blocked`, ghi mã lỗi ổn định và không gọi provider. Chỉ thay quy tắc này nếu
tài liệu tài khoản Viettel xác nhận một quy tắc làm tròn khác. Không dùng
heuristic gross/net: input Greenfield được khai báo rõ là giá bán gross đã gồm
VAT.

`tax_invoices.vat_rate` đơn lẻ không được làm nguồn sự thật cho mixed-rate.
Nguồn thật là snapshot dòng + breakdown; header giữ các tổng đã reconcile để
truy vấn và đối soát.

### P3 — Thu hẹp provider về hợp đồng đã đăng ký

1. Chỉ chấp nhận template `1/...`; xóa hoàn toàn nhánh runtime còn lại.
2. Truyền đúng hai giá trị đăng ký đã xác nhận, không derive ký hiệu và không
   cho fallback.
3. Bắt buộc mỗi `itemInfo` có `taxPercentage`/`taxAmount`; tạo đúng một
   `taxBreakdown` cho mỗi mức xuất hiện.
4. Persist `submission_snapshot` bất biến trước POST và giữ cùng
   `transactionUuid` theo `tax_invoice_id`; retry đọc lại snapshot đã seal.

### P4 — Hóa đơn thay thế

1. Phạm vi đầu tiên chỉ sửa buyer info; toàn bộ dòng, chiết khấu, VAT và tổng
   lấy từ immutable snapshot cùng issuance context của hóa đơn gốc.
2. Không đọc menu/order hiện tại để dựng lại nội dung pháp lý đã phát hành.
3. RPC khởi tạo chỉ tạo hóa đơn mới và link pending; chưa đổi hóa đơn cũ. Khi
   hóa đơn mới được xác nhận `issued`, RPC reconcile khóa cả hai dòng, chuyển
   hóa đơn cũ sang `replaced` và hoàn tất hai chiều link trong cùng transaction.
4. Timeout, exception hoặc `TRANSACTION_IS_BEING_PROCESSED` luôn đi
   `reconcile_required`; không quay về draft có thể bấm gửi lại.
5. Original invoice number/date/type/template và lý do/tham chiếu phải lấy từ
   snapshot/provider result gốc. Tên field Viettel cuối cùng là evidence gate
   P0, không suy từ comment code cũ.

### P5 — Test và nghiệm thu

- Migration replay từ schema rỗng trên target được phép.
- DB test: menu VAT bắt buộc; order snapshot đúng; snapshot job chứa từng
  `vat_rate`; không có default/fallback `0`.
- Unit/provider body test mẫu `1/001` cho các ca `0`, `5`, `8`, `10`, mixed
  `8+10`, item discount, order discount và rounding khó.
- Boundary test: DB snapshot → worker → body Viettel, khẳng định
  `taxBreakdowns` và các tổng khớp paid total.
- Replacement test: thay đổi menu/order sau phát hành không làm đổi body thay
  thế; unknown provider outcome không cho submit lần hai.
- Smoke được ủy quyền: kiểm payload/response trên Viettel và tra lại bằng cùng
  `transactionUuid`; không suy `issued` chỉ từ HTTP `200`.
- Sau schema: regenerate types, chạy targeted tests rồi
  `typecheck`, `lint`, `build`, `test`; re-index CodeGraph.

### P6 — Dọn framing mô hình pháp nhân cũ và tài liệu

1. Đổi product/legal framing còn active trong `AGENTS.md`, `README.md`,
   `docs/plan/decisions.md` và E2E fixture sang CTCP Chén Sứ/Greenfield.
2. Dọn ví dụ tên tài khoản mô hình pháp nhân cũ trong payment placeholder và QR/provider tests;
   không suy tên chủ tài khoản thật nếu chưa có cấu hình được xác nhận.
3. Sửa ví dụ VAT sai trong `docs/ref/glossary.md` và đồng bộ
   `docs/ref/third-party-integrations.md` với quy trình bàn giao kế toán hiện
   hành; không hardcode kỳ/tháng hoặc biểu mẫu chưa được kế toán xác nhận.
4. Giữ exact ID cũ trong denylist với nhãn trung tính `retired target`.
5. Giữ nguyên baseline và migration archive đã pin hash làm lineage evidence;
   CI kiểm tra zero literal trên active source/docs nhưng loại trừ lịch sử SQL
   bất biến.

## 5. Trạng thái triển khai ngày 2026-07-27

- Hoàn tất local: typed invoice profile, VAT bắt buộc `0/5/8/10`, snapshot v1,
  template `1/...`, total gate trước POST, unknown-outcome reconcile, replacement
  queue và CI grep-zero.
- Greenfield đã là target/type source của chính repo sau cutover. `1` Tenant,
  `1` Branch, `4` profile và `4` Auth users là bootstrap/runtime hiện tại cần
  giữ, không phải dữ liệu target cũ và không kích hoạt destructive rebaseline.
- Chưa apply forward migration HĐĐT mới. Hồ sơ Tenant hiện vẫn cần hoàn thiện
  legal name, MST, địa chỉ và đại diện trước khi kích hoạt invoice profile.
- Chưa kích hoạt profile `1/001` / `C26TCS`: activation phải fail cho đến khi
  owner hoàn thiện hồ sơ pháp nhân và MST khớp tài khoản Viettel.
- Chưa smoke provider thật: cần owner phê duyệt và evidence tài khoản cụ thể.

## 6. Bằng chứng còn thiếu trước Production

1. Bản HDSD/API Viettel hiện hành áp dụng cho tài khoản và mẫu đã đăng ký.
2. Xác nhận của kế toán về ma trận VAT từng món/dịch vụ và ngày hiệu lực, đặc
   biệt điều kiện `8%`.
3. Kết quả smoke cho mixed-rate, chiết khấu và replacement trên môi trường được
   Viettel/owner cho phép.

Không có bằng chứng nào trong nghiên cứu này xác thực credential, MST hoặc tình
trạng đăng ký riêng tư của CTCP Chén Sứ; hai giá trị mẫu/ký hiệu chỉ được ghi
nhận theo xác nhận trực tiếp của chủ sở hữu.
