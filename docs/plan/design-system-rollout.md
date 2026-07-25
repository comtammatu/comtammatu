# Chương trình Má Tư Design System — P0–P7

> Trạng thái: đang triển khai
> Nhánh hiện hành: `main`
> Workspace: `/Users/luongthebinh/Downloads/comtammatu`
> Phạm vi: Design System, accessibility, CSS/motion, PWA và rollout giao diện; không thay đổi database, ACL, RPC, route authority hoặc business flow.

## 1. Mục tiêu và thứ tự bắt buộc

Chương trình tạo một baseline duy nhất cho Má Tư Design System, sau đó áp dụng trực tiếp vào toàn bộ route theo từng nhóm công việc. P6 là phần bắt buộc, không phải việc tối ưu tùy chọn sau khi foundation hoàn thành.

```text
P0 Preflight
→ P1 Baseline Audit
→ P2 Design System Foundation
→ P3 Accessibility
→ P4 Tailwind/CSS/Motion
→ P5 Native-quality PWA
→ P6 Screen & Layout Rollout
→ P7 Release & Self-Improving
```

Quyền sở hữu lớp được khóa như sau:

```text
Base UI behavior
→ @comtammatu/ui styled primitives
→ app/workflow adapters
→ route/domain UI
```

- Base UI sở hữu behavior và accessibility primitive.
- Má Tư sở hữu visual language, token và semantic role.
- Shadcn chỉ là nguồn đối chiếu anatomy, state và API; không là runtime authority.
- `packages/ui/src/styles/globals.css` tiếp tục là shared CSS SSOT.
- Không tạo component library, theme root hoặc route stylesheet cạnh tranh.
- `Field` và `FormField` là contract hiện hành, không thuộc legacy cleanup.

## 2. Trạng thái chương trình

| Pha | Trạng thái | Exit gate chính |
| --- | --- | --- |
| P0 | Hoàn tất | Worktree sạch, skills xanh, CodeGraph mới, kế hoạch sống sẵn sàng |
| P1 | Hoàn tất | Baseline định lượng, debt được phân loại, Decision Brief C0 |
| P2 | Hoàn tất source-level; C1 đã reconciliation | Authority, token, component contract, docs và guards đồng bộ |
| P3 | Public runtime pass; authenticated/AT proof còn mở | WCAG 2.2 AA trên representative surfaces và shared primitives |
| P4 | Source convergence đã implement; runtime proof còn mở | Raw/custom CSS chỉ còn exception hợp lệ; motion có reduced-motion proof |
| P5 | Desktop Chrome manifest, update và offline boundary pass; real install/standalone device proof còn mở | Install/update/offline đúng boundary trên môi trường production-like |
| P6 | Hoàn tất source/static rollout cho 17 tranche; 123/123 page đã qua Advisor Gate; `/offline` và `/access-denied` đạt browser-runtime final | Mọi page được keep/tune/rebuild và đã xử lý theo route family |
| P7 | Self-improving loop, final P6 external reconciliation và full repository gate đã xanh; authenticated/AT/install proof còn mở | Full gates, evidence reconciliation và completion report |

Trạng thái chỉ chuyển khi evidence của exit gate đã có. “Code đã viết”, “review sạch”, “gate xanh”, “browser verified”, “runtime proven”, “committed”, “pushed”, “deployed” và “Production proven” là các sự thật độc lập.

## 3. P0 — Preflight và bảo vệ workspace

- Dùng worktree sạch từ `main` trên `codex/design-system-rollout`.
- Không sửa, stash, reset hoặc tái sử dụng WIP ở worktree chính.
- Chạy `codegraph index .` và `corepack pnpm agent:skills` trước source audit.
- Đọc engineering, skills, UI, workflow và orchestration rules.
- Đồng bộ outcome hiện hành vào `tasks/todo.md`.
- Không commit, push, PR hoặc deploy nếu owner chưa yêu cầu.

Evidence cần giữ:

- Đường dẫn worktree, branch và HEAD gốc.
- Kết quả `agent:skills`.
- Kết quả `codegraph status .` sau index.
- `git status --short` của worktree sạch trước thay đổi.

## 4. P1 — Baseline Audit

### 4.1 Design System inventory

- Kiểm kê token, typography, color, spacing, density, radius, elevation, effects và motion.
- Kiểm kê export/consumer của `@comtammatu/ui` bằng registry và source graph.
- Phân lớp primitive, semantic component, app adapter và route-local wrapper.
- Kiểm tra direct Base UI import, primitive escape và competing visual layer.
- Xác nhận mọi page có route family, archetype và exemplar.

### 4.2 Legacy/raw CSS inventory

Mỗi finding phải thuộc đúng một nhóm:

1. Có thể thay bằng semantic token/utility.
2. Dynamic runtime style hợp lệ như chart, geometry hoặc progress.
3. Browser, print, PWA hoặc safe-area exception có owner rõ.
4. Transitional alias cần migrate toàn bộ consumer rồi xóa.

Không xóa theo grep mù và không đổi tên chỉ để trông mới hơn. Baseline phải ghi riêng số lượng biến legacy, raw color, arbitrary layout/effect, inline style, custom keyframe và CSS file ngoài SSOT.

### 4.3 Accessibility và responsive baseline

- Audit landmark, heading, label/name, help/error relationship, focus, keyboard và live region.
- Audit contrast, touch target, zoom, reduced motion và horizontal overflow.
- Dùng matrix `320`, `390`, `768`, `1024`, `1440` với state loading, empty, error, blocked, permission, offline và destructive khi áp dụng.

### 4.4 PWA baseline

- Kiểm tra manifest identity/scope, service worker, install, update và offline recovery.
- Tách contract root, operator, POS, KDS, Runner và Self-order.
- Giữ Self-order và dữ liệu authenticated nhạy cảm ở network-only boundary.

### 4.5 Checkpoint C0

Chạy read-only song song, prompt bằng tiếng Anh và yêu cầu evidence `path:line`:

- `claude`: architecture, visual hierarchy, accessibility.
- `agy`: docs/rules, governance, debt classification, rollout risk.
- `cursor-agent`: source graph, blast radius, reuse và test gaps.

Codex kiểm chứng từng finding với source hiện tại, loại finding không có evidence và phát hành một Baseline Decision Brief duy nhất.

## 5. P2 — Design System Foundation

