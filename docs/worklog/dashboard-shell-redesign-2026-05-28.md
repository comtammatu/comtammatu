# Dashboard Shell — Đề xuất redesign (2026-05-28)

> Author: Product/UI Designer
> Scope: `/admin/*`, `/inventory/*`, `/finance/*`, `/hr/*`, `/orders`, `/menu`, `/notifications`
> Out of scope: `/br/[branchId]/{pos,kds,runner}`, `/employee/*` (frontline / portal — vẫn giữ shell riêng)
> Mockup kèm theo: [`dashboard-shell-mockups-2026-05-28.html`](./dashboard-shell-mockups-2026-05-28.html)

## 0. A+ gate trước khi implement

Không bắt đầu runtime implementation cho Dashboard Shell nếu một trong các điểm dưới đây chưa đạt **A/A+** khi review bằng screenshot ở đủ breakpoint:

| Gate | Tiêu chí đạt A+ | Bằng chứng bắt buộc |
|------|------------------|---------------------|
| IA / Wayfinding | User luôn biết đang ở đâu qua active sidebar, breadcrumb, page title; không còn cảm giác admin/inventory/finance/hr là 4 app riêng | Trunk test PASS cho desktop, tablet, mobile drawer, mobile page |
| Desktop shell | Sidebar expanded/collapsed đều rõ phân hệ, table-heavy page vẫn scan được, topbar không tranh chấp với page actions | Screenshot 1280, 1440, 1920 |
| Mobile shell | Drawer không bóp chữ, page action full-width, mọi icon/button/nav target tối thiểu 44px, không scroll ngang | Screenshot 375, 393, 430 + automated target/overflow check |
| Runtime-readiness | Mockup chỉ là reference; implement phải dùng shadcn/radix-lyra primitives, tokens trong `docs/spec/design-system.md`, `AppPage`/`AppSection`, không copy raw CSS/inline style | Dev handoff map primitive-by-primitive |
| Copy / labels | Label tiếng Việt là tên công việc quán thật, không phải tên module kỹ thuật; các route ẩn khỏi sidebar có đường vào rõ | Nav matrix + command/contextual rules trong tài liệu này |
| Scope safety | `/employee`, POS, KDS, Runner không bị kéo vào dashboard shell | Route-group plan giữ riêng các bề mặt frontline |

Nếu gate nào chỉ đạt B/C hoặc "conditional go", dừng ở mockup/spec và sửa tiếp. Chỉ khi toàn bộ gate đạt A/A+ mới mở PR runtime.

## 1. Vấn đề & mục tiêu

### Vấn đề hiện trạng

| # | Triệu chứng | Nguyên nhân |
|---|-------------|-------------|
| 1 | Admin / Inventory / Finance / HR cảm giác như 4 app riêng | Mỗi cụm có Shell wrapper riêng (`AdminShell`, các shell trong `inventory/_components`…) trỏ về `AppShell` nhưng với `navGroups` cắt rời theo "workspace" |
| 2 | Mất định vị khi vào route sâu | `pageHeader.breadcrumbSegments` chỉ giữ 2 cấp (workspace + nav-item), không có tail thực sự cho `/inventory/purchase-orders/PO-2026-0042/edit` |
| 3 | Nhiều cách vào cùng một việc | `DOMAIN_WORKSPACE_ITEMS` (inventory/finance/hr) và `ADMIN_NAV_GROUPS` (dashboard/reports/staff…) là hai trục song song; người dùng phải nhớ mình "đang ở module nào" |
| 4 | Sidebar không cảm thấy "đang ở phân hệ nào" | Active state cha-con dựa vào `findActiveNavItem` nhưng không có collapsible parent → khi vào sub-route thì group label vẫn nằm yên, không nhóm hoá theo công việc |
| 5 | Không có command palette | Mọi điều hướng phải đi qua sidebar; staff không tra cứu được nhanh theo tên việc / tên đơn |
| 6 | Một số route bị nhồi sidebar dù ít dùng | `/inventory/drafts`, `/inventory/reports`, `/admin/accounting`, `/finance/audit-trail`… có mặt trong shell nhưng nên là contextual / settings |

### Mục tiêu

Một Dashboard Shell duy nhất cho mọi bề mặt quản lý, để chủ quán / quản lý luôn trả lời được 4 câu:

1. **Tôi đang ở đâu?** — breadcrumb đầy đủ + sidebar group highlight.
2. **Tôi đang xem việc gì?** — page header có title + description.
3. **Tôi có thể làm gì tiếp theo?** — primary actions ở header, secondary trong card context, hành động `Tạo …` luôn truy cập được qua `⌘K`.
4. **Tôi quay lại đâu?** — breadcrumb clickable + back-link dưới sidebar header.

