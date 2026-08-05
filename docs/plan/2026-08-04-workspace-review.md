# Review kế hoạch ứng dụng Workspace

> Trạng thái: Review hoàn tất ngày 2026-08-04, read-only. Tài liệu được review:
> `docs/plan/2026-08-03-workspace-design.md` (thiết kế) và
> `docs/plan/2026-08-03-workspace-implementation-plan.md` (kế hoạch triển khai).
> Review này không ủy quyền tạo Vercel project, apply migration hoặc deploy.

## 1. Tóm tắt điều hành

Cặp tài liệu có kỷ luật cao bất thường so với mặt bằng kế hoạch triển khai:

- Thiết kế khóa quyết định sản phẩm/bảo mật kèm lý do, kế hoạch chuyển chúng
  thành 17 task (Task 0–16) với bước red/green TDD, danh sách file, interface
  và điều kiện dừng rõ ràng.
- Gần như mọi khẳng định sự kiện trong kế hoạch đã được đối chiếu với codebase
  thật và **đúng**: guard scripts, hằng số Vercel/Supabase ref, shape của
  `ModuleAcl`, pattern proxy của `apps/web`, lint gates, commit donor.
- Phân rã release đúng: R1 (database) phát hành trước R2–R4 (runtime phụ thuộc
  generated types), khớp workflow `db:types` của repo.

Kết quả đối chiếu phát hiện:

- **01 gap chặn (critical)**: trigger `canonicalize_notification` hiện tại sẽ từ
  chối mọi notification exact-user của Workspace → cần sửa trong Task 3 Step 6.
- **01 gap cao (high)**: `PERMISSION_KEY_COUNT` và seed-permission sync chưa được
  đưa vào file list của Task 3 Step 7.
- Một số rủi ro trung bình/thấp: migration R1 quá lớn, DnD chưa chốt thư viện,
  độ trễ thu hồi membership, hiệu năng Storage policy.

**Kết luận khả thi: cao.** Kế hoạch sẵn sàng thực thi sau khi vá 2 gap trên vào
tài liệu kế hoạch và chốt hướng drag/drop ở Task 8.

## 2. Phạm vi và phương pháp review

Review đọc toàn văn cả hai tài liệu và kiểm chứng các khẳng định then chốt bằng
cách đọc trực tiếp codebase tại thời điểm review:

| Đối tượng kiểm chứng | Nguồn |
| -------------------- | ----- |
| Guard Vercel/Supabase env | `scripts/check-preview-supabase-env.mjs` |
| Guard sync registry | `scripts/check-guard-sync.mjs` |
| ACL source | `packages/shared/src/auth/module-acl.ts`, `types.ts` |
| Permission catalog mirror | `packages/shared/src/auth/permissions.ts` |
| Notification baseline (trigger, RPC, RLS) | `supabase/migrations/20260802162900_baseline.sql` |
| Proxy pattern hiện tại | `apps/web/proxy.ts` |
| Lint gates, scripts được kế hoạch viện dẫn | `package.json`, `scripts/` |
| Donor checkout | `C:\Users\BINH\Downloads\matu-workspace` (commit đã pin) |

Mọi trích dẫn dòng/lỗi bên dưới lấy từ các nguồn này.

## 3. Đánh giá tài liệu thiết kế

### 3.1. Điểm mạnh

**a. Phân tách domain sạch.** Workspace chỉ là lớp phối hợp công việc: không sao
chép số tiền, bảng lương, tồn kho hay dữ liệu HR vào task, chỉ liên kết bản ghi.
Đây là quyết định đúng, tránh bài toán dual-authority. Hierarchy
`Tenant (L0) → Branch (L1)` được giữ nguyên; Workspace là surface, không phải cấp
tổ chức mới (được nhắc lại đúng ở Task 15 Step 1).

**b. Mô hình membership-as-authority (§5) là lõi trí tuệ của thiết kế và vững:**

- Đọc mặc định theo phòng ban; mở rộng theo lời mời project/task minh bạch.
- Bác bỏ rõ việc suy membership từ "nhân viên này không có module" kèm lý do
  đúng (permission/module đổi, trách nhiệm công việc thì không).
- Defense in depth đặt tên đúng từng lớp authority: candidate gate
  (`module-acl`) → `can_access_workspace()` RPC → RLS.
- Ma trận hành động §5.1 cụ thể, testable, ánh xạ 1:1 sang ma trận pgTAP và E2E
  trong kế hoạch.

