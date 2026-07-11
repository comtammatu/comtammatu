# Operations Smoke Gate

Runbook này kiểm chứng nhiệm vụ hệ thống đã chốt:

> Bán đúng, bếp nhận đúng, thu tiền đúng, in/hóa đơn đúng, kho trừ đúng, và chủ/quản lý nhìn được tình trạng vận hành thật theo ngày.

Đây là gate vận hành đầu cuối. Không dùng file này làm source of truth cho business
rules; khi có lệch, cập nhật canonical docs trước rồi mới cập nhật runbook.

## Khi Nào Chạy

- Trước khi mở chi nhánh mới hoặc đưa chi nhánh vào vận hành chính thức.
- Sau thay đổi vào POS, KDS, payment, print, stock consumption, HĐĐT, Finance Basic, hoặc realtime.
- Trước khi đánh dấu xong item `POS -> payment -> stock -> KDS/print -> HĐĐT` trong `tasks/todo.md`.
- Sau mỗi refactor server action/RPC có thể ảnh hưởng luồng bán hàng.

Không mark green từ `typecheck`, `lint`, hoặc `build` một mình. Gate này cần bằng
chứng runtime trên dev/test/staging được duyệt.

## Source Ladder

Đọc theo thứ tự này trước khi chạy:

1. [docs/ref/business-context.md](../ref/business-context.md) cho nhiệm vụ và phạm vi sản phẩm.
2. [docs/ref/glossary.md](../ref/glossary.md) cho cách gọi chuẩn.
3. [docs/ref/inventory-sop.md](../ref/inventory-sop.md) cho luồng kho và tiêu hao.
4. [docs/ref/einvoice-tax.md](../ref/einvoice-tax.md) cho HĐĐT.
5. [docs/runbooks/pos-kds/print-agent-rollout.md](pos-kds/print-agent-rollout.md) cho agent in.
6. [docs/runbooks/hddt-viettel-operations.md](hddt-viettel-operations.md) cho smoke Viettel S-invoice.

## Điều Kiện Vào Gate

- [ ] Target environment được ghi rõ: dev/test/staging, project ref, Vercel URL.
- [ ] Không chạy trực tiếp production nếu chưa có owner duyệt.
- [ ] Branch test có bàn/khu vực, máy POS, KDS station, printer config, payment config.
- [ ] Print agent của chi nhánh online hoặc đã ghi rõ fallback manual ticket.
- [ ] Item test có recipe/stock-backed consumption path.
- [ ] Tồn kho đủ để bán item test và có baseline trước smoke.
- [ ] HĐĐT test env hoặc support workflow được cấu hình rõ.
- [ ] Người chạy có tài khoản cho các vai: thu ngân/phục vụ, bếp, quản lý.

## Mission Checklist

| Mission           | Bằng chứng cần có                                                                                    | Không đạt nếu                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Bán đúng          | POS tạo đúng đơn, đúng bàn/kênh bán, đúng món, đúng giá, đúng giảm giá/phụ thu                       | Đơn tạo thành công nhưng sai line item, sai tổng tiền, hoặc sai bàn  |
| Bếp nhận đúng     | KDS nhận đúng phiếu bếp, đúng thứ tự, đúng món bếp cần làm                                           | KDS thiếu món, nhận trùng phiếu, hoặc ưu tiên thay thế đơn đang làm  |
| Thu tiền đúng     | Payment chuyển đúng trạng thái, đúng amount; payment RPC fail không được complete                    | Gateway thành công nhưng order/payment lệch trạng thái hoặc orphan   |
| In/hóa đơn đúng   | Print job claim/printed đúng, receipt không mất trường pháp lý, HĐĐT issued hoặc support workflow rõ | Receipt/HĐĐT thiếu dữ liệu, job failed không có đường retry          |
| Kho trừ đúng      | Kết quả khớp flag: post đúng, flag-off không post, shortage không partial-post                        | Movement sai/trùng/partial hoặc mismatch không có warning/reconcile  |
| Quản lý nhìn đúng | Finance Basic / reports phản ánh doanh thu, tồn kho, chi vận hành, lợi nhuận gộp sau smoke           | Owner dashboard không đổi, số lệch so với order/payment/stock đã tạo |

## Happy Path

Ghi lại mọi ID phát sinh: `branch_id`, `terminal_id`, `order_id`, `payment_id`,
`print_job_id`, `tax_invoice_id`, stock movement IDs.

1. Mở ca POS.
   - Expected: ca mở thành công, terminal đúng chi nhánh, POS hiển thị trạng thái printer.

2. Tạo đơn có ít nhất một món cần bếp và một món/option dùng để kiểm tổng tiền.
   - Expected: order ở đúng bàn/khu vực hoặc đúng kênh bán.
   - Expected: tổng tiền trước payment khớp line item, discount, tax/service charge nếu có.

3. Gửi bếp.
   - Expected: KDS nhận phiếu đúng chi nhánh/station/category.
   - Expected: KDS không mất current card nếu có order ưu tiên.
   - Expected: realtime/refetch không tạo duplicate ticket.

4. Hoàn thành một phần hoặc toàn bộ phiếu bếp.
   - Expected: trạng thái KDS chuyển đúng.
   - Expected: nếu completion tạo kitchen ticket print job, job có idempotency key và không in trùng khi retry.

