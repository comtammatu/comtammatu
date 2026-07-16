# Preview Branch — Non-Production Database

Dùng Preview Branch cho migration replay, RLS/RPC verification và smoke có write
mà không đụng production. Quyền tạo branch phụ thuộc vào
`supabase/migration-lineage.json`; production merge/reset/rebase/apply vẫn là
production write và cần quyền riêng.

## Trạng thái hiện tại — blocked pending re-baseline

PROD ledger và baseline source đang lệch lineage. Native Supabase Branching có
bước kéo migration history từ parent trước khi migrate, nên một branch mới có thể
replay lịch sử đã archive dù `supabase/migration-archive/` không nằm trong active
source tree.

Cho tới khi manifest chuyển sang `aligned`:

1. Không chủ động tạo Preview Branch bằng Dashboard, CLI hoặc MCP.
2. Dùng `corepack pnpm db:baseline:local-check` để chứng minh source install từ
   empty DB.
3. Dùng `corepack pnpm lint:migration-lineage` để xác nhận baseline hash, archive
   boundary và active-forward ceiling.
4. Không tăng `activeForwardLimit`; re-baseline là đường duy nhất để mở migration
   mới và native Preview trở lại.

Guard runtime chặn `create_branch` từ repo tooling nhưng vẫn cho `delete_branch`
để cleanup. Guard này không kiểm soát Supabase GitHub App đã cài ở cấp project;
app vẫn có thể tự tạo branch khi PR thay đổi. Muốn chặn cứng phải tắt integration
ở Supabase. Khi manifest còn blocked, branch tự tạo chỉ là evidence quan sát,
không được dùng để tuyên bố lineage đã aligned và phải được xóa sau kiểm chứng.

## Flow sau khi lineage đã aligned

1. Tạo một Preview Branch throwaway bằng tooling Supabase được kết nối cho task.
2. Ghi project ref/URL và xác minh ref không trùng protected refs trong
   Environment Registry.
3. Xác nhận deployment log chỉ chạy baseline version đã aligned và các forward
   migration mới hơn cutoff; dừng ngay nếu thấy archived/remote-only history.
4. Chỉ seed bằng dữ liệu non-production, không secret và không customer data.
5. Chạy schema/RLS/RPC tests, smoke flow cần thiết và security advisors.
6. Nếu branch là type source, chạy `corepack pnpm db:types` và review diff.
7. Thu thập evidence: ref, migration versions, test result và cleanup result.
8. Xóa Preview Branch khi xong; không để resource throwaway chạy vô thời hạn.

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

Per-PR auto-provision qua Supabase GitHub App và Vercel integration đang hoạt
động ngoài repo guard. Flow thực tế là PR update có thể tạo/cập nhật branch và
Preview deploy ngay cả khi manifest còn blocked. Vì vậy CI lineage gate, seed
safety, env binding, deployment log và teardown đều phải được kiểm chứng độc
lập; không suy luận trạng thái automation từ guard local.