**c. Bảo mật fail-closed thật sự, không boilerplate:** cookie host-only kèm lý do
blast radius; cấm token trong app-switcher URL; Workspace Production không nhận
`SUPABASE_SERVICE_ROLE_KEY`; redirect origin allowlist; signed URL ngắn hạn cho
attachment; allowlist origin cho link notification. Đây là threat modeling thật.

**d. MVP scope trung thực.** Non-goals (docs/wiki, AI, Gantt, time tracking,
realtime board, multi-tenant, migrate dữ liệu donor) chặn scope creep ngay từ đầu.
Quyết định board chỉ kéo giữa các cột, sắp trong cột theo
priority → deadline → `updated_at` giảm đáng kể rủi ro cho phần UI khó nhất.

**e. Optimistic concurrency qua `revision`.** `expected_revision` với UX conflict
phục hồi được là lựa chọn trưởng thành cho bài toán nhiều người cùng sửa task,
và được truyền nhất quán vào RPC contract (`update_work_task(p_task_id,
p_expected_revision, ...)`) lẫn E2E "revision conflict reloads instead of
overwriting".

**f. Chiến lược donor có ranh giới rõ.** Pin commit `2e27b85`, chỉ đọc qua
`git show`, danh sách giữ/loại minh bạch, cấm mang auth/schema/UI primitive của
donor vào. Review xác nhận commit tồn tại tại checkout donor trên máy
(message: "fix: vá bảo mật next 16.2.12..."), nên Task 0 Step 2 khả thi.

**g. Rollback doctrine đúng.** Schema additive giữ nguyên khi rollback; runtime
rollback bằng deployment/membership; database chỉ sửa forward. Khớp constraint
"không sửa migration đã apply" của AGENTS.md.

### 3.2. Điểm mở cần làm rõ

1. **Độ trễ thu hồi membership chưa được định lượng.** §4 nói vô hiệu hóa tài
   khoản làm "Auth liveness fail" chặn cả hai app. Nếu `can_access_workspace()`
   chạy mỗi request protected (như §9.1 gợi ý), thu hồi hiệu lực ngay; nếu chỉ
   chạy khi refresh token, trễ tối đa bằng TTL access token (~1 giờ). Kế hoạch
   đã chọn chạy RPC trong proxy mỗi request — đúng — nhưng cần nói rõ
   employee-active-status được enforce ở đâu (xem §5 bên dưới).
2. **Không Realtime cho notification Workspace.** Thiết kế bỏ lớp chú ý Realtime
   ("nếu contract hiện tại cho phép"). Với luồng giao việc, người dùng sẽ mong
   nhận biết gần tức thời. Đây là cut MVP chấp nhận được nhưng nên ghi vào chỉ
   số pilot theo dõi.
3. **Chưa có giới hạn pagination cho fan-out task detail** (participants,
   checklist, comments, attachments, events). Ổn với quy mô MVP nhưng cần cap
   trước khi số comment/event lớn.

## 4. Đánh giá kế hoạch triển khai

### 4.1. Phân rã release

Bảng R0–R5 có gate đo được cho từng release. Quyết định quan trọng nhất — R1
phát hành trước vì R2–R4 phụ thuộc generated types — khớp workflow `db:types` và
AGENTS.md. Câu "Không gom database và runtime phụ thuộc schema chưa apply vào
một deployment không tương thích" là invariant đúng và được lặp lại ở stop
conditions.

### 4.2. Kiểm chứng giả định so với codebase

Mọi khẳng định được chọn kiểm chứng đều **đúng**:

| Khẳng định của kế hoạch | Kết quả kiểm chứng |
| ----------------------- | ------------------ |
| Guard hiện chỉ cho phép `prj_OGyJLaxEcceuckDoOUWth60FasXC` | Đúng, hằng số trong `scripts/check-preview-supabase-env.mjs` |
| Supabase Production ref `enloyfnuerqgaqderbwb` | Đúng, cùng file |
| Scripts viện dẫn tồn tại (`supabase-migration-new.mjs`, `supabase-production-push.mjs`, `check-guard-sync.mjs`, `supabase-e2e-bringup.mjs`, `page-archetypes.mjs`) | Đủ trong `scripts/` |
| Lint gates tồn tại (`lint:guard-sync`, `lint:migration-lineage`, `lint:typegen`, `lint:ui-contract`, `lint:route-matrix`, `lint:seed-permissions`, `lint:doc-staleness`) | Đủ trong `package.json` |
| `ModuleAcl` hiện chỉ có `path`/`allowedRoles`/`label`; chưa có key `workspace` | Đúng; thêm trường `app?: "web" \| "workspace"` là additive |
| Proxy invariant khớp idiom web hiện tại (`updateSession`, `extractClaimsFromAccessToken`, `canAccess`, không `auth.getUser`) | Đúng theo `apps/web/proxy.ts` |
| `apps/` hiện chỉ có `web` và `print-agent` | Đúng, khớp mô tả "runtime leaf thứ ba" |
| Donor commit pin đọc được | Đúng tại checkout local |

