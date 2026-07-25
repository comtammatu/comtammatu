# Preview Branch — Non-Production Database

Preview Branch là môi trường throwaway cho migration replay, RLS/RPC
verification và smoke có write mà không đụng production. Quyền tạo branch phụ
thuộc vào parent Production đã xác minh; production merge/reset/rebase/apply vẫn
là production write và cần quyền riêng.

Guard của repo chỉ cho agent đọc hoặc mutate một Preview ref sau khi nó được
Supabase xác nhận là con của Production. Với từng MCP action, guard gọi
`supabase branches get` với parent Production cố định và đòi `project_ref` cùng
`parent_project_ref` khớp chính xác; không có local whitelist, stored-link state
hay cache để tin cậy lại. Nếu không xác minh được, Preview bị chặn. Không được
nới guard hay thay bằng Local Docker.

## Trạng thái hiện tại

Không có persistent non-production Supabase project. Preview Branch chỉ được
tạo on-demand cho một verification cụ thể rồi xóa. Type generation đọc
Production bằng ref literal; Preview Branch không phải type source.

`corepack pnpm lint:migration-lineage` kiểm tra active migration layout trước
replay, nhưng không quyết định quyền tạo Preview.

Trạng thái lineage không chứng minh branch cloud sẵn sàng. Trước khi tạo branch,
phải kiểm tra trạng thái Supabase hiện tại, lấy đúng chi phí theo giờ và được chủ
dự án xác nhận chi phí đó. Nếu parent hoặc Preview báo migration failure, dừng và
xử lý lineage/runtime trước khi dùng branch làm evidence.

## Flow

1. Chạy `corepack pnpm lint:migration-lineage` để xác nhận baseline và active
   migration layout hợp lệ.
2. Lấy chi phí Preview Branch hiện hành, báo đúng số tiền và chờ chủ dự án xác
   nhận.
3. Tạo một Preview Branch throwaway bằng tooling Supabase được kết nối cho task.
4. Ghi project ref, xác minh ref không trùng protected refs trong Environment
   Registry, rồi dùng MCP với `project_id` tường minh. Guard sẽ tự xác minh
   parent cho từng action.
5. Chỉ kiểm tra deployment status/log sau khi guard đã xác minh Preview. Xác
   nhận log chỉ chạy active baseline và forward migrations; dừng ngay nếu thấy
   archived/remote-only history.
6. Trước mọi mutation, để guard xác minh Preview ref qua parent Production.
   `supabase db push` bị tắt; merge/reset/rebase bị chặn kể cả với Preview đã
   xác minh. Nếu tra cứu thất bại, dừng và báo blocker.
7. Chỉ seed bằng dữ liệu non-production, không secret và không customer data.
8. Chạy schema/RLS/RPC tests, smoke flow cần thiết và security advisors trên
   Preview đã được phép mutation; ghi rõ target.
9. Chỉ chạy
   `SUPABASE_PROJECT_ID=iexwsuaqqenyjiskawoj corepack pnpm db:types` sau khi
   schema tương ứng đã được apply vào Production theo owner-gated flow. Không
   đổi type source sang Preview qua stored link hay env override.
10. Thu thập evidence: ref, migration versions, test result và cleanup result.
11. Xóa Preview Branch trong cùng task, xác nhận resource đã biến mất rồi mới
    đóng verification. Nếu cleanup thất bại, giữ task ở trạng thái blocked và
    báo owner; không để branch trở thành môi trường lâu dài.

## Preconditions

- Migration chain replay được từ empty DB.
- `corepack pnpm lint:migration-lineage` pass cho active migration layout.
- `supabase/seed.sql` đã được kiểm tra không mang production data hoặc secret.
- Caller có tooling/credential đủ để tạo và xóa branch.
- Mọi URL/service-role key trong session được đối chiếu với ref đã ghi.
- Agent-side Preview mutation gọi MCP với `project_id` tường minh và CLI có thể
  xác nhận branch đó là con của Production.

Nếu một precondition chưa chứng minh, không tạo branch. CI baseline replay chỉ
là source-chain evidence, không được báo thành cloud Preview proof.

## Vercel Preview

Vercel Preview đang bị tắt và không nhận Supabase ENV. On-demand Supabase
Preview Branch chỉ phục vụ database verification; nó không tự cấp quyền cho một
Vercel Preview runtime. `scripts/check-preview-supabase-env.mjs` chặn build
Preview trước khi Next.js compile. Không bypass guard hoặc sao chép credential
Production để tạo runtime proof.

## Automation hiện hành

Supabase GitHub App và Vercel integration chạy ngoài repo guard. PR update có thể
tạo/cập nhật branch hoặc Preview deploy, nên CI lineage gate, seed safety, env
binding, deployment log và teardown phải được kiểm chứng độc lập; không suy luận
trạng thái automation từ guard local.
