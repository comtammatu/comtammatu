# Kế hoạch triển khai ứng dụng Workspace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phát hành `work.comtammatu.com` như một ứng dụng quản lý công việc độc lập cho khối văn phòng, dùng chung Auth/nhân sự/database authority với hệ thống Cơm Tấm Má Tư và giới hạn dữ liệu theo phòng ban, dự án hoặc task được mời.

**Architecture:** Thêm deployable app `apps/workspace` vào monorepo, dùng các package `@comtammatu/*` hiện có và cùng Supabase project. Schema additive `work_*` cùng RLS/RPC sở hữu quyền phòng ban/dự án/task; `matu-workspace` chỉ là donor UI/workflow tại commit đã pin. Database phát hành trước runtime phụ thuộc generated types, sau đó rollout theo pilot một phòng ban.

**Tech Stack:** Node.js 24.x, pnpm 10.33, Turborepo 2.10, Next.js 16 App Router, React 19, TypeScript 6 strict, Zod 4, Supabase JS 2 + Postgres/RLS/RPC/Storage, Má Tư Design System (`@comtammatu/ui`), Node test runner, pgTAP và Playwright 1.61.

## Global Constraints

- TypeScript giữ `strict` và `noUncheckedIndexedAccess: true`.
- Dùng `supabase-js`; không thêm Prisma hoặc database authority thứ hai.
- Mọi Server Action input được Zod kiểm tra và không trả raw Supabase/Postgres `error.message` cho client.
- Client runtime chỉ import Supabase từ `@comtammatu/database/supabase/client`; database barrel chỉ được import type-only.
- Scope/filter nằm trong URL; không dùng `localStorage` hoặc React Context làm nguồn scope.
- Mutation nhiều bảng, audit, participant và notification phải nằm trong một atomic Postgres RPC.
- `profiles`, `employees`, `positions` và `auth.users` hiện có là identity authority duy nhất.
- `work_departments` là ranh giới cộng tác, không phải bản sao HR position và không cấp module nghiệp vụ.
- Workspace dùng Má Tư Design System; không mang app-local Shadcn primitive/theme từ donor vào repo.
- Auth cookie giữ host-only trên từng ứng dụng; không đặt domain cookie `.comtammatu.com` và không truyền token qua URL.
- Workspace Production không nhận `SUPABASE_SERVICE_ROLE_KEY`; mọi read/write người dùng chạy caller-scoped qua RLS/RPC.
- Database apply Production cần owner ủy quyền cho đúng batch trong task triển khai; kế hoạch này không tự cấp quyền apply/deploy.
- Sau apply schema vào type-source Production, chạy `corepack pnpm db:types` trước khi runtime code dùng type mới.
- Không sửa migration đã apply; rollback database là forward repair, rollback runtime là deployment/membership.
- Trước khi hoàn tất: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build && corepack pnpm test`; dùng `corepack pnpm verify` cho release candidate.
- Giữ nguyên mọi thay đổi dirty ngoài task. Donor chỉ đọc từ commit đã pin, không copy từ dirty worktree.
- Không commit hoặc push nếu Owner chưa yêu cầu trong task triển khai hiện hành.

---

## Phân rã release

| Release                    | Kết quả độc lập                                                      | Gate để sang release kế tiếp                                                        |
| -------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| R0 — Chuẩn bị              | Donor pin, Vercel project/domain/env registry và kiến trúc được khóa | Owner cung cấp literal Vercel project ID; migration tree sạch                       |
| R1 — Database foundation   | Bảng `work_*`, RLS/RPC, exact-user notifications và pgTAP            | CI database xanh; Preview rehearsal xanh; owner apply Production; types regenerated |
| R2 — App read-only         | Workspace login/access gate, shell, board/list/project/task reads    | Role/membership E2E âm/dương xanh                                                   |
| R3 — Core mutations        | Project/task/status/assignment/checklist/comment/activity            | Atomic RPC + conflict tests xanh                                                    |
| R4 — Files & notifications | Private attachment và thông báo exact recipient                      | Storage RLS + notification isolation xanh                                           |
| R5 — Integration & pilot   | App switcher, production domain, observability, pilot một phòng      | Pilot 7 ngày không có leak/corruption blocker                                       |

R1 phải phát hành trước code R2–R4 phụ thuộc generated types. Không gom database
và runtime phụ thuộc schema chưa apply vào một deployment không tương thích.

## Cấu trúc file đích

### Runtime và package graph

- `apps/workspace/package.json`: dependency/scripts của app mới
- `apps/workspace/tsconfig.json`: strict config kế thừa root
- `apps/workspace/next.config.ts`: security headers, transpile packages, action size
- `apps/workspace/eslint.config.mjs`: ESLint Next/TypeScript
- `apps/workspace/postcss.config.mjs`: Tailwind/PostCSS
- `apps/workspace/vercel.json`: Production branch `main`, region `sin1`, không cron
- `apps/workspace/proxy.ts`: session, claims, candidate ACL và live membership gate
- `apps/workspace/app/layout.tsx`: root metadata, Geist, theme và Toaster
- `apps/workspace/app/globals.css`: import `@comtammatu/ui/globals.css`, không tạo token mới
- `package.json`, `turbo.json`, `pnpm-lock.yaml`: workspace scripts/build graph

### Auth và app boundary

- `packages/shared/src/auth/module-acl.ts`: candidate `workspace` ModuleKey
- `packages/shared/src/auth/__tests__/module-acl-matrix.test.ts`: candidate-role matrix
- `packages/shared/src/runtime/application-origin.ts`: parse origin allowlist dùng chung
- `packages/shared/src/runtime/__tests__/application-origin.test.ts`: từ chối URL không an toàn
- `packages/shared/src/runtime/env.ts`: export helper origin mới
- `apps/workspace/app/(public)/(auth)/login/*`: cùng account, cookie host-only
- `apps/workspace/app/(public)/access-denied/page.tsx`: blocked-state presentation
- `apps/workspace/app/api/auth/signout/route.ts`: xóa cookie host Workspace
- `apps/workspace/lib/auth/context.ts`: RSC/action auth state và Auth liveness
- `apps/workspace/lib/auth/with-workspace-action.ts`: Zod + liveness + error mapping

### Database

- Migration active được tạo bằng `node scripts/supabase-migration-new.mjs work_management_foundation`
- `supabase/tests/work_management_rls_test.sql`: pgTAP isolation/action matrix
- `apps/web/tests/fixtures/supabase-e2e/tenant.sql`: seed phòng ban/thành viên/task CI
- `packages/database/src/types/database.types.ts`: generated sau Production apply
- `packages/shared/src/auth/permissions.ts`: TypeScript permission key mirror
- `docs/spec/toast-notification-system.md`: exact-user notification contract
- `docs/spec/database-schema.md`: `work_*` table ownership

### Workspace domain và UI

- `apps/workspace/lib/work/types.ts`: DTO/status/priority/filter types
- `apps/workspace/lib/work/filters.ts`: parse/serialize URL filters
- `apps/workspace/lib/work/queries.ts`: caller-scoped reads
- `apps/workspace/lib/work/schemas.ts`: Zod schemas cho actions
- `apps/workspace/lib/work/actions.ts`: Server Actions gọi typed RPC
- `apps/workspace/lib/work/error-map.ts`: stable SQL code -> Vietnamese copy
- `apps/workspace/lib/messages/vi.ts`: product copy
- `apps/workspace/app/(protected)/layout.tsx`: shell + navigation + switcher
- `apps/workspace/app/(protected)/page.tsx`: board
- `apps/workspace/app/(protected)/my-work/page.tsx`: actor task list
- `apps/workspace/app/(protected)/projects/page.tsx`: project list
- `apps/workspace/app/(protected)/projects/[projectId]/page.tsx`: project detail
- `apps/workspace/app/(protected)/tasks/[taskId]/page.tsx`: canonical task detail
- `apps/workspace/app/(protected)/team/page.tsx`: department membership admin
- `apps/workspace/app/(protected)/notifications/page.tsx`: work notification feed
- `apps/workspace/app/(protected)/_components/*`: shell, board, cards, toolbar
- `apps/workspace/app/(protected)/tasks/[taskId]/_components/*`: detail/checklist/comment/files
- `apps/workspace/tests/*.test.ts`: unit/static contract tests
- `apps/workspace/e2e/*.spec.ts`: authenticated flows và RBAC

### Integration và release

- `apps/web/app/components/app-shell.tsx`: Workspace app-switcher entry
- `apps/web/lib/notifications/action-url.ts`: allowlisted work notification link
- `apps/web/lib/messages/notifications.ts`: kind label
- `apps/web/app/_components/notification-item.tsx`: work icon handling
- `scripts/check-preview-supabase-env.mjs`: hai registered Production Vercel projects
- `scripts/check-guard-sync.mjs`: registry parity cho hai deploy targets
- `scripts/supabase-e2e-bringup.mjs`: CI-only env cho cả hai web apps
- `.github/workflows/ci.yml`: Workspace build/unit/E2E gate
- `docs/agent/rules/database.md`: Vercel Deployment Registry
- `docs/spec/architecture.md`: runtime thứ ba và Work surface
- `docs/spec/role-route-matrix.md`: Workspace audience và entry
- `docs/ref/screen-context-map.md`: route/job/device contract
- `docs/plan/adr/0023-workspace-application-surface.md`: quyết định kiến trúc bền vững
- `docs/runbooks/workspace-release.md`: rollout/rollback/incident runbook

---

### Task 0: Hoàn tất readiness trước khi viết code

**Files:**

- Read: `docs/plan/2026-08-03-workspace-design.md`
- Read: `docs/agent/rules/database.md`
- Read: `docs/agent/rules/ui.md`
- Read donor: repository `comtammatu/matu-workspace` commit `2e27b852a03387694f1daa31fab9d7e91c65e16a`

**Interfaces:**

- Consumes: approved product/design decisions
- Produces: literal Workspace Vercel project ID, controlled domain, clean migration ownership và pinned donor evidence

- [ ] **Step 1: Xác nhận source tree và migration tree không có writer xung đột**

Run:

```powershell
git status --short
git status --short -- supabase/migrations packages/database/src/types/database.types.ts
corepack pnpm agent:start
```

Expected: CodeGraph current/available; mọi thay đổi hiện có được phân loại theo
owner. Nếu migration hoặc generated type đang thay đổi ngoài task, dừng R1 cho
đến khi writer đó kết thúc; không di chuyển hoặc sửa file của họ.

- [ ] **Step 2: Pin donor chỉ từ commit đã review**

Run trong checkout donor sạch hoặc dùng `git show`:

```powershell
git -C C:\Users\BINH\Downloads\matu-workspace show --no-patch --format='%H %s' 2e27b852a03387694f1daa31fab9d7e91c65e16a
git -C C:\Users\BINH\Downloads\matu-workspace diff --quiet 2e27b852a03387694f1daa31fab9d7e91c65e16a -- apps/web/components packages/domain
```

Expected: lệnh đầu in đúng SHA; lệnh hai chỉ được dùng làm cảnh báo. Nếu dirty,
implementation đọc nội dung qua `git show <sha>:<path>`, không đọc file on-disk.

- [ ] **Step 3: Owner tạo Vercel project nhưng chưa gắn Production env**

Trong Vercel, tạo project `comtammatu-workspace` với:

```text
Repository: comtammatu/comtammatu
Root Directory: apps/workspace
Production Branch: main
Framework: Next.js
Region: sin1
Domain: work.comtammatu.com
```

Không đặt Supabase key trước khi Task 1 đưa project ID vào guard. Ghi literal
`prj_...` từ Project Settings; không ghi secret vào tài liệu.

- [ ] **Step 4: Khóa biến môi trường cần thiết**

Workspace Production chỉ nhận:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_PROJECT_ID
NEXT_PUBLIC_WEB_APP_URL=https://web.comtammatu.com
NEXT_PUBLIC_WORKSPACE_APP_URL=https://work.comtammatu.com
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
VERCEL_PROJECT_ID
VERCEL_ENV
```

`SUPABASE_SERVICE_ROLE_KEY`, payment/provider credentials, `CRON_SECRET` và
print-agent secrets không được cấp cho Workspace. Hai Upstash values chỉ phục
vụ login rate limit giống app web hiện tại.

- [ ] **Step 5: Tạo implementation worktree khi bắt đầu thực thi**

Chỉ thực hiện ở task triển khai, không trong task lập kế hoạch. Branch đề xuất:

```text
codex/workspace-foundation
```

Expected: một writer sở hữu migration/RLS slice; UI writers chỉ bắt đầu sau R1
generated types gate.

### Task 1: Đăng ký runtime Workspace và làm guard hiểu hai Vercel projects

**Files:**

- Modify: `docs/agent/rules/database.md`
- Modify: `scripts/check-preview-supabase-env.mjs`
- Modify: `scripts/check-guard-sync.mjs`
- Modify: `scripts/check-preview-supabase-env.test.mjs` nếu tách self-test khỏi script
- Create: `apps/workspace/vercel.json`
- Create: `docs/plan/adr/0023-workspace-application-surface.md`

**Interfaces:**

- Consumes: literal Workspace Vercel project ID từ Task 0
- Produces: `validateVercelSupabaseEnv(env)` chấp nhận chính xác hai Production project cùng ref; ADR cho Work surface

- [ ] **Step 1: Viết test đỏ cho registry hai project**

Refactor self-test thành bảng case hoặc thêm các assertion sau:

```javascript
assert.equal(
  validateVercelSupabaseEnv({
    VERCEL_ENV: "production",
    VERCEL_PROJECT_ID: WORKSPACE_PROJECT_ID,
    NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
    SUPABASE_PROJECT_ID: PRODUCTION_SUPABASE_REF,
  }).app,
  "workspace",
);
assert.throws(
  () =>
    validateVercelSupabaseEnv({
      VERCEL_ENV: "production",
      VERCEL_PROJECT_ID: "prj_unregistered000000000000000000",
      NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
    }),
  /registered Production project/,
);
```

`WORKSPACE_PROJECT_ID` là literal `prj_...` do Owner tạo ở Task 0, không đọc từ
env hoặc file ngoài registry.

- [ ] **Step 2: Chạy self-test để thấy fail**

Run:

```powershell
node scripts/check-preview-supabase-env.mjs --self-test
```

Expected: FAIL vì script hiện chỉ cho phép `prj_OGyJLaxEcceuckDoOUWth60FasXC`.

- [ ] **Step 3: Thay single project constant bằng registry bất biến**

Contract đích:

```javascript
const PRODUCTION_VERCEL_PROJECTS = new Map([
  ["prj_OGyJLaxEcceuckDoOUWth60FasXC", "web"],
  [WORKSPACE_PROJECT_ID, "workspace"],
]);

export function validateVercelSupabaseEnv(env) {
  // giữ preview fail-closed và validate exact Supabase hostname/ref
  const app = PRODUCTION_VERCEL_PROJECTS.get(env.VERCEL_PROJECT_ID);
  if (!app)
    throw new Error(
      "Vercel Production requires a registered Production project",
    );
  return { status: "ok", reason: "registered Production target", app };
}
```

Giữ nguyên fail-closed Preview contract; Task này không mở Vercel Preview dùng
Production data.

- [ ] **Step 4: Cập nhật database registry và guard-sync parser**

Thêm row `comtammatu-workspace` vào Vercel Deployment Registry, cùng Supabase ref
`enloyfnuerqgaqderbwb`. Sửa `check-guard-sync.mjs` để:

```text
- Parse đúng hai Vercel Production rows.
- Yêu cầu cả hai rows dùng cùng registered Production Supabase ref.
- So sánh tập project IDs với PRODUCTION_VERCEL_PROJECTS.
- Vẫn yêu cầu đúng một Production Supabase database ref.
```

- [ ] **Step 5: Tạo `apps/workspace/vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "git": {
    "deploymentEnabled": {
      "**": false,
      "main": true
    }
  },
  "regions": ["sin1"]
}
```

- [ ] **Step 6: Ghi ADR 0023**

ADR phải ghi rõ: separate hostname/deployment, same monorepo/Auth/database,
host-only cookies, work membership không suy từ module, donor-only codebase và
không có runtime/service-role thứ hai.

- [ ] **Step 7: Chạy guard tests**

Run:

```powershell
node scripts/check-preview-supabase-env.mjs --self-test
corepack pnpm lint:guard-sync
```

Expected: cả hai PASS; unregistered project và Preview Supabase env vẫn bị từ
chối.

### Task 2: Thêm candidate ACL và trusted application origins

**Files:**

- Modify: `packages/shared/src/auth/module-acl.ts`
- Modify: `packages/shared/src/auth/__tests__/module-acl-matrix.test.ts`
- Modify: `packages/shared/src/auth/index.ts`
- Create: `packages/shared/src/runtime/application-origin.ts`
- Create: `packages/shared/src/runtime/__tests__/application-origin.test.ts`
- Modify: `packages/shared/src/runtime/env.ts`

**Interfaces:**

- Produces: `ModuleKey = ... | "workspace"`
- Produces: `resolveTrustedApplicationOrigin(raw, allowedHosts): string`
- Consumes later: Workspace proxy candidate gate; app switcher; notification action URL

- [ ] **Step 1: Viết ACL test đỏ**

```typescript
test("workspace is only a candidate gate; every valid staff role may be checked by live membership", () => {
  for (const role of STAFF_ROLES) {
    assert.equal(canAccess(role, "workspace"), true);
  }
  assert.equal(MODULE_ACL.workspace.app, "workspace");
  assert.equal(MODULE_ACL.workspace.path, "/");
});
```

- [ ] **Step 2: Chạy test đỏ**

```powershell
corepack pnpm --filter @comtammatu/shared exec tsx --test src/auth/__tests__/module-acl-matrix.test.ts
```

Expected: FAIL vì `workspace` chưa tồn tại.

- [ ] **Step 3: Mở rộng ACL metadata không làm đổi route resolver của web**

Đổi `ModuleAcl` thành:

```typescript
interface ModuleAcl {
  app?: "web" | "workspace";
  path: string;
  allowedRoles: readonly StaffRole[];
  label: string;
}
```

Thêm:

```typescript
workspace: {
  app: "workspace",
  path: "/",
  allowedRoles: STAFF_ROLES,
  label: "Workspace",
},
```

Không thêm `/workspace` vào `resolveModuleFromPath`; đây là app host riêng.

- [ ] **Step 4: Viết test đỏ cho origin parser**

```typescript
test("accepts one exact HTTPS application origin", () => {
  assert.equal(
    resolveTrustedApplicationOrigin("https://work.comtammatu.com/", [
      "work.comtammatu.com",
    ]),
    "https://work.comtammatu.com",
  );
});

for (const value of [
  "http://work.comtammatu.com",
  "https://work.comtammatu.com.evil.example",
  "https://user@work.comtammatu.com",
  "https://work.comtammatu.com/path",
]) {
  test(`rejects unsafe application origin ${value}`, () => {
    assert.throws(() =>
      resolveTrustedApplicationOrigin(value, ["work.comtammatu.com"]),
    );
  });
}
```

- [ ] **Step 5: Implement pure origin parser và chạy shared tests**

Parser yêu cầu `https:`, exact hostname, không credential/port/path/search/hash,
trừ `localhost` chỉ khi `NODE_ENV !== "production"` và allowed host chứa
`localhost`.

Run:

```powershell
corepack pnpm --filter @comtammatu/shared test
corepack pnpm --filter @comtammatu/shared typecheck
```

Expected: PASS.

### Task 3: Tạo database foundation, RLS, RPC và notification recipient mode

**Files:**

- Create through migration helper: active migration named `work_management_foundation`
- Create: `supabase/tests/work_management_rls_test.sql`
- Modify: `apps/web/tests/fixtures/supabase-e2e/tenant.sql`
- Modify: `packages/shared/src/auth/permissions.ts`
- Modify: `scripts/check-guard-sync.mjs`
- Modify: `docs/spec/toast-notification-system.md`
- Modify: `docs/spec/database-schema.md`

**Interfaces:**

- Produces tables: `work_departments`, `work_department_members`, `work_projects`, `work_project_members`, `work_tasks`, `work_task_participants`, `work_task_checklist_items`, `work_task_comments`, `work_task_attachments`, `work_task_events`
- Produces helpers: `can_access_workspace()`, `can_read_work_department(bigint)`, `can_read_work_project(bigint)`, `can_read_work_task(bigint)`
- Produces RPCs listed in Step 5
- Extends `notifications.target_user_ids uuid[]`
- Produces private Storage bucket/policies cho `work-attachments`

- [ ] **Step 1: Snapshot migration ownership rồi tạo file bằng helper**

Run:

```powershell
git status --short -- supabase/migrations
node scripts/supabase-migration-new.mjs work_management_foundation
```

Expected: đúng một file 14-digit UTC+7 mới; không có pending migration ngoài
task trong apply batch.

- [ ] **Step 2: Viết pgTAP test đỏ cho visibility matrix**

`work_management_rls_test.sql` phải tạo hai tenant, hai phòng, permanent member,
project collaborator, task-only participant và unrelated staff rồi chứng minh:

```sql
select results_eq(
  $$ select title from public.work_tasks order by title $$,
  $$ values ('Task phòng của tôi'), ('Task liên phòng ban') $$,
  'department member sees own department and invited project task'
);

select is_empty(
  $$ select id from public.work_tasks where title = 'Task không liên quan' $$,
  'unrelated staff cannot read another department task'
);

select results_eq(
  $$ select public.can_read_work_task(:task_only_id) $$,
  $$ values (true) $$,
  'task participant can read exactly the assigned task'
);
```

Test thêm các negative mutation: collaborator không quản lý phòng, unrelated
staff không comment/checklist/upload, task participant không đọc sibling task,
tenant A không liên kết profile/project/task tenant B.

- [ ] **Step 3: Định nghĩa bảng và composite integrity**

Migration dùng bigint identity, text checks và timestamps theo repo. Các
constraint bắt buộc:

```sql
check (status in ('backlog','todo','in_progress','review','done','canceled'))
check (priority in ('low','normal','high','urgent'))
check (member_role in ('lead','member'))
check (project_role in ('lead','member','collaborator'))
check (participant_role in ('assignee','collaborator','watcher'))
check (revision > 0)
```

Tạo unique partial index bảo đảm một active department membership mỗi
`(tenant_id, user_id)` và unique participant mỗi `(task_id, user_id)`.

Tạo private bucket `work-attachments` với giới hạn 10 MiB và MIME allowlist PDF,
DOCX, XLSX, PNG, JPEG, WebP. Storage policies parse path
`{tenant_id}/{task_id}/...`, yêu cầu tenant match và ủy quyền qua parent task.

- [ ] **Step 4: Implement shared read helpers và RLS**

Helper signature:

```sql
public.can_access_workspace() returns boolean
public.can_read_work_department(p_department_id bigint) returns boolean
public.can_read_work_project(p_project_id bigint) returns boolean
public.can_read_work_task(p_task_id bigint) returns boolean
```

Mỗi function dùng trusted `auth.uid()`/`auth_tenant_id()`, `security definer`,
`set search_path = pg_catalog, public`, revoke `PUBLIC`, grant chỉ
`authenticated` khi caller cần gọi trực tiếp. `can_access_workspace()` bắt buộc
join kiểm tra `employees.status = 'active'` với `auth.uid()` để vô hiệu hóa ngay
liveness khi nhân viên bị deactivate. RLS bảng con gọi parent helper.

- [ ] **Step 5: Implement atomic RPC interfaces**

RPC MVP:

```text
create_work_department(p_name, p_code, p_lead_user_id) -> department_id
set_work_department_member(p_department_id, p_user_id, p_member_role, p_active) -> boolean
create_work_project(p_department_id, p_name, p_description, p_lead_user_id, p_due_at) -> project_id
set_work_project_member(p_project_id, p_user_id, p_project_role, p_active) -> boolean
create_work_task(p_department_id, p_project_id, p_title, p_description, p_priority, p_assignee_id, p_due_at) -> task row
update_work_task(p_task_id, p_expected_revision, p_title, p_description, p_priority, p_assignee_id, p_due_at) -> task row
set_work_task_status(p_task_id, p_expected_revision, p_status) -> task row
set_work_task_participant(p_task_id, p_user_id, p_participant_role, p_active) -> boolean
create_work_checklist_item(p_task_id, p_title) -> checklist row
set_work_checklist_item(p_item_id, p_completed, p_title) -> checklist row
create_work_task_comment(p_task_id, p_body) -> comment row
finalize_work_task_attachment(p_task_id, p_storage_path, p_file_name, p_mime_type, p_byte_size) -> attachment row
remove_work_task_attachment(p_attachment_id) -> storage_path
```

Mỗi RPC authorize trước mutation, khóa task khi cần, cập nhật revision, append
`work_task_events`, gọi `log_audit`, và tạo notification cùng transaction khi
có recipient khác actor. Các lỗi tùy chỉnh sử dụng convention SQLSTATE/ERRCODE cụ thể
(ví dụ `USING ERRCODE = '23514'` cho revision conflict `work_revision_conflict`) để `error-map.ts` parse mã lỗi ổn định.

- [ ] **Step 6: Mở rộng notification exact-user mode**

Thay contract table bằng:

```sql
alter table public.notifications
  add column target_user_ids uuid[] not null default '{}';

alter table public.notifications
  drop constraint notifications_target_roles_check;

alter table public.notifications
  add constraint notifications_target_mode_check check (
    cardinality(target_roles) > 0 or cardinality(target_user_ids) > 0
  );
```

Policy select cho phép exact recipient hoặc legacy role/branch; exact-user row
không được vô tình mở cho toàn role. Update `list_notifications`, unread count
và mark-all RPC dựa trên policy mới. Thêm work-only list/count RPC nếu pagination
theo `kind like 'work.%'` không thể thực hiện an toàn từ client.

- [ ] **Step 7: Thêm `WORK_MANAGE: "work:manage"` và đồng bộ permission catalog**

Insert permission catalog với scope `tenant`, module `work`,
`is_delegable_to_staff = false`. Owner bypass được phép; không thêm key vào
position role template.

Đồng thời cập nhật `packages/shared/src/auth/permissions.ts`:
- Bump `PERMISSION_KEY_COUNT = 108`
- Thêm key `WORK_MANAGE: "work:manage"` mirror vào TypeScript catalog
- Cập nhật seed-permission sync để `lint:seed-permissions` pass

- [ ] **Step 8: Thêm CI seed deterministic**

Seed một phòng `Văn phòng`, một lead, một member, một project, một collaborator
Kế toán và một task participant Chi nhánh. Seed phải dùng existing fixture UUIDs
và không tự tạo Auth authority thứ hai.

- [ ] **Step 9: Chạy static/lineage checks trước database rehearsal**

Run:

```powershell
corepack pnpm lint:migration-lineage
corepack pnpm lint:seed-permissions
corepack pnpm --filter @comtammatu/shared test
git diff --check
```

Expected: PASS. pgTAP runtime chạy trong CI E2E harness hoặc verified Preview,
không tự dựng Supabase Local trên workstation.

### Task 4: Rehearse, apply database-first release và regenerate types

**Files:**

- Modify after apply: `packages/database/src/types/database.types.ts`
- Evidence only: CI run, guarded Preview/Production command output

**Interfaces:**

- Consumes: reviewed migration + pgTAP từ Task 3
- Produces: Production schema/type source có work contract; exact generated TS types

- [ ] **Step 1: Chạy CI database jobs trên PR database-first**

Expected jobs:

```text
gates
baseline-replay
e2e-smoke (includes pnpm db:test and work_management_rls_test.sql)
```

Không gọi R1 xanh chỉ từ local static tests.

- [ ] **Step 2: Rehearse trên verified Supabase Preview Branch**

Theo `docs/runbooks/db/preview-branch-setup.md`, tạo child branch của literal
parent `enloyfnuerqgaqderbwb`, verify `project_ref` và `parent_project_ref`, apply
đúng migration task-owned, chạy pgTAP và advisors. Expected: không advisor error,
mọi negative RLS assertion pass.

- [ ] **Step 3: Kiểm tra Production dry-run**

Run chỉ khi target credentials đã được owner cung cấp đúng workflow:

```powershell
node scripts/supabase-production-push.mjs --dry-run
```

Expected: `Would push these migrations` chứa đúng file
`work_management_foundation` đã review, không có file thừa/thiếu.

- [ ] **Step 4: Dừng tại approval gate**

Owner phải ủy quyền rõ `--apply` cho đúng batch trong task triển khai. Nếu chưa
có, trạng thái R1 là blocked-at-approval; không dùng MCP apply hoặc raw
`supabase db push`.

- [ ] **Step 5: Apply bằng wrapper rồi regenerate types**

Sau approval:

```powershell
node scripts/supabase-production-push.mjs --apply
$env:SUPABASE_PROJECT_ID='enloyfnuerqgaqderbwb'
corepack pnpm db:types
corepack pnpm lint:typegen
corepack pnpm lint:migration-lineage
```

Expected: apply thành công; generated types chứa toàn bộ `work_*`, RPC và
`notifications.target_user_ids`; không có diff không giải thích ngoài type file.

- [ ] **Step 6: Refresh CodeGraph sau SQL/generated-type change**

```powershell
corepack pnpm agent:start
```

Expected: graph current. Chỉ sau gate này bắt đầu Task 5 runtime.

### Task 5: Scaffold `apps/workspace` và CI build contract

**Files:**

- Create: `apps/workspace/package.json`
- Create: `apps/workspace/tsconfig.json`
- Create: `apps/workspace/next.config.ts`
- Create: `apps/workspace/eslint.config.mjs`
- Create: `apps/workspace/postcss.config.mjs`
- Create: `apps/workspace/app/layout.tsx`
- Create: `apps/workspace/app/globals.css`
- Create: `apps/workspace/app/error.tsx`
- Modify: `package.json`
- Modify: `turbo.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces package `@comtammatu/workspace`
- Produces scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:e2e`
- Consumes `@comtammatu/database`, `@comtammatu/shared`, `@comtammatu/ui`, Zod
- Consumes `@comtammatu/security` cho login rate limit

- [ ] **Step 1: Tạo package manifest tối thiểu**

```json
{
  "name": "@comtammatu/workspace",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "dotenv -e ../../.env.local -e .env.local -- next dev --port 3001",
    "build": "node ../../scripts/check-preview-supabase-env.mjs && dotenv -e ../../.env.local -e .env.local -- next build",
    "build:e2e": "dotenv -e .env.test.local -- next build",
    "start": "next start --port 3001",
    "start:e2e": "dotenv -e .env.test.local -- next start --port 3001",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "tsx --test tests/*.test.ts",
    "test:e2e": "playwright test --project=chromium"
  }
}
```

Dependencies dùng exact version range hiện có trong `apps/web/package.json` và
workspace packages `@comtammatu/database`, `@comtammatu/shared`,
`@comtammatu/ui`, `@comtammatu/security`; không thêm component library khác.

- [ ] **Step 2: Tạo config kế thừa root và Next security headers**

`next.config.ts` giữ CSP chỉ cho self + Supabase, `frame-ancestors 'none'`, HSTS,
`poweredByHeader: false`, transpile ba package dùng chung và không khai báo
service-role/provider env.

- [ ] **Step 3: Tạo root layout với shared UI**

```tsx
import "@comtammatu/ui/globals.css";
import "./globals.css";
import { Toaster } from "@comtammatu/ui/components/sonner";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Thêm root/Turbo scripts**

Thêm `dev:workspace` và build task:

```json
"dev:workspace": "PATH=$(dirname $(command -v corepack)):$PATH turbo run dev --filter=@comtammatu/workspace"
```

`@comtammatu/workspace#build` hash Supabase public env, app URLs, hai Upstash
login-rate-limit env, `VERCEL_PROJECT_ID`, `VERCEL_ENV` và outputs `.next/**`
trừ cache/dev.

- [ ] **Step 5: Install lockfile và chạy build contract đỏ/xanh**

```powershell
corepack pnpm install --lockfile-only
corepack pnpm --filter @comtammatu/workspace typecheck
corepack pnpm --filter @comtammatu/workspace lint
corepack pnpm --filter @comtammatu/workspace build
```

Expected: package được Turbo nhận; build không cần service-role. Với local
placeholder public env hợp lệ, empty shell build PASS.

### Task 6: Implement Workspace login, proxy và live access gate

**Files:**

- Create: `apps/workspace/proxy.ts`
- Create: `apps/workspace/lib/auth/context.ts`
- Create: `apps/workspace/lib/auth/with-workspace-action.ts`
- Create: `apps/workspace/app/(public)/(auth)/login/page.tsx`
- Create: `apps/workspace/app/(public)/(auth)/login/actions.ts`
- Create: `apps/workspace/app/(public)/access-denied/page.tsx`
- Create: `apps/workspace/app/api/auth/signout/route.ts`
- Create: `apps/workspace/tests/proxy-access-static.test.ts`
- Create: `apps/workspace/tests/action-boundary.test.ts`

**Interfaces:**

- Produces `loadWorkspaceAuthState()` -> `{ supabase, session, claims, user, access }`
- Produces `withWorkspaceAction(schema, handler)` -> typed `ActionResult`
- Consumes `can_access_workspace()` và `canAccess(role, "workspace")`

- [ ] **Step 1: Viết static tests đỏ cho proxy invariants**

Assertions bắt buộc:

```typescript
assert.match(proxySource, /updateSession\(request\)/);
assert.match(proxySource, /extractClaimsFromAccessToken/);
assert.match(proxySource, /canAccess\(claims\.user_role, "workspace"\)/);
assert.match(proxySource, /rpc\("can_access_workspace"/);
assert.doesNotMatch(proxySource, /auth\.getUser\(/);
assert.doesNotMatch(proxySource, /SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(proxySource, /domain:\s*["']\.comtammatu\.com/);
```

- [ ] **Step 2: Implement proxy fail-closed**

Flow chính xác:

```text
public /login, /access-denied, /api/auth/signout -> pass
no session -> /login?returnTo=<safe internal path>
invalid claims -> /access-denied?reason=missing-auth-context
candidate ACL false -> /access-denied?reason=insufficient-permission
can_access_workspace error/false -> /access-denied?reason=workspace-membership-required
otherwise -> response from updateSession preserving refreshed cookies
```

- [ ] **Step 3: Implement login bằng cùng Supabase account**

Zod schema:

```typescript
const loginSchema = z.object({
  email: z.email({ error: "Email không hợp lệ" }),
  password: z.string().min(1, { error: "Vui lòng nhập mật khẩu" }),
  returnTo: z.string().optional(),
});
```

Giữ một generic post-validation failure message `Email hoặc mật khẩu không
đúng` để không tạo user-enumeration oracle. Dùng `loginRateLimit` hiện có với
cùng contract 10 lần/5 phút theo IP; key rate-limit được prefix `workspace:login:`
để phân tách riêng với web app, tránh làm cạn budget của nhau. Rate-limit backend
failure không được mở đường brute-force im lặng.

Thêm checklist đăng ký Supabase Auth redirect URL cho `https://work.comtammatu.com`
và các preview origins được kiểm soát.

Sau `signInWithPassword`, đọc access token claims, gọi
`can_access_workspace()`, sign out local nếu không có membership, rồi redirect
safe internal path hoặc `/`. Không tạo profile/workspace membership tại login.

- [ ] **Step 4: Implement RSC/action Auth liveness**

`loadWorkspaceAuthState()` dùng cached `getSession()`, decode claims, gọi
`getUser()` một lần ở protected RSC để phát hiện revoked session và redirect
qua `/api/auth/signout`. `withWorkspaceAction` chạy liveness trước handler,
validate Zod trước RPC và map lỗi auth/permission thành copy ổn định.

- [ ] **Step 5: Chạy targeted tests**

```powershell
corepack pnpm --filter @comtammatu/workspace test
corepack pnpm --filter @comtammatu/workspace typecheck
```

Expected: invalid/no membership fail closed; no raw error path; no broad cookie.

### Task 7: Xây server query layer, URL filters và Work shell read-only

**Files:**

- Create: `apps/workspace/lib/work/types.ts`
- Create: `apps/workspace/lib/work/filters.ts`
- Create: `apps/workspace/lib/work/queries.ts`
- Create: `apps/workspace/lib/messages/vi.ts`
- Create: `apps/workspace/app/(protected)/layout.tsx`
- Create: `apps/workspace/app/(protected)/_components/workspace-shell.tsx`
- Create: `apps/workspace/app/(protected)/_components/workspace-nav.tsx`
- Create: `apps/workspace/app/(protected)/_components/app-switcher.tsx`
- Create: `apps/workspace/tests/work-filters.test.ts`
- Modify: `scripts/page-archetypes.mjs`
- Modify: `docs/spec/page-archetypes.md`
- Modify: `docs/ref/screen-context-map.md`

**Interfaces:**

- Produces `WorkFilters`, `parseWorkFilters(searchParams)`, `buildWorkFilterUrl()`
- Produces `getWorkspaceShellData()`, `listVisibleWorkTasks(filters)`, `getWorkTaskDetail(id)`
- Consumes generated `Database` types và caller-scoped Supabase client

- [ ] **Step 1: Viết filter tests đỏ**

```typescript
test("normalizes workspace filters without local state", () => {
  assert.deepEqual(
    parseWorkFilters({
      department: "12",
      project: "33",
      status: "in_progress",
      assignee: "me",
      q: "  mở chi nhánh  ",
      view: "board",
    }),
    {
      departmentId: 12,
      projectId: 33,
      status: "in_progress",
      assignee: "me",
      query: "mở chi nhánh",
      view: "board",
    },
  );
});
```

Test từ chối negative/non-integer IDs, unknown status/view và query quá 80 ký tự.

- [ ] **Step 2: Implement domain DTOs và parser thuần**

```typescript
export type WorkTaskStatus =
  "backlog" | "todo" | "in_progress" | "review" | "done" | "canceled";

export type WorkTaskPriority = "low" | "normal" | "high" | "urgent";

export interface WorkFilters {
  departmentId: number | null;
  projectId: number | null;
  status: WorkTaskStatus | null;
  assignee: "me" | string | null;
  query: string;
  view: "board" | "list";
}
```

- [ ] **Step 3: Implement caller-scoped queries**

Queries không nhận `tenant_id` từ URL. Lấy tenant/user từ auth state, để RLS
lọc rows, và luôn xử lý Supabase error bằng server log đã redact + user copy.
Task detail fetch task, participants, checklist, comments, attachments và events
song song sau khi parent task row đã được RLS xác nhận.

- [ ] **Step 4: Build shared shell**

Navigation MVP:

```text
Công việc: Bảng công việc, Việc của tôi, Dự án
Tổ chức: Đội ngũ (chỉ khi can manage)
Tiện ích: Thông báo
Account: Trang cá nhân -> web `/me` cho non-Owner; Owner -> web `/`; module được cấp; đăng xuất
```

App switcher dùng validated `NEXT_PUBLIC_WEB_APP_URL`; không truyền session.

- [ ] **Step 5: Đăng ký Workspace archetypes**

Mở rộng page-archetype audit để scan `apps/workspace/app/**/page.tsx`; đăng ký
BOARD/LIST/DETAIL/GATE routes theo design doc. Không tạo exception cho raw
primitives ngoài `@comtammatu/ui`.

- [ ] **Step 6: Chạy tests và UI contract**

```powershell
corepack pnpm --filter @comtammatu/workspace test
corepack pnpm lint:ui-contract
corepack pnpm --filter @comtammatu/workspace typecheck
```

Expected: PASS.

### Task 8: Chuyển chọn lọc board/list/project/task detail từ donor

**Files:**

- Create: `apps/workspace/app/(protected)/page.tsx`
- Create: `apps/workspace/app/(protected)/my-work/page.tsx`
- Create: `apps/workspace/app/(protected)/projects/page.tsx`
- Create: `apps/workspace/app/(protected)/projects/[projectId]/page.tsx`
- Create: `apps/workspace/app/(protected)/tasks/[taskId]/page.tsx`
- Create: `apps/workspace/app/(protected)/_components/work-board.tsx`
- Create: `apps/workspace/app/(protected)/_components/work-list.tsx`
- Create: `apps/workspace/app/(protected)/_components/task-card.tsx`
- Create: `apps/workspace/app/(protected)/tasks/[taskId]/_components/task-detail.tsx`
- Create: `apps/workspace/tests/task-presentation-model.test.ts`

**Interfaces:**

- Consumes: query DTOs/filters từ Task 7
- Produces: read-only BOARD/LIST/DETAIL routes với canonical `/tasks/[taskId]`
- Donor reads: use `git show 2e27b85:<path>`, không import donor package

- [ ] **Step 1: Lập donor mapping bằng committed source**

Inspect:

```powershell
git -C C:\Users\BINH\Downloads\matu-workspace show 2e27b852a03387694f1daa31fab9d7e91c65e16a:apps/web/components/work-surface.tsx
git -C C:\Users\BINH\Downloads\matu-workspace show 2e27b852a03387694f1daa31fab9d7e91c65e16a:apps/web/components/task-detail-sheet.tsx
git -C C:\Users\BINH\Downloads\matu-workspace show 2e27b852a03387694f1daa31fab9d7e91c65e16a:packages/domain/src/work-surface/tasks.ts
```

Copy only pure status/filter/presentation ideas. Replace UUID workspace scope,
cookie active workspace, app-local UI imports và `?task=` detail bằng contract
mới. Khóa quyết định drag/drop: Dùng native HTML5 Drag and Drop API hoặc component
status picker đơn giản, không thêm thư viện drag-and-drop ngoài chưa qua kiểm duyệt.

- [ ] **Step 2: Viết presentation model tests đỏ**

Test sort: open trước closed, urgent/high trước normal/low, overdue trước
undated trong cùng priority; status column membership không double-count.

- [ ] **Step 3: Implement BOARD và responsive fallback**

Desktop: sáu status columns, horizontal scroll chỉ trong board viewport. Mobile:
status tabs + full-row list; không ép card columns ẩn ngang. Task click luôn tới
`/tasks/[id]`.

- [ ] **Step 4: Implement LIST, projects và detail routes**

Mỗi route render loading/empty/error/permission state. `/my-work` khóa assignee
theo current user và chỉ cho filter status/project/query. Project detail không
hiển thị member ngoài RLS-visible project.

- [ ] **Step 5: Chạy test/build read-only slice**

```powershell
corepack pnpm --filter @comtammatu/workspace test
corepack pnpm --filter @comtammatu/workspace lint
corepack pnpm --filter @comtammatu/workspace typecheck
corepack pnpm --filter @comtammatu/workspace build
```

Expected: PASS; no import from `matu-workspace` or `apps/web` private paths.

### Task 9: Implement project/task/status/participant mutations

**Files:**

- Create: `apps/workspace/lib/work/schemas.ts`
- Create: `apps/workspace/lib/work/error-map.ts`
- Create: `apps/workspace/lib/work/actions.ts`
- Create: `apps/workspace/app/(protected)/_components/project-form-dialog.tsx`
- Create: `apps/workspace/app/(protected)/_components/task-form-dialog.tsx`
- Create: `apps/workspace/app/(protected)/_components/task-status-control.tsx`
- Create: `apps/workspace/app/(protected)/tasks/[taskId]/_components/task-participants.tsx`
- Create: `apps/workspace/tests/work-action-schemas.test.ts`
- Create: `apps/workspace/tests/work-error-map.test.ts`

**Interfaces:**

- Produces actions: `createProject`, `setProjectMember`, `createTask`, `updateTask`, `setTaskStatus`, `setTaskParticipant`
- Every task update consumes `expectedRevision: number`
- Returns `ActionResult<{ id: number; revision: number }>` or typed DTO

- [ ] **Step 1: Viết Zod tests đỏ**

```typescript
test("task mutation requires bounded content and a positive revision", () => {
  assert.equal(
    updateTaskSchema.safeParse({
      taskId: 9,
      expectedRevision: 0,
      title: "",
      description: "x".repeat(10001),
      priority: "impossible",
    }).success,
    false,
  );
});
```

Exact limits: title 1–160, description 0–10,000, comment 1–4,000, project name
1–120, due date ISO date/datetime hợp lệ.

- [ ] **Step 2: Viết stable error mapping tests đỏ**

Map exact server codes:

```text
work_access_denied -> Bạn không còn quyền thực hiện thao tác này.
work_revision_conflict -> Công việc vừa được người khác cập nhật. Hãy tải bản mới.
work_member_inactive -> Nhân viên này không còn hoạt động.
work_invalid_scope -> Phòng ban hoặc dự án không hợp lệ.
23505 -> Dữ liệu này đã tồn tại.
fallback -> Không thể cập nhật công việc. Vui lòng thử lại.
```

- [ ] **Step 3: Implement actions qua wrapper và RPC**

Không truyền tenant/current actor vào RPC. Sau success gọi `revalidatePath` cho
`/`, `/my-work`, project và task canonical routes bị ảnh hưởng.

- [ ] **Step 4: Implement task status drag/drop an toàn**

Drag chỉ đổi status, không thay manual order. Optimistic UI được phép nhưng
rollback ngay khi action fail/conflict; toast dùng stable ID để tránh duplicate.

- [ ] **Step 5: Implement assignment/collaboration controls**

Picker chỉ tải active profiles mà caller được phép mời. Fixed-module/branch
staff không nhìn các project khác sau khi được mời task; UI không suy quyền từ
position label.

- [ ] **Step 6: Chạy targeted tests**

```powershell
corepack pnpm --filter @comtammatu/workspace test
corepack pnpm --filter @comtammatu/workspace typecheck
```

Expected: validation/conflict/permission paths PASS.

### Task 10: Implement checklist, comments và activity

**Files:**

- Modify: `apps/workspace/lib/work/actions.ts`
- Create: `apps/workspace/app/(protected)/tasks/[taskId]/_components/task-checklist.tsx`
- Create: `apps/workspace/app/(protected)/tasks/[taskId]/_components/task-comments.tsx`
- Create: `apps/workspace/app/(protected)/tasks/[taskId]/_components/task-activity.tsx`
- Create: `apps/workspace/tests/task-collaboration-static.test.ts`

**Interfaces:**

- Produces actions: `createChecklistItem`, `setChecklistItem`, `createTaskComment`
- Consumes: task child RLS + RPCs từ R1

- [ ] **Step 1: Viết static tests đỏ cho child-boundary**

Test source bảo đảm actions chỉ nhận parent/item IDs + bounded content, dùng
`withWorkspaceAction`, không insert trực tiếp nhiều bảng và không trả raw error.

- [ ] **Step 2: Implement checklist**

Checklist update dùng RPC, pending control disabled, có accessible label và
optimistic rollback. Delete không nằm trong MVP; item có thể đổi title hoặc
completed.

- [ ] **Step 3: Implement plain-text comments**

Render text an toàn, preserve line breaks, không dùng `dangerouslySetInnerHTML`.
Comment mới append event + exact-recipient notification cho participants khác
actor trong cùng transaction.

- [ ] **Step 4: Implement activity timeline**

Display kind allowlist: created, updated, status_changed, assignee_changed,
participant_added, checklist_changed, commented, attachment_added/removed.
Unknown kind dùng nhãn fallback an toàn; metadata không render raw JSON.

- [ ] **Step 5: Chạy tests**

```powershell
corepack pnpm --filter @comtammatu/workspace test
corepack pnpm --filter @comtammatu/workspace lint
```

Expected: PASS.

### Task 11: Implement private attachments

**Files:**

- Modify: `supabase/tests/work_management_rls_test.sql`
- Modify: `apps/workspace/lib/work/actions.ts`
- Create: `apps/workspace/lib/work/attachments.ts`
- Create: `apps/workspace/app/(protected)/tasks/[taskId]/_components/task-attachments.tsx`
- Create: `apps/workspace/tests/work-attachments.test.ts`

**Interfaces:**

- Produces `buildWorkAttachmentPath(tenantId, taskId, objectId, fileName)`
- Produces `finalizeTaskAttachment` và `removeTaskAttachment`
- Consumes bucket/RLS đã phát hành trong R1: `work-attachments`, private, max 10 MiB, exact MIME allowlist

- [ ] **Step 1: Viết pure path/MIME tests đỏ**

```typescript
test("builds a tenant/task scoped safe path", () => {
  assert.equal(
    buildWorkAttachmentPath(
      1,
      42,
      "550e8400-e29b-41d4-a716-446655440000",
      "Kế hoạch Q4.pdf",
    ),
    "1/42/550e8400-e29b-41d4-a716-446655440000/Ke-hoach-Q4.pdf",
  );
});
```

Test từ chối traversal, null byte, executable MIME, empty filename và
`10 MiB + 1 byte`.

- [ ] **Step 2: Xác nhận bucket và Storage RLS từ R1 bằng pgTAP**

Tests prove policies parse first two path segments thành tenant/task, require
tenant match và `can_read_work_task(task_id)`. INSERT additionally requires
actor có quyền comment/checklist task; DELETE chỉ uploader hoặc
project/department lead/Owner. Nếu contract R1 thiếu, sửa bằng forward migration
được review riêng trước runtime; không sửa migration đã apply.

- [ ] **Step 3: Implement browser upload + atomic finalize**

Browser upload trực tiếp bằng `@comtammatu/database/supabase/client`; sau upload
gọi finalize action. Nếu finalize fail, gọi remove object best-effort và hiển
thị retry. Metadata row chỉ được tạo bởi RPC sau khi kiểm tra path/size/MIME.

- [ ] **Step 4: Implement signed download**

Server query tạo signed URL sống 10 phút sau RLS-visible metadata lookup. Không
lưu signed URL vào database/activity/notification.

- [ ] **Step 5: Chạy pgTAP + unit tests**

```powershell
corepack pnpm --filter @comtammatu/workspace test
corepack pnpm lint:migration-lineage
```

Trong CI/Preview, prove same-task participant upload/download, unrelated user
deny, cross-tenant path deny và uploader/lead delete matrix.

### Task 12: Implement exact-recipient Workspace notifications

**Files:**

- Create: `apps/workspace/app/(protected)/notifications/page.tsx`
- Create: `apps/workspace/lib/notifications/actions.ts`
- Create: `apps/workspace/app/(protected)/_components/notification-list.tsx`
- Modify: `apps/web/lib/notifications/action-url.ts`
- Modify: `apps/web/tests/notification-action-url.test.ts`
- Modify: `apps/web/lib/messages/notifications.ts`
- Modify: `apps/web/app/_components/notification-item.tsx`
- Modify: `docs/spec/toast-notification-system.md`

**Interfaces:**

- Work kinds: `work.task_assigned`, `work.task_participant_added`, `work.task_commented`, `work.task_status_changed`
- Stored `action_url`: internal Workspace path `/tasks/{id}`
- Web resolver output: exact trusted Workspace origin + stored path

- [ ] **Step 1: Viết cross-app action URL tests đỏ**

```typescript
test("maps work notification paths to the trusted Workspace origin", () => {
  assert.equal(
    resolveNotificationActionUrl(claims("self_service", null), {
      actionUrl: "/tasks/42",
      entityId: 42,
      kind: "work.task_assigned",
      targetBranchId: null,
    }),
    "https://work.comtammatu.com/tasks/42",
  );
});
```

Test từ chối `//evil.example`, absolute untrusted URL, `work.*` path ngoài route
allowlist và non-work kind cố dùng Workspace origin.

