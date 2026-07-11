# Preview Branch — Non-Production Database

Dùng Preview Branch cho migration replay, RLS/RPC verification và smoke có write
mà không đụng production. Agent được phép create/use/delete Preview Branch theo
`docs/agent/rules/database.md`; production merge/reset/rebase/apply vẫn là
production write và cần quyền riêng.

## Current agent-driven flow

1. Tạo một Preview Branch throwaway bằng tooling Supabase được kết nối cho task.
2. Ghi project ref/URL và xác minh ref không trùng protected refs trong
   Environment Registry.
3. Apply active migration chain vào branch, không dùng production ledger làm
   shortcut.
4. Chỉ seed bằng dữ liệu non-production, không secret và không customer data.
5. Chạy schema/RLS/RPC tests, smoke flow cần thiết và security advisors.
6. Nếu branch là type source, chạy `corepack pnpm db:types` và review diff.
7. Thu thập evidence: ref, migration versions, test result và cleanup result.
8. Xóa Preview Branch khi xong; không để resource throwaway chạy vô thời hạn.

## Preconditions

- Migration chain replay được từ empty DB.
- `supabase/seed.sql` đã được kiểm tra không mang production data hoặc secret.
- Caller có tooling/credential đủ để tạo và xóa branch.
- Mọi URL/service-role key trong session được đối chiếu với ref đã ghi.

Nếu một precondition chưa chứng minh, dừng write smoke; local baseline replay hoặc
read-only analysis không thay thế target-ref verification.

## Vercel Preview

Vercel Preview có thể được nối thủ công với credential của Preview Branch để test
runtime. Ghi rõ preview host và Supabase ref; không cho preview deploy nhận
production service-role key.

## Parked automation option

Per-PR auto-provision qua Supabase GitHub App và Vercel integration chưa được coi
là runtime hiện hành. Chỉ bật sau khi seed safety, teardown, spend control và env
binding được kiểm chứng. Khi đó flow kỳ vọng mới là PR open → branch + preview
deploy, PR close/merge → teardown; cập nhật runbook từ bằng chứng live trước khi
cho agent dựa vào automation đó.