Lưu ý thêm: `list_notifications` hiện trả `target_roles text[]` trong return
table — khi thêm `target_user_ids`, feed/unread/mark-all contract đổi. Kế hoạch
Task 3 Step 6 đã nêu cập nhật nhóm RPC này, đúng hướng.

### 4.3. Nhận xét từng task

**Task 0 — Readiness.** Bước kiểm tra writer xung đột trên migration tree trước
khi chạm schema là thực dụng (repo đang có migration gần đây). Env lockout
(không đặt Supabase key trước khi project ID vào guard) là ordering an toàn đúng.
Thiếu sót nhỏ: chưa có dòng checklist đăng ký Supabase Auth redirect URL cho
`https://work.comtammatu.com` — thiết kế §4 yêu cầu; hiện chỉ xuất hiện ngầm ở
preflight Task 16. Nên thêm một dòng explicit vào R0 hoặc Task 6.

**Task 1 — Registry hai project.** Refactor guard từ single constant sang registry
bất biến với test đỏ trước là chuẩn. Yêu cầu giữ nguyên fail-closed Preview
contract tránh vô tình mở Preview với Production data. `vercel.json` disable
deploy mọi branch trừ `main` đúng với monorepo nhiều app.

**Task 2 — Candidate ACL + origin parser.** `resolveTrustedApplicationOrigin`
dùng chung cho app switcher và notification action URL là tái sử dụng đúng chỗ.
Bộ test từ chối `https://work.comtammatu.com.evil.example`, `user@host`, path —
đúng các vector cần chặn. Quyết định không thêm `/workspace` vào
`resolveModuleFromPath` giữ nguyên route resolver của web, tránh regression.

**Task 3 — Database foundation (task lớn nhất, xem thêm §6).** Contract 10 bảng,
4 helper, 13 RPC là đầy đủ so với thiết kế §6–§7. Composite FK
`(user_id, tenant_id) -> profiles` và unique partial index cho một active
membership mỗi người là chi tiết integrity đúng. Điểm thiếu: (1) trigger
notification — gap chặn, (2) `PERMISSION_KEY_COUNT`/seed sync — gap cao,
(3) convention SQLSTATE cho error code tùy chỉnh (`work_revision_conflict`...)
chưa ghi — baseline đã có tiền lệ `USING ERRCODE = '23514'`, nên ghi rõ để
`error-map.ts` parse ổn định.

**Task 4 — Apply và typegen.** Approval gate explicit ("blocked-at-approval",
không tự dùng MCP apply hay `supabase db push`) tôn trọng đúng owner-delegation.
Dry-run trước, verify đúng tên file migration trước khi apply là quy trình đúng.
Bước chạy advisors trong Preview rehearsal sẽ giúp phát hiện sớm chi phí Storage
policy (rủi ro R6).

**Task 5 — Scaffold app.** Manifest tối thiểu, không thêm component library, build
guard nhúng `check-preview-supabase-env.mjs` vào `build` script là pattern tốt.
Mâu thuẫn nhỏ: file structure ghi `layout.tsx` có "Geist, theme và Toaster" nhưng
snippet Step 3 chỉ có Toaster — nên thống nhất trước khi thực thi.

**Task 6 — Login/proxy/gate.** Static source-match assertions cho invariant bảo
mật (`doesNotMatch(/SUPABASE_SERVICE_ROLE_KEY/)`,
`doesNotMatch(/domain:\s*["']\.comtammatu\.com/)`) là pattern hay cho thuộc tính
khó test hành vi. Generic failure message chống user-enumeration oracle và reuse
`loginRateLimit` 10 lần/5 phút là đúng. Cần xác nhận `loginRateLimit` key theo
IP+email từng app, để login web không làm cạn budget của Workspace và ngược lại —
kế hoạch chưa nói rõ.