- [ ] **Step 2: Implement resolver bằng origin parser Task 2**

Chỉ `work.*` được map sang Workspace origin. Legacy notification path tiếp tục
đi qua `resolvePostLoginRedirect`; không nới internal plane rules.

- [ ] **Step 3: Implement Workspace notification feed**

Feed gọi work-only list/count RPC, mark read qua `notification_reads`, không
query notification của domain khác. Task row click mark-read rồi mở canonical
task path.

- [ ] **Step 4: Add message/icon contract**

Thêm Vietnamese kind labels và một intentional clipboard/check icon fallback.
Không render technical kind làm nhãn chính.

- [ ] **Step 5: Verify recipient isolation**

pgTAP/E2E chứng minh hai nhân viên cùng `self_service` role nhưng chỉ exact
recipient thấy notification; Owner không thấy exact-user row nếu không được
target, trừ feed quản trị riêng được thiết kế sau MVP.

- [ ] **Step 6: Chạy notification tests**

```powershell
corepack pnpm --filter @comtammatu/web exec tsx --test tests/notification-action-url.test.ts
corepack pnpm --filter @comtammatu/workspace test
```

Expected: PASS.

### Task 13: Implement team administration và app switcher discovery

**Files:**

- Create: `apps/workspace/app/(protected)/team/page.tsx`
- Create: `apps/workspace/app/(protected)/team/_components/department-list.tsx`
- Create: `apps/workspace/app/(protected)/team/_components/member-dialog.tsx`
- Modify: `apps/workspace/lib/work/actions.ts`
- Modify: `apps/web/app/components/app-shell.tsx`
- Create: `apps/web/app/_lib/workspace-access.ts`
- Create: `apps/web/tests/workspace-app-switcher-static.test.ts`