Không tạo design system mới. Tận dụng `apps/web/app/components/app-shell.tsx` đã có, và sửa **dữ liệu IA + một số contract slot** chứ không vẽ lại visual.

## 2. IA / Navigation Map

### 2.1 Sidebar groups (theo công việc, không theo tên kỹ thuật)

```
┌─ Brand block ───────────────────────────────────┐
│ 🟧 Cơm Tấm Má Tư                                │
│    Quản trị · {role}                            │
├─ Branch context block ──────────────────────────┤
│ 🏬 Chi nhánh: Tất cả ▾                          │
│    (owner/super_manager mới có "Tất cả")        │
├─ HÔM NAY ───────────────────────────────────────┤
│ 🏠 Tổng quan                  /admin/dashboard  │
├─ ĐIỀU HÀNH ─────────────────────────────────────┤
│ 🛒 Đơn hàng hôm nay           /orders           │
│ 🍱 Thực đơn                   /menu             │
│ 🚀 Mở vận hành chi nhánh ▾                      │
│     POS / KDS / Runner — opens branch picker    │
├─ KHO HÀNG ──────────────────────────────────────┤
│ 📊 Tổng quan kho              /inventory/dashboard│
│ 📦 Tồn kho                    /inventory/stock  │
│ 📋 Nguyên liệu                /inventory/ingredients│
│ 📑 Công thức                  /inventory/recipes│
│ 🏷️ Nhà cung cấp              /inventory/suppliers│
│ 📥 Mua & nhập ▾                                 │
│     • Đơn mua (PO)            /inventory/purchase-orders│
│     • Phiếu nhập (GRN)        /inventory/grn    │
│     • Hóa đơn nhà cung cấp    /inventory/supplier-invoices│
│     • Trả nhà cung cấp        /inventory/supplier-returns│
│ 🍳 Sơ chế / sản xuất          /inventory/production│
│ 🔁 Chuyển kho                 /inventory/transfers│
│ 🧮 Kiểm kê                    /inventory/stocktake│
│ 📤 Xuất kho                   /inventory/issues │
│ ⏰ Hạn sử dụng                /inventory/expiry │
│ 🗑️ Hao hụt                   /inventory/waste  │
├─ TÀI CHÍNH ─────────────────────────────────────┤
│ 📒 Sổ nhật ký                 /finance/journal  │
│ 🧾 Hóa đơn                    /finance/invoices │
│ 🔍 Đối chiếu                  /finance/reconciliation│
│ 📊 Báo cáo tài chính          /finance/statements│
│ 📅 Kỳ kế toán                 /finance/periods  │
├─ NHÂN SỰ ───────────────────────────────────────┤
│ 👥 Danh sách nhân viên        /hr               │
│ 💰 Bảng lương                 /hr/payroll       │
├─ BÁO CÁO ───────────────────────────────────────┤
│ 📈 Báo cáo điều hành          /admin/reports    │
├─ THIẾT LẬP ─────────────────────────────────────┤
│ 👤 Phân quyền nhân viên       /admin/staff      │
│ 💬 Phản ánh khách             /admin/feedback   │
│ ⚙️ Cài đặt hệ thống           /admin/settings   │
├─ User block (footer) ───────────────────────────┤
│ 👤 {tên} · {role}            [⎋ Đăng xuất]      │
└─────────────────────────────────────────────────┘
```

**Quy tắc nhóm:**

- Nhóm = **công việc của một vai trò** chứ không phải module ACL. "Kho hàng" gom mọi việc liên quan tới nguyên vật liệu — không tách `inventory_procurement` / `inventory_admin` riêng ở UI.
- Mỗi nhóm tối đa 7 leaf để mắt scan trong 1 lần.
- Item có ≥ 4 sub-route quan trọng → dùng collapsible parent ("Mua & nhập"). Item ≤ 3 sub-route → flat.
- Group label **không** click được (chỉ visual). Click vào label không điều hướng.

### 2.2 Visibility theo role

| Nhóm | owner | super_manager | area_manager | branch_manager | warehouse_manager | production_manager | accountant |
|------|:----:|:--:|:--:|:--:|:--:|:--:|:--:|
| Hôm nay (Tổng quan) | ✓ | ✓ | ✓ (area) | ✓ (branch) | – | – | – |
| Điều hành — Đơn / Thực đơn / Mở vận hành | ✓ | ✓ | ✓ | ✓ | – | – | – |
| Kho hàng | ✓ | ✓ | – | – | ✓ | ✓ | – |
| Tài chính | ✓ | ✓ | – | – | – | – | ✓ |
| Nhân sự | ✓ | ✓ | ✓ | – | – | – | – |
| Báo cáo | ✓ | ✓ | ✓ (area) | ✓ (branch) | – | – | – |
| Thiết lập | ✓ | ✓ | – | – | – | – | – |

