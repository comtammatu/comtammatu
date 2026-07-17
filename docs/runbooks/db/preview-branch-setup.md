# Preview Branch — Non-Production Database

Dùng Preview Branch cho migration replay, RLS/RPC verification và smoke có write
mà không đụng production. Quyền tạo branch phụ thuộc vào
`supabase/migration-lineage.json`; production merge/reset/rebase/apply vẫn là
production write và cần quyền riêng.

## Trạng thái hiện tại — aligned

PROD ledger đã được đối chiếu với baseline `20260717151345` và managed-surfaces
fold `20260717151346`; source manifest cho phép native Preview Branching. Kết quả
cũ không thay thế được `corepack pnpm lint:migration-lineage` ngay trước mỗi lần
tạo branch.

Trạng thái lineage không chứng minh branch cloud sẵn sàng. Trước khi tạo branch,
phải kiểm tra trạng thái Supabase hiện tại, lấy đúng chi phí theo giờ và được chủ
dự án xác nhận chi phí đó. Nếu parent hoặc Preview báo migration failure, dừng và
xử lý lineage/runtime trước khi dùng branch làm evidence.

## Flow

1. Chạy `corepack pnpm lint:migration-lineage` và xác nhận manifest vẫn
   `state=aligned`, `nativePreviewBranching=enabled`.
2. Lấy chi phí Preview Branch hiện hành, báo đúng số tiền và chờ chủ dự án xác
   nhận.
3. Tạo một Preview Branch throwaway bằng tooling Supabase được kết nối cho task.
4. Ghi project ref/URL và xác minh ref không trùng protected refs trong
   Environment Registry.
5. Xác nhận deployment log chỉ chạy baseline version đã aligned và các forward
   migration mới hơn cutoff; dừng ngay nếu thấy archived/remote-only history.
6. Chỉ seed bằng dữ liệu non-production, không secret và không customer data.
7. Chạy schema/RLS/RPC tests, smoke flow cần thiết và security advisors.
8. Nếu branch là type source, chạy `corepack pnpm db:types` và review diff.
9. Thu thập evidence: ref, migration versions, test result và cleanup result.
10. Xóa Preview Branch khi xong; không để resource throwaway chạy vô thời hạn.

## Preconditions

- Migration chain replay được từ empty DB.
- `supabase/migration-lineage.json` có `state=aligned`,
  `nativePreviewBranching=enabled`, và `productionCutoff=baselineVersion`.
- `supabase/seed.sql` đã được kiểm tra không mang production data hoặc secret.
- Caller có tooling/credential đủ để tạo và xóa branch.
- Mọi URL/service-role key trong session được đối chiếu với ref đã ghi.

Nếu một precondition chưa chứng minh, không tạo branch; local baseline replay là
evidence source-only, không được báo thành cloud Preview proof.

## Vercel Preview

Vercel Preview có thể được nối thủ công với credential của Preview Branch để test
runtime. Ghi rõ preview host và Supabase ref; không cho preview deploy nhận
production service-role key.

## Automation hiện hành

Supabase GitHub App và Vercel integration chạy ngoài repo guard. PR update có thể
tạo/cập nhật branch hoặc Preview deploy, nên CI lineage gate, seed safety, env
binding, deployment log và teardown phải được kiểm chứng độc lập; không suy luận
trạng thái automation từ guard local.