**Interfaces:**

- Produces management actions: `createDepartment`, `setDepartmentMember`
- Produces `canCurrentUserOpenWorkspace()` live RPC probe for switcher visibility
- Consumes `NEXT_PUBLIC_WORKSPACE_APP_URL`

- [ ] **Step 1: Viết switcher visibility tests đỏ**

Static/pure contract:

```text
RPC true -> render Workspace external link
RPC false/error -> do not render link
href origin must pass trusted application origin parser
link contains no token/user/tenant query params
```

- [ ] **Step 2: Implement team page owner-only actions**

Read table visible to Owner/department lead; mutation create/deactivate/reassign
member chỉ Owner qua `work:manage` trong MVP. Deactivate membership không xóa
project/task history; user còn task/project invite vẫn chỉ thấy explicit scope.

- [ ] **Step 3: Implement app switcher in both apps**

Web app probes `can_access_workspace()` caller-scoped. Workspace hiển thị
`Trang cá nhân` về `${WEB_APP_ORIGIN}/me` cho non-Owner và
`${WEB_APP_ORIGIN}/` cho Owner; các module links đến từ app discovery contract,
không tự suy module từ position.

- [ ] **Step 4: Chạy auth/UI tests**

```powershell
corepack pnpm --filter @comtammatu/web test
corepack pnpm --filter @comtammatu/workspace test
corepack pnpm lint:ui-contract
```

