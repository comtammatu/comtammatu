# Preview Branch — Non-Production Database

Preview Branch là môi trường throwaway cho migration replay, RLS/RPC
verification và smoke có write mà không đụng production. Quyền tạo branch phụ
thuộc vào parent Production đã xác minh; production merge/reset/rebase/apply vẫn
là production write và cần quyền riêng.

Guard của repo chỉ cho agent đọc hoặc mutate một Preview ref sau khi nó được
Supabase xác nhận là con của Production. Với từng MCP action, guard gọi
`supabase branches list` với parent Production cố định và đòi `project_ref` cùng
`parent_project_ref` khớp chính xác; không có local whitelist, stored-link state
hay cache để tin cậy lại. Nếu không xác minh được, Preview bị chặn. Không được
nới guard hay thay bằng Local Docker.

## Mô hình môi trường

Production `enloyfnuerqgaqderbwb` là database persistent duy nhất. Preview Branch
là môi trường throwaway được tạo từ đúng parent này; không duy trì database
non-production persistent riêng. `corepack pnpm lint:migration-lineage` kiểm tra active migration
layout trước replay, nhưng không quyết định quyền tạo Preview.

Trạng thái lineage không chứng minh branch cloud sẵn sàng. Trước khi tạo branch,
phải kiểm tra trạng thái Supabase hiện tại, lấy đúng chi phí theo giờ và được chủ
dự án xác nhận chi phí đó. Nếu parent hoặc Preview báo migration failure, dừng và
xử lý lineage/runtime trước khi dùng branch làm evidence.

## Flow

1. Chạy `corepack pnpm lint:migration-lineage` để xác nhận baseline và active
   migration layout hợp lệ.
2. Read the registered parent with exact MCP input
   `get_project({"id":"enloyfnuerqgaqderbwb"})`. Verify the returned ID,
   current status, and owning organization. Follow the Environment Registry's
   scoped cost-read rule; do not enumerate organizations or infer their identity.
   Report the current Preview price and wait for the owner's approval of that
   amount before cost confirmation or branch creation. Metadata access does not
   authorize spending or Production writes.
3. Tạo một Preview Branch throwaway bằng tooling Supabase được kết nối cho task.
4. Ghi project ref, xác minh ref không trùng protected refs trong Environment
   Registry, rồi dùng MCP với `project_id` tường minh. Guard sẽ tự xác minh
   parent cho từng action.
5. Chỉ kiểm tra deployment status/log sau khi guard đã xác minh Preview. Xác
   nhận log chỉ chạy active baseline và forward migrations; dừng ngay nếu thấy
   archived/remote-only history.
6. Trước mọi mutation, để guard xác minh Preview ref qua parent Production.
   File replay chỉ được phép vào Preview đã xác minh; merge/reset/rebase bị chặn.
   Nếu tra cứu thất bại, dừng và báo blocker.
7. Repo chủ ý không có `supabase/seed.sql` hoặc `supabase/_local-dev`; Preview
   mặc định chỉ nhận schema. Không copy hai fixture CI trong
   `apps/web/tests/fixtures/supabase-e2e/` lên Preview vì chúng có tài khoản và
   mật khẩu cố định. Nếu smoke cần dữ liệu, tạo fixture riêng cho đúng Preview
   đã xác minh, không dùng dữ liệu production, rồi xóa cả branch sau smoke.
8. Chạy schema/RLS/RPC tests, smoke flow cần thiết và security advisors trên
   Preview đã được phép mutation.
9. Sau khi migration được apply lên Production type source theo quyền hiện hành,
   chạy `corepack pnpm db:types` và review diff; Preview không phải type source
   của repository.
10. Thu thập evidence: ref, migration versions, test result và cleanup result.
11. Delete the created Preview in the same task. After the provider confirms
    success, replay only the `delete_branch` guard payload for its recorded
    branch ID and project ref. Both must report
    `Preview branch absent from validated Production parent snapshot`.
    Do not send a second delete request. Lookup failure, malformed rows, or
    mismatched lineage do not prove cleanup; keep the task blocked and report
    the unresolved resource if deletion or verification fails.

## Preconditions

- When optional local hook adapters are absent, run each exact tool payload
  through `corepack pnpm exec node scripts/guard-prod-db.mjs` before dispatch.
  This resolves the repository-pinned Supabase CLI for the fresh parent lookup;
  successful manual proof does not install or imply automatic hook enforcement.
- Before applying the reviewed Preview migration, run the exact guarded command
  `corepack pnpm exec supabase db push --project-ref <verified-preview-ref> --dry-run --skip-vault`.
  Its complete pending list must equal the reviewed task-owned files. Do not
  remove either flag or add selectors, seed, roles, or include-all options.
- Migration chain replay được từ empty DB.
- `corepack pnpm lint:migration-lineage` pass cho active migration layout.
- `corepack pnpm lint:seed-permissions` xác nhận không có auto-seed path cho
  Preview và fixture local vẫn nằm trong harness CI riêng.
- Caller có tooling/credential đủ để tạo và xóa branch.
- Mọi URL/service-role key trong session được đối chiếu với ref đã ghi.
- Agent-side Preview mutation gọi MCP với `project_id` tường minh và CLI có thể
  xác nhận branch đó là con của Production.

Nếu một precondition chưa chứng minh, không tạo branch. CI baseline replay chỉ
là source-chain evidence, không được báo thành cloud Preview proof.

## Vercel Preview

Vercel Preview hiện bị vô hiệu hóa. Build Preview không thể tự chứng minh
credential được cấp thuộc một Preview Branch ephemeral có parent là Production,
nên `scripts/check-preview-supabase-env.mjs` chặn mọi build Preview và liệt kê
tên biến Supabase cần gỡ mà không in giá trị.

## Automation hiện hành

Supabase GitHub App chạy ngoài repo guard. PR update có thể tạo hoặc cập nhật
branch, nên CI lineage gate, seed safety, deployment log và teardown phải được
kiểm chứng độc lập; không suy luận trạng thái automation từ guard local.