### 5.1 Token và visual roles

- Chuẩn hóa semantic color, typography, spacing/density, radius/elevation, border/focus/status, safe-area/viewport và motion roles.
- Migrate consumer trước khi xóa transitional alias.
- Giữ contrast ở cả light và warm-dark theme.

### 5.2 Component contracts

Chuẩn hóa theo nhóm:

- Input: Button, Link, Input, Textarea, Select, Checkbox, Radio, Switch.
- Form anatomy: Field, FormField, FieldGroup, help/error/validation.
- Overlay/composite: Dialog, Sheet, Popover, Menu, Tooltip, Tabs, Combobox.
- Data: Table, DataTable, list, board, mobile-card composition.
- State: loading, empty, error, not-found, blocked, permission, offline.
- App semantic: AppPage, AppSection, AppToolbar, KpiCard, StatusBadge và operational components.

`Card` chỉ là frame mỏng; không tạo god-component bằng variants. Public API thay đổi phải migrate consumer trong cùng wave.

### 5.3 Docs, registry và guards

- Đồng bộ `docs/spec/design-system.md`, `docs/modules/ui.md`, page archetypes và component registry.
- Chỉ cập nhật agent rules khi source-of-truth hoặc routing thật sự đổi.
- Xóa policy trùng lặp; không tạo documentation tree chỉ dành cho agent.
- Thêm ratchet cho debt đo được, ưu tiên blocking-zero hoặc non-growth guard có outcome rõ.

### 5.4 Checkpoint C1

Ba external agent review foundation diff ở chế độ read-only. Codex kiểm chứng, sửa finding hợp lệ và chạy lại focused/full gates theo risk.

## 6. P3 — Accessibility Program

Mục tiêu là WCAG 2.2 AA:

- Bổ sung `@axe-core/playwright` làm dev dependency của web app.
- Chuẩn hóa landmarks, heading order, visible labels, accessible names, help/error links, focus visibility/trap/restore, keyboard composite controls và live regions.
- Không dùng màu làm tín hiệu duy nhất.
- Contrast: text thường `4.5:1`, large text `3:1`, focus/non-text control `3:1`.
- Touch target tối thiểu `44px`; operational control ưu tiên `48px`.
- Verify keyboard-only, zoom 200%, reduced motion và representative axe runs.
- VoiceOver/Safari và TalkBack/Android là manual evidence cho critical paths, không được giả lập bằng source test.

Exit: axe không có serious/critical violation trên representative surfaces; shared primitives đạt keyboard/focus contract; critical flows có assistive-technology evidence hoặc blocker môi trường được ghi rõ.

## 7. P4 — Tailwind CSS, raw CSS và Motion

- Tailwind CSS 4 là mặc định cho layout/visual composition.
- Raw static CSS chuyển về semantic token/utility khi không phải exception hợp lệ.
- Inline style chỉ giữ cho runtime geometry/chart/progress hoặc boundary được ghi rõ.
- Không thêm animation framework, decorative loop hoặc `transition-all`.
- Motion chỉ phục vụ state transition, hierarchy hoặc direct feedback và luôn có reduced-motion behavior.
- Chỉ giảm debt baseline sau khi consumer đã migrate và tests/audit xanh.

## 8. P5 — Native-quality PWA

Áp dụng trực tiếp Apple HIG, Liquid Glass boundary, Material Design 3, Android adaptive layout, WCAG 2.2 và web-platform best practices.

- Standalone chrome, safe area, touch feedback, keyboard/viewport recovery.
- Adaptive bottom navigation, sidebar và two-pane layout nhưng giữ cùng IA.
- Không phụ thuộc hover, không disable zoom, không đẩy critical action khỏi thumb reach.
- Liquid Glass chỉ dùng cho transient navigation/overlay/chrome; không phủ data table, form hoặc operational workspace.
- Có contrast fallback và reduced-transparency behavior.
- Verify manifest, scope, install, update, offline recovery, asset reachability và network-only boundaries.

Ngoài scope: Capacitor, Flutter, Swift/Kotlin rewrite, native wrapper và hardware bridge chưa có nhu cầu thật.

## 9. P6 — Rollout Layout và Interface UI

Mỗi route phải có trạng thái `keep`, `tune` hoặc `rebuild`; `keep` cũng cần evidence. Thứ tự rollout:

1. Global chrome và shared state frames.
2. POS.
3. KDS.
4. Runner.
5. Self-order.
6. Branch runtime: landing, shift/attendance, inventory, staff, management.
7. Owner operations: Inventory, Finance, Nhân sự & tiền lương, Reports, Menu/configuration, Settings/admin.
8. Public/system: login, QR/public, denied, offline/error, install/update.

Hot paths giữ information hierarchy:

```text
Next action hoặc live queue
→ current context
→ primary work content
→ secondary data
```

Không biến POS/KDS/Runner/Self-order thành dashboard-card grid. Desktop được tăng density nhưng không đổi IA so với mobile.

### Quy trình mỗi route-family tranche

1. Ghi UI Advisor Gate.
2. Khóa actor, job, primary action và recovery.
3. Chọn archetype, exemplar và shared components.
4. Thiết kế state loading/empty/error/success/partial/blocked/permission/offline áp dụng được.
5. Implement layout và interaction ở shared owner cao nhất hợp lý.
6. Verify accessibility và viewport matrix.
7. Chạy focused tests, typecheck, lint và build theo risk.
8. Cập nhật contract/regression chỉ khi finding có tính dùng chung.
9. Chuyển tự động sang tranche kế tiếp.

Checkpoint C2 chạy sau operational hot paths và sau toàn bộ P6; ba agent giữ cùng vai trò review như C0, Codex là người chốt.

### P6.0a — UI Advisor Gate: offline system state

- Actor: mọi người dùng khi mất kết nối.
- Job: hiểu trạng thái mạng, biết dữ liệu chưa tải được và thử lại khi kết nối phục hồi.
- Archetype: `GATE/AUTH`; shared composition: `AppPage`, `AppEmptyState`, `Button`.
- Primary action: `Thử lại`; không có secondary action cạnh tranh.
- Disposition: `tune` vì runtime contract, service-worker fallback, theme hydration và contrast đã được chỉnh ở shared owner; visual hierarchy hiện tại được giữ.
- Evidence: local production build, Axe không có serious/critical violation tại `390×844` và `1440×900`, operator offline fallback hoạt động, POS/Self-order vẫn `NetworkOnly`.

