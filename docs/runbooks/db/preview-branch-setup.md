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

1. Không tạo Preview Branch bằng Dashboard, CLI hoặc MCP.
2. Dùng `corepack pnpm db:baseline:local-check` để chứng minh source install từ
   empty DB.
3. Dùng `corepack pnpm lint:migration-lineage` để xác nhận baseline hash, archive
   boundary và active-forward ceiling.
4. Không tăng `activeForwardLimit`; re-baseline là đường duy nhất để mở migration
   mới và native Preview trở lại.

Guard runtime chặn `create_branch` nhưng vẫn cho `delete_branch` để cleanup.

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

## Parked automation option

Per-PR auto-provision qua Supabase GitHub App và Vercel integration chưa được coi
là runtime hiện hành. Chỉ bật sau khi lineage alignment, seed safety, teardown,
spend control và env binding được kiểm chứng. Khi đó flow kỳ vọng mới là PR open
→ branch + preview deploy, PR close/merge → teardown; cập nhật runbook từ bằng
chứng live trước khi cho agent dựa vào automation đó.