Expected: PASS.

### Task 14: Mở rộng CI E2E cho Workspace

**Files:**

- Modify: `scripts/supabase-e2e-bringup.mjs`
- Modify: `scripts/check-guard-sync.mjs`
- Modify: `.github/workflows/ci.yml`
- Create: `apps/workspace/playwright.config.ts`
- Create: `apps/workspace/e2e/workspace-access.spec.ts`
- Create: `apps/workspace/e2e/workspace-task-flow.spec.ts`
- Create: `apps/workspace/e2e/workspace-collaborator-isolation.spec.ts`

**Interfaces:**

- Produces ignored `apps/workspace/.env.test.local` only inside GitHub Actions
- Produces CI script `test:e2e:smoke`
- Consumes deterministic seed từ Task 3

- [ ] **Step 1: Cập nhật CI-only env writer guard**

Cho phép harness ghi đúng hai ignored paths:

```text
apps/web/.env.test.local
apps/workspace/.env.test.local
```

`check-guard-sync` tiếp tục fail nếu script ghi root `.env.local`, chạy ngoài
`GITHUB_ACTIONS=true`, hoặc ghi path app khác.

- [ ] **Step 2: Viết E2E access matrix**

Scenarios:

```text
Owner -> sees all and Team admin
Office member -> sees own department only
Project collaborator Accountant -> sees invited project, not department sibling projects
Task participant Branch staff -> sees one task, not project list/sibling task
Unrelated active employee -> access denied
Inactive employee -> access denied after liveness/membership check
```