### P6.0b — UI Advisor Gate: global recovery chrome

- Actor: mọi vai trò khi điều hướng khỏi detail/document workflow hoặc phục hồi từ root error.
- Job: quay lại context trước đó hoặc thử lại mà không phải nhắm vào control quá nhỏ.
- Shared owner: `AppBackLink` và root `global-error`; không tạo route-local back button.
- Primary action: back hoặc retry theo đúng state, không thêm navigation cạnh tranh.
- Disposition: năm Inventory detail/document route chuyển sang `tune/implemented-static/open`; chưa final vì worktree không có authenticated browser target.
- Implementation: `AppBackLink` compose `Button` với `touch`/`icon-touch`, kế thừa focus keyline và có fallback accessible name; raw global-error retry giữ hit target tối thiểu `44px`.

### P6.1a — UI Advisor Gate: POS shell và loading state

- Actor: thu ngân và Branch Manager đang mở ca, chọn bàn/món, kiểm tra bill và thu tiền.
- Job: nhìn thấy current order và hành động kế tiếp ngay cả khi session/menu đang hydrate; PWA install/update/offline banner không được làm tràn hoặc cắt workspace.
- Archetype: `BOARD`; hierarchy giữ `next action/current order → menu/table context → bill → secondary session data`, không đổi thành dashboard-card grid.
- Shared owner: outer POS layout sở hữu viewport; `PosPageSkeleton` chỉ sở hữu phần flex còn lại bên dưới PWA toolbar.
- Primary action: tiếp tục tác vụ bán hàng sau loading; tranche này không thay đổi data, action, breakpoint, route authority hoặc business flow.
- Disposition: `tune/implemented-static/open`; chưa final vì không có authenticated test target/session trong worktree.
- Implementation: bỏ nested `h-dvh`, truyền flex ownership qua wrapper Boneyard và cho pane menu co giãn bằng `min-w-0 flex-1`; giữ breakpoint hai pane tại `xl`.

### P6.1b — UI Advisor Gate: KDS live queue

- Actor: nhân sự bếp theo dõi queue realtime và Branch Manager khi cần hỗ trợ vận hành.
- Job: nhìn thấy ticket cần xử lý tiếp theo, current station/filter context và hoàn tất món mà không bị cắt board khi PWA toolbar xuất hiện.
- Archetype: `BOARD`; hierarchy giữ `live queue → station/filter context → ticket work → history/settings`, không đổi thành dashboard-card grid.
- Shared owner: KDS layout sở hữu viewport; board, loading và error state sở hữu phần flex còn lại.
- Primary action: đánh dấu ticket sẵn sàng; history, audio, fullscreen và theme tiếp tục là secondary controls.
- Disposition: `tune/implemented-static/open`; chưa final vì thiếu authenticated KDS session và viewport runtime evidence.
- Implementation: bỏ nested `h-dvh` khỏi `KdsBoard`, cho loading/error state fill remaining workspace; không đổi realtime, filtering, permission, mutation hoặc breakpoint.

### P6.1c — UI Advisor Gate: Runner calling board

- Actor: nhân sự phục vụ theo dõi thứ tự món cần mang ra và khách nhìn màn gọi số tại chi nhánh.
- Job: thấy đơn tiếp theo, số món, trạng thái và thời gian chờ trong một board ổn định khi PWA toolbar xuất hiện.
- Archetype: `BOARD`; hierarchy giữ `next order → current queue → overflow queue → secondary Wi-Fi footer`.
- Shared owner: Runner layout sở hữu viewport; queue, inline error, loading và route error fill phần flex còn lại.
- Primary action: Runner là màn quan sát/call board; không thêm action, dashboard card hoặc interaction không thuộc flow.
- Disposition: `tune/implemented-static/open`; chưa final vì thiếu authenticated/standalone Runner runtime evidence.
- Implementation: bỏ nested `h-dvh` khỏi queue và inline error, chuẩn hóa loading/error boundary theo remaining workspace; giữ polling, queue ordering, light-only contract và responsive row limits.

### P6.1d — UI Advisor Gate: Self-order guest workflow

- Actor: khách tại bàn quét QR để xem thực đơn, chọn món, kiểm tra bill, gửi yêu cầu và thanh toán.
- Job: luôn thấy current table/menu context và hành động giỏ hàng kế tiếp mà không bị double safe-area hoặc nested viewport cắt nội dung.
- Archetype: `WORKFLOW`; hierarchy giữ `current table/menu → menu content → cart/bill action → payment/recovery state`, không đổi thành dashboard-card grid.
- Shared owner: `AppPage mobile` chỉ giới hạn workflow width, không tự dự trữ fixed chrome; Self-order owner tự cung cấp content clearance và safe-area cho Cart CTA.
- Primary action: mở giỏ hàng hoặc tiếp tục trạng thái bill/payment hiện tại; tranche này không đổi request/payment, data, route authority hoặc business flow.
- Disposition: `tune/implemented-static/open`; unavailable state có public browser/Axe proof, active ordering/payment flow còn mở vì worktree không có registered environment và QR token hợp lệ.
- Implementation: bỏ implicit `pb-28`, bỏ inner `h-dvh` khỏi active workflow, cho unavailable/completed/not-found state fill viewport qua flex ownership; giữ `pb-44` và `workflow-safe-pb` tại action owner.

### P6.2a — UI Advisor Gate: Branch landing, shift và shared loading

- Actor: nhân sự chi nhánh và Branch Manager bắt đầu ca, xem queue, mở station hoặc đi vào công việc nhân sự/kho tiếp theo.
- Job: thấy `today status → pending queue → station/primary work → support` trước khi drill down; loading không được dựng thêm page shell bên trong operator shell.
- Archetype: Branch home `LANDING`, shift wrapper `EMBED-WRAPPER`; bottom navigation giữ các daily job family, management ở secondary navigation.
- Primary action: thay đổi theo current work state (chấm công, tiếp tục checklist, mở station hoặc xử lý queue); không thêm dashboard KPI/card grid.
- Disposition: landing và shift composition giữ `keep/source-baseline/open` vì hierarchy, touch control và recovery đã đúng; shared loading state được `tune/implemented-static` nhưng không nâng các page chưa audit riêng thành final.
- Implementation: cả 7 operator loading boundary dùng `PageSkeleton bare`, tái sử dụng `AppPage` do layout sở hữu và loại bỏ nested width/padding shell; regression khóa toàn route group.

