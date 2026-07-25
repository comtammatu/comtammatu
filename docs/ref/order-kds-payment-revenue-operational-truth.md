# Sự thật vận hành đơn hàng, KDS, thanh toán và doanh thu

Ngày lập: 2026-07-25
Mã sự cố: `TC-260725-044-PH`
Mức review: **T3** — tiền, migration, `SECURITY DEFINER`, bằng chứng vận hành

## Mục tiêu

Một đơn phải đối chiếu được xuyên suốt:

`order → order_items → KDS events → print jobs → payments → SePay reconciliation → POS session → HĐĐT → finance day`

Các màn hình `/orders`, `/br/[branchId]/pos-sessions`, KDS History và
`/finance/revenue/[date]` phải dùng cùng thuật ngữ và cùng nguồn dữ liệu.

## Kết luận sự cố 17 phần cơm nhưng phiếu bếp có 16

Read-only Production evidence của đơn `TC-260725-044-PH` xác nhận:

- đơn `10161`, chi nhánh Phước Hải `3`, có 12 dòng món hoạt động, tổng 26 đơn
  vị và 17 phần thuộc nhóm cơm/món chính theo danh mục hiện tại;
- KDS có đủ 17 phần món chính và các ticket còn sống đều ở trạng thái `ready`;
- payload các phiếu bếp chỉ có 16 phần món chính;
- dòng bị thiếu trên phiếu bếp là `Cơm Tấm Bì ×1`, `order_item_id = 22299`,
  `kds_ticket_id = 16706`, ticket bếp `#044-4`;
- món thuộc danh mục `Khác` (`category_id = 5`, loại `main_dish`), có tuyến tới
  trạm KDS Bếp chính nhưng không có `printer_menu_categories` tại chi nhánh
  Phước Hải;
- luồng gửi order đã có quy tắc dùng máy in bếp mặc định khi danh mục chưa có
  mapping, nhưng producer phiếu khi hoàn tất KDS lại chỉ lấy item có mapping
  explicit; vì hai luồng không cùng quy tắc nên ticket vẫn hiển thị và hoàn
  thành trên KDS nhưng không tạo `print_job`.

Quét read-only cùng điều kiện trên Production cho thấy đây không phải một đơn
đơn lẻ. Trong các live ticket ngày 2026-07-25 có 6 đơn, 6 ticket và 7 phần thuộc
danh mục `Khác` đã `ready`, đều còn `sent_to_kitchen_at IS NULL` và không tìm
thấy item tương ứng trong payload phiếu bếp: `TC-260725-003-PH`,
`TC-260725-004-PH`, `TC-260725-008-PH`, `TC-260725-044-PH`,
`MV-260725-046-PH`, `TC-260725-051-PH`. Đây là phạm vi số hóa xác nhận được;
không suy rộng thành số món bếp thực tế đã hoặc chưa làm.

Preflight Production chỉ đọc được làm mới lúc 15:24 ngày 2026-07-25 vẫn trả
đúng 6 đơn, 6 ticket và 7 phần; category `Khác` vẫn chưa có printer route.

Nguyên nhân số hóa đã rõ: **mapping danh mục bị thiếu đã kích hoạt sự không nhất
quán giữa KDS routing và completion-print routing**, không phải KDS bỏ món.
Migration đồng bộ completion print với quy tắc fallback máy in bếp mặc định đã
có; nếu cả mapping lẫn máy in mặc định đều không dùng được, RPC trả cảnh báo
thay vì im lặng. Tuy nhiên dữ liệu vẫn không chứng minh bếp thực tế đã làm/giao
16 hay 17 phần; không được suy diễn trạng thái vật lý từ KDS hoặc phiếu in.

Xử lý vận hành tức thời là owner map danh mục `Khác` của chi nhánh Phước Hải
sang đúng máy in bếp (dự kiến `Mon chinh`, `printer_id = 6`) sau khi xác nhận
tuyến thực tế. Fallback chỉ dùng quy tắc máy in bếp mặc định hiện hữu của chi
nhánh, không suy ra máy in từ trạm KDS. Không tạo ngược phiếu “gốc” cho đơn cũ
vì sẽ làm sai bằng chứng lịch sử.