Khi role không thấy bất kỳ leaf nào trong group, **ẩn toàn bộ group** (kể cả label).

### 2.3 Đường vào KHÔNG nằm sidebar

Sidebar chỉ chứa **bề mặt làm việc thường xuyên**. Các route sau truy cập qua kênh khác:

| Route | Đường vào | Lý do |
|-------|-----------|-------|
| `/inventory/reports` | Header action `📈 Báo cáo` trong group "Kho hàng" — hoặc `⌘K` | Báo cáo là output, không phải workflow hàng ngày |
| `/inventory/drafts` | Badge `Bản nháp (n)` cạnh "Mua & nhập" — hoặc trang detail | Trạng thái tạm, không phải đích đến |
| `/inventory/settings` | Footer link trong `/inventory/dashboard` | Cấu hình kho — ít dùng |
| `/finance/chart-of-accounts` | Inside `/finance/settings` page-card hoặc `⌘K` | Master data, sửa hiếm |
| `/finance/audit-trail` | Top-right action trên mọi finance page (icon 🕓) — hoặc `⌘K` | Drill-down, không phải nav |
| `/admin/crm` | Sub-tab trong `/admin/staff` (Khách hàng) | Chưa thành phân hệ độc lập |
| `/admin/accounting` | Đã được merge vào `/finance/periods`, redirect | Trùng chức năng |
| `/br/{id}/settings` | Branch picker dropdown → "Cài đặt chi nhánh" | Scoped theo branch |
| `/br/{id}/menu-limits` | `/menu` → tab "Hạn mức bán hôm nay" theo branch | Contextual cho thực đơn |
| `/notifications` | Bell icon trên topbar (badge) → drawer → "Xem tất cả" mở fullpage | Là center, không phải workflow |

### 2.4 Top bar (h-14)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ☰  [Cơm Tấm Má Tư · CN Bình Tân]   🔍 Tìm nhanh ⌘K   🏬 ▾  🔔₃  👤   │
└──────────────────────────────────────────────────────────────────────┘
 ↑    ↑                                ↑              ↑    ↑    ↑
 trig  brand (mobile only)              command       branch bell user
       hoặc page-title (mobile)                       switcher
