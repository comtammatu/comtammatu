# Preview Branch — Non-Production Database

Preview Branch là môi trường throwaway cho migration replay, RLS/RPC
verification và smoke có write mà không đụng production. Quyền tạo branch phụ
thuộc vào `supabase/migration-lineage.json`; production
merge/reset/rebase/apply vẫn là production write và cần quyền riêng.

Guard của repo chỉ cho agent đọc hoặc mutate một Preview ref mới sau khi ref đó
đi qua trusted registration path. Khi đường đăng ký này chưa có, agent chỉ được
dùng các thao tác create/teardown branch đã được guard xác minh; việc kiểm tra
deployment status/log và mutation evidence phải chuyển sang persistent Cloud
DEV đã đăng ký, hoặc do chủ dự án trực tiếp vận hành và cung cấp từ Preview.
Không được nới guard, dùng stored link state hay thay bằng Local Docker.

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
5. Chỉ kiểm tra deployment status/log của Preview qua trusted registration hoặc
   owner-operated evidence. Xác nhận log chỉ chạy baseline version đã aligned
   và các forward migration mới hơn cutoff; dừng ngay nếu thấy
   archived/remote-only history.
6. Trước mọi mutation, chứng minh Preview ref đã được trusted registration hoặc
   chuyển mutation test sang persistent Cloud DEV với literal target binding.
   Nếu không có một trong hai đường này, dừng và báo blocker.
7. Chỉ seed bằng dữ liệu non-production, không secret và không customer data.
8. Chạy schema/RLS/RPC tests, smoke flow cần thiết và security advisors trên
   target đã được phép mutation; ghi rõ target là DEV hay Preview.
9. Nếu registered Cloud DEV là type source của task, chạy
   `corepack pnpm db:types` và review diff. Preview ref không thay thế DEV type
   source qua stored link hay env override.
10. Thu thập evidence: ref, migration versions, test result và cleanup result.
11. Xóa Preview Branch khi xong; không để resource throwaway chạy vô thời hạn.

## Preconditions

- Migration chain replay được từ empty DB.
- `supabase/migration-lineage.json` có `state=aligned`,
  `nativePreviewBranching=enabled`, và `productionCutoff=baselineVersion`.
- `supabase/seed.sql` đã được kiểm tra không mang production data hoặc secret.
- Caller có tooling/credential đủ để tạo và xóa branch.
- Mọi URL/service-role key trong session được đối chiếu với ref đã ghi.
- Agent-side Preview mutation có trusted registration path; nếu không, kế hoạch
  mutation phải chỉ rõ persistent Cloud DEV hoặc owner-operated Preview.

Nếu một precondition chưa chứng minh, không tạo branch. CI baseline replay chỉ
là source-chain evidence, không được báo thành cloud Preview proof.

## Vercel Preview

Vercel Preview có thể được nối thủ công với credential của Preview Branch để test
runtime. Ghi rõ preview host và Supabase ref; không cho preview deploy nhận
production service-role key.

## Automation hiện hành

Supabase GitHub App và Vercel integration chạy ngoài repo guard. PR update có thể
tạo/cập nhật branch hoặc Preview deploy, nên CI lineage gate, seed safety, env
binding, deployment log và teardown phải được kiểm chứng độc lập; không suy luận
trạng thái automation từ guard local.