## Các vấn đề gốc

| Khu vực           | Vấn đề                                                     | Hậu quả                                                   |
| ----------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| Số lượng món      | `COUNT(*)` bị dùng thay cho `SUM(quantity)`                | Một dòng số lượng lớn bị hiển thị như một món             |
| Phần cơm          | `order_items` không giữ loại danh mục lúc bán              | Đổi danh mục sau này làm đổi lịch sử                      |
| Ăn kèm            | Món `side_dish` và `order_items.sides` bị trộn hoặc bỏ sót | Không đối chiếu được phần chính với đồ kèm                |
| KDS History       | Đọc từ `kds_tickets` sống                                  | Cleanup làm mất lịch sử hoàn thành                        |
| KDS audit         | `audit_logs` có API ghi tổng quát                          | Không đủ tư cách làm ledger KDS canonical                 |
| Tuyến in          | KDS station mapping độc lập với printer category mapping   | KDS có món nhưng phiếu bếp có thể thiếu món               |
| Print             | `print_jobs.payload` có thể bị cập nhật                    | Phiếu cũ không còn là bằng chứng bất biến                 |
| `/orders`         | Chọn phần tử đầu của quan hệ `payments`                    | Có thể hiện sai phương thức/trạng thái                    |
| POS session       | Một số báo cáo cộng `orders.total_amount`                  | Lệch với tiền thật đã thu                                 |
| Doanh thu ngày    | Có nơi dùng thời điểm tạo đơn                              | Sai ngày khi thanh toán qua nửa đêm                       |
| SePay             | Settlement chưa luôn tạo link bank–payment canonical       | Finance báo thiếu đối soát dù tiền đã vào                 |
| HĐĐT              | Chỉ nhìn `tax_invoices.order_id`                           | Bỏ sót hóa đơn tổng hợp ngày                              |
| Liên kết vận hành | Thiếu trace chung                                          | Quản lý phải dò nhiều màn hình nhưng vẫn thiếu bằng chứng |

## Hợp đồng dữ liệu canonical

### Tiền và ngày doanh thu

- Tiền đã thu: `payments.amount`.
- Thanh toán hợp lệ: `payments.status = 'completed'` và `paid_at IS NOT NULL`.
- Ngày/giờ doanh thu: `payments.paid_at AT TIME ZONE 'Asia/Ho_Chi_Minh'`.
- `orders.total_amount`, `orders.payment_method` là bản sao nghiệp vụ để cảnh
  báo sai lệch, không phải nguồn cộng tiền.
- Một đơn có thể có nhiều lượt thử thanh toán; UI phải hiện đủ các lượt.

### Số lượng

- Dòng món: `COUNT(order_items.id)`.
- Số lượng món: `SUM(order_items.quantity)`.
- Phần cơm/món chính mới: snapshot
  `order_items.category_type_snapshot = 'main_dish'`.
- Dữ liệu cũ không có snapshot phải ghi rõ là chưa phân loại lịch sử; nếu dùng
  danh mục hiện tại để hỗ trợ điều tra thì phải gắn nhãn “dữ liệu cũ theo danh
  mục hiện tại”.
- Ăn kèm gồm hai số riêng: dòng món `side_dish` và số lượng trong
  `order_items.sides`.
- “Đã phục vụ” chỉ tính `order_items.status = 'served'`.
- “KDS đã hoàn thành” chỉ tính item đã có event `completed`; không đồng nghĩa
  với món đã giao khách.

### KDS và print

- `kds_ticket_events` là ledger append-only, do trigger canonical ghi.
- Ledger giữ snapshot món, tên trạm, batch, actor, trạng thái trước/sau và thời
  điểm.
- Không tạo FK từ ledger tới ticket sống để cleanup không xóa/chặn lịch sử.
- Khi migration chạy, ticket `ready`/`served` còn sống được ghi thành
  `legacy_live_snapshot`; đây là mốc chuyển đổi, không được trình bày như lịch
  sử đầy đủ trước migration.
