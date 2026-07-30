# Thiết kế RPC điều chỉnh chênh lệch tồn theo chứng từ

**Ngày:** 2026-07-30  
**Mức review:** T3  
**Phạm vi phát hành:** code, migration, kiểm thử, PR, apply Greenfield và deploy Vercel Production

## 1. Vấn đề

`createInventoryDocumentCorrection` đang ghi trực tiếp vào
`public.stock_movements` bằng Supabase Data API. Database đã chủ động thu hồi
`INSERT`, `UPDATE` và `DELETE` của `authenticated` để mọi bút toán kho đi qua
RPC nguyên tử. Vì vậy thao tác tạo điều chỉnh trả `403 / SQLSTATE 42501:
permission denied for table stock_movements`.

Lỗi này không được sửa bằng cách cấp lại `INSERT` hoặc thêm policy ghi trực tiếp.
`stock_movements` là append-only ledger; quyền ghi trực tiếp sẽ phá ranh giới
authorization và cho phép client tự khai tenant, branch, actor, loại movement
hoặc chứng từ nguồn.

## 2. Mục tiêu

- Khôi phục thao tác điều chỉnh chênh lệch tồn từ GRN, Phiếu xuất, Điều chuyển
  và Mẻ sản xuất.
- Giữ `stock_movements` ở chế độ RPC-only đối với `authenticated`.
- Xác thực source document, branch, ingredient, permission và tồn không âm
  trong cùng transaction với movement.
- Chống double submit và retry tạo movement trùng.
- Giữ Hóa đơn NCC, VAT, công nợ, payment, GRN, PO và WAC bất biến.
- Giữ báo cáo minh bạch: GRN là đầu vào mua hàng; adjustment là chênh lệch
  giải trình riêng; tồn cuối kỳ tính cả hai.
- Sửa guard của `amend_grn_line` để nhận biết Hóa đơn NCC được phân bổ qua nhiều
  GRN, không chỉ GRN tương thích trên header hóa đơn.

## 3. Ngoài phạm vi

- Không cấp lại direct DML trên `stock_movements`.
- Không tự sửa GRN, PO, Hóa đơn NCC, VAT, payment hoặc supplier credit từ thao
  tác điều chỉnh tồn.
- Không hồi tố WAC hoặc dùng giá Hóa đơn NCC làm giá cho adjustment.
- Không xây payment proposal, debit note hoặc credit-note engine mới.
- Không thay đổi route, record depth, shell hoặc visual language.
- Không xóa movement sai; recovery dùng compensating adjustment được duyệt.

## 4. Tổng hợp T3 theo bốn góc nhìn

### PM

Kết quả nhỏ nhất được chấp nhận là thao tác điều chỉnh tồn hoạt động lại mà
không mở rộng quyền client và không làm thay đổi sự thật tài chính đã chốt.

### BA

GRN phản ánh đầu vào mua hàng. Adjustment phản ánh chênh lệch tồn vật lý có
giải trình. Hai nhóm cùng tham gia công thức tồn cuối nhưng không thay thế nhau.
Hóa đơn đã thanh toán không bị sửa ngược; sai lệch mua hàng phải đi qua
Supplier Return/Credit Note hoặc Hóa đơn NCC bổ sung theo nghiệp vụ tương ứng.

### Senior Dev

Ranh giới đúng là một `SECURITY DEFINER` RPC có `search_path` an toàn, tự lấy
tenant và actor từ auth context, khóa dữ liệu cần thiết, xác thực permission và
ghi movement trong một transaction. Server Action chỉ làm Zod validation, gọi
RPC và ánh xạ lỗi an toàn.

### QA/QC

Bằng chứng phải bao phủ permission, scope, source state, unit conversion, tồn
âm, idempotency, source FK, WAC, AP/payment bất biến, direct DML bị khóa, báo
cáo cân và rollout đúng target.

## 5. Quyết định kiến trúc

### 5.1 Phương án được chọn

Tạo RPC riêng:

```sql
public.create_inventory_document_stock_adjustment(
  p_document_type text,
  p_document_id bigint,
  p_branch_id bigint,
  p_ingredient_id bigint,
  p_quantity_change numeric,
  p_reason text,
  p_idempotency_key uuid
) returns jsonb
```

Kết quả thành công:

```json
{
  "success": true,
  "movement_id": 123,
  "replayed": false
}
```

Retry cùng key và cùng payload trả cùng `movement_id` với `replayed: true`.
Cùng key nhưng payload hoặc actor khác trả lỗi
`stock_adjustment_idempotency_conflict`.

### 5.2 Phương án không chọn

- Không mở rộng `adjust_stock_exception` bằng nhiều tham số chứng từ vì sẽ trộn
  điều chỉnh ngoại lệ tự do với điều chỉnh có source document.
- Không dùng service role trong Server Action vì kiểm tra và ghi sẽ bị tách
  transaction, tạo race và đưa authorization ra khỏi database.
- Không cấp `INSERT` cho `authenticated`.

## 6. Data flow

```text
DocumentStockCorrectionDialog
  → createInventoryDocumentStockAdjustment Server Action
  → Zod validation
  → create_inventory_document_stock_adjustment RPC
      → auth.uid() + auth_tenant_id()
      → has_permission(branch_id, 'inventory:write')
      → validate source document + ingredient + branch + posted state
      → lock stock_levels row
      → reject negative resulting stock
      → resolve active warehouse + active base unit
      → resolve/replay idempotency key
      → INSERT stock_movements(type = 'adjustment')
      → stock trigger updates stock_levels.current_quantity
  → safe ActionResult
  → revalidate affected inventory/report paths
```

## 7. Invariants

### 7.1 Auth và scope

- `auth.uid()` và `auth_tenant_id()` phải tồn tại.
- Tenant, actor và source FK không nhận trực tiếp từ client.
- Actor phải có `inventory:write` tại đúng `p_branch_id`.
- Branch và document phải thuộc tenant hiện tại.
- Branch Manager không được điều chỉnh branch khác dù gọi RPC trực tiếp.

### 7.2 Chứng từ nguồn

- `grn`: GRN `confirmed`, branch khớp và có `grn_items` của ingredient.
- `issue`: Phiếu xuất `confirmed`, branch khớp và có `stock_issue_items` của
  ingredient.
- `transfer`: branch gửi chỉ hợp lệ từ lúc đã ship; branch nhận chỉ hợp lệ sau
  khi đã receive; transfer phải có ingredient tương ứng.
- `production_run`: mẻ `completed`, branch đích khớp và finished good khớp
  ingredient.
- RPC chỉ đặt đúng một source FK trong `grn_id`, `issue_id`, `transfer_id` hoặc
  `production_run_id`.

### 7.3 Ledger và WAC

- `type` luôn là `adjustment`.
- `quantity_change` hữu hạn và khác `0`.
- `reason` trim, dài từ 10 đến 500 ký tự.
- RPC khóa dòng `stock_levels` tương ứng trước khi kiểm tra tồn mới.
- Nếu chưa có dòng tồn, quantity hiện tại được xem là `0`; adjustment âm bị
  từ chối.
- `current_quantity + quantity_change` không được âm.
- `entry_unit_id` là active base unit; `entry_quantity` bằng trị tuyệt đối của
  `quantity_change`.
- Adjustment không ghi hoặc thay đổi giá mua; `avg_unit_cost` giữ nguyên.
- GRN/PO/invoice/payment/credit không bị update từ RPC này.

### 7.4 Idempotency

Thêm `stock_movements.idempotency_key uuid` nullable và unique partial index
trên `(tenant_id, idempotency_key)` khi key khác null.

Khi unique conflict:

- RPC đọc movement hiện có trong cùng tenant.
- So sánh actor, branch, ingredient, signed quantity, normalized reason và đúng
  source FK.