```

- `☰` SidebarTrigger: hiện cả mobile + desktop (Cmd/Ctrl+B trên desktop).
- Brand text chỉ hiện khi sidebar collapsed/sheet đóng (mobile).
- Command palette button: `<Button variant="outline" size="sm">` với `Search` icon + label "Tìm nhanh" + KbdGroup `⌘K`. Mobile: chỉ icon, `size-11`.
- Branch switcher: chip có icon Store + tên chi nhánh đang chọn. Click → Popover với danh sách branch + lựa chọn "Tất cả chi nhánh" (chỉ owner/super_manager). Khi đổi, URL param `?branch={id}` cập nhật + toàn bộ sidebar/scope re-resolve.
- Notification bell: badge count, mở Sheet drawer (không full-page), max 10 latest, footer "Xem tất cả → `/notifications`".
- User menu: avatar → DropdownMenu (Hồ sơ / Đổi mật khẩu / Tham khảo / Đăng xuất).

### 2.5 Page header (dưới top bar)

```
┌──────────────────────────────────────────────────────────────┐
│ Kho hàng / Mua & nhập / Đơn mua / PO-2026-0042                │
│                                                  [Lưu] [Hủy]  │
│ Đơn mua từ Cty TNHH Phú Cường — Tạo 28/05/2026                │
└──────────────────────────────────────────────────────────────┘
```

- Dòng 1: **breadcrumb đầy đủ**. Segment cuối là **bold + lớn hơn** (page title), các segment trước là link `muted-foreground hover:foreground`.
- Dòng 2: description ngắn (nguồn dữ liệu, ngữ cảnh) — optional.
- Actions ở góc phải, wrap về dưới ở mobile.
- Mobile rule: nếu breadcrumb > 3 segment thì rút gọn `… / Đơn mua / PO-2026-0042`.
- Trên mobile, page title (segment cuối) lên top bar luôn → header bên dưới chỉ còn description + actions.

## 3. Wireframes / states

> Pixel-perfect mockup ở [`dashboard-shell-mockups-2026-05-28.html`](./dashboard-shell-mockups-2026-05-28.html) — mở trực tiếp trên trình duyệt để xem.

### 3.1 Desktop expanded (≥ 1280px)

- Sidebar: 264px wide, `bg-sidebar` (warm cream), border-r.
- Top bar h-14 sticky.
- Main content: max-w-7xl, p-6, gap-6.

### 3.2 Desktop collapsed / icon mode

- Cmd+B → sidebar co còn 56px, chỉ icon + tooltip.
- Brand block còn 40px square logo.
- Branch context block → icon 🏬, tooltip hiện tên branch.
- Group labels ẩn (chỉ icons phân tách bằng spacing).
- Collapsible parents: click → popover ra phải (giống `Menubar`), không expand inline.
- Active state highlight item con đang ở (vì user vẫn cần biết mình ở đâu); parent dùng pulse dot subtle góc trên.

### 3.3 Tablet (md: 768–1023)

- Sidebar default collapsed (icon mode).
- Top bar: command palette button chỉ còn icon `🔍`.
- Page header actions wrap xuống dưới title.

### 3.4 Mobile (< 768)

- Sidebar = `Sheet` (slide-in từ trái).
- Top bar:
  - `☰` (mở Sheet)
  - Page title (truncate, segment cuối của breadcrumb)
  - `🔍` icon (open command palette)
  - `🔔` icon (badge)
  - 👤 avatar (small)
- Branch switcher chuyển vào trong Sheet (đầu sidebar) thay vì top bar.
- Page header chỉ render breadcrumb tail 2 segment + description, actions xuống dưới (stacky).
- Bottom-safe-area padding cho main.

### 3.5 Sidebar states

| State | Visual |
|-------|--------|
| Group có item active | Group label vẫn `muted` (không bold), nhưng item active có `bg-sidebar-primary text-sidebar-primary-foreground rounded-md font-semibold` |
| Collapsible parent active (con đang active) | Parent vẫn chevron, nhưng nền `bg-sidebar-accent/40` nhẹ để cho biết "section này đang mở"; con bên trong highlight `bg-sidebar-primary` |
| Collapsible parent với sub đang active nhưng đã collapse | Parent nhận active state (full primary) — vì nó là affordance duy nhất nhìn thấy |
| Hover | `bg-sidebar-accent text-sidebar-accent-foreground` |
| Focus (keyboard) | Outline-ring 2px primary, không thay đổi bg |
| Loading prefetch | Không hiển thị — prefetch ngầm |

### 3.6 Command palette (⌘K)

```
┌─ Tìm trang, hành động hoặc đơn hàng ─── [esc] ┐
│ 🔍 ___________________________________________ │
├────────────────────────────────────────────────┤
│ TRANG                                          │
│ 🏠 Tổng quan                                   │
│ 🛒 Đơn hàng hôm nay                            │
│ 📦 Tồn kho                                     │
│ 📋 Nguyên liệu                                 │
│ …                                              │
├────────────────────────────────────────────────┤
│ HÀNH ĐỘNG NHANH                                │
│ ➕ Tạo đơn mua PO                          [+] │
│ ➕ Tạo phiếu nhập kho GRN                  [+] │
│ ➕ Tạo phiếu chuyển kho                    [+] │
│ ➕ Thêm món vào thực đơn                   [+] │
│ ➕ Thêm nguyên liệu                        [+] │
│ ➕ Đóng kỳ kế toán tháng                   [+] │
├────────────────────────────────────────────────┤
│ ĐƠN GẦN ĐÂY (nếu có search match)              │
│ 🧾 PO-2026-0042 — Cty Phú Cường                │
│ 🧾 GRN-2026-0118 — Kho TT                      │
└────────────────────────────────────────────────┘
```

**Behavior:**
- Mở: button trên top bar / `⌘K` / `Ctrl+K`.
- Fuzzy match qua tên trang VI + alias EN (e.g. "po", "purchase order" → "Đơn mua").
- Group order: Trang → Hành động → Đơn gần đây (chỉ khi query không rỗng).
- Recent (LRU 5) ở đầu khi vừa mở, query rỗng.
- Keyboard: `↑↓` di chuyển, `Enter` đi, `Tab` filter group, `Esc` đóng.
- A11y: `role="dialog" aria-label="Tìm nhanh"`.

## 4. Rule rõ: sidebar vs command vs contextual

### 4.1 Cái gì NÊN vào sidebar

- Là **đích đến** (destination), không phải hành động.
- Có **list / dashboard / workflow page** đằng sau.
- User dùng **≥ 3 lần / tuần** ở vai trò chuẩn.
- Không bị scoped theo URL param tạm (e.g. id, status).

### 4.2 Cái gì NÊN vào command palette

- **Hành động tạo mới** (`Tạo PO mới…`, `Thêm nguyên liệu…`).
- Trang **ít dùng nhưng cần tìm nhanh** (audit trail, chart of accounts, settings sub-page).
- **Tra cứu entity** theo mã / tên (đơn hàng, NCC, nhân viên).
- Chuyển nhanh chi nhánh / vai trò xem.

### 4.3 Cái gì NÊN nằm contextual / page-card

- Sub-resource của một trang (Drafts, Exports của trang đó).
- Settings sub-page chỉ đụng khi đã ở module đó.
- Quick filter / state toggle ngay trong workspace landing.

### 4.4 Cái gì NÊN nằm top bar

- Branch switcher (scope toàn cục).
- Notification bell (toàn cục).
- User menu (toàn cục).
- Command palette trigger.

### 4.5 Cái gì KHÔNG nằm đâu hết

- Page-level toggle (theme, density) — không hiện ra ở admin vì repo đang lock `light`. Khi nào contract đổi mới thêm.
- Marketing/landing content.

## 5. Mockup screens (xem HTML để render đầy đủ)

| # | Tên screen | Mục tiêu | File mockup |
|---|------------|----------|-------------|
| 1 | Desktop expanded — Tổng quan | "Hôm nay" view cho owner: doanh thu + đơn + kho + cảnh báo | Tab `home-desktop` |
| 2 | Desktop collapsed — Inventory dashboard | Sidebar icon mode + dense data | Tab `inventory-collapsed` |
| 3 | Finance journal — desktop | Table-heavy + breadcrumb sâu | Tab `finance-journal` |
| 4 | HR payroll — desktop | Workflow-first | Tab `hr-payroll` |
| 5 | PO detail — deep route + breadcrumb | Kho hàng / Mua & nhập / Đơn mua / PO-2026-0042 | Tab `po-detail` |
| 6 | Command palette (⌘K) | Search + actions + recent | Tab `command-palette` |
| 7 | Mobile drawer + page | Sheet sidebar + condensed page header | Tab `mobile` |
| 8 | Branch switcher popover | Đổi scope nhanh | Tab `branch-switcher` |

## 6. Handoff cho dev

### 6.1 Component primitives nên dùng

| Component | Dùng cho | Lưu ý |
|-----------|---------|-------|
| `Sidebar` family từ `packages/ui` | Sidebar shell | Đã có sẵn — không tạo wrapper mới |
| `Breadcrumb*` | Page header crumb | Render đủ chain, segment cuối là `BreadcrumbPage` (current) |
| `Command*` (`CommandDialog`, `CommandInput`, `CommandGroup`, `CommandItem`, `CommandShortcut`) | Command palette | Thêm mới — chưa có route-level palette |
| `Popover` | Branch switcher, collapsed parent flyout | Re-use existing |
| `Sheet` | Mobile sidebar, notification drawer | Sheet đã có |
| `DropdownMenu` | User menu | Có sẵn |
| `Kbd`, `KbdGroup` | Hiển thị `⌘K` | Cần thêm primitive nếu thiếu — copy từ shadcn |
| `AppPage` / `AppSection` từ `app/components/surface.tsx` | Bọc nội dung trang | Dùng `width="wide"` cho list, `"narrow"` cho form |

### 6.2 Files cần sửa / thêm

| File | Hành động | Mô tả |
|------|-----------|-------|
| `packages/shared/src/auth/nav-config.ts` | Sửa | Thay `ADMIN_NAV_GROUPS` + `DOMAIN_WORKSPACE_ITEMS` thành 1 `UNIFIED_NAV_GROUPS` có 7 groups (Hôm nay / Điều hành / Kho hàng / Tài chính / Nhân sự / Báo cáo / Thiết lập). Thêm `children?: NavItemConfig[]` cho collapsible. Thêm `surface?: "sidebar" \| "command" \| "both"` để palette filter. |
| `packages/shared/src/auth/nav-resolution.ts` | Sửa | `resolveAdminNavGroups(role)` → `resolveUnifiedNav(role, permissions, { surface })`. Filter ẩn group rỗng. Implement `getVisibleNav(role, permissions, opts)` y như matu-platform. |
| `apps/web/app/components/app-shell.tsx` | Sửa | (1) Thêm slot `branchContext?: ReactNode` ở SidebarHeader. (2) Thêm slot `topBarExtras?: ReactNode` cho command/notif/user (render ở `lg:flex-row`). (3) Hỗ trợ collapsible parents (render `Collapsible` + `SidebarMenuSub`). (4) Breadcrumb logic: full chain từ root, không chỉ slice 2 segment. (5) Mobile: title segment cuối lên top bar. |
| `apps/web/app/components/command-palette.tsx` | Thêm | Client component, mount global, listen `⌘K`. Build `pages` từ `getVisibleNav(..., {surface: "command"})`. Build `actions` từ list tĩnh + ACL. Optionally search-by-id qua server action sau. |
| `apps/web/app/components/branch-switcher.tsx` | Thêm | Server-data từ `getCurrentBranchScope()`, popover client. Update URL `?branch=…`. |
| `apps/web/app/components/notification-bell.tsx` | Thêm/sửa | Server-fetched count, client Sheet drawer hiển thị 10 mới nhất; full page vẫn ở `/notifications`. |
| `apps/web/app/(protected)/(shell)/layout.tsx` | Thêm | **Route group mới** `(shell)` bọc admin/inventory/finance/hr/orders/menu — mount `<AppShell>` 1 lần. Bỏ các shell wrapper riêng. Employee/POS/KDS/Runner KHÔNG nằm trong group này. |
| `apps/web/app/(protected)/admin/components/admin-shell.tsx` | Xóa / convert thành adapter mỏng | Sau khi route-group shell có sẵn, file này không còn cần. Hoặc giữ làm wrapper export `<AdminShell>` để code cũ migrate dần. |
| `apps/web/app/(protected)/inventory/_components/*-shell.tsx` | Xóa các shell wrapper riêng | Một số trang inventory đang tạo shell riêng (admin-shell-style) → bỏ, dùng layout group. |

### 6.3 Spacing scale — single source

Chỉ dùng các giá trị sau, không phát sinh giá trị mới khi viết UI:

```
4 · 6 · 8 · 10 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64
```

Cấm tuyệt đối: `14`, `18`, `22`, `28`, `30` (và mọi giá trị px không nằm trong bảng).

**Semantic aliases** (dùng trong code thay vì hard-code px):

| Token | Giá trị | Áp dụng |
|---|---|---|
| `--pad-page` | 24 (desktop) / 16 (mobile) | Padding `<main>` page-content |
| `--pad-card` | 16 | Padding trong `Card`, `Tile` |
| `--pad-cell` | 12 / 16 | Padding `<td>`, `<th>` |
| `--gap-grid` | 16 | Gap giữa items trong grid |
| `--gap-section` | 24 | Gap giữa các section block trong page |
| `--gap-stack` | 12 | Heading → body, group nội bộ trong card |
| `--gap-tight` | 8 | Icon → label, label → input |

**Tailwind mapping** (cho dev viết runtime):

| Token | Tailwind class |
|---|---|
| 4px | `gap-1 p-1 space-y-1` |
| 8px | `gap-2 p-2` |
| 12px | `gap-3 p-3` |
| 16px | `gap-4 p-4` |
| 24px | `gap-6 p-6` |
| 32px | `gap-8 p-8` |

**Vertical rhythm bắt buộc** cho mọi page:

```
Crumb → Title:               4 (sp-1)
Title → Description:         4 (sp-1)
Page header → Content:       0  (chỉ border-b)
Section → Section:           24 (sp-6)
Heading h2 → table/grid:     12 (sp-3)
Card eyebrow → value:        6  (sp-1-5)
Card value → delta:          4  (sp-1)
Card body → foot:            12 (sp-3)
Feed row padding-y:          12 (sp-3, đầu/cuối ra 0)
```

**Component-specific contract:**

| Component | Padding | Gap nội bộ |
|---|---|---|
| `Sidebar.Header` | 16 đều | gap 12 giữa brand & branch chip |
| `Sidebar.GroupLabel` | 16 / 12 / 6 (top/x/bottom) | — |
| `Sidebar.MenuButton` | 8 / 12 (y/x) | gap 10 icon→label |
| `Sidebar.SubButton` | 6 / 12 (y/x) | gap 8 icon→label |
| `Sidebar.Footer` | 12 đều | gap 10 |
| `TopBar` | 0 / 16 | gap 12 giữa các block |
| `PageHeader` | 20 / 24 / 16 (top/x/bottom) | — |
| `Card` | 16 đều | — |
| `Table cell` | 12 / 16 | — |
| `Alert` | 12 / 16 | gap 12 icon→text |
| `CommandPalette` row | 8 / 12 | gap 12 icon→label |

**Enforcement** — thêm pattern vào `scripts/check-ui-contract.mjs`:

```js
// Cấm arbitrary px không thuộc scale
const ALLOWED_PX = new Set([4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64]);
// Pattern: p-[NNpx], gap-[NNpx], style="...: NNpx..."
```

### 6.4 Responsive — Mobile-first

**Nguyên tắc bắt buộc:**

- **Base CSS = mobile.** Mọi rule mặc định viết cho viewport hẹp nhất. Không có `@media (max-width: …)` để patch mobile sau.
- **Mỗi breakpoint chỉ ADD capability, không OVERRIDE.** `md:` thêm sidebar, `lg:` thêm padding lớn — không có rule kiểu `lg:` xoá thứ `md:` vừa thêm.
- **Dùng Tailwind `min-width` modifier** (`sm:`, `md:`, `lg:`) hoặc `@container shell (min-width: …)` cho component-level responsive. Không dùng `max-width`.

**Breakpoints (chuẩn Tailwind, áp dụng cả `@media` và `@container`):**

| Token | Min-width | Mục đích |
|-------|-----------|---------|
| (base) | 0 | Mobile portrait — phone 360–414 |
| `sm:` | 640 | Phone landscape — grid bắt đầu giãn |
| `md:` | 768 | Tablet — sidebar lộ ra (icon mode) |
| `lg:` | 1024 | Desktop nhỏ — sidebar expanded mặc định |
| `xl:` | 1280 | Desktop wide — padding tăng thêm (optional) |

**Layout adaptation (mobile-first, cộng dồn):**

| Element | Base (< sm) | + `sm:` (≥ 640) | + `md:` (≥ 768) | + `lg:` (≥ 1024) |
|---------|-------------|-----------------|------------------|-------------------|
| `Shell` | `flex-col` (stack) | — | `md:flex-row` | — |
| `Sidebar` | `fixed`, `translateX(-100%)`, drawer pattern, full labels khi `.open` | — | `md:static`, `md:translateX(0)`, `md:w-16` icon mode, ẩn labels | `lg:w-64`, hiện labels (trừ khi `.collapsed`) |
| `Topbar` | `h-13`, padding `0 12`, hiện page-title-mobile, ẩn cmd-btn + branch-chip | — | `md:h-14`, padding `0 16`, ẩn page-title-mobile, hiện cmd-btn (icon-only), hiện branch-chip | `lg:` cmd-btn full search bar + label "Tìm nhanh" + `⌘K` |
| `PageHeader` | padding `16`, title `18`, crumb font `11` | `sm:p-5`, title `20`, crumb `12` | — | `lg:p-6`, title `22`, crumb `13` |
| `PageContent` | padding `16`, gap `16` | `sm:p-5`, gap `20` | — | `lg:p-6`, gap `24` |
| `Grid 4-col` | `grid-cols-1` (mobile dày) / `grid-cols-2` (mobile rộng) | `sm:grid-cols-4` | — | — |
| `Grid 3-col` | `grid-cols-1` | `sm:grid-cols-3` | — | — |
| `Grid 2-col` (2fr 1fr) | `grid-cols-1` | — | `md:grid-cols-[2fr_1fr]` | — |
| `Crumbs` | last 2 segment | `sm:` last 3 | `md:` full chain | — |
| `PageActions` | stack dọc, full-width btn | — | `md:flex-row`, auto-width | — |
| `Branch switcher` | trong Sheet (đầu sidebar) | — | `md:` chip ở top bar | — |

**Mobile bottom safe-area:**
- Main content padding-bottom kèm `pb-[max(env(safe-area-inset-bottom),16px)]`.
- Floating action button (nếu có) phải tránh keyboard zone.

**Persisted state:**
- Sidebar `expanded` / `collapsed` lưu qua cookie `sidebar_state` — đã có sẵn từ primitive `Sidebar`.
- Branch chọn lưu qua URL param `?branch=…`, không dùng `localStorage` (rule AGENTS.md).
- Trên mobile, drawer state KHÔNG persist — mở rồi tự đóng khi điều hướng.

**Test bắt buộc trước khi merge:**

```bash
# Chrome DevTools device emulation, tất cả phải pass:
- iPhone SE (375 × 667)
- iPhone 14 Pro (393 × 852)
- iPad mini (768 × 1024) portrait
- iPad Pro 11" (834 × 1194) landscape
- MacBook Air 13" (1280 × 800)
- Desktop 1440 × 900
- Desktop 1920 × 1080
```

**Anti-patterns cấm:**

```css
/* ❌ SAI — desktop-first */
.sidebar { width: 264px; }
@media (max-width: 768px) { .sidebar { width: 0; } }