### P6.2b — UI Advisor Gate: Branch on-hand list

- Actor: Branch Manager hoặc nhân sự kho tra cứu tồn hiện tại và mở đúng nguyên liệu để xem chi tiết.
- Job: quét nhanh tên, loại/SKU, mức tồn và cảnh báo trên điện thoại; filter và nhận hàng vẫn là context/exception action, không cạnh tranh với row navigation.
- Archetype: `LIST`; hierarchy giữ `attention exception → search/filter → dense stock list → ingredient detail`.
- Primary action: chạm một dòng để mở chi tiết nguyên liệu; không thêm quick mutation vào màn tra cứu read-only.
- Disposition: `tune/implemented-static/open`; còn thiếu authenticated touch/scroll proof tại matrix đã định.
- Implementation: thay card-row 64px có khoảng cách bằng semantic list 44px, separator, không gap và không outer card lặp; giữ accessible `list/listitem`, risk badge, quantity, filter states và GRN action ownership.

### P6.2c — UI Advisor Gate: Branch inventory entry workflows

- Actor: Branch Manager hoặc nhân sự kho nhận hàng, mở/tiếp tục kiểm kê và tra cứu tiêu hao trong đúng chi nhánh.
- Job: đi từ stock landing đến đúng nghiệp vụ; trong mỗi flow thấy action kế tiếp, trạng thái chứng từ, filter và recovery state mà không bị Owner dashboard chen vào.
- Archetype: stock root `LANDING`; GRN/stocktake/consumption `LIST` dẫn vào `DOC-WORKFLOW` hoặc typed detail.
- Primary action: stock root ưu tiên tồn kho, nhận hàng và sản xuất; GRN ưu tiên tạo/tiếp tục phiếu, stocktake ưu tiên mở/tiếp tục đợt, consumption ưu tiên recorded truth rồi mới tới manual slip.
- Disposition: stock landing, stocktake và consumption giữ `keep/source-baseline/open`; GRN `tune/implemented-static/open` vì search và status filter cần accessible name ổn định. Runtime vẫn mở vì thiếu authenticated inventory target.
- Implementation: thêm `aria-label` cho GRN search và status trigger tại route owner, giữ 80px row cho draft/receipt có nhiều metadata và destructive action; không áp density 44px của read-only on-hand lên document workflows.

### P6.2d — UI Advisor Gate: Branch Team workspace

- Actor: Branch Manager theo dõi người đang làm, ca cần xử lý, kiểm kê chưa nộp và mở hồ sơ tóm tắt của nhân viên.
- Job: thấy exception/action queue trước, lọc theo trạng thái, rồi drill down vào drawer để xử lý checkout/count hoặc liên hệ nhân viên.
- Archetype: `BOARD` cho live team và `LIST`/directory cho members, cùng một touch tab workspace; không tạo module tài khoản/quyền tại Branch.
- Primary action: board tự ưu tiên `needs_action`, sau đó `working`, rồi `all`; action phê duyệt chỉ xuất hiện trong detail drawer theo permission hiện hữu.
- Disposition: `keep/source-baseline/open`; source đã có touch tabs, overflow-safe filter chips, grouped mobile cards, scroll-owned drawer, empty/error/no-access states và named controls. Chưa final vì chưa có authenticated phone/tablet evidence.
- Implementation: không đổi source sau Advisor Gate; giữ nguyên ACL, permission probes, attendance/count actions và Owner-vs-Branch authority.

### P6.2e — UI Advisor Gate: Branch management surfaces

- Actor: Branch Manager kiểm tra order gần đây, ca POS, hạn mức món và cấu hình floor/KDS/printer tại đúng chi nhánh.
- Job: xử lý live exception trước, rồi drill down vào chứng từ hoặc cấu hình; không kéo Owner analytics hay tenant-wide administration vào Branch shell.
- Archetype: orders và POS sessions `LIST/DETAIL`; menu limits `LIST` có swipe/drawer; settings root `LANDING` dẫn vào các `SETTINGS-PANEL` dùng shared embedded clients.
- Primary action: active orders, session variance, sold-out/disabled menu item hoặc setup control tương ứng; action mutation nằm trong typed sheet/drawer/form thay vì card dashboard.
- Disposition: `keep/source-baseline/open`; source đã có touch tabs/rows, exception-first sorting, accessible search/fields, one-scroll drawers, permission-filtered settings links và embedded shared forms. Chưa final vì cần authenticated Branch Manager runtime.
- Implementation: không đổi source sau Advisor Gate; giữ POS/KDS/Printer/Table clients ở shared settings owner và giữ authority hiện hữu.

### P6.3a — UI Advisor Gate: Owner Inventory

- Actor: Owner giám sát tồn, nhận hàng, luân chuyển, kiểm kê, tiêu hao và master data xuyên chi nhánh.
- Job: thấy task/exception trước, đi vào đúng operational flow, sau đó mới đọc KPI và tiến độ; Branch vẫn là filter/scope chứ không tạo IA khác.
- Archetype: inventory root `DASHBOARD`; các queue `LIST`, chứng từ `DOC-WORKFLOW`, chi tiết `DETAIL`, reports `REPORT`, cấu hình `SETTINGS-PANEL`.
- Primary action: task/alert đang mở và flow card tương ứng; KPI chỉ drill down khi có direct data contract.
- Disposition: `keep/source-baseline/open`; root đã có `tasks/priority alerts → main flows → compact KPIs → active work`, subroutes dùng shared list/detail/form contracts. Chưa final vì thiếu authenticated Owner matrix.
- Implementation: không đổi source; giữ route paths, scope, query và inventory authority hiện hữu.

### P6.3b — UI Advisor Gate: Owner Finance