- KDS History mặc định theo ngày nhưng cho chọn ngày và loại sự kiện; timeline
  đầy đủ là màn chính, nhóm hoàn thành chỉ là số liệu dẫn xuất. Nếu ngày có hơn
  100 sự kiện, UI phải báo rõ giới hạn và yêu cầu lọc theo loại sự kiện.
- Snapshot KDS lúc chuyển đổi luôn được tách khỏi event canonical trên
  `/orders`, POS session và Finance; không được cộng hoặc trình bày như bằng
  chứng bếp đã làm/giao đủ.
- `print_jobs` là bằng chứng append-only; chỉ các trường lifecycle được đổi.
- Phiếu bếp mới lưu `ticket_ids` và `order_item_ids` để nối chính xác event KDS
  với print job, không suy đoán theo order.
- Completion print ưu tiên mapping danh mục; khi danh mục chưa có mapping thì
  dùng cùng máy in bếp mặc định như luồng gửi order hiện hữu.
- Hoàn tất KDS có item chưa map máy in phải trả `kitchen_print_skipped` và số
  ticket bị bỏ qua nếu không còn tuyến hợp lệ; UI cảnh báo kiểm tra cấu hình
  danh mục/máy in, tách khỏi lỗi enqueue/in.
- Receipt và phiếu chốt ca dùng khóa idempotency versioned để một nội dung mới
  tạo bằng chứng mới, không ghi đè phiếu cũ.

### SePay

- Cặp canonical chỉ được tạo khi tenant, provider transaction ID, hướng tiền
  vào, số tiền, payment, order và webhook ký hợp lệ khớp chính xác.
- Cùng bank + cùng payment: idempotent.
- Bank hoặc payment đã liên kết khác: `needs_review`, không tự chuyển link.
- Settlement và canonical reconciliation chạy trong cùng transaction.

Read-only Production preflight ngày 2026-07-25, làm mới lúc 15:24:

- `0` payment bị nối với nhiều bank transaction;
- `0` bank transaction bị nối với nhiều payment;
- `0` bank transaction đang trộn payment với target khác;
- có `301` cặp SePay exact-match, trong đó `101` cặp chưa có canonical link.

Đây là bằng chứng trước migration, không phải xác nhận migration đã được áp.

### HĐĐT

Mỗi đơn phải trả về toàn bộ bằng chứng:

- HĐ theo đơn qua `tax_invoices.order_id`;
- HĐ tổng hợp ngày qua `tax_invoice_orders`;
- trạng thái `not_required`;
- các trạng thái cần xử lý như `draft`, `signing`, `submitted`;
- số hóa đơn và `provider_ref` khi có.

## Kế hoạch triển khai

### P0 — Khóa thuật ngữ và tái hiện

- Đối chiếu sự cố `TC-260725-044-PH`.
- Xác nhận sai lệch KDS 17/phiếu bếp 16 đến đúng item và mapping bị thiếu.
- Tách dòng món, số lượng, phần cơm, ăn kèm, served và KDS completed.
- Ghi rõ giới hạn bằng chứng của lịch sử cũ.

### P1 — Sửa lựa chọn payment và trace đơn

- `/orders` chọn payment hoàn tất canonical thay vì phần tử đầu.
- Hiện tất cả lượt thanh toán.
- Hiện riêng dòng món, tổng số lượng, cơm có snapshot, cơm dữ liệu cũ ước tính,
  ăn kèm và số lượng đã phục vụ.
- Tạo `get_order_operational_trace` nối payment, KDS, print, HĐĐT và audit.
- Thêm liên kết từ trace tới POS session.

### P2 — Bằng chứng DB bất biến

- Snapshot loại danh mục lúc insert `order_items`.
- Tạo `kds_ticket_events` append-only và RPC lịch sử theo cursor.
- KDS History đọc ledger thay vì ticket sống.
- Khóa identity/payload của `print_jobs`, giữ lifecycle RPC.
- Version hóa producer receipt, provisional và shift-close.

### P3 — SePay canonical