5. Thanh toán bằng một phương thức được duyệt cho smoke.
   - Cash: expected RPC `confirm_cash_payment` hoàn tất order/payment.
   - VietQR: expected QR mang đúng `orders.payment_code` theo configured prefix;
     SePay webhook hoặc cashier confirm qua `confirm_vietqr_payment` hoàn tất
     order/payment.
   - MoMo: expected chỉ dùng native QR khi provider trả `qrCodeUrl`; webhook hoàn tất qua `complete_payment_and_consume_stock`.

6. Kiểm order/payment sau thanh toán.
   - Expected: order `completed`, payment `completed`, table được release nếu dine-in.
   - Expected: không có payment/order mismatch.

7. Kiểm kho theo cấu hình branch.
   - Nếu `pos_stock_outcome_posting` bật và đủ tồn: hoàn tất kitchen outcome;
     xác minh movement `pos_sale` / `sale_consumption` được post đúng branch,
     nguyên liệu, đơn vị và số lượng; retry không tạo movement trùng.
   - Nếu flag tắt: ghi rõ branch + flag evidence và xác minh không có movement
     sale-consumption phát sinh ngoài ý muốn.
   - Với shortage race hiếm khi posting: payment vẫn completed, không có movement
     partial, có warning/support evidence và reconciliation qua stocktake.

8. Kiểm in.
   - Expected: receipt print job được claim và chuyển `printed`.
   - Expected: receipt có branch name/address, order number, line items, total, payment method.
   - Expected: failed print job có đường retry ở `/admin/settings/printers/jobs`.

9. Kiểm HĐĐT.
   - Expected: HĐĐT issued qua Viettel S-invoice hoặc queue/support workflow có trạng thái rõ.
   - Expected: nếu khách không nhập thông tin mua hàng, flow vẫn tuân thủ policy HĐĐT hiện hành.

10. Kiểm quản lý nhìn đúng.
    - Expected: Finance Basic/reports phản ánh doanh thu vừa phát sinh.
    - Expected: inventory view phản ánh outcome đã chứng minh ở bước 7 (movement
      đúng, flag-off không movement, hoặc shortage đang có reconciliation).
    - Expected: support queues không còn mismatch chưa xử lý.

## Failure Path Bắt Buộc

Chạy ít nhất một failure path sau trong cùng environment:

### Payment RPC fail

- Tạo đơn test với điều kiện khiến payment RPC không được phép hoàn tất.
- Expected: user thấy thông báo an toàn, không lộ raw database error.
- Expected: order/payment không chuyển `completed` khi payment RPC fail.
- Expected: có log/audit/support signal đủ để xử lý.

### Stock posting shortage

- Chỉ test trên non-prod với flag bật và một race/fixture shortage có kiểm soát.
- Expected: payment/order vẫn completed theo D065.
- Expected: không có movement một phần; warning đủ để điều tra.
- Expected: stocktake/reconciliation xác nhận và sửa chênh lệch.

### Printer offline

- Tắt printer hoặc làm agent không reach được printer trong môi trường test.
- Expected: POS/KDS vẫn giữ source of truth trong DB.
- Expected: `print_jobs` chuyển `failed` hoặc pending rõ ràng.
- Expected: manager retry được sau khi printer online.

### HĐĐT provider hoặc cron fail

- Chặn/không gọi được provider trong env test hoặc trigger một lỗi provider đã biết.
- Expected: order/payment không bị rollback sai.
- Expected: HĐĐT vào trạng thái recovery rõ ràng, có retry/manual support path.

## Evidence Cần Ghi

Tạo PR/task evidence với format:

```md
## Operations Smoke Evidence

- Date/time:
- Environment:
- Commit SHA:
- Branch/site:
- Roles used:
- Devices:
- Payment method:
- Order ID:
- Payment ID:
- Print job ID:
- Tax invoice ID:
- Stock movement IDs:
- Result: GREEN / YELLOW / RED
- Blockers:
- Follow-up tasks:
```

## Green Criteria

Gate chỉ green khi:

- Happy path chạy đủ từ POS đến quản lý nhìn số.
- Ít nhất một failure path đã được chứng minh không làm sai dữ liệu.
- Không có raw Supabase/Postgres error trả ra UI.
- Không có order/payment/stock/HĐĐT mismatch chưa giải thích hoặc chưa có
  reconciliation owner.
- Print failure có đường retry hoặc fallback vận hành rõ.
- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build` pass trên checkout dùng để deploy/test.

## Yellow Criteria

Chỉ được yellow nếu vẫn có thể vận hành an toàn bằng thao tác thủ công đã ghi rõ:

- HĐĐT provider chưa issued tự động nhưng có queue/manual recovery.
- Printer fail nhưng manual ticket fallback đã chạy được và dữ liệu DB đúng.
- Realtime chậm nhưng refetch/visibility resume đưa UI về đúng state.

Yellow không được dùng nếu payment, stock, hoặc order status có thể sai âm thầm.

## Red Criteria

Không vận hành/không scale nếu có một trong các lỗi:

- Payment thành công nhưng order không đúng trạng thái.
- Movement sai site, trùng, partial-post, hoặc thiếu không thuộc flag-off/shortage
  path đã có warning + reconciliation.
- KDS thiếu phiếu bếp cho món cần bếp.
- Receipt/HĐĐT mất thông tin pháp lý bắt buộc.
- Quản lý nhìn số sai mà không có reconciliation path.
- Fallback thay đổi UX/product contract thay vì fail rõ.