- [ ] **Step 3: Viết E2E core flow**

Lead creates project/task, assigns member, member moves todo -> in_progress,
checks checklist, comments, uploads PDF, collaborator opens notification, and
revision conflict reloads instead of overwriting.

- [ ] **Step 4: Add CI build/start commands**

Sau web E2E hoặc trong job Workspace riêng:

```bash
pnpm --filter @comtammatu/workspace build:e2e
pnpm --filter @comtammatu/workspace run test:e2e:smoke
```

Không chạy hai Next servers cùng port; Workspace dùng 3001.

- [ ] **Step 5: Run full local non-runtime gates**

```powershell
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
corepack pnpm test
```

Expected: PASS. Authenticated database E2E evidence đến từ CI job, không được
thay bằng fake client hoặc workstation Production data.

### Task 15: Cập nhật architecture authority và release runbook

**Files:**

- Modify: `docs/spec/architecture.md`
- Modify: `docs/spec/role-route-matrix.md`
- Modify: `docs/CODEBASE_MAP.md`
- Modify: `docs/modules/auth.md`
- Modify: `docs/modules/database.md`
- Modify: `docs/modules/infrastructure.md`
- Modify: `docs/modules/ui.md`
- Modify: `docs/ref/screen-context-map.md`
- Create: `docs/runbooks/workspace-release.md`