- Thêm unique bank-to-payment canonical.
- Thêm guard exact match.
- Bọc settlement hiện có để tạo match cùng transaction.
- Backfill chỉ các cặp khớp chính xác, conflict để review.

### P4 — POS session

- Báo cáo tiền và giờ dùng completed payments/`paid_at`.
- Thành viên ca được xác định bởi `orders.pos_session_id`; payment nằm ngoài
  `opened_at`–`closed_at` vẫn thuộc ca nhưng phải hiện là ngoại lệ “late”.
- Payment hoàn tất không bị ẩn khi trạng thái/tổng tiền bản sao trên order bị
  lệch; lệch được đếm riêng để xử lý.
- Phân biệt số lượng gọi, served, KDS completed và phiếu đã in.
- Hiện số lượt payment và bằng chứng KDS/print/HĐĐT/audit.
- Tách số KDS canonical khỏi snapshot ticket sống lúc chuyển đổi.
- Phiếu chốt ca lấy breakdown tiền từ `payments`.

### P5 — Finance theo ngày

- `/finance/revenue` và biểu đồ dùng completed payments/`paid_at`, không lọc
  theo `orders.payment_status`.
- `get_orders_for_day_v2` trả đúng một dòng mỗi order với payment hoàn tất;
  v1 được giữ lại để rollback an toàn.
- Tổng tiền dùng `payments.amount`; tổng giảm/VAT là fact theo order và không
  nhân đôi theo payment attempt.
- Hiện số lượng món/phần cơm/ăn kèm, KDS, print, POS session, đối soát,
  audit và HĐĐT tổng hợp ngày.
- KDS canonical và KDS snapshot cũ là hai trường riêng; snapshot cũ luôn mang
  cảnh báo “bằng chứng không đầy đủ”.
- Liên kết trực tiếp về `/orders?orderId=` và POS session.

### P6 — Kiểm chứng và phát hành

- Làm rõ parent `main` đang báo `MIGRATIONS_FAILED`; không tạo hoặc dùng Preview
  làm evidence cho tới khi parent/lineage sẵn sàng.
- Test lựa chọn payment.
- Test KDS History từ event snapshot sau cleanup.
- Test tĩnh các contract migration/ACL/money.
- Test SQL invariant cho payment/order mirror lệch, bank đã khớp target khác,
  KDS complete→recall→complete qua ngày/cleanup và print mutation/retry.
- Chạy
  `supabase/tests/order_kds_payment_revenue_operational_truth_test.sql` và
  `supabase/tests/sepay_payment_conflict_quarantine_test.sql` trên Preview;
  cả hai chạy trong transaction rồi rollback.
- Web typecheck, ESLint, UI/copy contract và migration-lineage.
- Replay đủ migration trên Supabase Preview có parent
  `iexwsuaqqenyjiskawoj`.
- Chạy DB security/advisor checks trên Preview.
- Regenerate database types từ target được Environment Registry cho phép.
- Chạy full `typecheck`, `lint`, `build`, `test`.
- Authenticated browser QA desktop/mobile cho bốn route.
- PR/CI xanh.
- Owner áp migration Production theo đường phát hành đã duyệt.
- Authenticated Production read-only smoke sau deploy.

## Thứ tự phát hành

1. Chạy read-only preflight dưới đây trên đúng target. Nếu có kết quả, dừng
   migration và đối soát thủ công; không tự sửa hoặc chuyển liên kết.
2. Áp migration additive và function-compatible trước.
3. Refresh PostgREST schema cache nếu target không tự nhận chữ ký mới.
4. Deploy web sử dụng contract mới.
5. Kiểm tra một đơn cash và một đơn VietQR từ POS tới Finance.
6. Owner xác nhận và sửa mapping máy in của danh mục `Khác` tại Phước Hải,
   rồi chạy một đơn thử có `Cơm Tấm Bì`; đối chiếu KDS, `print_job` và phiếu
   giấy.
7. Chỉ sau khi Preview và CI xanh mới trình owner áp Production.