- Payload trùng trả movement cũ.
- Payload khác fail closed.

Các writer cũ không truyền key và tiếp tục ghi `NULL`; unique index không ảnh
hưởng chúng.

## 8. Ranh giới GRN và Hóa đơn NCC

Điều chỉnh tồn theo GRN chỉ tạo `adjustment` có `grn_id` để truy vết. Nó không
thay đổi `grn_items.received_quantity`, `po_applied_quantity`, invoice
allocation, WAC hoặc AP.

Sửa sự thật thực nhận tiếp tục dùng `amend_grn_line`. Guard của RPC này phải
chặn khi GRN được liên kết trực tiếp hoặc qua
`supplier_invoice_receipt_allocations` với bất kỳ Hóa đơn NCC nào có:

- `payment_status <> 'unpaid'`;
- `paid_amount > 0`; hoặc
- `credit_applied_amount > 0`.

Guard giữ kiểm tra header tương thích cho dữ liệu cũ và thêm join qua allocation
table cho mô hình nhiều GRN–một hóa đơn.

## 9. Quyền database

- RPC dùng `SECURITY DEFINER` vì phải ghi vào RPC-only ledger.
- RPC đặt `SET search_path TO ''` và schema-qualify mọi object.
- RPC tự kiểm tra auth, tenant, permission và source scope trước mọi write.
- `REVOKE ALL ... FROM PUBLIC, anon`.
- Chỉ `GRANT EXECUTE ... TO authenticated, service_role`.
- Giữ nguyên `REVOKE INSERT, UPDATE, DELETE ON public.stock_movements FROM
anon, authenticated`.
- RLS SELECT hiện hành không thay đổi.

## 10. Server Action và UI

Đổi tên action theo nghĩa nghiệp vụ:
`createInventoryDocumentStockAdjustment`.

Action:

- dùng Zod cho toàn bộ input;
- tạo hoặc nhận idempotency key ổn định cho một lần submit;
- gọi đúng một RPC;
- không query permission/source/location/unit riêng trước write;
- không runtime-import database barrel trong client;
- không trả raw database error;
- chỉ báo success khi có `movement_id`.

Dialog hiện tại được giữ nguyên cấu trúc. Copy lấy từ inventory message
dictionary và nói rõ:

> Chỉ điều chỉnh tồn; không thay đổi GRN, Hóa đơn NCC hoặc thanh toán.

Các trạng thái permission denied, chứng từ không hợp lệ, tồn âm, idempotency
conflict và lỗi chung dùng copy tiếng Việt an toàn.

## 11. Mã lỗi ổn định

| Token                                   | SQLSTATE | Ý nghĩa phía ứng dụng                   |
| --------------------------------------- | -------- | --------------------------------------- |
| `not_authenticated`                     | `28000`  | Phiên đăng nhập không hợp lệ            |
| `forbidden`                             | `42501`  | Không có quyền tại branch               |
| `source_document_not_found`             | `P0002`  | Không tìm thấy chứng từ                 |
| `source_document_not_posted`            | `23514`  | Chứng từ chưa ở trạng thái cho phép     |
| `source_ingredient_not_found`           | `23514`  | Nguyên liệu không thuộc chứng từ        |
| `active_warehouse_required`             | `P0002`  | Branch chưa có active warehouse         |
| `entry_unit_not_found`                  | `23503`  | Thiếu active base unit                  |
| `negative_stock`                        | `23514`  | Điều chỉnh làm tồn âm                   |
| `stock_adjustment_idempotency_conflict` | `23505`  | Key đã dùng cho payload khác            |
| `has_paid_invoice`                      | `23514`  | Không được sửa GRN đã có payment/credit |

## 12. Kiểm thử

### 12.1 SQL tests