**Interfaces:**

- Produces durable authority cho runtime/package/data/auth/route/release boundaries
- Consumes verified implementation facts; không ghi claim deploy trước evidence

- [ ] **Step 1: Update architecture/package graph**

Ghi ba runtime leaves: `apps/web`, `apps/workspace`, `apps/print-agent`; chỉ hai
web apps dùng Supabase Auth session. Workspace không trở thành Tenant L1/L2;
hierarchy vẫn `Tenant -> Branch`.

- [ ] **Step 2: Update route/audience contract**

Thêm Work surface riêng, hostname routes và phân biệt rõ `/me`. Generated local
route matrix không được giả rằng `work.comtammatu.com` là `/workspace` path.

- [ ] **Step 3: Write release runbook**

Runbook có các bước:

```text
preflight registry/env/domain
DB dry-run/apply/typegen gate
Vercel deployment exact SHA
owner/lead/member/collaborator smoke
7-day pilot metrics and incident contacts
runtime rollback to prior deployment
membership revocation
forward-only database repair
```

- [ ] **Step 4: Run doc/route guards**

```powershell
corepack pnpm lint:doc-staleness
corepack pnpm lint:route-matrix
git diff --check
```

Expected: PASS.

### Task 16: Production cutover và pilot

**Files/Systems:**

