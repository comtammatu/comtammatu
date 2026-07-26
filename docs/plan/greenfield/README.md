# Greenfield Project Plan — `comtammatu-greenfield`

> Trạng thái: kế hoạch thực thi; chưa tạo repo, Supabase Project hoặc runtime
> đích.
>
> Owner direction: 2026-07-26.

Tài liệu này sở hữu thứ tự chuyển giao, bootstrap repo, dọn dẹp authority và
release gate. Nó không lặp lại kiến trúc nghiệp vụ hoặc quyết định cutover:

- [Kiến trúc mục tiêu](../../architecture/target-modules-tech-stack-project-structure.md)
  sở hữu Modules, Tech Specs, Infra, Project Structure và các lát cắt sản phẩm.
- [Auth và Authorization mục tiêu](../../architecture/target-auth-authorization.md)
  sở hữu membership, scoped RBAC, route access, RLS và RPC.
- [ADR 0014](../adr/0014-greenfield-company-tenant-cutover.md) sở hữu quyết định
  không lấy dữ liệu cũ, không dual-write, rollback và cutover.
- [ADR 0015](../adr/0015-greenfield-authorization-model.md) sở hữu quyết định
  authorization đã được owner chấp nhận.
- `docs/spec/*`, `docs/modules/*` của repo đang chạy tiếp tục là current-state
  authority cho tới khi từng lát cắt được triển khai và chứng minh trên target.

## 1. Kết quả đích

Tạo một repo private độc lập tên `comtammatu-greenfield`, dùng lại có chọn lọc
code đã được chứng minh của `comtammatu`, nhưng khởi tạo lại authority, schema,
configuration và delivery workflow cho mô hình:

```text
Company
├── Khối Văn phòng dùng chung
└── Tenant
    ├── Kho Tổng
    ├── Bếp Trung Tâm
    └── N Chi nhánh vận hành
```

Kết quả hoàn tất phải có:

1. một repo độc lập, không thuộc GitHub fork network và không mang toàn bộ lịch
   sử, branch, tag hoặc quyền của repo nguồn;
2. một Supabase Production Candidate mới, không phải DEV;
3. một migration chain target replay được từ empty, không chứa operational data
   cũ;
4. một Vercel project và các site agent độc lập, không chia sẻ runtime binding
   hoặc credential với hệ thống cũ;
5. Company/Tenant/site authority, Branch Workspace, Effective Configuration,
   HĐĐT Doanh nghiệp, Kho Tổng, Bếp Trung Tâm và Workforce theo kiến trúc mục
   tiêu;
6. current Production tiếp tục là nguồn vận hành duy nhất cho tới owner cutover
   gate; sau giao dịch live đầu tiên trên target chỉ restore hoặc fix-forward.

## 2. “Fork” trong kế hoạch này