- Auth null và tenant null.
- Actor thiếu `inventory:write`.
- Cross-tenant và cross-branch.
- Từng document type với state hợp lệ và không hợp lệ.
- Ingredient không thuộc source.
- Active warehouse hoặc base unit bị thiếu.
- Quantity `0`, `NaN`, infinity và adjustment âm vượt tồn.
- Source FK đúng và chỉ một FK được đặt.
- `current_quantity` đổi đúng; WAC không đổi.
- Retry cùng key chỉ có một movement.
- Cùng key khác payload fail closed.
- Hóa đơn, allocation, paid amount, credit, payment và VAT không đổi.
- `amend_grn_line` chặn paid/partial/credited invoice qua header và allocation.
- Direct table DML của `authenticated` vẫn bị từ chối.

### 12.2 Static/application tests

- Action gọi RPC và không còn direct insert.
- Regression guard quét mọi runtime callsite của
  `.from("stock_movements").insert`.
- Zod từ chối input không hợp lệ.
- Mọi token được ánh xạ sang copy an toàn.
- Dialog có cảnh báo tài chính và không hiển thị raw error.
- Báo cáo giữ `grn_receipt` và `adjustment` thành hai bucket.
- Công thức opening + movements = closing.

### 12.3 Runtime smoke

- Phone và desktop: mở dialog, submit, pending, error và success.
- Permission denied và negative-stock không tạo movement.
- Canary hợp lệ tạo đúng một movement.
- Retry canary không tạo movement thứ hai.
- Đối chiếu trước/sau cho stock level, WAC, GRN, invoice và payment.

## 13. Trình tự PR, apply và deploy

1. Làm việc trên branch riêng, chỉ sở hữu các file trong phạm vi task.
2. Tạo forward migration trước code phụ thuộc.
3. Viết failing tests, migration, generated contract và app changes.
4. Chạy targeted tests và `REVIEW_TIER=T3 corepack pnpm verify`.
5. Mở PR T3; CI và review phải xanh.
6. Sau ủy quyền chính xác, apply migration additive lên literal Greenfield ref
   `enloyfnuerqgaqderbwb` trước khi app mới được deploy.
7. Chạy `corepack pnpm db:types`, advisors và commit generated types vào PR.
8. Chạy lại CI; chỉ merge khi xanh.
9. Merge `main` và deploy duy nhất Vercel project
   `prj_OGyJLaxEcceuckDoOUWth60FasXC`.
10. Chạy read-only smoke ngay sau deploy.
11. Chạy một canary bằng nghiệp vụ thật được owner duyệt; không tạo fixture giả
    trong Production.
12. Xác minh logs, movement, stock, WAC, invoice và payment trước khi tuyên bố
    rollout hoàn tất.

Không deploy project retired và không ghi vào retired Supabase ref.

## 14. Rollback và recovery

- Nếu app lỗi, rollback Vercel deployment và giữ schema additive.
- Không drop RPC, column hoặc index như phản ứng đầu tiên.
- Nếu RPC chưa ghi sai dữ liệu, sửa bằng forward migration/code.
- Nếu đã có movement sai, không xóa ledger; tạo compensating adjustment sau
  khi xác định source, actor, quantity và lý do.
- Không cấp lại direct DML để khắc phục sự cố.
- Nếu canary cho thấy invoice/payment/WAC thay đổi, dừng rollout ở trạng thái
  RED và điều tra trước mọi retry.

## 15. Tiêu chí chấp nhận

- Không còn direct `POST /rest/v1/stock_movements` từ document adjustment.
- Không còn `42501 permission denied for table stock_movements` cho luồng hợp
  lệ; unauthorized call vẫn fail closed tại RPC.
- Một submit hoặc retry tạo đúng một adjustment movement.
- Tồn không âm và ledger khớp `stock_levels`.
- `grn_receipt` và `adjustment` vẫn tách riêng trong báo cáo.
- Hóa đơn NCC đã thanh toán, VAT, AP, credit và payment không đổi.
- `amend_grn_line` không thể sửa GRN đã có payment/credit qua bất kỳ allocation
  nào.
- Full T3 verification, CI, Greenfield apply, Vercel deploy và canary đều có
  evidence riêng.