- Vercel project `comtammatu-workspace`
- DNS/domain `work.comtammatu.com`
- Supabase Auth allowed redirect URLs
- Runtime logs/observability
- No source mutation ngoài reviewed release diff

**Interfaces:**

- Consumes: exact green commit SHA, applied R1 schema, Production env registry
- Produces: restricted Production pilot và rollback evidence

- [ ] **Step 1: Production preflight**

Verify project ID/ref/domain, absence of service-role/provider secrets, exact
commit SHA, CI green, migration ledger applied và generated types matching.

- [ ] **Step 2: Deploy with domain initially restricted**

Deploy exact SHA. Chỉ Owner và một pilot department có active work membership;
mọi người khác nhận access denied. Không auto-create membership khi login.

- [ ] **Step 3: Run role walkthrough**

Desktop + mobile:

```text
Owner manages department/member
Lead creates project/task and assigns participant
Member updates status/checklist/comment
Cross-department collaborator sees invited scope only
Unrelated user cannot discover task/project via direct URL
Attachment signed URL expires and cannot be reused cross-user
Notification exact recipient opens Workspace task
/me remains on web.comtammatu.com and data is unchanged
```

- [ ] **Step 4: Pilot một phòng trong 7 ngày**

Theo dõi: failed Server Actions, RLS denies, revision conflicts, upload failures,
notification delivery/read, p95 route/action latency và access-denied anomalies.
Không đánh giá năng suất cá nhân hoặc xếp hạng nhân viên từ task counts.