- Actor: Owner theo dõi sức khỏe tài chính, dòng tiền, đối soát, chi phí, doanh thu, HĐĐT và công nợ nhà cung cấp.
- Job: chọn kỳ/phạm vi, đọc bốn KPI có direct contract, kiểm tra quỹ hiện tại rồi xử lý exception queue; detail/report không đổi IA theo viewport.
- Archetype: finance root `DASHBOARD`; revenue/food-cost `REPORT`; bank/expenses/invoices/supplier invoices `LIST/DETAIL`.
- Primary action: drill down từ KPI hoặc exception có `href`; không promote metric suy diễn thành KPI và không đưa settlement action vào decorative card.
- Disposition: `keep/source-baseline/open`; regression hiện hữu khóa KPI order, direct-contract set, DataTable/mobile-card composition, fail-closed initial state và shared filters. Chưa final vì thiếu authenticated Finance runtime.
- Implementation: không đổi source; giữ nguyên payment, SePay, HĐĐT và supplier-payment business authority.

### P6.3c — UI Advisor Gate: Owner Nhân sự & tiền lương

- Actor: Owner quản lý hồ sơ nhân sự, chấm công, lương và deep-link vào tài khoản/quyền khi cần.
- Job: lọc danh sách trước, thao tác trên employee/payroll row, và mở quyền từ secondary action; không biến “Tài khoản & quyền” thành module nghiệp vụ ngang hàng.
- Archetype: HR root/staff/attendance/payroll `LIST`; payroll period và permissions `DETAIL`; HR setup `SETTINGS-PANEL`.
- Primary action: thêm nhân viên hoặc xử lý row/period hiện tại; account access là secondary header/deep navigation.
- Disposition: `keep/source-baseline/open`; source dùng `AppPage`, responsive DataTable/mobile cards, touch header actions, shared status domains và typed dialogs. Chưa final vì thiếu authenticated HR runtime.
- Implementation: không đổi source, ACL, RPC hoặc payroll flow.

### P6.3d — UI Advisor Gate: Owner reports, menu, settings và administration

- Actor: Owner cấu hình menu, điểm vận hành, tenant/payment/printing và xem các report/detail hỗ trợ quyết định.
- Job: list/filter trước, mở form/detail đúng phạm vi, và phân biệt empty data với load failure.
- Archetype: Menu và Branches `LIST`; Settings `LANDING/SETTINGS-PANEL`; print jobs `LIST`; report surfaces `REPORT`.
- Primary action: add/edit entity hoặc xử lý monitor exception; settings landing chỉ dẫn đến nhóm cấu hình có permission.
- Disposition: Menu/Settings/reports giữ `keep/source-baseline/open`; `/branches` chuyển `tune/implemented-static/open` vì trước đây query error bị hiển thị như danh sách rỗng.
- Implementation: `/branches` bắt Supabase error và render shared `AppEmptyState mode="error"` với copy tập trung; static regression khóa distinction failure-vs-empty, không đổi branch CRUD hay authority.

### P6.4 — UI Advisor Gate: Public và system surfaces

- Actor: nhân viên chưa đăng nhập, người dùng bị chặn quyền, operator mất mạng và khách Self-order theo QR.
- Job: hiểu ngay trạng thái hiện tại, có một recovery action rõ ràng và không lộ/chuyển nhầm dữ liệu giữa public, authenticated hoặc NetworkOnly boundary.
- Archetype: login/access-denied/offline `GATE/AUTH`; root not-found/error là shared recovery frame; Self-order `PUBLIC-WORKFLOW`.
- Primary action: đăng nhập, trở về route mặc định/đăng xuất, thử lại khi có mạng hoặc tiếp tục guest workflow; tất cả control quan trọng dùng named touch size.
- Disposition: `/offline` và `/access-denied` đạt `tune/browser-runtime/final`; login `tune/browser-runtime/open` vì visual/Axe đã pass nhưng auth success cần registered target; Self-order active flow giữ `tune/implemented-static/open`, unavailable state đã có public runtime proof.
- Implementation: offline retry chuyển sang `size="touch"`; login bỏ decorative infinite mascot loop; access-denied dùng semantic Badge variants thay route-local tone classes; Axe pass ở `390×844` và `1440×900`, offline retry đo ≥44px. Login runtime dùng local-only Supabase placeholder để render proxy path, không nối Cloud database.

## 10. P7 — Release Gate và Self-Improving Loop

Mỗi tranche chạy tối đa hai vòng:

```text
Observe
→ Measure
→ Challenge
→ Fix tại shared owner cao nhất
→ Verify
→ Encode durable learning
```

Theo dõi:

- Legacy token/alias count.
- Raw CSS/inline-style exception count.
- Direct primitive escape và duplicate wrapper count.
- Page-archetype và keep/tune/rebuild coverage.
- Axe, overflow, responsive, motion và PWA failures.
- POS/KDS/Self-order hot-path performance.

Chỉ promote thành shared component khi có semantic role rõ hoặc nhiều consumer thật.

Mỗi wave chạy focused tests, `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm build` và `codegraph index .` theo risk. Toàn chương trình chạy `corepack pnpm verify`, authenticated browser matrix, production-like PWA proof, VoiceOver/TalkBack proof, `git diff --check` và reconciliation cuối C0/C1/C2.

## 11. Evidence ledger