`Fork` là một controlled code fork, không phải nút **Fork** của GitHub.
[GitHub fork](https://docs.github.com/en/enterprise-cloud@latest/pull-requests/reference/forks)
giữ liên kết với upstream; private fork còn kế thừa cấu trúc team permissions.
[Mirror](https://docs.github.com/en/repositories/creating-and-managing-repositories/duplicating-a-repository)
lại mang toàn bộ remote branch, tag và history. Hai cơ chế đó không phù hợp với
mục tiêu tách authority.

Quy trình mặc định:

```text
clean source commit
  → verified source archive
  → curated bootstrap tree
  → new standalone private repo
  → one new root commit
```

Repo cũ được giữ làm audit archive. Source commit và checksum của archive là
bootstrap evidence; history cũ không được copy sang repo mới. Mọi ngoại lệ phải
được owner phê duyệt trước khi tạo repo.

## 3. Ràng buộc không được phá

- Không bootstrap từ worktree chưa sạch hoặc từ file chưa commit.
- Không copy file chứa giá trị như `.env`, `.env.local`, `.env.*.local`,
  `.vercel/project.json`, `.mcp.json`, Supabase link state, `.codegraph/`, cache
  hoặc file ignored. `.env.example` được viết lại thành contract không chứa
  secret hoặc old binding.
- Không import order, payment, stock, HR, invoice, audit, Auth user hoặc
  operational job state cũ.
- Không dual-write, đồng bộ hai chiều hoặc dựng compatibility layer giữa hai
  database.
- Không tạo persistent DEV chỉ để phục vụ greenfield. CI dùng Supabase Local;
  cloud target là Production Candidate.
- Không cho command thiếu project ref, project ref lạ hoặc project ref cũ rơi
  vào writable default.
- Không bật deploy, cron, webhook, HĐĐT issuance hoặc branch agent trước đúng
  phase gate.
- Không đổi current-state docs của `comtammatu` thành target-state docs trước
  khi runtime tương ứng đã được triển khai.
- Không đưa `docs/plan/decisions.md`, source `tasks/todo.md`, nội dung `tasks/*`
  hoặc legacy artifact của `comtammatu` vào curated tree. Greenfield không kế
  thừa backlog, decision log hay implementation chronology.
- Không dựng ERP tổng quát. Phạm vi là F&B Operating ERP của Cơm Tấm Má Tư.
- V1 chỉ kích hoạt profile HĐĐT Doanh nghiệp của Công ty Cổ Phần Chén Sứ. Data
  model có thể tham chiếu profile khác, nhưng chưa chạy song song HKD khi chưa
  có nhu cầu và profile thứ hai được xác nhận.
- Company chỉ cần định danh kỹ thuật và trạng thái để runtime chạy. MST, thông
  tin pháp nhân, tài khoản HĐĐT, chứng thư và HĐLĐ chỉ bắt buộc tại workflow tích
  hợp tương ứng.

## 4. Bản đồ authority

| Concern               | Authority trong giai đoạn chuyển giao                              | Quy tắc promote                                                |
| --------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Hệ thống đang chạy    | `comtammatu` current specs, modules, code và applied state         | Không sửa thành target-state sớm                               |
| Kiến trúc đích        | `docs/architecture/target-modules-tech-stack-project-structure.md` | Chỉ chuyển thành current spec sau khi slice live-proven        |
| Cutover/rollback      | `docs/plan/adr/0014-greenfield-company-tenant-cutover.md`          | Trong repo mới viết lại thành ADR 0001, không copy lịch sử ADR |
| Thứ tự thực thi       | Tài liệu này                                                       | Xóa khi hoàn tất và nội dung ổn định đã về đúng owner          |
| Runtime behavior      | Code, applied schema và active configuration của đúng target       | Docs phải theo sau evidence triển khai                         |
| Route và capability   | Target route-capability registry + capability catalog              | Route matrix và navigation projection chỉ là generated output  |
| Database type         | Applied target schema và generated types                           | Không sửa type bằng tay                                        |
| Dependency version    | Package manifests và lockfile                                      | Không ghi exact version lặp lại trong docs                     |
| Project ref và quyền  | Environment Registry của repo tương ứng                            | Không hardcode ở docs/module khác                              |
| Memory và tool output | Discovery evidence                                                 | Không bao giờ vượt repo authority                              |

Một fact chỉ có một owner. Khi chuyển nội dung từ tài liệu cũ sang owner mới,
phải xóa bản lặp; không tạo thư mục archive hoặc agent wiki thứ hai.

## 5. Ma trận chuyển giao

### 5.1. Docs

| Hành động | Nội dung                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep      | Kiến trúc mục tiêu, từng domain term đã được xác nhận, design-system contract còn áp dụng và business invariant đã có owner hiện hành                                                             |
| Rewrite   | `docs/README.md`, glossary, business context, architecture hiện hành, Auth, Database, Infrastructure, HĐĐT và runbook theo repo/target mới                                                        |
| Generate  | `docs/CODEBASE_MAP.md`, route-capability matrix, database types, migration/status inventory và mọi tài liệu đã có generator                                                                       |
| Exclude   | `docs/plan/decisions.md`, source `tasks/*` gồm `tasks/todo.md`, ADR 0005–0013, design rollout/review snapshot, worklog, old environment/runbook evidence và nội dung chỉ mô tả lịch sử triển khai |

Trước khi exclude, mọi invariant còn cần cho code được fork phải được đối chiếu
với code và viết lại vào đúng spec/ref/module từ current evidence. Không copy
nguyên current glossary: chỉ extract term đã xác nhận, rồi viết lại
Company/Tenant/site/Auth vocabulary từ target docs đã được owner chấp nhận.
Không copy đoạn hoặc giữ nguyên `decisions.md` chỉ vì một vài quyết định còn giá
trị.

Trong repo mới:

- ADR đầu tiên là greenfield bootstrap/cutover, được viết lại từ ADR 0014;
- authorization decision được viết lại từ ADR 0015 thành ADR 0002 với trạng
  thái Accepted; không copy numbering hoặc lịch sử ADR cũ;
- `docs/plan/decisions.md` không tồn tại;
- không file nào từ source `tasks/*` được extract; nếu workflow target vẫn cần
  task tracker thì generate một file rỗng từ template Greenfield sau sanitation,
  không dùng nội dung hoặc blob của source `tasks/todo.md`;
- `docs/spec/*` và `docs/modules/*` chỉ mô tả phần đã đúng với target;
- phần chưa triển khai tiếp tục được gắn rõ `target`, không được trình bày như
  deployed truth;
- plan hết hiệu lực bị xóa, không chuyển sang `archive/`;
- exact project ref chỉ xuất hiện tại Environment Registry, guard negative
  fixtures hoặc generated binding được Registry kiểm tra.

### 5.2. Rules

| Hành động      | Nội dung                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep           | TypeScript strict, Zod ở trust boundary, `supabase-js`, multi-row RPC, không lộ raw error, ACL/RLS fail closed, URL-owned scope và Git safety |
| Rewrite        | `AGENTS.md`, `database.md`, `skills.md`, `references.md` và business framing theo Company → Tenant → operational site                         |
| Keep tối thiểu | `engineering.md`, `database.md`, `ui.md`, `workflow.md`, `orchestration.md`, `references.md`, `skills.md`                                     |
| Exclude        | Quy tắc gắn với HKD hiện hành, old project ref, old baseline, tenant/branch giả định và adapter-specific instruction đã hết tác dụng          |

`AGENTS.md` vẫn là entrypoint ngắn. `CLAUDE.md` chỉ là compatibility shim. Root
adapter directories chỉ nối runtime vào rules; không được trở thành authority
thứ hai.

Rule cleanup là T3 governance work và phải hoàn tất trước khi bật Supabase MCP,
Vercel link hoặc cloud write path trong repo mới.

### 5.3. Guards và runtime adapters

Guard reset có hai trạng thái:

**Bootstrap mode — chưa có target ref**

- current Production và mọi ref của codebase khác nằm trong `NO_TOUCH`;
- không có `APPROVED_PREVIEW_PARENT_REF`;
- project-less và unknown target fail closed;
- Supabase MCP chưa bind target;
- type generation, baseline extraction và migration apply không có fallback;
- Vercel, webhook, cron và branch agent chưa liên kết.

**Candidate mode — exact target ref đã được owner xác nhận**

- Environment Registry thêm đúng ref với nhãn `PRODUCTION CANDIDATE`;
- guard, guard-sync fixtures, type generation, MCP adapter và runbook thay đổi
  cùng một review;
- MCP tiếp tục `read_only=true`;
- cloud write chỉ hợp lệ khi command mang exact target và quyền hiện hành cho
  phép;
- current Production vẫn ở `NO_TOUCH`;
- promotion từ Candidate sang Production đổi trạng thái authority, không mở
  rộng lệnh hoặc credential ngầm.

Các bề mặt bắt buộc phải audit trong sanitation change:

- `docs/agent/rules/database.md`;
- `scripts/guard-prod-db.mjs` và `scripts/check-guard-sync.mjs`;
- `.codex/config.toml`, `.codex/hooks.json`, `.claude/settings.json` và
  `.mcp.json.example`;
- type generator, migration-lineage/baseline tooling và preview guard;
- Vercel config, GitHub Actions, print-agent setup và database runbooks;
- toàn bộ lint/guard được gọi từ root scripts, gồm copy, UI, client storage,
  regression, baseline, seed, i18n và route matrix;
- mọi literal hoặc fallback trỏ tới hệ thống cũ.

Mỗi guard được phân loại `keep`, `rewrite`, `regenerate` hoặc `delete` cùng
consumer và failure fixture. Không copy một guard chỉ vì nó đang nằm trong
`pnpm lint`; guard không còn target contract phải bị xóa khỏi pipeline.

Acceptance bắt buộc:

- old ref chỉ còn ở denylist/negative fixture được allowlist rõ;
- unknown, omitted và malformed target đều bị chặn;
- guard tests tự chứng minh positive Local/CI case và negative old/cloud case;
- `lint:guard-sync`, `lint:rules-mirror`, `lint:migration-lineage` và
  `lint:preview-env` đạt trước khi enable cloud adapter;
- không có code path cùng lúc ghi được vào cả current và candidate.

### 5.4. Memory

Repo mới không copy local/global memory của repo cũ. Memory namespace bắt đầu
rỗng và chỉ nhận fact bền vững đã được kiểm tra lại:

- owner direction hiện hành;
- business/legal boundary đã xác nhận;
- authority và naming convention ổn định;
- regression/lesson đã chứng minh còn tồn tại trong code mới.

Không import commit SHA đang làm việc, dirty state, deployment result, tool
availability, PR/CI history hoặc project ref như một current fact. Chronicle,
rollout summary và repo cũ chỉ là nguồn discovery; live repo, target Registry,
applied schema và owner direction mới hơn luôn thắng.

Memory migration phải là một review riêng sau khi repo mới tồn tại. Mỗi fact
được phân loại `keep`, `rewrite` hoặc `drop`; không bulk-copy thư mục memory.

### 5.5. Skills

Tracked skill bundle ban đầu chỉ gồm capability cần cho roadmap gần nhất:

1. `building-components`;
2. `next-best-practices`;
3. `playwright`;
4. `supabase`;
5. `supabase-postgres-best-practices`;
6. `turborepo`.

`shadcn`, `web-design-guidelines`, `vercel-react-best-practices`,
`next-cache-components`, `next-upgrade` và `ai-elements` không được copy mặc
định. Chỉ thêm lại khi có task signal và consumer thật.

Manifest và checker được tạo lại từ đúng bundle, không sửa hash thủ công. Global
skill, plugin và MCP catalog không phải dependency của repo. Mỗi task tiếp tục
chọn một primary capability và tối đa một specialist cho risk surface riêng.

### 5.6. Workflow và task state

Giữ T1/T2/T3, four-lens review, evidence-based completion và multi-agent safety.
Tối giản phần tracking:

- không extract bất kỳ file nào trong source `tasks/*`;
- nếu workflow Greenfield giữ file tracker, generate mới `tasks/todo.md`,
  `tasks/regressions.md` và `tasks/lessons.md` dưới dạng shell rỗng; chúng không
  kế thừa nội dung, Git blob hoặc trạng thái từ repo cũ;
- tracker mới chỉ chứa active outcome phát sinh trong Greenfield;
- roadmap đầy đủ ở tài liệu này, không nhân bản vào task board;
- mỗi phase chỉ mở một implementation slice đủ nhỏ để review và rollback;
- một writer sở hữu diff; reviewer/subagent mặc định read-only;
- trạng thái `written`, `CI green`, `candidate-applied`, `deployed` và
  `live-proven` không được dùng thay nhau.

Các thay đổi governance, guard, Auth/RLS, migration, money, tax, HĐĐT, cutover
và external writer đều là T3. UI/copy hoặc docs chỉ được hạ tier khi không đổi
authority, policy hay behavior.

### 5.7. Code, database và infrastructure

| Surface      | Quy tắc                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Monorepo     | Giữ package graph hiện tại; không thêm package/service/state library nếu chưa có consumer chéo boundary              |
| Product code | Reuse implementation có test và khớp target; legacy compatibility hoặc hardcode không được promote                   |
| Database     | Current migrations là discovery input, không phải target chain; viết target chain replay từ empty                    |
| Seed         | Chỉ versioned reference data; Company, Tenant, site, user, catalog và integration profile được provision có chủ đích |
| Cron/job     | Bootstrap để disabled; chỉ activate bằng release step sau provisioning và health proof                               |
| Vercel       | Project mới, candidate domain mới, không copy `.vercel/project.json`, không tự gắn production domain                 |
| Secrets      | Provision lại từng secret; không pull/copy từ project cũ và không lưu credential HĐĐT trong browser/database payload |
| Print agent  | Identity site-scoped, revoke được; không dùng `service_role` tại site                                                |
| Provider     | SePay, Viettel và webhook được đăng ký lại có kiểm soát; không để endpoint cũ và mới cùng nhận ghi                   |

Bootstrap dùng positive allowlist, không dùng cách copy cả repo rồi xóa dần.
Source archive chỉ là audit input. Một file/module chỉ được extract vào curated
tree khi đồng thời thỏa:

1. có consumer trong target architecture;
2. interface và invariant khớp Company → Tenant → operational site;
3. có runnable check hoặc sẽ được thay bằng target implementation trong cùng
   bootstrap slice;
4. không chứa compatibility path, current project binding, magic organization/
   site ID hoặc HKD-only transaction contract.

Legacy mặc định bị loại gồm current migration chain/baseline, old seed/cron
assumption, compatibility alias/fallback, landing route đã retire, provider
singleton cũ, source environment binding, historical docs/ADR/worklog và toàn
bộ source `tasks/*`. Không tạo `legacy/`, `archive/` hoặc quarantine directory
trong repo mới; repo cũ là nơi tra cứu lịch sử.

### 5.8. Hardcode exit register

Mục tiêu không phải xóa mọi literal. Product invariant thật sự cố định được giữ
trong code khi có owner và test. Giá trị thay đổi theo tổ chức, site, môi trường,
provider hoặc thời gian phải rời khỏi code:

| Nhóm                                                             | Target owner                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Project ref, URL, domain, runtime binding                        | Environment Registry và verified deployment binding                                     |
| Company, Tenant, site, user hoặc magic ID như `tenant_id = 1`    | Provisioned row, server-derived scope và RLS                                            |
| Giá, giới hạn bán, payment method, sellable window               | Typed Effective Configuration: Tenant default → site override → snapshot                |
| VAT, seller identity, template, series, invoice profile metadata | Versioned invoice profile và transaction snapshot                                       |
| Username, password, token, certificate                           | Server-side secret store/env; database chỉ giữ secret reference khi cần                 |
| Route scope và quyền                                             | URL site param, live membership/assignment, target route-capability registry và RLS/RPC |
| Generated schema, route hoặc dependency fact                     | Generator, applied schema, manifests và lockfile                                        |
| Brand/product invariant thật sự cố định                          | Named constant hoặc content contract có owner; không biến thành Company bootstrap field |

G0 tạo inventory theo bảng trên. Mỗi kết quả phải được phân loại `move`,
`generate`, `keep-with-owner` hoặc `delete`. Không chấp nhận allowlist chung kiểu
“legacy”; mọi `keep-with-owner` phải nêu authority và runnable check. G4 chỉ
được coi là xong khi không còn magic organization/site ID, provider singleton
toàn cục hoặc environment fallback trên transaction path.

## 6. Phases và hard gates

### G0 — Freeze source

**Thực hiện**

1. Hoàn tất hoặc tách toàn bộ WIP khỏi source candidate.
2. Chọn một commit `main` sạch, CI green và ghi exact SHA.
3. Chạy full repository verification và secret scan trên tree cùng history.
4. Tạo source archive từ exact commit, checksum và file manifest.
5. Lập positive allowlist code/docs/assets và explicit denylist cho
   `docs/plan/decisions.md`, source `tasks/*`, current migrations và legacy
   artifacts.
6. Tạo hardcode inventory theo phần 5.8, chưa sửa code trong bước kiểm kê.

**Gate**

- source commit không chứa uncommitted migration;
- archive không chứa ignored/local binding;
- full gates và secret scan đạt;
- hardcode inventory có owner/action cho từng finding;
- owner chốt source SHA.

### G1 — Curate và reset authority offline

**Thực hiện**

1. Dựng staging tree bằng cách chỉ extract positive allowlist từ verified
   archive; chưa `git init` và chưa tạo repo remote.
2. Áp dụng ma trận docs/rules/guards/memory/skills/workflow ở phần 5.
3. Đưa mọi old project ref vào `NO_TOUCH`; gỡ mọi implicit default.
4. Viết lại ADR 0001, docs index, glossary và target/current status.
5. Tạo skill bundle tối thiểu, guard fixtures và `.env.example` đã sanitize.
6. Chỉ generate task tracker shell rỗng nếu workflow target còn yêu cầu; không
   extract source `tasks/todo.md`, backlog, regressions hoặc lessons.
7. Chuyển hardcode thuộc repo/tool authority sang Registry, generator hoặc
   explicit fail-closed binding.
8. Review archive-to-curated diff cùng manifest trước root commit.

**Gate**

- không còn authority cạnh tranh hoặc current-state doc giả target truth;
- `docs/plan/decisions.md`, source `tasks/*`, current migration chain và mọi
  denylisted legacy artifact đều không tồn tại trong curated tree;
- old ref scan chỉ trả về deny/negative-test allowlist;
- mọi root lint/guard có quyết định và consumer rõ;
- agent skills, rule mirror, guard sync, doc staleness và review-tier gates đạt;
- không external tool nào có writable cloud target;
- curated tree được owner chấp nhận trước khi trở thành Git history.

### G2 — Create isolated repository

**Thực hiện**

1. Tạo standalone private repo `comtammatu-greenfield`, không README/template và
   không fork relationship.
2. Audit organization base permissions, visible teams, GitHub Apps, webhooks,
   deploy keys, forking policy và organization Actions/Dependabot/Codespaces
   secrets/variables trước khi nhập code.
3. `git init` trên curated tree, tạo đúng một root commit và push duy nhất
   `main`.
4. Giữ Actions, deployments, environment secrets và Git integration tắt.
5. Cấu hình provisional ruleset: PR bắt buộc, cấm force-push/xóa branch và
   production environment cần owner approval; chưa require tên CI check chưa
   tồn tại.

**Gate**

- `git remote -v` chỉ có repo mới;
- GitHub không báo fork parent;
- repo private, permission/app/webhook/deploy-key audit đạt;
- chưa có inherited secret, deployment hoặc environment binding;
- bootstrap evidence truy ngược được về exact source SHA.

### G3 — Re-enable CI và khóa ruleset

**Thực hiện**

1. Review workflow bằng placeholder env và Supabase Local.
2. Bật Actions mà chưa cấp organization/repository production secrets.
3. Chạy dependency audit, boundary checks, typecheck, lint, test và build.
   Target database replay chỉ trở thành required check sau khi Greenfield
   Authority tạo target chain ở G4.
4. Chỉ giữ CI job có consumer và exit evidence hiện tại.
5. Sau lần CI green đầu tiên, cập nhật ruleset để require đúng check name.
6. Tạo một PR thử có check fail để chứng minh ruleset chặn merge, sau đó đóng PR.

**Gate**

- CI không tham chiếu secret hoặc project ref cũ;
- Actions không tạo deployment;
- không check nào bị skip nhưng vẫn được trình bày như greenfield database proof;
- main ruleset thực sự chặn merge khi required check fail.

### G4 — Product slices, interleave với candidate proof

Triển khai đúng năm slice trong
[kiến trúc mục tiêu](../../architecture/target-modules-tech-stack-project-structure.md#84-các-lát-cắt-triển-khai),
không lặp chi tiết tại đây:

1. Greenfield Authority;
2. Branch Workspace;
3. Effective Configuration và HĐĐT;
4. Kho Tổng và Bếp Trung Tâm;
5. Workforce và Attendance.

Mỗi slice có hai gate:

1. `source-ready`: contract, migration/code, Local test và docs khớp nhau;
2. `runtime-proven`: evidence trên exact Production Candidate hoặc provider/site
   boundary tương ứng đạt.

Thứ tự thực thi của năm slice là Greenfield Authority, Branch Workspace,
Effective Configuration và HĐĐT, Kho Tổng và Bếp Trung Tâm, rồi Workforce và
Attendance. Greenfield Authority phải tạo target migration chain và bật
required from-empty replay cùng SQL/RLS negative tests. Sau khi `source-ready`,
G5 được mở để apply và lấy runtime proof. Effective Configuration và HĐĐT mở G6
cho provider proof; các slice còn lại dùng cùng candidate để chứng minh route
kind, RLS và workflow.

Slice kế tiếp chỉ được mở khi dependency trước đã `source-ready`; không slice
nào được gọi là hoàn tất trước `runtime-proven`. Work hoàn toàn độc lập chỉ chạy
song song khi review chứng minh không chia schema, authority hoặc transaction
contract.

### G5 — Provision và chứng minh Production Candidate

G5 mở ngay khi Greenfield Authority đạt `source-ready`; nó là evidence lane của
G4, không phải bước chờ toàn bộ product code hoàn tất.

**Thực hiện**

1. Owner tạo Supabase Project mới và cung cấp exact ref/rights.
2. Thêm target vào Environment Registry, guards, adapters và type generation
   trong cùng một atomic review.
3. Apply target chain một lần sau khi Local replay đạt.
4. Lập versioned candidate checklist cho Auth settings, xác nhận custom
   access-token hook absent/disabled, public sign-up và anonymous Auth disabled,
   invite/login/recovery redirect allowlist, password/rate-limit policy, Security
   Admin MFA, JWT expiry khớp Realtime revocation bound, SMTP và email
   suppression, API/network policy, extensions, Realtime, Storage, cron và
   backup; xác minh từng mục trên exact ref.
5. Provision Company, Tenant, sites, users, reference catalog và enterprise
   Viettel profile; operational cron vẫn disabled.
6. Chạy owner-gated one-time bootstrap cho Security Admin đầu tiên bằng exact
   target/user ID, ghi audit, enroll/challenge AAL2 và chứng minh zero-admin
   recovery; Security Admin sau đó bind một Security Admin recovery identity
   khác qua audited RPC, không tạo permanent Owner bypass.
7. Tạo Vercel project/candidate domain riêng nhưng chưa gắn production domain.
   Candidate deployment manifest không có cron schedule; schedule chỉ được thêm
   bằng release change tại G7.
8. Chốt RPO/RTO, backup tier và chạy restore drill.

**Gate**

- generated types đến từ applied candidate schema;
- không có operational row cũ;
- project-level Auth/API/network/Realtime/Storage/backup checklist khớp exact
  target;
- Security Admin bootstrap bị khóa sau lần đầu; hai identity có AAL2/recovery
  độc lập, stranded/zero-admin recovery và Realtime revocation-window evidence
  đạt;
- candidate Supabase và Vercel không có active cron schedule;
- Company office user hoạt động không cần site giả, site worker fail closed
  ngoài assignment;
- backup/restore proof đạt;
- candidate URL chỉ trỏ tới new Vercel/new Supabase.

### G6 — Integrations và site agents

**Thực hiện**

1. Provision riêng Upstash, SePay, Viettel, webhook và cron secrets.
2. Xác minh rõ Viettel environment là sandbox/test hay tài khoản phát hành thật,
   cùng designated template/series.
3. Nếu dùng tài khoản phát hành thật, kế toán/owner phải phê duyệt dữ liệu hóa
   đơn thử và thủ tục xử lý sau test: phát hành hợp lệ, điều chỉnh/thay thế khi
   cần và reconcile; không phát hành chỉ để thử kỹ thuật.
4. Chứng minh gross-price/mixed-VAT reconciliation, issue, replace, adjust,
   retry, idempotency và reconcile trên enterprise invoice profile.
5. Thay print-agent `service_role` bằng revocable site-scoped identity.
6. Chạy physical print và provider smoke có owner kiểm soát.
7. Giữ webhook, cron phát hành và branch agent production disabled.

**Gate**

- secret không tới browser hoặc business table;
- provider không thể ghi nhầm old project;
- provider environment, template/series và accounting procedure đã được xác
  nhận; invoice được cho phép đi hết issue/reconcile;
- mỗi site agent chỉ claim/complete job đúng site;
- không runtime nào address được cả hai database.

### G7 — Cutover

**Trước cửa sổ cutover**

1. Full gates, authenticated workflow smoke và canary đạt.
2. Drain payment, HĐĐT, print, webhook và reconciliation queue cũ.
3. Backup hệ thống cũ và xác minh khả năng đọc/restore.
4. Đưa old Production vào reversible write fence: dừng cron/webhook, disable
   active writer access và chứng minh không còn writer. Owner giữ một sealed
   reactivation procedure có thể cấp credential mới nếu pre-live rollback được
   phê duyệt; không để credential rollback ở runtime.
5. Owner ghi nhận cutover approval.

**Chuyển một lần**

1. Gắn production domain và Vercel binding mới.
2. Chuyển provider webhook và site agents.
3. Kích hoạt release migration/config cho cron cần thiết.
4. Chạy một giao dịch kiểm soát từ POS → payment → KDS → print → HĐĐT →
   reconciliation.
5. Khi owner chấp nhận giao dịch target đầu tiên, đóng rollback và revoke vĩnh
   viễn old writer credentials.

Rollback về hệ thống cũ chỉ được phép trước giao dịch live đầu tiên trên target.
Rollback phải tái mở old authority qua sealed procedure và đồng thời đóng target
writer; không hai hệ thống cùng ghi. Sau mốc đó chỉ restore hoặc fix-forward
trên target.

### G8 — Retention và closeout

1. Đưa old repo/project về read-only trong retention window đã được owner chốt.
2. Thu hồi credential không còn dùng và theo dõi provider ingress cũ.
3. Chuyển mọi target contract đã live-proven về current specs/modules.
4. Xóa tài liệu kế hoạch, audit snapshot và rule tạm đã hết hiệu lực.
5. Archive hoặc delete old project là một owner decision riêng sau khi chốt
   nghĩa vụ pháp lý, kế toán và vận hành.

## 7. Risk register

| Risk                                                                      | Control                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Bootstrap từ dirty tree                                                   | Exact clean source commit, archive checksum và allowlist                  |
| Old authority lọt sang repo mới                                           | Curated root commit, Keep/Rewrite/Generate/Exclude review                 |
| Agent/tool ghi nhầm database cũ                                           | Old refs `NO_TOUCH`, no default target, negative guard fixtures           |
| Current migration mang `tenant_id = 1`, cron hoặc operational assumptions | Target chain mới, from-empty replay, cron disabled until release          |
| Docs nói target đã live                                                   | Current/target status header và promote only after evidence               |
| HĐĐT phát hành hai nơi hoặc sai VAT                                       | One enterprise profile, snapshot, idempotency, queue drain và owner smoke |
| Print agent giữ quyền quá rộng                                            | Site-scoped identity, no `service_role`                                   |
| Task/memory cũ trở thành hidden authority                                 | Empty task/memory start; import fact-by-fact only                         |
| Skill/rule bundle phình không có consumer                                 | Six-skill starting bundle; task-signal gate for additions                 |
| Rollback tạo split-brain                                                  | Pre-first-transaction rollback only; afterwards restore/fix-forward       |

## 8. Owner gates còn cần chốt khi thực thi

| Gate                                                      | Thời điểm            |
| --------------------------------------------------------- | -------------------- |
| Exact source commit                                       | Trước G0 hoàn tất    |
| GitHub organization, private visibility và ruleset        | Trước G1             |
| Exact Supabase candidate ref, region, plan và backup tier | Trước G5             |
| Vercel candidate project/domain                           | Trong G5             |
| RPO/RTO và retention window của old project               | Trước G7             |
| Provider test invoice và cutover window                   | Trước G6/G7          |
| First live transaction approval                           | Ngay tại G7          |
| Archive/delete old repo/project                           | Sau retention window |

Các gate này không cho phép agent tự suy đoán giá trị. Chưa có exact target ref
thì toàn bộ cloud database write path phải tiếp tục fail closed.

## 9. Definition of Done

Greenfield program chỉ hoàn tất khi:

- repo `comtammatu-greenfield` độc lập, private, có một bootstrap root và không
  mang fork parent/history cũ;
- root tree không chứa `docs/plan/decisions.md`, source `tasks/*`, current
  migration chain, compatibility artifact hoặc legacy directory; task tracker
  nếu có là file Greenfield được generate mới;
- docs, rules, guards, memory, skills và workflow có đúng một authority map;
- old refs chỉ tồn tại ở deny/negative-test surface;
- hardcode inventory không còn finding chưa có owner/action;
- full CI, target migration replay, SQL/RLS tests, typecheck, lint, test và build
  đều đạt;
- Production Candidate có backup/restore proof, scoped identities và không có
  operational data cũ;
- Branch Workspace, Company/Tenant/sites, Effective Configuration, HĐĐT Doanh
  nghiệp, Kho Tổng, Bếp Trung Tâm và Workforce đạt exit evidence;
- old Production không còn writer trước giao dịch live đầu tiên;
- controlled live transaction và reconciliation đạt;
- repo/project cũ ở trạng thái read-only theo retention decision;
- tài liệu kế hoạch này được xóa sau khi stable truth đã nằm ở specs, modules,
  runbooks và ADR hiện hành.

## 10. Lát cắt thực thi đầu tiên

Khi owner yêu cầu bắt đầu fork, chỉ mở G0:

1. xác định exact source commit;
2. chứng minh worktree/CI/secret scan sạch;
3. tạo archive, checksum, positive allowlist và legacy denylist;
4. chứng minh `decisions.md`, source `tasks/*` và current migrations không nằm
   trong extraction set;
5. trình owner bootstrap evidence;
6. dừng trước hành động tạo repo nếu GitHub organization, visibility hoặc
   ruleset chưa được chốt.

Không tạo Supabase Project, Vercel project, provider credential hay branch-agent
binding trong lát cắt đầu tiên.
