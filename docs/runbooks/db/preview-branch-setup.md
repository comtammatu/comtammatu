# Preview Branch — Non-Production Database

Dùng Preview Branch cho migration replay, RLS/RPC verification và smoke có write
mà không đụng production. Agent được phép create/use/delete Preview Branch theo
`docs/agent/rules/database.md`; production merge/reset/rebase/apply vẫn là
production write và cần quyền riêng.

## Current agent-driven flow

1. Tạo một Preview Branch throwaway và associate đúng Git branch bằng tooling
   Supabase được kết nối cho task.
2. Ghi project ref/URL và xác minh ref không trùng protected refs trong
   Environment Registry.
3. Để Supabase Branching apply active migration chain từ exact Git SHA; không
   dùng production ledger làm shortcut và không apply từng file thủ công.
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

Nếu một precondition chưa chứng minh, dừng write smoke. Docker Local chỉ là
developer tooling tùy chọn, không phải release gate; local replay và read-only
analysis không thay thế target-ref verification trên Supabase Preview.

## Vercel Preview

Vercel Preview có thể được nối thủ công với credential của Preview Branch để test
runtime. Ghi rõ preview host và Supabase ref; không cho preview deploy nhận
production service-role key.

## GitHub integration gate rollout

Gate này chưa được coi là blocking-live cho đến khi hoàn tất các precondition của
D047: kiểm chứng seed safety, teardown, spend, env binding và xác nhận trên
dashboard rằng `Deploy to production` đã tắt. Trong giai đoạn rollout, PR có đổi
`supabase/**` phải được kiểm tra thủ công trên Preview Branch gắn đúng Git branch.

Sau khi D047 được kích hoạt, check `Supabase Preview` phải trả literal `success`
trên exact head SHA và wrapper CI fail-closed cũng phải thành công. `skipped`,
`neutral`, thiếu check, sai project/ref/SHA hoặc timeout đều là fail. Production
vẫn theo file → PR → merge → owner apply.