- [ ] **Step 5: Expansion gate**

Mở phòng tiếp theo chỉ khi không có P0/P1 security/data issue, core flow thành
công, rollback đã thử và owner xác nhận. Sau đó mới mời Kế toán/Kho/HR/Chi nhánh
vào task liên phòng ban thật.

- [ ] **Step 6: Rollback khi có blocker**

Rollback Vercel về deployment trước, gỡ domain nếu cần và deactivate work
memberships. Không drop `work_*`, không sửa migration ledger; mọi database fix
dùng forward migration được review riêng.

---

## Self-review của kế hoạch

### Spec coverage

- App riêng/cùng monorepo/Auth/database: Tasks 1, 2, 5, 6.
- Phòng ban và collaborator visibility: Tasks 3, 4, 7, 13, 14.
- MVP task/project/checklist/comment/activity: Tasks 8–10.
- Attachment và notification: Tasks 11–12.
- App switcher và `/me` separation: Tasks 7, 13, 15.
- Database-first, guard, CI, rollout/rollback: Tasks 0, 1, 4, 14–16.
- Donor selective transplant: Tasks 0 và 8.

### Type/interface consistency

- `workspace` là candidate ModuleKey; `can_access_workspace()` là live access
  authority; RLS helpers là row authority.
- Task mutation luôn dùng bigint IDs và `expectedRevision`/`revision` number.
- Notification lưu relative Workspace path; web resolver mới ghép trusted
  origin.
- Mọi app runtime dùng generated `Database`; runtime chỉ bắt đầu sau Task 4.

### Critical stop conditions

Dừng triển khai nếu xảy ra một trong các điều kiện:

- Migration tree có file ngoài task trong cùng apply batch.
- Workspace Vercel project ID chưa được đưa vào registry/guard.
- Preview/Production ref không chứng minh là child/registered ref đúng.
- Production apply chưa có owner delegation cho exact batch.
- Generated types chưa phản ánh schema đã apply.
- RLS negative tests hoặc collaborator direct-URL tests fail.
- Workspace deployment nhận service-role/provider secrets.
- Runtime cần import private code từ `apps/web` hoặc primitive/theme từ donor.