**Task 7 — Query layer và shell.** Filter nằm trên URL với test normalize đúng
(từ chối ID âm/non-integer, status/view lạ, query > 80 ký tự). Quy tắc "Queries
không nhận `tenant_id` từ URL" là invariant an toàn quan trọng. Mobile board
chuyển thành tabs/list thay vì ép ngang khớp thiết kế §8.

**Task 8 — Donor transplant.** Chỉ copy ý tưởng pure status/filter/presentation,
thay UUID scope/cookie workspace/`?task=` detail bằng contract mới — đúng thiết
kế §11. **Gap**: chưa chốt cách hiện thực drag/drop (donor dùng gì, HTML5 native
hay thư viện). Nếu donor dùng thư viện chưa có trong dependency set của monorepo,
đây là quyết định boundary phải khóa ở step mapping trước khi sang Task 9.

**Task 9 — Mutations.** Zod limit cụ thể (title 1–160, description 0–10.000,
comment 1–4.000, project name 1–120) và error map stable code → copy tiếng Việt
với fallback an toàn là đúng contract AGENTS.md. Optimistic UI với rollback ngay
khi conflict và toast stable ID tránh duplicate là chi tiết vận hành tốt.
Picker "chỉ tải active profiles mà caller được phép mời" cần một query/RPC phụ
chưa được liệt kê trong interfaces — nên bổ sung để không phát sinh read ad-hoc.

**Task 10 — Checklist/comments/activity.** Static test child-boundary (actions chỉ
nhận parent/item ID + bounded content, không insert trực tiếp nhiều bảng) bảo vệ
đúng boundary atomic-RPC. Plain-text comments không `dangerouslySetInnerHTML`,
activity render theo kind allowlist với fallback an toàn — đúng yêu cầu thiết kế
§6 ("không chứa HTML tùy ý").

**Task 11 — Attachments.** Test path builder với filename tiếng Việt có dấu
(`Kế hoạch Q4.pdf` → `Ke-hoach-Q4.pdf`) là case thực tế tốt; phủ traversal, null
byte, executable MIME, `10 MiB + 1 byte`. Flow upload trực tiếp + atomic finalize
+ best-effort cleanup khi finalize fail khớp thiết kế §9.3. Signed URL 10 phút và
cấm lưu signed URL vào database/activity/notification là đúng.

**Task 12 — Notifications exact-recipient.** Resolver map chỉ `work.*` sang
Workspace origin bằng parser Task 2, legacy path giữ `resolvePostLoginRedirect` —
đúng nguyên tắc không nới plane cũ. Test từ chối `//evil.example` và non-work
kind cố dùng Workspace origin là đủ vector. E2E "hai nhân viên cùng
`self_service` nhưng chỉ exact recipient thấy" chứng minh isolation đúng điểm
yếu nhất của role-targeting.

**Task 13 — Team admin + switcher.** Probe `can_access_workspace()` caller-scoped
cho visibility switcher (không render link khi false/error) tránh leak sự tồn tại
của app. Owner-only mutation qua `work:manage` trong MVP đúng thiết kế §5.

**Task 14 — CI E2E.** Guard env writer chỉ cho phép đúng 2 path ignored và chỉ
trong `GITHUB_ACTIONS=true` là hardening đúng. Ma trận access 6 kịch bản phủ đủ
audience trong thiết kế §2.1, gồm cả inactive employee. Dùng port 3001 tránh
trùng web server là chi tiết thực dụng.

**Task 15 — Documentation authority.** Đúng nguyên tắc "verified facts only,
không ghi claim deploy trước evidence". Lưu ý `docs/ref/screen-context-map.md`
xuất hiện trong file list cả Task 7 và Task 15 — nên chỉ định một lần sửa theo
release để tránh conflict khi chạy song song nhiều writer.

**Task 16 — Cutover và pilot.** Triển khai với membership hạn chế, không
auto-create membership khi login, role walkthrough desktop + mobile, pilot 7 ngày
kèm chỉ số cụ thể (failed actions, RLS denies, revision conflicts, p95 latency)
và expansion gate yêu cầu không P0/P1 — quy trình phát hành thận trọng đúng mức.
Câu "Không đánh giá năng suất cá nhân hoặc xếp hạng nhân viên từ task counts" là
ràng buộc đạo đức vận hành đáng ghi nhận.