| Mốc | Evidence | Trạng thái/ghi chú |
| --- | --- | --- |
| P0 worktree | Branch/worktree/status | Rollout được cô lập trên `codex/design-system-rollout`, sau đó fast-forward vào local `main`; worktree/branch rollout đã được gỡ. Chưa push/deploy |
| P0 base drift | Read-only Git comparison + rebase | Worktree được tạo từ `b17d8f1`; trước Integration Gate, `main` tiến thêm 8 commit tới `df1b37c68`. Rollout được rebase không conflict và 45 focused regression đều pass |
| P0 worktree convergence | Git inventory + focused reconciliation | Worktree foundation cũ có 42 path WIP (41 tracked + 1 untracked). Chỉ chuyển các contract độc nhất: skip-link focus target, compact Sheet sizing, shared Branch detail grid và named Drawer max-height; CSS/docs/task đã được baseline mới bao phủ không bị nhân đôi. Toàn bộ WIP cũ được giữ tại stash `9882c26d32c78e9fb36fee70294a06fbed7cd7ce`; worktree và branch `codex/design-system-foundation` đã được gỡ an toàn |
| P0 skills | `corepack pnpm agent:skills` | Đã vượt gate |
| P0 graph | `codegraph index .` + status | Đã làm mới sau `codegraph init` cục bộ |
| P1 route census | `corepack pnpm audit:ui-components` | 123/123 page được phân loại; không thiếu/stale |
| P1 UI guards | `corepack pnpm lint:ui-contract` | Đã vượt baseline hiện tại |
| P1 Shadcn | `shadcn info -c apps/web` | Không có Shadcn runtime config/component; giữ reference-only |
| P1 CSS | Source audit | Một shared CSS file; chưa có biến tên legacy/old/v1/compat |
| P1 Base UI | Source audit | App không import trực tiếp; imports nằm trong `packages/ui` |
| C0 | Claude/Agy/Cursor findings | Claude và Cursor có evidence dùng được; Agy không có output do auth/credit/permission boundary; Codex đã reconciliation |
| P2 Input contract | Source + preventive guards | Xóa public compatibility alias và 8 consumer prop; `controlSize` là visual density API duy nhất |
| P3 axe setup | Playwright list + runtime | 7 representative specs; `/login`, `/offline`, `/access-denied` và Self-order unavailable đã pass Axe tại 390×844 và 1440×900 trên local production server; Branch landing, checkout approvals và Owner inventory còn mở vì worktree không có `.env.test.local`, auth storage và Vercel Preview đang bị tắt |
| P4 CSS convergence | Source audit + UI contract | Xóa 3 utility không consumer; legacy variable name giữ 0 và có preventive ratchet |
| P5 manifest/update/offline | Static tests + local production browser | Serwist ghi 257 precache URLs ở full gate mới nhất; manifest không có parse error; installability chỉ báo CLI incognito; hai SW khác hash kích hoạt `controllerchange`; offline `/br/1` render fallback sau update, còn `/br/1/pos` và `/q/*` vẫn NetworkOnly |
| P6 tranche 1 | Focused/full static tests | Tune shared checkout-approval presenter; không đổi action, loader, authority hoặc business flow |
| P6 disposition | UI audit | 123/123 route có disposition: 107 `keep/source-baseline/open`, 13 `tune/implemented-static/open`, 1 `tune/browser-runtime/open`, 2 `tune/browser-runtime/final`; protected final tiếp tục bị guard yêu cầu authenticated runtime |
| P6 offline accessibility | Axe + theme runtime | `/offline` pass ở mobile/desktop sau khi loại bỏ transition `light → night` trong hydration và retune night primary; route đạt `tune/browser-runtime/final` |
| P6 global recovery chrome | Static contract + UI audit | `AppBackLink` dùng named touch Button sizes/focus keyline và icon fallback name; root error retry đạt `44px`; 5 route consumer được ghi `tune/implemented-static/open` |
| P6 POS shell | Static responsive contract + UI audit | POS skeleton không còn nested viewport owner; Boneyard wrapper sở hữu column/background fallback và truyền `min-h-0`/`flex-1`, menu pane giữ breakpoint `xl`; route được ghi `tune/implemented-static/open` |
| P6 KDS queue | Focused tests + static responsive contract | Layout là viewport owner duy nhất; board/loading/error fill remaining workspace; 22 focused tests, web typecheck và UI contract xanh; route được ghi `tune/implemented-static/open` |
| P6 Runner board | Focused tests + static responsive contract | Queue/inline error/loading/route error không còn nested viewport; polling, IA và light-only contract giữ nguyên; 18 focused tests, web typecheck và UI contract xanh |
| P6 Self-order workflow | Static contract + public browser/Axe | `AppPage mobile` không còn implicit bottom clearance; active shell có một viewport owner; unavailable/not-found state fill viewport. Public unavailable state pass Axe ở 2 viewport và không overflow tại 320/390/768/1024/1440; active flow còn mở vì thiếu registered env/token |
| P6 Branch shell/loading | Source Advisor Gate + focused tests | Branch home và shift hierarchy được giữ; 7 operator loading boundary chuyển sang `PageSkeleton bare`, không còn nested `AppPage`; web tests, typecheck và UI contract xanh |
| P6 Branch on-hand | Static responsive contract + UI audit | Dense 44px separator list giữ accessible `list/listitem`, filter có accessible name, risk badge và detail navigation; 28 focused tests, web typecheck và UI contract xanh; route được ghi `tune/implemented-static/open` |
| P6 Branch inventory workflows | Source Advisor Gate + web tests + UI audit | Stock landing, stocktake và consumption giữ đúng operational hierarchy; GRN search/status có accessible name mới và route được ghi `tune/implemented-static/open`; web tests 1205 pass/32 skip, 123/123 page vẫn được phân loại |
| P6 Branch Team | Source Advisor Gate | Board ưu tiên exception queue, Team/Members dùng touch tabs và scroll-owned detail drawer; ACL/action không đổi; giữ `keep/source-baseline/open` chờ authenticated phone/tablet proof |
| P6 Branch management | Source Advisor Gate | Orders, POS sessions, menu limits và settings giữ đúng Branch-native hierarchy, typed detail/embedded forms và touch contracts; giữ `keep/source-baseline/open` chờ authenticated runtime |
| P6 Owner operations | Source Advisor Gates + focused tests + UI audit | Inventory/Finance/HR/Menu/Settings giữ IA và shared contracts có evidence; `/branches` phân biệt load failure với empty list; 30 focused tests, web typecheck và UI contract xanh; route census 123/123 |
| P6 public/system | Production build + Playwright/Axe | Login bỏ decorative loop, access-denied dùng semantic Badge, offline retry ≥44px; ba surface pass Axe mobile/desktop. `/offline` và `/access-denied` final; login giữ open vì chưa chứng minh auth success |
| Dependency security | `corepack pnpm deps:security` | Ba advisory `brace-expansion` mức high được xử lý bằng exact transitive patch override; advisory `sharp <0.35.0` được xử lý bằng exact `next>sharp: 0.35.3` override. Resolution dùng `sharp 0.35.3`/`libvips 8.18.3`; audit hiện không còn known vulnerability |
| Integration Gate | Rebase + focused regressions | Rollout được rebase lên `main` tại `df1b37c68` không conflict; 45 POS/Self-order/Inventory regressions pass trước full gate |
| Full repository gate | `REVIEW_TIER=T3 corepack pnpm verify` | Rerun sau Integration Gate exit `0`: security, dependency audit/boundaries, typecheck 7/7, toàn bộ lint/guards, production build 257 URLs và 4/4 package test tasks đều xanh; web 1220 pass/32 skip |
| C1 | Claude/Agy/Cursor review | Claude và Cursor có evidence dùng được; Agy không nhận được patch trong sandbox/stdin; Codex đã kiểm chứng, sửa 6 finding hợp lệ và bác finding sai bằng source/gates |
| C2 operational hot paths | Claude/Agy/Cursor review | Claude có một finding source dùng được và đã được sửa; Agy fail-closed vì sandbox từ chối `command`; Cursor reconnect rồi không phát output và được dừng sau bounded wait; không gán finding giả cho hai agent không có evidence |
| C2 final P6 | Claude/Agy/Cursor review | Cursor có 3 finding dùng được và đều đã reconciliation; Agy fail-closed vì sandbox từ chối `command`; Claude không phát review sau nhiều bounded wait và được dừng; full verify sau fix xanh |

