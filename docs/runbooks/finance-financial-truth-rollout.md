# Finance Financial Truth — Rollout

Checklist này triển khai Finance theo một chuỗi có thể đối soát:

- `payments` sở hữu Doanh thu và phương thức thanh toán.
- `bank_transactions` sở hữu mọi biến động tiền ngân hàng từ SePay.
- `bank_opening_balance` là mốc bắt buộc vì hệ thống không đọc được số dư ngân
  hàng; sửa mốc chỉ làm thay đổi kết quả đúng phần chênh của mốc.
- `pos_sessions` sở hữu số đếm, dự thu và lệch tiền của từng ca.
- Quan hệ đối soát chỉ phân loại bằng chứng; không tạo thêm biến động tiền.

Business contract nằm ở `docs/modules/finance.md` và
`docs/ref/operational-data-contract.md`. Runbook này chỉ chốt trình tự rollout
và evidence bắt buộc.

## Trạng thái phải báo riêng

Không gộp các trạng thái sau thành “đã xong”:

1. `written`: source/migration đã có trong working tree.
2. `verified-local`: typecheck, lint, build và test đã qua.
3. `applied-cloud-dev`: migration có trong Cloud DEV ledger theo `name` và
   schema/RLS/RPC smoke đã qua.
4. `preview-ready`: Vercel Preview đã build đúng commit, nối đúng Cloud DEV và
   authenticated browser smoke đã qua.
5. `production-ready`: PR/CI/Preview xanh và gói migration/backfill đã được
   review; chưa có nghĩa là đã ghi Production.
6. `applied-production`: migration có trong Production ledger theo `name` sau
   ủy quyền Owner trong session hiện tại.
7. `deployed-production`: app đúng commit đã READY và canary Production đã qua.

Supabase ghi `version` theo thời điểm apply; đối chiếu rollout bằng `name`, rồi
lưu cả `version` thực tế làm evidence. Không so filename timestamp local với
`version` cloud để kết luận migration bị thiếu.

## Trình tự migration

Apply đúng thứ tự dưới đây bằng migration tooling sau khi đã kiểm project ref:

1. `20260719190000_align_finance_cash_shift_truth.sql`
2. `20260719210000_create_canonical_bank_transactions.sql`
3. `20260719213000_harden_finance_function_execute_acl.sql`
4. `20260719220000_create_bank_reconciliation_matches.sql`
5. `20260719221500_align_bank_reconciliation_indexes.sql`
6. `20260719222000_add_bank_reconciliation_tenant_index.sql`
7. `20260719223000_backfill_pos_variance_resolution_state.sql`
8. `20260719224000_guard_cash_correction_with_bank_evidence.sql`
9. `20260719225000_create_finance_attention_targets.sql`
10. `20260720110000_enforce_payment_method_mirror.sql`

Sau khi apply vào schema nguồn tạo types, chạy `corepack pnpm db:types` và review
diff trước khi chạy full gate.

## Cloud DEV và Preview gate

- [ ] Xác nhận literal Cloud DEV ref theo Environment Registry.
- [ ] Đủ 10 migration theo `name`; hai bảng canonical bật RLS.
- [ ] `anon` không có `EXECUTE` trên RPC import, reconcile, correction hoặc
      attention.
- [ ] Owner-only RPC kiểm `auth_is_owner`; read/attention kiểm `finance:view`;
      xử lý lệch ca kiểm `pos:close_shift` và branch scope.
- [ ] Không có duplicate `(tenant_id, provider_transaction_id)` hoặc row
      reconciliation gắn hơn một loại chứng từ.
- [ ] Không còn `orders.payment_method` khác `payments.method` cho payment
      `completed`; migration chỉ repair mirror khi đúng một payment nguồn.
- [ ] Chạy advisor sau DDL. Cảnh báo SECURITY DEFINER chỉ được chấp nhận khi RPC
      là browser boundary chủ ý, `anon=false` và có auth check bên trong.
- [ ] Preview build đúng commit/branch, không deploy một working tree chứa thay
      đổi ngoài scope.