### 4.4. Quality gates

Chuỗi gate được dùng đúng tầng:

- Unit/static (Node test runner, tsx) cho pure logic và source invariant.
- pgTAP cho RLS isolation và action matrix — chạy trong CI/Preview, không dựng
  Supabase Local trên workstation, nhất quán rule repo.
- Lint gates chuyên biệt (`lint:guard-sync`, `lint:migration-lineage`,
  `lint:ui-contract`, `lint:route-matrix`, `lint:seed-permissions`) khóa các
  invariant liên gói.
- `corepack pnpm verify` dành riêng cho release candidate.

Stop conditions cuối tài liệu là danh sách đầy đủ và thực thi được; điều kiện
"Workspace deployment nhận service-role/provider secrets → dừng" đặc biệt quan
trọng.

## 5. Nhất quán thiết kế ↔ kế hoạch

Nhất quán rất cao; các cặp đối chiếu chính:

| Thiết kế | Kế hoạch | Kết quả |
| -------- | -------- | ------- |
| §5 chuỗi authority 3 lớp | Task 2 + Task 6 + Task 3 | Khớp |
| §6 danh sách 10 bảng `work_*` | Task 3 Interfaces | Khớp từng bảng |
| §8 routes/archetypes | Task 7 Step 5 | Khớp BOARD/LIST/DETAIL/GATE |
| §10 kinds notification, 10 MiB, MIME, path attachment | Task 11–12 | Khớp, kể cả test path |
| §11 donor pin và danh sách loại bỏ | Task 0 + Task 8 | Khớp |
| §12 ba vòng rollout | Task 16 Steps 2–5 | Khớp |
| Không realtime board/task | Không có wiring Realtime nào | Khớp |

Một căng thẳng cần giải quyết: thiết kế §4 nói Workspace đọc trạng thái hoạt
động từ `employees`, và Task 14 test "Inactive employee → access denied". Nhưng
điểm enforce (trong `can_access_workspace()` hay ở membership seed) chưa được chỉ
định. Khuyến nghị: ghi vào helper contract rằng `can_access_workspace()` phải
join `employees` đang hoạt động, vì deactivate là đòn off-boarding chính.

## 6. Gap phát hiện (xếp hạng)

### 6.1. 🔴 Critical — Trigger notification chặn toàn bộ exact-user mode

Task 3 Step 6 thêm `target_user_ids uuid[]` và đổi check constraint để chấp nhận
`target_roles` rỗng miễn có `target_user_ids`. Nhưng baseline có BEFORE INSERT
trigger trên `public.notifications` (`trg_canonicalize_notification`) gọi
`private.canonicalize_notification()`, và hàm này `RAISE EXCEPTION
'notification_requires_canonical_target_role'` (ERRCODE 23514) khi
`cardinality(NEW.target_roles) = 0`.

Mọi notification `work.*` được thiết kế là exact-recipient không role targeting,
nên **mọi insert sẽ thất bại bên trong transaction của RPC atomic**, kéo theo
abort toàn bộ mutation task (giao việc, bình luận, đổi trạng thái).

Yêu cầu sửa kế hoạch — Task 3 Step 6 phải bao gồm:

```sql
-- Thay trigger function để cho phép exact-user mode:
-- bỏ qua canonicalize/empty-check khi target_user_ids không rỗng;
-- giữ normalization role legacy cho row role-targeted.
CREATE OR REPLACE FUNCTION private.canonicalize_notification() ...
```

Và thêm assertion pgTAP: (1) insert exact-user thành công; (2) `action_url`
`/tasks/{id}` đi qua nhánh `ELSE NEW.action_url` không bị trigger viết lại.

### 6.2. 🟠 High — `PERMISSION_KEY_COUNT` và seed-permission sync

Task 3 Step 7 insert `work:manage` vào DB catalog `permission_keys`, nhưng
`packages/shared/src/auth/permissions.ts` khóa cứng `PERMISSION_KEY_COUNT = 107`
với comment "bump when a migration adds/removes a catalog key", guarded bằng
string-match test; đồng thời `lint:seed-permissions` chạy trong chuỗi lint. Cả
hai đều vắng mặt trong file list Task 3. Gap này sẽ lộ dưới dạng gate đỏ (phục
hồi được) nhưng kế hoạch nên nêu đích danh cách sửa (bump 108, mirror key TS, cập
nhật seed sync) thay vì phát hiện giữa chừng.