/* ✅ ĐÚNG — mobile-first */
.sidebar { transform: translateX(-100%); }
@media (min-width: 768px) { .sidebar { transform: none; width: 64px; } }
@media (min-width: 1024px) { .sidebar { width: 264px; } }
```

```jsx
/* ❌ SAI — class mobile, override desktop */
<div className="p-6 max-md:p-4">

/* ✅ ĐÚNG — mobile base, scale up */
<div className="p-4 md:p-5 lg:p-6">
```

```css
/* ❌ SAI — kiểm tra viewport */
@media (max-width: 767px) { /* mobile only */ }

/* ✅ ĐÚNG — base + min-width override */
.x { /* mobile by default */ }
@media (min-width: 768px) { .x { /* + tablet */ } }
```

### 6.5 Keyboard shortcuts

| Phím | Hành động |
|------|-----------|
| `⌘K` / `Ctrl+K` | Mở command palette |
| `⌘B` / `Ctrl+B` | Toggle sidebar collapsed |
| `Esc` (trong palette) | Đóng palette |
| `↑ ↓` (trong palette) | Di chuyển item |
| `Enter` (trong palette) | Đi tới item |
| `g d` (vim-style, optional) | Go to Dashboard — chỉ enable trong palette với prefix |

### 6.6 A11y

- Sidebar: `<nav aria-label="Điều hướng chính">`.
- Top bar: `<header>` với `role="banner"`, search button có `aria-keyshortcuts="Meta+K Control+K"`.
- Notification bell: `aria-label="Thông báo ({count})"`.
- Skip link `<a href="#main-content" class="sr-only focus:not-sr-only">Bỏ qua điều hướng</a>` ở đầu shell.
- Focus visible: dùng `:focus-visible` outline-ring, không tắt outline.
- Color contrast: tất cả token đã đạt AA dưới radix-lyra (text ≥ 4.5:1, icon ≥ 3:1).

### 6.7 Migration plan (incremental, an toàn)

```
PR-1  Add nav-config.ts unified groups (gated by flag `UNIFIED_NAV=true`)
      + nav-resolution.ts surface filter
      Tests: snapshot resolver output per role.