- [ ] Preview dùng Cloud DEV credentials đồng bộ; không có Production
      `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Owner đăng nhập thật và mở được `/finance`,
      `/finance/bank-transactions`, `/finance/expenses`.
- [ ] Branch Manager không vào được `/finance`, nhưng xử lý được đúng ca thuộc
      chi nhánh qua `/br/[branchId]/pos-sessions?session=[id]`.

## Bank ledger canary

- [ ] Đặt `bank_opening_balance` và ngày mốc; chưa có mốc thì UI phải hiển thị
      `—`, không suy ra số dư từ giao dịch.
- [ ] Import file SePay có cả tiền vào và tiền ra. Số cuối phải bằng:
      `đầu kỳ + tổng tiền vào - tổng tiền ra`.
- [ ] Import lại cùng file cho `inserted_count=0`; cùng SePay ID nhưng facts khác
      phải fail toàn bộ import.
- [ ] Sửa số dư mở thêm `x` làm số cuối tăng đúng `x`; không mất payment hoặc
      bank transaction cũ.
- [ ] Gắn/gỡ payment, expense, thanh toán NCC hoặc refund không đổi tổng
      `bank_transactions`.
- [ ] Giao dịch chưa gắn nguồn xuất hiện trong Finance Attention và drilldown
      giữ đúng khoảng ngày Việt Nam.

## POS cash canary

- [ ] Kết ca tính `dự thu = đầu ca + completed cash payments`; không dùng
      `orders.total_amount` làm nguồn tiền.
- [ ] `staff_repaid` chỉ dùng cho thiếu tiền, ghi đúng số nhân viên bù và không
      tạo cash-book adjustment mới.
- [ ] `accepted_adjustment` giữ nguyên số đếm/lệch lúc đóng và đưa signed
      difference vào tiền mặt theo sổ.
- [ ] Sửa Cash → VietQR đồng bộ payment/order, giảm dự thu ca và mở lại variance
      resolution; bank ledger chưa đổi cho đến khi có SePay evidence.
- [ ] Mọi sửa method của payment đã hoàn tất vẫn phải qua
      `correct_payment_method`; trigger mirror không thay thế audit, tính lại ca
      hoặc kiểm tra bank evidence.
- [ ] VietQR → Cash bị chặn khi còn canonical match hoặc signed webhook evidence;
      Owner phải gỡ bằng chứng trong đối soát trước.
- [ ] Audit có đúng action: `bank_transactions.sepay_import`,
      `bank_transaction.reconcile`, `payment.method_correct`,
      `pos_session.variance_resolve`.

## Owner và Kế toán

- [ ] Owner rà Daily Close: bốn metric có nguồn/công thức rõ, tiền theo sổ, lệch
      ca, SePay chưa gắn nguồn, VietQR thiếu bằng chứng, chi vận hành, AP, HĐĐT và
      tồn đầu/cuối kỳ.
- [ ] Branch Manager chỉ xử lý lệch ca trong phạm vi quyền chi nhánh.
- [ ] Khi chưa có role `accountant`, Kế toán chỉ nhận export/evidence do Owner
      kiểm soát; không map ngầm `office` hoặc vị trí khác thành Finance access.
- [ ] Trước khi mở workspace Kế toán, Owner phải quyết định role, scope,
      read-only/action, quyền khóa kỳ và remediation profile Production.

## Production go/no-go

Không apply hoặc backfill Production nếu chưa có ủy quyền Owner trong session
hiện tại.

Go khi đủ toàn bộ:

- PR đã review, CI xanh, Preview/auth smoke xanh.
- Production ref được đối chiếu literal với Environment Registry.
- Có read-only preflight: migration names, opening anchors, số lượng/chiều SePay,
  duplicate IDs, POS variance legacy state và RPC grants.
- Có snapshot trước apply và script đối soát sau apply.
- Import/backfill canonical SePay dùng provider transaction ID để idempotent;
  không sửa/xóa `payments` nhằm ép số dư khớp.

Thứ tự Production: apply 10 migration → regenerate/verify contract artifacts nếu
cần → import/backfill SePay → đối chiếu công thức ngân hàng → deploy app → Owner
canary → theo dõi runtime logs.

## Rollback

Các migration là additive/hardening. Nếu app canary lỗi, rollback app về
deployment trước và giữ schema mới; không drop ledger hoặc xóa bank evidence.
Nếu import sai, dừng reconcile/deploy và điều tra theo provider transaction ID;
không chạy destructive cleanup khi chưa có một migration repair được review và
ủy quyền riêng.