Evidence ledger chỉ ghi kết quả đã quan sát. Không nâng source/static test thành browser, PWA runtime hoặc assistive-technology proof.

## 12. Self-Improving Loop — vòng 1

| Metric | Baseline | Sau fix | Ruling |
| --- | ---: | ---: | --- |
| Legacy CSS variable definitions | 0 | 0 | Giữ zero bằng guard có self-test |
| `Input.size` compatibility API/consumer props | 1 API + 8 props | 0 | `controlSize` là contract duy nhất; wrapper inheritance cũng bị guard |
| Custom utility không có consumer | 3 | 0 | Xóa tại CSS SSOT, không thay bằng alias mới |
| UI guard được phân loại | 80 | 85 | Bốn preventive guard và một disposition gate mới đều có owner/reporting |
| Representative axe specs | 0 | 7 | Bốn public surfaces pass runtime ở 2 viewport; 3 authenticated surfaces và AT proof vẫn là gate riêng |
| Runner manifest contract gap | 1 | 0 | POS/KDS/Runner có coverage đối xứng |
| Operator offline fallback runtime | `307 → /login`, sau đó `ERR_FAILED` | Fallback render đúng | Sửa public route boundary rồi explicit precache; không mở cache cho POS/Self-order |
| Route-family implementation | 0 tranche trong chương trình này | 17 tranche | Operational hot paths, Branch runtime, Owner operations và public/system surfaces đã qua Advisor Gate; hai public recovery routes đạt final; protected runtime vẫn open đúng evidence boundary |

Vòng 1 đã bắt được một consumer gián tiếp `FormattedNumberInput` mà census `<Input>` trực tiếp không thấy. Fix được đưa lên guard ở shared owner thay vì vá riêng build; forced typecheck và production build đều phải xanh trước khi chuyển tranche.

Vòng 2 của PWA bắt được source test suy luận sai rằng route dynamic sẽ tự vào precache. Browser production-like chứng minh hai lỗi nối tiếp: proxy chặn `/offline`, sau đó manifest không chứa fallback. Fix nằm tại hai owner hiện hữu (`isPublicAppPath` và Serwist manifest transform), kèm regression test, network-only runtime proof và service-worker update proof qua hai build khác hash.

Vòng P6.0 bắt đầu từ lỗi contrast `4.21:1` của primary button trong night theme. Lần retest tiếp tục bắt màu trung gian `light → night` chỉ đạt `1.03:1`: provider đã ghi đè bootstrap class sau hydration và bỏ qua `disableTransitionOnChange`. Fix được nâng lên semantic tokens, root theme input và shared `ThemeProvider`; Axe chỉ pass sau khi build production mới không còn trạng thái chuyển màu thiếu tương phản.

Vòng global chrome bị preventive guard chặn lần đầu vì raw `min-h-11` được đặt trực tiếp lên link action. Fix cuối compose `AppBackLink` qua `Button` và dùng hai named sizes hiện hữu, nên touch/focus behavior quay về đúng primitive owner thay vì mở exception trong guard.

Vòng POS phát hiện hai viewport owner lồng nhau: layout đã sở hữu `h-dvh` nhưng skeleton lại yêu cầu thêm một viewport, nên PWA banner có thể làm workspace vượt phần chiều cao còn lại. Fix đặt ownership ở layout, truyền flex qua wrapper Boneyard và khóa regression `h-dvh` không quay lại skeleton; không tạo component hoặc breakpoint mới.

Vòng KDS áp dụng trực tiếp learning từ POS và phát hiện board lặp lại nested viewport ownership. Fix mở rộng bằng loading/error state fill contract tại route owner, nhưng không khái quát thành component mới khi mới có hai operational consumers và semantics state vẫn khác nhau.

Vòng Runner xác nhận vấn đề thuộc operational shell pattern: queue và inline error cùng lồng viewport trong layout. Test cũ từng khóa chính class sai được sửa thành contract “layout sở hữu viewport, route state sở hữu remaining flex”; polling và public display semantics không thay đổi.

Vòng Self-order phát hiện `AppPage mobile` dự trữ `pb-28` ngầm trong khi Cart CTA đã tự sở hữu `pb-44` và safe-area, đồng thời active shell tạo thêm một `h-dvh` bên trong root. Fix chuyển clearance về đúng workflow owner. UI guard bắt `gap-0` không thuộc named spacing baseline; class thừa được bỏ thay vì tăng debt budget. Browser test lần đầu đo loading skeleton trước final state nên báo overflow giả; readiness được khóa vào `#main-content` rồi matrix năm viewport mới pass.

Vòng C2 nhận một finding có thể kiểm chứng từ Claude: POS Boneyard flattener phụ thuộc wrapper DOM, có thể làm mất column/background trên loading flash. Codex xác nhận blast radius qua CodeGraph và chuyển `flex-col bg-background` lên wrapper owner; static regression và full web test giữ contract. Cảnh báo density của `AppBackLink` được giữ làm runtime check, không rollback touch target đã được spec hóa.

Full gate đầu tiên sau C2 bị `doc-staleness` chặn vì `tasks/todo.md` giữ một checkbox lịch sử đã hoàn tất. Learning được áp dụng ngay: active task chỉ giữ outcome hiện tại, còn evidence lịch sử nằm trong living plan; rerun toàn bộ `verify` sau sửa đã xanh.

