# Kế hoạch chuyển đổi Công thức, Lệnh và Đơn vị sản xuất

## Mục tiêu và phạm vi

Lát cắt này loại bỏ vai trò “Đơn vị sản xuất” khỏi danh mục nguyên liệu, đặt đơn vị đầu ra và đầu vào tại từng Công thức sản xuất, rồi snapshot toàn bộ định mức vào Lệnh sản xuất. Thành phẩm chỉ được nhập tồn tại Bếp Trung Tâm; giao về chi nhánh tiếp tục đi qua chứng từ Điều chuyển.

Không triển khai multi-level BOM, versioning công thức, thay thế nguyên liệu, chi phí nhân công, variance engine hoặc trạng thái “Mẻ hỏng”. Mẻ không có sản lượng phải hủy và ghi nhận vật tư hỏng qua Hao hụt.

## Quyết định vận hành đã khóa

- Surface chuẩn là `/inventory/production`. Owner chọn Bếp TT bằng URL scope; `central_kitchen_lead` chỉ làm việc tại site Bếp TT trong JWT.
- Công thức có sản lượng chuẩn, đơn vị thành phẩm và đơn vị riêng cho từng dòng nguyên liệu. Mọi quy cách đang active của đúng item đều được dùng.
- Lệnh lấy đơn vị từ công thức, không có picker đơn vị và không nhận `targetBranchId`.
- State machine là `draft → in_progress → completed`; `draft` không được hoàn thành trực tiếp.
- Khi tạo lệnh, hệ thống snapshot sản lượng chuẩn và toàn bộ dòng nguyên liệu. Sửa công thức sau đó không làm đổi lệnh đã tạo.
- Hoàn thành lệnh trừ nguyên liệu thực tế và nhập thành phẩm tại cùng site `central_kitchen` trong một transaction. CTA sau hoàn thành chỉ dẫn sang Điều chuyển.
- Mười ba nhóm công thức hiện hữu được backfill thành `needs_review`. Dữ liệu suy diễn chỉ được prefill để đối chiếu, không tự kích hoạt.

## Mô hình đích

`production_recipe_specs` là header duy nhất theo `(tenant_id, finished_good_id)`, lưu sản lượng chuẩn, snapshot đơn vị thành phẩm và trạng thái `needs_review | active | inactive`. `production_recipes` tiếp tục là các dòng nguyên liệu và tham chiếu header bằng `recipe_spec_id`.

`production_runs` snapshot `recipe_spec_id`, `recipe_output_quantity` và đơn vị đầu ra. `production_run_lines` snapshot số lượng kế hoạch, đơn vị và hệ số quy đổi của từng nguyên liệu. Chỉ recipe `active` được tạo lệnh.

```text
Công thức active
  ├─ snapshot header ────────────────┐
  └─ snapshot dòng nguyên liệu ─────┤
                                     ▼
                         Lệnh draft tại Bếp TT
                                     │ bắt đầu
                                     ▼
                              in_progress
                                     │ hoàn thành nguyên tử
                 ┌───────────────────┴──────────────────┐
                 ▼                                      ▼
        trừ nguyên liệu thực tế                  nhập thành phẩm Bếp TT
                                                        │
                                                        ▼
                                              Điều chuyển riêng nếu cần
```

## Triển khai theo đợt

### Đợt 0 — An toàn và lineage

1. Giữ module Sản xuất ở trạng thái bảo trì cho đến khi migration và runtime cùng đạt acceptance.
2. Land nguyên văn mọi migration đã applied Production nhưng chưa có trong Git bằng commit riêng.
3. Trước migration mới, xác minh project ref, migration ledger, số nhóm/dòng công thức, trạng thái lệnh và production movement. Nếu có lệnh khác `cancelled`, dừng backfill.
4. Không apply Production nếu Owner chưa ủy quyền đúng batch trong phiên hiện tại.

### Đợt 1 — Schema additive và fail-closed

1. Tạo hai bảng snapshot, FK, checks, indexes, RLS và quyền read-only trực tiếp.
2. Backfill recipe header thành `needs_review`; link các dòng hiện hữu; giữ lệnh `cancelled` để đọc và không tạo run line giả.
3. Thay production unit-role trigger bằng kiểm tra quy cách active của đúng item.
4. Thêm aggregate RPC cho công thức và RPC create/start/complete/cancel mới. Các writer cũ trả lỗi bảo trì ổn định hoặc bị revoke.
5. Rehearse trên Preview Branch có parent Production đã xác minh. Sau Production apply, chạy `corepack pnpm db:types`.

### Đợt 2 — Runtime và UI chuẩn

1. Catalog bỏ copy/picker “Đơn vị sản xuất”; compatibility call tạm truyền `p_production_unit_id = null`.
2. Form công thức quản lý header và các dòng bằng generic active-unit picker; hiển thị badge trạng thái.
3. Form tạo lệnh chỉ nhận recipe, sản lượng kế hoạch, source/target location cùng Bếp TT và ghi chú.
4. Detail chỉ cho bắt đầu ở `draft`, hoàn thành ở `in_progress`, và chỉ đọc ở `completed/cancelled`.
5. Route branch cũ redirect sang surface chuẩn, giữ `branchId` và run ID.
6. Sau hoàn thành, CTA phụ mở Điều chuyển; không nối target branch vào lệnh.

### Đợt 3 — Duyệt dữ liệu và cleanup

1. Owner mở và lưu từng recipe live để xác nhận output quantity/unit và toàn bộ nguyên liệu; chỉ khi đó recipe mới `active`.
2. Chạy một mẻ đầy đủ trên Preview. Production smoke có movement cần ủy quyền riêng.
3. Chỉ xóa RPC/cột/implementation legacy khi CodeGraph, source callers và `pg_depend` cùng xác nhận không còn phụ thuộc.
4. Đổi signature `save_ingredient_catalog` và drop `ingredients.production_unit_id` trong maintenance window Catalog riêng; không tạo overload compatibility.

## Tổng hợp rà soát T3

### PM

Giá trị chính là ngăn sản xuất sai định mức và chặn đường tắt nhập thành phẩm thẳng về chi nhánh. Maintenance fail-closed giữa migration và runtime là đánh đổi có chủ đích, giới hạn trong module Sản xuất.

### BA

Đơn vị là thuộc tính của từng công thức, không phải vai trò cố định của item. Lệnh là chứng từ lịch sử nên phải snapshot công thức. Sản xuất và Điều chuyển là hai nghiệp vụ, hai chứng từ và hai điểm kiểm soát khác nhau.

### Senior Dev

Mọi write nhiều dòng nằm trong Postgres RPC, `SECURITY DEFINER` có `search_path` rỗng, input được kiểm tra ở cả Zod và SQL. Completion khóa run và stock rows theo thứ tự ổn định, trả shortage trong `DETAIL`, và bảo toàn tổng giá trị WAC đầu vào/đầu ra.

### QA

Acceptance phải chứng minh hệ số quy đổi, snapshot bất biến, transition đúng, idempotency completion, rollback khi thiếu tồn, chặn cross-site và cân bằng giá trị. Browser smoke chạy Owner/Bếp TT trên mobile, tablet và desktop ở Preview.

## Rollback và cổng nghiệm thu

Trước production movement đầu tiên, rollback runtime bằng maintenance UI và giữ schema additive. Sau khi có completed movement, không rollback schema hoặc sửa ledger; chỉ roll forward.

Chạy targeted SQL/Node tests, sau đó:

```bash
REVIEW_TIER=T3 corepack pnpm lint:review-tier
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
corepack pnpm verify
corepack pnpm lint:migration-lineage
codegraph index .
```