PR-2  Add `apps/web/app/(protected)/(shell)/layout.tsx`
      + extend AppShell with branchContext + topBarExtras + collapsible-parent support
      + breadcrumb-full logic.
      Migrate /orders, /menu only (lowest-risk, no existing shell).

PR-3  Add command-palette + branch-switcher + notification-bell components.
      Mount inside (shell) layout. Gate `UNIFIED_NAV=true`.

PR-4  Migrate /admin/* into (shell) group; remove AdminShell wrapper.
      Verify breadcrumbs at deep routes.

PR-5  Migrate /inventory/* into (shell). Remove inventory-specific shells.

PR-6  Migrate /finance/* into (shell).

PR-7  Migrate /hr/* into (shell). Drop `UNIFIED_NAV` flag — make default.

PR-8  Clean-up: delete old AdminShell, DOMAIN_WORKSPACE_ITEMS, old route-group leftovers.
```

Mỗi PR đi qua T2/T3 review tuỳ blast radius (theo `docs/agent/rules/workflow.md`). PR-2 và PR-4 là T3 vì đụng nav/auth boundary.

### 6.8 Test coverage tối thiểu

- Snapshot `resolveUnifiedNav` cho từng role.
- E2E (Playwright) cho mỗi route family: deep-route → breadcrumb đầy đủ → click crumb → quay về.
- Keyboard: `⌘K` opens palette, `Esc` closes, `Enter` navigates.
- A11y axe-core check trên `/admin/dashboard`, `/inventory/stock`, `/finance/journal`.
- Mobile sheet open/close + tap nav item closes sheet.

### 6.9 Out of scope (KHÔNG làm trong refactor này)

- Đổi design tokens / màu sắc / typography.
- Đổi visual của `Sidebar`, `Breadcrumb` primitive.
- Đổi permission model (`module-acl.ts` giữ nguyên).
- Đổi POS/KDS/Runner/Employee portal.
- Realtime updates trong sidebar (badge counts) — defer PR sau.

## 7. Decision log

| Quyết định | Lý do |
|-----------|-------|
| Sidebar groups theo công việc, không theo module ACL | User mental model là việc làm ("nhập kho") chứ không phải module ("inventory_procurement") |
| Branch switcher ở top bar, không sidebar | Là scope toàn cục, không phải destination |
| Command palette là kênh chính cho "Tạo mới" | Giảm áp lực sidebar; thao tác này có shortcut vận tốc cao |
| Breadcrumb hiển thị **full chain** ở desktop | Trả lời "tôi đang ở đâu" — đặc biệt quan trọng cho route sâu (PO detail, GRN edit) |
| `(shell)` là route group, không phải nested layout per module | 1 sidebar instance duy nhất → tránh re-mount giữa modules → giữ scroll state |
| Không thêm dark mode | Repo lock `light` (theme-script.tsx); chờ contract đổi |
| Không vẽ lại visual | UI Authority rule trong AGENTS.md — chỉ sửa IA + data |

---

**Next step:** chủ dự án review IA + screen list. Khi OK, mở PR-1 (`UNIFIED_NAV` flag + nav-config) để verify resolver output trước khi đụng route migration.