Vòng Branch runtime phát hiện 7 loading boundary cùng dựng `PageSkeleton` đầy đủ bên trong layout đã sở hữu `AppPage`. Fix dùng `bare` tại từng boundary và một regression loop cho toàn group, không tạo loading component thứ hai. Ở Branch on-hand, guard chặn raw `gap-0`; final composition dùng `role=list` + `flex-col` không-gap, giữ `Item` làm `listitem` 44px có separator và không tăng debt baseline.

Vòng inventory mở rộng không áp density của on-hand lên mọi list. GRN draft/receipt giữ 80px vì row sở hữu nhiều metadata và destructive action; stocktake/consumption giữ composition hiện tại. Audit bắt được search và status trigger của GRN chỉ dựa vào placeholder, nên fix tối thiểu nằm tại accessible-name owner và có static regression. Team workspace được giữ sau khi source chứng minh exception-first filter, touch targets, grouped cards và một drawer scroll owner.

Vòng Owner operations tôn trọng regression intent thay vì đảo hierarchy theo cảm tính: Finance giữ direct-contract KPI order, Inventory giữ task/alert trước flow/KPI, HR giữ account access ở secondary deep navigation. Một defect thật xuất hiện ở Branch administration: Supabase read error bị coerce thành `[]`, làm failure trông như “0 điểm vận hành”. Fix fail-closed bằng shared error frame, copy tập trung và regression failure-vs-empty.

Vòng public/system loại bỏ decorative infinite animation khỏi login nhưng giữ mascot motion cho loading/Runner khi nó truyền trạng thái. Access-denied bỏ route-local badge tone classes để dùng variant semantic; offline retry quay về named touch contract. Browser lần đầu cho login 500 do thiếu Supabase env, nên proof được chạy lại với URL/key placeholder local-only; đây là environment separation, không phải bỏ qua lỗi Axe.

Vòng final P6 review nhận ba finding có thể kiểm chứng từ Cursor: disposition regression đã stale so với registry, search của on-hand chưa có accessible name và checkout approvals chưa có authenticated Axe case. Codex sửa cả ba tại owner tương ứng, giữ checkout runtime ở trạng thái mở vì chưa có target đăng ký, rồi chạy lại full verify. Agy bị sandbox từ chối quyền `command`; Claude không phát review trong nhiều bounded wait, nên hai lần gọi này không được tính là review sạch.

## 13. C1 reconciliation

| Agent | Evidence dùng được | Quyết định của Codex |
| --- | --- | --- |
| `claude` | Đề nghị guard ba utility đã xóa; yêu cầu kiểm chứng imports, custom height, wrapper, list semantics, Runner và full gates | Nhận guard `retired-utility-reference`; bác các cảnh báo còn lại vì imports đủ, `max-h-dvh-80` là utility Má Tư có owner, `ItemGroup` có `role=list`, Runner route tồn tại và forced gates xanh |
| `cursor-agent` | Default E2E project scope, icon trạng thái chưa xong, heading semantics, fixed Axe wait, docs/API `Input` | Nhận cả năm: functional E2E khóa `chromium`, icon vòng tròn trung tính, `SectionLabel as="h3"`, readiness theo body + animation frames, docs ghi đủ `default/field/touch` |
| `agy` | Không có source finding | Plan sandbox chỉ thấy scratch; retry qua stdin báo không nhận patch. Không bypass permission và không gán finding giả |

Codex bổ sung page-disposition gate sau C1 để biến P6 thành metric fail-closed: source baseline không thể được nâng thành final nếu thiếu `authenticated-runtime` evidence.

## 14. C2 operational-hot-path reconciliation

| Agent | Evidence dùng được | Quyết định của Codex |
| --- | --- | --- |
| `claude` | Xác nhận height chain của POS/KDS/Runner/Self-order; chỉ ra POS Boneyard flattener có thể làm mất column/background tùy DOM wrapper; nhắc kiểm tra density của text-mode `AppBackLink` | Nhận finding POS và chuyển column/background lên wrapper, giữ static regression; giữ `AppBackLink` 48px theo touch contract và để narrow authenticated header overflow ở runtime gate |
| `agy` | Không có source finding | Hai lần sandbox fail-closed vì `command` không được phép trong headless mode, kể cả prompt tự chứa diff; không dùng `--dangerously-skip-permissions` và không gán review giả |
| `cursor-agent` | Không có source finding | Lần stdin kết thúc rỗng; retry positional prompt gặp reconnect rồi không phát token trong bounded wait và được dừng; không coi session rỗng là review sạch |

Checkpoint chỉ review source/diff. Nó không nâng operational route thành browser verified khi thiếu authenticated runtime evidence.

## 15. C2 final-P6 reconciliation

| Agent | Evidence dùng được | Quyết định của Codex |
| --- | --- | --- |
| `cursor-agent` | Disposition regression chưa theo registry mới; on-hand search thiếu accessible name; checkout approvals thiếu authenticated Axe coverage | Nhận cả ba: đồng bộ expectation và final count, thêm `aria-label` cùng static regression, thêm manager-auth Axe case; focused tests và full verify sau fix đều xanh |
| `agy` | Không có source finding | Sandbox fail-closed vì tool cần quyền `command` nhưng headless mode tự từ chối; không bypass permission và không gán finding giả |
| `claude` | Không có source finding ở final checkpoint | Nhiều bounded wait chỉ trả connector warning hoặc rỗng; tiến trình được dừng và không được coi là review sạch. Evidence Claude dùng được ở C2 operational vẫn được giữ riêng phía trên |

Codex đã kiểm chứng từng finding Cursor trong source trước khi sửa. Checkout approvals chỉ được nâng coverage test, chưa được nâng thành runtime pass khi chưa có auth storage và registered target.

## 16. Gate còn mở và bước tiếp theo

- Authenticated Branch/Owner axe và viewport matrix cần `.env.test.local`, auth storage và target test đã đăng ký; không dùng credential hoặc remote DB không rõ authority.
- VoiceOver/Safari, TalkBack/Android, thao tác install và real standalone shell vẫn là manual/runtime evidence riêng; desktop Chrome manifest/update và operator offline recovery đã có local production-like proof.
- P6 source/static rollout đã hoàn tất cho toàn bộ 17 tranche. Bước kế tiếp của P7 là chạy ba authenticated Axe/viewport cases, VoiceOver/TalkBack critical paths và install/update/standalone proof trên target có authority; mỗi route chỉ chuyển `final=true` khi evidence tương ứng tồn tại.