### 6.3. 🟡 Trung bình

1. **Migration R1 quá lớn.** 10 bảng + 4 helper + 13 RPC + notification
   extension + trigger repair + storage bucket/policies trong một file. Additive
   và có rehearsal nên blast radius giới hạn, nhưng mọi khiếm khuyết buộc lần
   apply Production thứ hai có owner approval. Nên cân nhắc tách notification
   contract (ảnh hưởng shared, web đang dùng) khỏi schema `work_*`.
2. **Drag/drop chưa chốt.** Task 9 Step 4 nói drag chỉ đổi status nhưng không
   nêu cách hiện thực. Nếu donor dùng thư viện chưa có trong dependency set, cần
   quyết định boundary trước Task 9. Đây là lỗ hổng "quyết định chưa khóa" hiếm
   hoi của một kế hoạch vốn decision-complete.
3. **Độ trễ thu hồi membership.** Giữ per-request `can_access_workspace()` trong
   proxy; E2E "deactivate rồi navigate" (đã có trong Task 14) giữ nguyên làm bằng
   chứng.
4. **Rate limit dùng chung Upstash.** Xác nhận `loginRateLimit` key theo
   app+IP+email để hai app không làm cạn budget của nhau.

### 6.4. 🟢 Nhỏ

- Snippet `layout.tsx` Task 5 thiếu Geist/theme so với file structure.
- Đăng ký Supabase Auth redirect URL cho `https://work.comtammatu.com` cần một
  dòng checklist explicit (R0 hoặc Task 6).
- Convention SQLSTATE/ERRCODE cho `work_*` error code tùy chỉnh cần ghi trong
  RPC contract Task 3 để `error-map.ts` parse ổn định.
- `docs/ref/screen-context-map.md` trong file list cả Task 7 lẫn Task 15 — chỉ
  định một owner-edit theo release.

## 7. Risk register tổng hợp

| # | Rủi ro | Mức | Giảm thiểu |
| - | ------ | --- | ---------- |
| R1 | Trigger `canonicalize_notification` chặn mọi notification exact-user | Critical | Thêm thay trigger function vào Task 3 Step 6 + pgTAP insert test |
| R2 | Gate đỏ vì `PERMISSION_KEY_COUNT`/seed sync khi insert `work:manage` | High | Mở rộng file list Task 3 Step 7 |
| R3 | Migration R1 quá lớn, lỗi buộc lần apply thứ hai | Medium | Cân nhắc tách notification contract khỏi schema `work_*` |
| R4 | Thu hồi membership trễ nếu bỏ RPC gate ở path nào đó | Medium | Per-request `can_access_workspace()` trong proxy; giữ E2E deactivate |
| R5 | Drag/drop chưa chốt hiện thực | Medium | Khóa quyết định ở donor mapping Task 8 trước Task 9 |
| R6 | Storage policy gọi helper per-row có chi phí | Low | Advisor check khi rehearsal Preview (Task 4 Step 2) |
| R7 | Không có attention layer realtime cho notification Workspace | Low | Chấp nhận MVP; theo dõi trong chỉ số pilot |

## 8. Khuyến nghị và kết luận

Khuyến nghị trước khi bắt đầu thực thi:

1. Vá Task 3 Step 6: thay `private.canonicalize_notification()` để exact-user
   mode hợp lệ, kèm pgTAP assertion insert và action_url passthrough.
2. Vá Task 3 Step 7: bump `PERMISSION_KEY_COUNT`, mirror `WORK_MANAGE` trong TS,
   cập nhật seed-permission sync, thêm vào file list.
3. Chốt hiện thực drag/drop trong donor mapping của Task 8.
4. Thêm dòng đăng ký redirect URL Supabase Auth và ghi rõ employee-active-status
   được enforce trong `can_access_workspace()`.
5. Cân nhắc tách migration notification contract khỏi migration `work_*`.

Kết luận: thiết kế và kế hoạch nhất quán cao, nền tảng sự kiện đối chiếu với
codebase là chính xác gần như tuyệt đối, quy trình gate và approval tôn trọng
đúng ranh giới owner. Giải pháp Workspace **khả thi cao**; sau khi vá 2 gap
critical/high nêu trên, kế hoạch sẵn sàng cho Task 0.