```sql
SELECT tenant_id, payment_id, count(*) AS bank_count
FROM public.bank_transaction_reconciliation_matches
WHERE payment_id IS NOT NULL
GROUP BY tenant_id, payment_id
HAVING count(*) > 1;

SELECT tenant_id, bank_transaction_id, count(*) AS target_count
FROM public.bank_transaction_reconciliation_matches
GROUP BY tenant_id, bank_transaction_id
HAVING count(*) FILTER (WHERE payment_id IS NOT NULL) > 0
   AND count(*) > 1;
```

Không merge Preview branch vào Production bằng công cụ tự động. Không ghi
Production nếu owner chưa ủy quyền rõ cho đúng thao tác trong phiên hiện tại.

## Kiểm toán bằng chứng hoàn tất

| Yêu cầu                                                                 | Bằng chứng hiện có                                                 | Trạng thái                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------- |
| Thuật ngữ dòng món, số lượng, phần cơm, ăn kèm, served và KDS completed | Contract UI/SQL và unit/static tests                               | Đã chứng minh ở source/local                   |
| Payment và ngày doanh thu theo `payments.paid_at`                       | Sáu migration, static contract, Production preflight chỉ đọc       | Đã chứng minh ở source; chưa replay DB         |
| KDS History bất biến sau cleanup                                        | Event ledger, immutable trigger, snapshot món/trạm và test cleanup | Đã chứng minh ở source; chưa chạy SQL test     |
| SePay canonical một bank–một payment                                    | Preflight Production, unique/guard migration và transaction test   | Chưa replay/backfill trên Preview              |
| Trace POS/print/HĐĐT/audit theo ngày                                    | `/orders`, POS session và Finance drill contract                   | Chưa có authenticated runtime capture          |
| Migration/ACL an toàn                                                   | T3 review, `pnpm verify`, SQL transaction tests đã viết            | Chưa có Preview replay/advisors                |
| CI và artifact phát hành                                                | Isolated worktree xanh                                             | Chưa commit/push/Draft PR/CI                   |
| Production                                                              | Không có write; nguyên nhân và phạm vi đã đọc xác nhận             | Chưa được owner ủy quyền apply/smoke           |
| Tuyến máy in danh mục `Khác` tại Phước Hải                              | Đã xác định thiếu mapping                                          | Chưa được owner xác nhận/sửa và thử phiếu giấy |

Không dùng test tĩnh hoặc local build để thay thế bằng chứng Preview,
authenticated runtime, CI hay Production.

## Trạng thái thực hiện

Đã hoàn thành tại isolated worktree:

- xác định nguyên nhân đơn `TC-260725-044-PH` và preflight Production chỉ đọc;
- triển khai sáu migration, cập nhật bốn route, cảnh báo tuyến in và bộ test;
- hoàn tất T3 engineering/operations review, không còn finding local;
- `pnpm verify` và `git diff --check` đều xanh, gồm security/dependency audit,
  package boundaries, `typecheck`, `lint`, production `build` và full test; web
  test có 1.274 test, 1.242 pass, 32 skip, 0 fail.

Chưa được coi là phát hành:

- chưa replay migration và SQL transaction tests trên Supabase Preview;
- chưa regenerate database types từ schema đã áp;
- chưa có authenticated browser QA/CI;
- chưa sửa mapping máy in hoặc áp migration trên Production.

Supabase inventory làm mới ngày 2026-07-25 xác nhận project Production
`iexwsuaqqenyjiskawoj` là `ACTIVE_HEALTHY`, chưa có Preview branch và record
branch `main` mang trạng thái migration `MIGRATIONS_FAILED`. Trạng thái này
không chứng minh runtime Production lỗi, nhưng phải được làm rõ bằng branch
replay trước mọi kế hoạch apply.

## Điều kiện hoàn tất

Goal chỉ hoàn tất khi:

- migration replay thành công;
- các quyền trực tiếp bị từ chối đúng và RPC hợp lệ vẫn chạy;
- bốn màn hình dùng cùng số tiền/ngày/số lượng;
- có bằng chứng authenticated runtime;
- CI xanh;
- Production deployment và smoke được xác nhận riêng, không suy ra từ local
  hoặc Preview.
