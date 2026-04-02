# Design System — Cơm Tấm Má Tư

> Version: 0.1.0 | Created: 2026-04-01
> Stack: Next.js 16.2 · React 19.2 · Tailwind CSS 4.2 · shadcn/ui · TypeScript 6.0

---

## 1. Brand Identity

**Cơm Tấm Má Tư** — chuỗi nhà hàng cơm tấm Việt Nam, CTCP.

- **Tinh thần thương hiệu**: Ấm áp, truyền thống, đáng tin cậy, chuyên nghiệp
- **Màu chủ đạo**: Amber-brown — gợi liên tưởng đến sườn nướng, cơm tấm vàng ươm
- **KHÔNG dùng đỏ** cho primary — đỏ chỉ dành cho destructive/error
- **Ngôn ngữ**: Tiếng Việt (vi) cho tất cả UI text
- **Tiền tệ**: VND — hiển thị dạng `45.000đ`

---

## 2. Color System

Sử dụng OKLCH color space (perceptual uniformity tốt hơn HSL). Toàn bộ tokens map sang CSS variables tương thích shadcn/ui.

### 2.1 Light Mode (Default)

| Token                            | OKLCH Value            | Hex Approx | Mục đích                     |
| -------------------------------- | ---------------------- | ---------- | ---------------------------- |
| `--color-background`             | `oklch(0.98 0.005 80)` | #FAF8F5    | Nền chính — warm cream       |
| `--color-foreground`             | `oklch(0.15 0.02 55)`  | #1C1612    | Text chính — near-black warm |
| `--color-primary`                | `oklch(0.50 0.14 55)`  | #8B5E2F    | Primary — warm amber-brown   |
| `--color-primary-foreground`     | `oklch(0.98 0.005 80)` | #FAF8F5    | Text trên primary            |
| `--color-secondary`              | `oklch(0.94 0.01 80)`  | #EDE8E0    | Secondary — warm beige       |
| `--color-secondary-foreground`   | `oklch(0.25 0.02 55)`  | #3D3129    | Text trên secondary          |
| `--color-accent`                 | `oklch(0.70 0.14 80)`  | #C49B4A    | Accent — warm gold           |
| `--color-accent-foreground`      | `oklch(0.15 0.02 55)`  | #1C1612    | Text trên accent             |
| `--color-muted`                  | `oklch(0.94 0.01 80)`  | #EDE8E0    | Muted backgrounds            |
| `--color-muted-foreground`       | `oklch(0.55 0.02 55)`  | #8B7E72    | Text phụ, placeholder        |
| `--color-card`                   | `oklch(1.0 0 0)`       | #FFFFFF    | Card background              |
| `--color-card-foreground`        | `oklch(0.15 0.02 55)`  | #1C1612    | Card text                    |
| `--color-border`                 | `oklch(0.88 0.01 80)`  | #DDD5C9    | Borders                      |
| `--color-input`                  | `oklch(0.88 0.01 80)`  | #DDD5C9    | Input borders                |
| `--color-ring`                   | `oklch(0.50 0.14 55)`  | #8B5E2F    | Focus ring                   |
| `--color-destructive`            | `oklch(0.55 0.20 27)`  | #DC2626    | Error/danger                 |
| `--color-destructive-foreground` | `oklch(0.98 0.005 0)`  | #FFF5F5    | Text trên destructive        |

### 2.2 Dark Mode

| Token                            | OKLCH Value           | Hex Approx | Ghi chú                   |
| -------------------------------- | --------------------- | ---------- | ------------------------- |
| `--color-background`             | `oklch(0.16 0.02 55)` | #1E1814    | Dark warm background      |
| `--color-foreground`             | `oklch(0.93 0.01 80)` | #EBE5DD    | Light warm text           |
| `--color-primary`                | `oklch(0.65 0.14 55)` | #C4894A    | Lighter amber for dark bg |
| `--color-primary-foreground`     | `oklch(0.13 0.02 55)` | #1A1410    | Dark text on primary      |
| `--color-secondary`              | `oklch(0.24 0.02 55)` | #3A2F25    | Dark secondary            |
| `--color-secondary-foreground`   | `oklch(0.93 0.01 80)` | #EBE5DD    | Light text on secondary   |
| `--color-accent`                 | `oklch(0.60 0.12 80)` | #A88638    | Muted gold                |
| `--color-accent-foreground`      | `oklch(0.93 0.01 80)` | #EBE5DD    | Light text on accent      |
| `--color-muted`                  | `oklch(0.24 0.02 55)` | #3A2F25    | Dark muted                |
| `--color-muted-foreground`       | `oklch(0.60 0.02 55)` | #998B7E    | Muted text                |
| `--color-card`                   | `oklch(0.20 0.02 55)` | #2A221B    | Dark card                 |
| `--color-card-foreground`        | `oklch(0.93 0.01 80)` | #EBE5DD    | Card text                 |
| `--color-border`                 | `oklch(0.30 0.02 55)` | #4A3D32    | Dark border               |
| `--color-input`                  | `oklch(0.30 0.02 55)` | #4A3D32    | Dark input border         |
| `--color-ring`                   | `oklch(0.65 0.14 55)` | #C4894A    | Focus ring                |
| `--color-destructive`            | `oklch(0.45 0.18 27)` | #B91C1C    | Darker red for dark mode  |
| `--color-destructive-foreground` | `oklch(0.93 0.01 0)`  | #F5EDED    | Text on destructive       |

### 2.3 Sidebar Tokens (Admin)

| Token                                | Light                  | Dark                  |
| ------------------------------------ | ---------------------- | --------------------- |
| `--color-sidebar`                    | `oklch(0.96 0.008 80)` | `oklch(0.18 0.02 55)` |
| `--color-sidebar-foreground`         | `oklch(0.25 0.02 55)`  | `oklch(0.90 0.01 80)` |
| `--color-sidebar-primary`            | `oklch(0.50 0.14 55)`  | `oklch(0.65 0.14 55)` |
| `--color-sidebar-primary-foreground` | `oklch(0.98 0.005 80)` | `oklch(0.13 0.02 55)` |
| `--color-sidebar-accent`             | `oklch(0.91 0.015 80)` | `oklch(0.26 0.02 55)` |
| `--color-sidebar-accent-foreground`  | `oklch(0.25 0.02 55)`  | `oklch(0.90 0.01 80)` |
| `--color-sidebar-border`             | `oklch(0.88 0.01 80)`  | `oklch(0.30 0.02 55)` |
| `--color-sidebar-ring`               | `oklch(0.50 0.14 55)`  | `oklch(0.65 0.14 55)` |

### 2.4 Status Colors (Custom — ngoài shadcn)

| Status          | Token             | Color       | Badge Variant |
| --------------- | ----------------- | ----------- | ------------- |
| Success/Active  | `--color-success` | Emerald 600 | `success`     |
| Warning/Pending | `--color-warning` | Amber 500   | `warning`     |
| Info            | `--color-info`    | Sky 500     | `info`        |

Áp dụng cho:

| Domain  | Status      | Badge Variant | Icon            |
| ------- | ----------- | ------------- | --------------- |
| Order   | pending     | `warning`     | Clock           |
| Order   | confirmed   | `info`        | CheckCircle     |
| Order   | preparing   | `info`        | ChefHat         |
| Order   | ready       | `success`     | Bell            |
| Order   | served      | `success`     | UtensilsCrossed |
| Order   | completed   | `secondary`   | CheckCheck      |
| Order   | cancelled   | `destructive` | X               |
| Table   | available   | `success`     | Circle          |
| Table   | occupied    | `warning`     | Users           |
| Table   | reserved    | `info`        | CalendarClock   |
| Table   | maintenance | `secondary`   | Wrench          |
| Payment | pending     | `warning`     | Clock           |
| Payment | completed   | `success`     | CheckCircle     |
| Payment | failed      | `destructive` | AlertCircle     |
| Payment | refunded    | `secondary`   | RotateCcw       |
| Staff   | active      | `success`     | UserCheck       |
| Staff   | inactive    | `secondary`   | UserX           |
| Staff   | on_leave    | `warning`     | Calendar        |

### 2.5 Radius Tokens

```
--radius-sm: 0.25rem   (4px)  — small elements (badge, tag)
--radius-md: 0.375rem  (6px)  — inputs, buttons
--radius-lg: 0.5rem    (8px)  — cards, dialogs
--radius-xl: 0.75rem   (12px) — large containers
```

---

## 3. Typography

### 3.1 Font Family

**Be Vietnam Pro** — Google Font, variable font, full Vietnamese diacritics support.

- Hỗ trợ đầy đủ: ơ, ư, ắ, ặ, ề, ổ, ữ, ự, ỹ...
- Weights: 300 (light), 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- Fallback: `system-ui, -apple-system, sans-serif`

Lý do chọn:

- Playfair Display + Karla (từ UI UX Pro Max skill) **thiếu Vietnamese diacritics** → loại
- Be Vietnam Pro: sans-serif hiện đại, dễ đọc trên mọi kích thước, tối ưu cho tiếng Việt

### 3.2 Type Scale

| Level     | Class       | Size | Weight       | Line Height | Dùng cho                            |
| --------- | ----------- | ---- | ------------ | ----------- | ----------------------------------- |
| Display   | `text-4xl`  | 36px | Bold 700     | 1.2         | Page title (Dashboard, Menu)        |
| Heading 1 | `text-2xl`  | 24px | Bold 700     | 1.3         | Section title                       |
| Heading 2 | `text-xl`   | 20px | Bold 700     | 1.4         | Card title, dialog title            |
| Heading 3 | `text-base` | 16px | SemiBold 600 | 1.5         | Subsection, table group header      |
| Body      | `text-base` | 16px | Regular 400  | 1.5         | Paragraph, description              |
| Body SM   | `text-sm`   | 14px | Regular 400  | 1.5         | Table cell, form label, input text  |
| Caption   | `text-xs`   | 12px | Medium 500   | 1.4         | Helper text, timestamp, badge label |

> **Lưu ý Vietnamese diacritics:** Tiếng Việt có dấu xếp chồng (ể, ẵ, ỗ). Line-height cho Display
> đã tăng lên 1.2 (từ 1.1) để tránh cắt đỉnh dấu. H2 và H3 giờ có khoảng cách rõ rệt hơn
> (H2: 20px Bold vs H3: 16px SemiBold) để tạo visual hierarchy khi scan nhanh.
> Heading 3 dùng `uppercase tracking-wider` khi làm table group header để phân biệt với Body text.

### 3.3 Số & Giá (Tabular Numbers)

Dùng `font-variant-numeric: tabular-nums` cho:

- Cột giá trong table → số thẳng hàng
- Tổng tiền POS
- Dashboard metrics

Class: `tabular-nums` (Tailwind built-in)

---

## 4. Spacing & Layout

### 4.1 Spacing Scale

Base unit: 4px. Sử dụng Tailwind default scale.

| Token | Value | Dùng cho                              |
| ----- | ----- | ------------------------------------- |
| `1`   | 4px   | Inline spacing, icon gap              |
| `2`   | 8px   | Compact element spacing               |
| `3`   | 12px  | Input padding-x, button padding       |
| `4`   | 16px  | Component gap, card padding (compact) |
| `6`   | 24px  | Card padding, section spacing         |
| `8`   | 32px  | Page section gap                      |
| `12`  | 48px  | Large section gap                     |
| `16`  | 64px  | Page-level padding                    |

### 4.2 Responsive Breakpoints

Tailwind v4 defaults:

```
sm:  640px   — Mobile landscape
md:  768px   — Tablet portrait
lg:  1024px  — Tablet landscape / Small desktop
xl:  1280px  — Desktop
2xl: 1536px  — Wide desktop
```

### 4.3 Container Widths per Surface

| Surface  | Container          | Sidebar                              | Content Area                                    |
| -------- | ------------------ | ------------------------------------ | ----------------------------------------------- |
| Admin    | Full viewport      | w-64 (256px), collapsible → w-[68px] | `flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` |
| POS      | Full viewport      | None                                 | Split: 70% menu / 30% cart                      |
| KDS      | Full viewport      | None                                 | CSS Grid `auto-fill, minmax(320px, 1fr)`        |
| Employee | `max-w-lg mx-auto` | None                                 | Single column, centered                         |
| Login    | `max-w-sm mx-auto` | None                                 | Centered card                                   |

---

## 5. Application Surfaces

### 5.1 Admin Panel (`/admin/*`)

**Target**: Desktop + Tablet | Mouse-first | Standard density

```
┌──────────────────────────────────────────────────┐
│ [≡] Breadcrumb                    [Branch ▾] [👤]│  ← Header (h-14, sticky)
├────────┬─────────────────────────────────────────┤
│        │                                         │
│  Logo  │  Page Title              [+ Thêm mới]  │  ← Page header
│        │  Mô tả ngắn                             │
│  Nav   │─────────────────────────────────────────│
│  items │  [Search...] [Filter ▾] [Filter ▾]     │  ← Filter bar
│        │─────────────────────────────────────────│
│        │  ┌─────────────────────────────────┐    │
│        │  │ Data Table                      │    │  ← Content
│        │  │ header | header | header | ⋯    │    │
│        │  │ cell   | cell   | cell   | ⋯    │    │
│        │  │ ...                             │    │
│        │  └─────────────────────────────────┘    │
│        │  ← 1 2 3 ... 10 →  Hiển thị 1-10/50   │  ← Pagination
│        │                                         │
└────────┴─────────────────────────────────────────┘
  w-64                    flex-1
```

**Admin List Page Pattern:**

1. Page Header: `<h1>` (text-2xl font-bold) + description (text-muted-foreground) + primary action Button
2. Filter Bar: Search Input + Select filters + optional date range
3. Data Table: sortable columns, row selection, row actions (DropdownMenu)
4. Pagination: page numbers + items per page selector
5. Empty State: centered icon + heading + description + CTA button

**Admin Detail/Edit Page Pattern:**

1. Breadcrumb: Dashboard / Menu / [Item Name]
2. Page Header: title + back button (ghost)
3. Form sections as Cards, each with CardHeader + CardContent
4. Sticky footer: Cancel (outline) + Save (primary)

**Admin Settings Page Pattern:**

1. Vertical Tabs on desktop (left sidebar within content)
2. Horizontal Tabs on mobile
3. Each tab → Card with form fields

### 5.2 POS (`/br/[branchId]/pos`)

**Target**: Tablet (10-12") | Touch-first | Relaxed density | Min touch target: 48px

```
┌─────────────────────────────────┬────────────────┐
│  [Cơm] [Nước] [Tráng miệng]    │  Bàn 5 — 3 món │  ← Category tabs / Cart header
├─────────────────────────────────┤────────────────┤
│  ┌──────┐ ┌──────┐ ┌──────┐    │  Cơm tấm sườn  │
│  │ Ảnh  │ │ Ảnh  │ │ Ảnh  │    │  1x    45.000đ │
│  │ Tên  │ │ Tên  │ │ Tên  │    │────────────────│
│  │ Giá  │ │ Giá  │ │ Giá  │    │  Cơm tấm bì    │
│  └──────┘ └──────┘ └──────┘    │  2x    70.000đ │
│  ┌──────┐ ┌──────┐ ┌──────┐    │────────────────│
│  │      │ │      │ │      │    │                │
│  │      │ │      │ │      │    │                │
│  └──────┘ └──────┘ └──────┘    │                │
│  ...                            │────────────────│
│                                 │  Tạm tính:     │
│                                 │     115.000đ   │
│                                 │  VAT 8%: 9.200đ│
│                                 │  ═══════════   │
│                                 │  124.200đ      │
├─────────────────────────────────┤────────────────┤
│  [🔍 Tìm món]                   │ [Tiền mặt]    │
│                                 │ [VietQR]       │
│                                 │ [Momo]         │
└─────────────────────────────────┴────────────────┘
         ~70%                          ~30%
```

**POS Design Rules:**

- Menu grid: CSS Grid `auto-fill, minmax(120px, 1fr)`, gap-3
- Menu item card: image (aspect-square, rounded-lg) + name (text-sm font-medium, 2 lines max) + price (text-sm font-bold tabular-nums)
- Tap to add → instant cart update (optimistic UI)
  - Rollback: nếu server reject (mạng chậm/fail), hiển thị toast error + revert cart item
  - Debounce: quantity stepper debounce 300ms để tránh double-charge
  - Disable payment buttons khi có pending optimistic update
- Cart items: name + quantity stepper (- / qty / +) + line total
- Payment buttons: h-12, full-width, font-semibold
- Category tabs: h-12, min-w-[80px], scrollable horizontally
- Font size minimum: 14px (text-sm). No text-xs
- All interactive elements: min-h-[48px] min-w-[48px]

### 5.3 KDS (`/br/[branchId]/kds`)

**Target**: Wall-mounted display / Tablet | Touch with gloves | Spacious | Dark theme default | Min touch target: 64px

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  #42 — Bàn 5 │  #43 — Bàn 2 │  #44 — Bàn 8 │  #45 — Bàn 1 │
│  ⏱ 3:24      │  ⏱ 7:15      │  ⏱ 1:02      │  ⏱ 0:30      │
│──────────────│──────────────│──────────────│──────────────│
│  2x Sườn nướng│  1x Đặc biệt │  3x Bì chả   │  1x Sườn bì  │
│  1x Bì chả   │  +trứng ốp la│  1x Nước mía │  2x Chả      │
│     +thêm chả│  2x Sườn bì  │              │              │
│  1x Nước mía │  1x Trà đá   │              │              │
│              │              │              │              │
│              │              │              │              │
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │
│ │   XONG   │ │ │   XONG   │ │ │   XONG   │ │ │   XONG   │ │
│ └──────────┘ │ └──────────┘ │ └──────────┘ │ └──────────┘ │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

**KDS Design Rules:**

- LUÔN dark theme (`class="dark"` on layout)
- Order card: Card with thick left border (color = time status)
- Timer color thresholds: green `< 5 min` → amber `5-10 min` → red `> 10 min`
- Grid: `auto-fill, minmax(320px, 1fr)`, gap-4
- Order number: text-3xl font-bold
- Item list: text-xl, line-height relaxed
- Bump button: h-16, full-width, bg-primary, text-lg font-bold
- No scrolling per card — nếu quá dài, card mở rộng
- No sidebar, no header — full immersion
- Font size minimum: 18px (text-lg). No text-sm or smaller
- Real-time updates via Supabase Realtime (subscribe to order changes)
- **Audio cues** (môi trường bếp ồn, đầu bếp thường rời mắt khỏi màn hình):
  - Đơn mới: notification chime ngắn (1 beep)
  - Đơn sắp trễ (chuyển sang amber): double beep cảnh báo
  - Đơn quá trễ (chuyển sang red): continuous beep cho đến khi acknowledge
  - Bump thành công: confirmation tone
  - Audio có thể tắt/bật trong settings. Volume control riêng
- **Performance**: `React.memo` cho mỗi `OrderCard` — chỉ re-render khi order data thay đổi.
  Với nhiều KDS station cùng subscribe Supabase Realtime, tránh re-render toàn bộ grid khi 1 order update

### 5.4 Employee Portal (`/employee`)

**Target**: Mobile phone | Touch | Standard density | System theme preference

```
┌──────────────────┐
│  Cơm Tấm Má Tư   │
│  Nguyễn Văn A     │
│  Cashier — CN Q1  │
├──────────────────┤
│                  │
│  [Ca làm hôm nay]│
│  08:00 - 16:00   │
│                  │
│  [Lịch sử lương] │
│                  │
│  [Đổi mật khẩu]  │
│                  │
├──────────────────┤
│ [🏠] [📋] [👤]   │  ← Bottom tab nav
└──────────────────┘
     max-w-lg
```

**Employee Portal Design Rules:**

- Single column, max-w-lg, centered
- Bottom tab navigation (3-4 tabs): Home, Schedule, Profile
- Card-based content sections
- Large tap targets: min-h-[44px]
- Respect system dark/light preference
- Simple, minimal UI — nhân viên cần thao tác nhanh

---

## 6. Component Specifications

### 6.1 Navigation

#### Sidebar (Admin)

Component: shadcn `Sidebar` (collapsible)

```
Structure:
├── SidebarHeader
│   └── Logo + App name "Cơm Tấm Má Tư"
├── SidebarContent
│   ├── SidebarGroup "Tổng quan"
│   │   └── Dashboard
│   ├── SidebarGroup "Vận hành"
│   │   ├── Menu (UtensilsCrossed)
│   │   ├── Đơn hàng (Receipt)
│   │   └── Kho hàng (Package)
│   ├── SidebarGroup "Quản lý"
│   │   ├── Nhân viên (Users)
│   │   └── Khách hàng (Heart)
│   ├── SidebarGroup "Tài chính"
│   │   ├── Tài chính (Wallet)
│   │   └── Báo cáo (BarChart3)
│   └── SidebarGroup "Hệ thống"
│       └── Cài đặt (Settings)
└── SidebarFooter
    └── User info + logout
```

- Items filtered by role via `MODULE_ACL` (`packages/shared/src/auth/module-acl.ts`)
- Active state: `bg-sidebar-accent text-sidebar-accent-foreground font-medium`
- Collapsible: icon-only mode (w-[68px]) on toggle or mobile
- Mobile: opens as Sheet (slide from left)
- Keyboard: arrow keys to navigate, Enter to select

#### Header (Admin)

```
┌─[≡]──[Dashboard / Menu / Cơm tấm sườn]──────[Chi nhánh Q1 ▾]──[👤 ▾]─┐
```

- Height: h-14, sticky top-0, z-30
- Left: sidebar toggle (mobile, ghost icon button) + Breadcrumb
- Right: Branch selector (Select) + User avatar (DropdownMenu: profile, settings, logout)
- Border bottom: border-b
- Background: bg-background/95 backdrop-blur (slight transparency)

#### Breadcrumb

Component: shadcn `Breadcrumb`

```
Dashboard / Menu / Cơm tấm đặc biệt
```

- Separator: `/` (ChevronRight icon, text-muted-foreground)
- Current page: font-medium, text-foreground
- Parent links: text-muted-foreground, hover:text-foreground
- Truncate long names with `...` (max-w-[200px] truncate)

#### Tabs

Component: shadcn `Tabs`

- Dùng cho: Settings pages (vertical desktop / horizontal mobile), Detail pages (Item → Info / Variants / Modifiers / Sides)
- Active tab: border-b-2 border-primary text-foreground font-medium
- Inactive: text-muted-foreground hover:text-foreground
- TabsContent: pt-6

### 6.2 Data Display

#### Data Table

Component: shadcn `Table` + `@tanstack/react-table`

**Features:**

- Column sorting: click header → asc → desc → none (ArrowUpDown icon)
- Row selection: Checkbox column (leftmost)
- Pagination: 10 / 20 / 50 rows per page
- Column visibility: toggle via DropdownMenu
- Row actions: DropdownMenu (⋯ button) → Edit, Delete, Toggle active
- Responsive: horizontal scroll on mobile (overflow-x-auto)

**Styling:**

- Header: bg-muted text-muted-foreground text-xs font-medium uppercase tracking-wider
- Row: border-b hover:bg-muted/50 transition-colors
- Cell: py-3 px-4 text-sm
- Selected row: bg-primary/5
- Empty state: py-12, centered icon + text + optional action

**Standard Admin Table Columns:**

| Column       | Width     | Align  | Notes                           |
| ------------ | --------- | ------ | ------------------------------- |
| Checkbox     | w-[40px]  | center | Row selection                   |
| ID/Number    | w-[80px]  | left   | #1, #2... or auto-generated     |
| Name/Title   | flex-1    | left   | Primary identifier, font-medium |
| Status       | w-[120px] | center | Badge component                 |
| Price/Amount | w-[120px] | right  | tabular-nums, VND formatted     |
| Date         | w-[140px] | left   | dd/MM/yyyy HH:mm format         |
| Actions      | w-[60px]  | center | ⋯ DropdownMenu                  |

#### Card

Component: shadcn `Card`

**Variants by usage:**

Stat Card (Dashboard):

```
┌─────────────────────┐
│  Doanh thu hôm nay  │  ← CardHeader: text-sm text-muted-foreground
│  12.450.000đ        │  ← CardContent: text-2xl font-bold tabular-nums
│  ↑ 12.5% vs hôm qua│  ← text-xs, text-success (green) or text-destructive (red)
└─────────────────────┘
```

Setting Card:

```
┌─────────────────────────┐
│  Thông tin chi nhánh     │  ← CardTitle: text-lg font-semibold
│  Cập nhật thông tin...   │  ← CardDescription: text-sm text-muted-foreground
├─────────────────────────┤
│  [Form fields here]     │  ← CardContent: space-y-4
├─────────────────────────┤
│            [Lưu thay đổi]│  ← CardFooter: flex justify-end
└─────────────────────────┘
```

#### Badge

Component: shadcn `Badge` + custom variants

**Variants:**

| Variant       | Background     | Text                        | Border                                       |
| ------------- | -------------- | --------------------------- | -------------------------------------------- |
| `default`     | bg-primary     | text-primary-foreground     | —                                            |
| `secondary`   | bg-secondary   | text-secondary-foreground   | —                                            |
| `outline`     | transparent    | text-foreground             | border                                       |
| `destructive` | bg-destructive | text-destructive-foreground | —                                            |
| `success`     | bg-emerald-100 | text-emerald-800            | — (dark: bg-emerald-900/30 text-emerald-400) |
| `warning`     | bg-amber-100   | text-amber-800              | — (dark: bg-amber-900/30 text-amber-400)     |
| `info`        | bg-sky-100     | text-sky-800                | — (dark: bg-sky-900/30 text-sky-400)         |

Size: `text-xs font-medium px-2.5 py-0.5 rounded-sm`

#### Avatar

Component: shadcn `Avatar`

- Size: h-8 w-8 (header), h-10 w-10 (profile), h-6 w-6 (table)
- Fallback: initials từ display_name (e.g., "Nguyễn Văn A" → "NA")
- Background fallback: bg-muted, text-muted-foreground, text-xs font-medium

#### Skeleton

Component: shadcn `Skeleton`

Dùng cho loading states:

- Table: 5 skeleton rows, matching column widths
- Card: skeleton cho title + value + trend
- Sidebar: skeleton cho nav items
- Form: skeleton cho labels + inputs

#### Empty State (Custom Pattern)

```
┌─────────────────────────────┐
│                             │
│         [Icon 48px]         │  ← Lucide icon, text-muted-foreground
│                             │
│   Chưa có món ăn nào        │  ← text-lg font-medium
│   Thêm món ăn đầu tiên     │  ← text-sm text-muted-foreground, text-center
│   cho thực đơn của bạn.     │
│                             │
│      [+ Thêm món ăn]        │  ← Button variant="outline" (primary action)
│   Hoặc nhập từ Excel        │  ← Button variant="link" text-sm (secondary action, optional)
│                             │
└─────────────────────────────┘
```

Empty state nên có:

- **Primary action**: Button outline rõ ràng (e.g., "+ Thêm món ăn")
- **Secondary action** (optional): link nhỏ bên dưới cho hành động thay thế (e.g., "Nhập từ Excel", "Xem hướng dẫn")
- Container: dashed border (`border-dashed`), py-12, max-w-sm mx-auto

### 6.3 Form Components

#### Input

Component: shadcn `Input`

**Variants:**

Default:

```text
[                    ]  → h-9, rounded-md, border, text-sm
```

With prefix (VND):

```text
[₫ |              ]  → prefix: text-muted-foreground, border-r, px-3
```

With suffix (%):

```text
[              | % ]  → suffix: text-muted-foreground, border-l, px-3
```

With icon (Search):

```text
[🔍|              ]  → icon: absolute left-3, input: pl-9
```

**States:**

- Default: border-input
- Focus: ring-2 ring-ring ring-offset-2
- Error: border-destructive ring-destructive
- Disabled: opacity-50 cursor-not-allowed
- Placeholder: text-muted-foreground

#### Textarea

Component: shadcn `Textarea`

- Min height: h-20 (4 lines)
- Resize: vertical only (resize-y)
- Same states as Input

#### Select

Component: shadcn `Select`

- Trigger: h-9, same styling as Input
- Content: bg-popover, rounded-md, shadow-md, border
- Item: py-2 px-3, hover:bg-accent, focus:bg-accent
- Dùng cho: branch picker, role picker, category filter, status filter

#### Combobox (Searchable Select)

Pattern: shadcn `Popover` + `Command`

- Dùng cho: staff assignment, menu item selection, large lists (>10 items)
- Search input trong Command
- Empty state: "Không tìm thấy kết quả"

#### Checkbox

Component: shadcn `Checkbox`

- Size: h-4 w-4
- Checked: bg-primary, border-primary, white checkmark
- Dùng cho: table row selection, multi-select options

#### Switch

Component: shadcn `Switch`

- Size: h-5 w-9
- Dùng cho: is_active toggles, is_available toggles, boolean settings
- Label bên trái: "Đang hoạt động" + description text below

#### Label

Component: shadcn `Label`

- Style: text-sm font-medium
- Required fields: append ` *` với `text-destructive`
- Associated với input qua `htmlFor`

#### Form Layout

Component: shadcn `Form` (react-hook-form + Zod)

```
FormField
  └── FormItem (space-y-2)
      ├── FormLabel       → Label component + required indicator
      ├── FormControl     → Input/Select/Textarea/etc.
      ├── FormDescription → text-xs text-muted-foreground (optional hint)
      └── FormMessage     → text-sm text-destructive (validation error)
```

**Form spacing:**

- Between fields: `space-y-4`
- Between sections: `space-y-6`
- Form width: `max-w-2xl` (create/edit), full-width (settings/filters)

#### Number Input for VND

Custom pattern wrapping shadcn Input:

- Prefix: `₫` (text-muted-foreground)
- `inputMode="numeric"` (mobile keyboard)
- Format on blur: `45000` → `45.000`
- Store raw number (no formatting in state)
- Placeholder: `0`
- Class: `tabular-nums text-right`

> **Cursor handling:** Khi format dấu chấm (.) trên input, regex replace đơn giản sẽ gây nhảy cursor.
> Cân nhắc dùng `react-number-format` hoặc custom hook để duy trì vị trí cursor khi user đang gõ.
> Approach đơn giản: chỉ format on blur, giữ raw number khi đang focus.

#### Date Picker

Pattern: shadcn `Popover` + `Calendar`

- Format display: `dd/MM/yyyy` (Vietnamese standard)
- Placeholder: "Chọn ngày"
- Calendar: locale vi, start week on Monday
- Optional: date range picker cho reports

### 6.4 Feedback & Overlay Components

#### Dialog (Modal)

Component: shadcn `Dialog`

**Sizes:**

| Size      | Class                      | Dùng cho                       |
| --------- | -------------------------- | ------------------------------ |
| `sm`      | `max-w-sm`                 | Simple confirms, quick actions |
| `default` | `max-w-lg`                 | Create/edit forms (1-5 fields) |
| `lg`      | `max-w-2xl`                | Complex forms, multi-section   |
| `xl`      | `max-w-4xl`                | Previews, large content        |
| `full`    | `max-w-[calc(100vw-4rem)]` | Full-screen modals (rare)      |

**Structure:**

```
Dialog
  └── DialogContent
      ├── DialogHeader
      │   ├── DialogTitle     → text-lg font-semibold
      │   └── DialogDescription → text-sm text-muted-foreground
      ├── [Form/Content]      → py-4
      └── DialogFooter        → flex gap-2 justify-end
          ├── Button variant="outline" → Hủy
          └── Button variant="default" → [Action verb]
```

**Rules:**

- Always include DialogTitle (accessibility)
- Close button (X) top-right
- Click outside → close (default behavior)
- Escape → close
- Footer buttons: Cancel (outline, left) + Primary action (right)
- Loading state: primary button shows spinner + disabled

#### Alert Dialog (Destructive Confirm)

Component: shadcn `AlertDialog`

Dùng cho: delete item, deactivate staff, cancel order

```
┌─────────────────────────────┐
│  Xóa món ăn?                │  ← AlertDialogTitle
│                             │
│  Bạn có chắc muốn xóa      │  ← AlertDialogDescription
│  "Cơm tấm sườn nướng"?     │
│  Hành động này không thể    │
│  hoàn tác.                  │
│                             │
│       [Hủy]  [Xóa món ăn]  │  ← Cancel (outline) + Destructive
└─────────────────────────────┘
```

**Rules:**

- Destructive button: `variant="destructive"`, explicit action text ("Xóa món ăn" NOT "OK" or "Xác nhận")
- Cannot click outside to close
- Must explicitly choose Cancel or Confirm

#### Dropdown Menu

Component: shadcn `DropdownMenu`

Dùng cho:

1. Row actions (table): Trigger = ⋯ icon button (ghost, size="icon")
2. User menu (header): Trigger = Avatar

```
┌──────────────┐
│ ✏️ Chỉnh sửa │  ← DropdownMenuItem
│ 📋 Sao chép  │
│──────────────│  ← DropdownMenuSeparator
│ 🗑 Xóa       │  ← text-destructive
└──────────────┘
```

- Item height: min-h-[36px]
- Icons: 16px (size-4), mr-2
- Destructive items: `text-destructive focus:text-destructive`
- Keyboard: Arrow keys, Enter to select, Escape to close

#### Toast (Notifications)

Library: `sonner`

Position: bottom-right (desktop), bottom-center (mobile)

**Types:**

| Type    | Icon        | Duration | Dùng cho                         |
| ------- | ----------- | -------- | -------------------------------- |
| success | CheckCircle | 4s       | CRUD thành công                  |
| error   | XCircle     | 6s       | Lỗi validation, server error     |
| info    | Info        | 4s       | Thông báo chung                  |
| loading | Spinner     | ∞        | Đang xử lý (dismiss on complete) |

**Config:**

- Max visible: `visibleToasts={3}` — tránh spam UI, đặc biệt POS/KDS có updates liên tục
- Stacking: newest on top, older ones collapse
- Dismiss: swipe hoặc click X

**Examples:**

- "Đã lưu thực đơn" (success)
- "Đã xóa bàn số 5" (success)
- "Không thể kết nối server. Vui lòng thử lại." (error — luôn kèm hướng dẫn)
- "Đang tạo hóa đơn…" (loading — dùng `…` không phải `...`)

#### Tooltip

Component: shadcn `Tooltip`

- Delay: 300ms (delayDuration)
- Dùng cho: icon-only buttons, truncated text
- Max width: max-w-[250px]
- Style: bg-primary text-primary-foreground text-xs py-1 px-2 rounded

#### Sheet (Slide-over)

Component: shadcn `Sheet`

| Side    | Dùng cho                         |
| ------- | -------------------------------- |
| `left`  | Mobile sidebar navigation        |
| `right` | Quick-edit panels, filter panels |

- Width: w-[300px] (mobile sidebar), w-[400px] (edit panels)
- Overlay: bg-black/50
- Escape + click outside to close

#### Popover

Component: shadcn `Popover`

- Dùng cho: date picker, combobox dropdown, color picker, filter detail
- Alignment: start | center | end
- Side: top | bottom
- Style: bg-popover, rounded-md, shadow-md, border

#### Command Palette

Component: shadcn `Command`

- Trigger: `Cmd+K` (global keyboard shortcut)
- Dùng cho: global search across modules
- Groups: Trang (pages), Món ăn (menu items), Nhân viên (staff)
- Empty: "Không tìm thấy kết quả cho '[query]'"

### 6.5 Action Components

#### Button

Component: shadcn `Button`

**Variants:**

| Variant       | Style                                  | Dùng cho                       |
| ------------- | -------------------------------------- | ------------------------------ |
| `default`     | bg-primary text-primary-foreground     | Primary actions: Lưu, Thêm mới |
| `secondary`   | bg-secondary text-secondary-foreground | Secondary actions              |
| `outline`     | border bg-background                   | Cancel, back, alternative      |
| `ghost`       | transparent, hover:bg-accent           | Icon buttons, nav items        |
| `destructive` | bg-destructive                         | Delete, deactivate             |
| `link`        | text-primary underline                 | Inline links                   |

**Sizes:**

| Size      | Class            | Dùng cho                  |
| --------- | ---------------- | ------------------------- |
| `sm`      | h-8 px-3 text-xs | Table actions, compact UI |
| `default` | h-9 px-4 text-sm | Forms, dialogs            |
| `lg`      | h-11 px-8        | Page-level CTAs           |
| `icon`    | h-9 w-9          | Icon-only buttons         |

**Loading state:**

```tsx
<Button disabled>
  <Loader2 className="mr-2 size-4 animate-spin" />
  Đang lưu...
</Button>
```

**POS Button sizes:**

- Menu item tap: min-h-[48px]
- Payment button: h-12 w-full text-base font-semibold
- Quantity stepper: h-10 w-10

**KDS Button sizes:**

- Bump button: h-16 w-full text-lg font-bold

#### Pagination

Custom pattern or shadcn `Pagination`

```
← Trước  1  2  [3]  4  5  Sau →     Hiển thị 21-30 của 148 kết quả
```

- Current page: bg-primary text-primary-foreground
- Other pages: bg-background hover:bg-accent
- Disabled: opacity-50
- Items per page: Select (10 / 20 / 50)

#### Toggle Group

Component: shadcn `ToggleGroup`

- Dùng cho: Grid/List view switcher, time range selector (Hôm nay / Tuần / Tháng)
- Style: border rounded-md, active item: bg-accent

---

## 7. Icons

**Library:** Lucide React (tree-shakeable, consistent stroke style)

### 7.1 Size Scale

| Surface | Default Size | Stroke Width | Class    |
| ------- | ------------ | ------------ | -------- |
| Admin   | 20px         | 1.5          | `size-5` |
| POS     | 24px         | 2            | `size-6` |
| KDS     | 28px         | 2            | `size-7` |
| Inline  | 16px         | 1.5          | `size-4` |

### 7.2 Module Icon Mapping

| Module    | Icon | Lucide Name       |
| --------- | ---- | ----------------- |
| Dashboard | 📊   | `LayoutDashboard` |
| Menu      | 🍴   | `UtensilsCrossed` |
| Orders    | 🧾   | `Receipt`         |
| Inventory | 📦   | `Package`         |
| Staff/HR  | 👥   | `Users`           |
| CRM       | ❤️   | `Heart`           |
| Finance   | 💰   | `Wallet`          |
| Reports   | 📈   | `BarChart3`       |
| Settings  | ⚙️   | `Settings`        |
| POS       | 🛒   | `ShoppingCart`    |
| KDS       | 👨‍🍳   | `ChefHat`         |

### 7.3 Action Icon Mapping

| Action     | Icon | Lucide Name         |
| ---------- | ---- | ------------------- |
| Search     | 🔍   | `Search`            |
| Add/Create | ➕   | `Plus`              |
| Edit       | ✏️   | `Pencil`            |
| Delete     | 🗑   | `Trash2`            |
| More/Menu  | ⋯    | `MoreHorizontal`    |
| Back       | ←    | `ArrowLeft`         |
| Close      | ✕    | `X`                 |
| Filter     | 🔽   | `SlidersHorizontal` |
| Sort       | ↕    | `ArrowUpDown`       |
| Download   | ⬇    | `Download`          |
| Upload     | ⬆    | `Upload`            |
| Refresh    | 🔄   | `RefreshCw`         |
| Eye (view) | 👁   | `Eye`               |
| Copy       | 📋   | `Copy`              |
| Print      | 🖨   | `Printer`           |
| Logout     | 🚪   | `LogOut`            |

---

## 8. VND Currency Formatting

### Rules

- Separator: dấu chấm (.) — `45.000` NOT `45,000`
- Suffix: `đ` (chữ thường, không space) — `45.000đ`
- No decimals — `45.000đ` NOT `45.000,00đ`
- Negative: `-45.000đ`
- Zero: `0đ`
- Large numbers: `1.250.000đ`

### Implementation

```ts
// packages/shared/src/format/currency.ts
export function formatVND(amount: number): string {
  const formatted = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted}đ`;
}
```

### Display Classes

```
text-right tabular-nums font-medium
```

---

## 9. Accessibility

### 9.1 Contrast Ratios

- Normal text (< 18px): minimum 4.5:1 (WCAG AA)
- Large text (>= 18px bold or >= 24px): minimum 3:1
- Interactive elements: minimum 3:1 against adjacent colors
- ALL color combinations in §2 phải đạt WCAG AA minimum

### 9.2 Focus Management

- Visible focus ring trên mọi interactive elements: `ring-2 ring-ring ring-offset-2 ring-offset-background`
- Tab order: logical, left-to-right, top-to-bottom
- Focus trap trong Dialog/AlertDialog/Sheet
- Return focus sau khi đóng overlay

### 9.3 Touch Targets

| Surface  | Minimum Size | Class               |
| -------- | ------------ | ------------------- |
| Admin    | 32 x 32 px   | `min-h-8 min-w-8`   |
| POS      | 48 x 48 px   | `min-h-12 min-w-12` |
| KDS      | 64 x 64 px   | `min-h-16 min-w-16` |
| Employee | 44 x 44 px   | `min-h-11 min-w-11` |

### 9.4 Keyboard Navigation

- All actions reachable via Tab + Enter/Space
- Escape: close modals, popovers, dropdowns
- Arrow keys: navigate within menus, tables, tabs
- Cmd+K: open command palette (global search)

### 9.5 Screen Reader

- Icon-only buttons: `aria-label` bắt buộc (e.g., `aria-label="Chỉnh sửa"`)
- Status badges: `role="status"` or explicit text
- Loading states: `aria-busy="true"`, `aria-live="polite"` for updates
- Form errors: linked via `aria-describedby`
- Tables: proper `<th scope="col">` headers

### 9.6 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 9.7 Color Independence

Never use color alone to convey information:

- Status badges: color + text label + icon
- Form errors: red border + error icon + text message
- Chart data: color + pattern/shape + label

---

## 10. Animation & Transitions

### 10.1 Duration Scale

| Duration | Value | Dùng cho                      |
| -------- | ----- | ----------------------------- |
| Fast     | 150ms | Hover states, opacity changes |
| Normal   | 200ms | Dialogs, popovers, dropdowns  |
| Slow     | 300ms | Sheet slide, sidebar collapse |

### 10.2 Easing

- Enter: `ease-out` (decelerate)
- Exit: `ease-in` (accelerate)
- Move: `ease-in-out`

### 10.3 Standard Animations

```css
@theme {
  --animate-fade-in: fade-in 0.2s ease-out;
  --animate-fade-out: fade-out 0.15s ease-in;
  --animate-slide-in-right: slide-in-right 0.3s ease-out;
  --animate-slide-out-right: slide-out-right 0.3s ease-in;
  --animate-scale-in: scale-in 0.2s ease-out;
}
```

---

## 11. Dark Mode Strategy

### Implementation

- Tailwind v4: `@custom-variant dark (&:where(.dark, .dark *))`
- Toggle class `dark` on `<html>` element
- Store preference in `localStorage` key `theme`
- System preference: `prefers-color-scheme` as default

### Surface Defaults

| Surface  | Default Theme | User Toggle?     |
| -------- | ------------- | ---------------- |
| Admin    | Light         | Yes (header)     |
| POS      | Light         | Yes (settings)   |
| KDS      | **Dark**      | No (always dark) |
| Employee | System        | Yes              |
| Login    | Light         | No               |

---

## 12. File Structure

```
packages/ui/
├── components.json            ← shadcn CLI config
├── package.json               ← deps: cva, clsx, tailwind-merge, lucide-react, radix-ui
├── src/
│   ├── index.ts               ← barrel export
│   ├── lib/
│   │   └── utils.ts           ← cn() utility
│   └── components/
│       ├── button.tsx          ← shadcn components (copied, owned)
│       ├── card.tsx
│       ├── input.tsx
│       ├── ...
│       └── ui/                 ← custom composite components
│           ├── stat-card.tsx
│           ├── empty-state.tsx
│           ├── data-table.tsx
│           └── vnd-input.tsx

apps/web/
├── app/
│   ├── globals.css            ← @theme tokens, dark mode, base styles
│   ├── layout.tsx             ← Be Vietnam Pro font, body classes, ThemeProvider
│   └── ...

packages/shared/
├── src/
│   ├── format/
│   │   └── currency.ts        ← formatVND()
│   └── auth/
│       ├── module-acl.ts      ← existing, sidebar reads from this
│       └── nav-config.ts      ← sidebar groups derived from MODULE_ACL
```

---

## 13. Dependencies

### packages/ui

| Package                    | Version | Purpose                  |
| -------------------------- | ------- | ------------------------ |
| `class-variance-authority` | ^0.7.1  | Component variant system |
| `clsx`                     | ^2.1.1  | Conditional class names  |
| `tailwind-merge`           | ^3.5.0  | Merge Tailwind classes   |
| `lucide-react`             | ^1.7.0  | Icon library             |
| `sonner`                   | ^2.0.7  | Toast notifications      |
| `@radix-ui/react-*`        | latest  | Headless UI primitives   |

### apps/web

| Package                 | Version | Purpose                 |
| ----------------------- | ------- | ----------------------- |
| `@tanstack/react-table` | ^8.21.3 | Data table logic        |
| `react-hook-form`       | ^7.72.0 | Form state management   |
| `@hookform/resolvers`   | ^5.2.2  | Zod integration for RHF |

### shadcn Components (Sprint 1)

Layout: `sidebar`, `separator`, `sheet`, `scroll-area`, `collapsible`
Forms: `button`, `input`, `label`, `select`, `checkbox`, `switch`, `textarea`, `form`, `calendar`, `popover`
Data: `table`, `badge`, `avatar`, `tabs`
Feedback: `dialog`, `alert-dialog`, `dropdown-menu`, `tooltip`, `command`, `sonner`
Display: `card`, `skeleton`, `breadcrumb`, `toggle-group`, `pagination`

---

## 14. Web Interface Guidelines

> Nguồn: Vercel Web Interface Guidelines + Web Design best practices

### HTML & Semantics

- `<button>` cho actions, `<a>` cho navigation — KHÔNG BAO GIỜ `<div onClick>`
- `<img>` luôn có `width` + `height` attributes (tránh CLS)
- Below-fold images: `loading="lazy"`
- Icon-only buttons: `aria-label` bắt buộc
- Form controls: `<label>` hoặc `aria-label`
- Skip link cho main content
- Headings theo thứ bậc `<h1>`–`<h6>`

### Forms

- `autocomplete` + `name` attributes có ý nghĩa (e.g., `autocomplete="email"`)
- `type` + `inputMode` phù hợp (`email`, `tel`, `numeric`)
- `spellCheck={false}` cho email, codes, usernames
- Placeholders kết thúc bằng `…`: "Tìm kiếm…", "Nhập email…"
- KHÔNG ĐƯỢC chặn paste (`onPaste` + `preventDefault`)
- Labels phải clickable (`htmlFor` hoặc wrap control)
- Submit button giữ enabled cho đến khi request bắt đầu → show spinner
- Errors hiển thị inline cạnh field + focus first error on submit
- Cảnh báo khi navigate với unsaved changes (`beforeunload`)

### Text & Typography

- Dấu ba chấm: `…` (ellipsis character) không phải `...`
- Ngoặc kép: `"` `"` (curly quotes)
- Loading text: "Đang lưu…", "Đang tải…"
- `text-wrap: balance` cho headings (tránh widows/orphans)
- Text containers: `truncate`, `line-clamp-*`, hoặc `break-words`
- Flex children: `min-w-0` để cho phép truncation

### Animation

- CHỈ animate `transform` + `opacity` (compositor-friendly)
- KHÔNG BAO GIỜ `transition: all` — list properties cụ thể
- Honor `prefers-reduced-motion`
- Animations phải interruptible — phản hồi user input giữa chừng

### State & Navigation

- URL phản ánh state: filters, tabs, pagination trong query params
- Deep-link mọi stateful UI
- Destructive actions: confirmation dialog hoặc undo window — KHÔNG immediate

### Touch & Mobile

- `touch-action: manipulation` trên POS/KDS (tránh double-tap zoom delay)
- `overscroll-behavior: contain` trong modals/drawers/sheets
- `autoFocus`: chỉ dùng trên desktop, single primary input; tránh trên mobile

### Dark Mode

- `color-scheme: dark` trên `<html>` cho dark themes
- `<meta name="theme-color">` match page background
- Native `<select>`: set explicit `background-color` + `color` (Windows dark mode)

### Performance

- Lists > 50 items: virtualization bắt buộc (`virtua` hoặc `content-visibility: auto`)
- Tránh layout reads trong render (`getBoundingClientRect`, `offsetHeight`)
- `<link rel="preconnect">` cho CDN/asset domains

---

## 15. React Performance Patterns

> Nguồn: Vercel React Best Practices (57 rules, 8 categories)

### Eliminating Waterfalls (CRITICAL)

- `Promise.all()` cho independent fetches
- `await` chỉ ở nhánh thực sự cần — defer await
- Suspense boundaries để stream content

### Bundle Size (CRITICAL)

- Direct imports: `@comtammatu/ui/components/button` — KHÔNG barrel import trong client
- `next/dynamic` cho heavy components (Calendar, DataTable trong modals)
- Analytics/3rd-party: load sau hydration (`next/script strategy="afterInteractive"`)

### Server Performance (HIGH)

- `React.cache()` cho per-request deduplication
- Minimize data serialized từ Server Components sang Client
- `server.after()` (Next.js 16) cho non-blocking ops (audit logs, analytics)
- Server Actions: authenticate như API routes

### Re-render Optimization (MEDIUM)

- `useMemo` cho expensive computations
- Functional `setState`: `setCount(prev => prev + 1)` cho stable callbacks
- Primitive deps trong `useEffect`
- Derived state: compute during render, không dùng `useEffect`
- `useTransition` cho non-urgent updates (filters, search)

---

## 16. React Composition Patterns

> Nguồn: Vercel Composition Patterns

### Component Architecture

- **KHÔNG boolean prop proliferation**: Không `isThread`, `isEditing`, `isDMThread`
- Mỗi boolean doubles possible states → exponential complexity
- **Compound components** thay vì monolithic:

```tsx
// ĐÚNG: composition
<Composer.Frame>
  <Composer.Header />
  <Composer.Input />
  <Composer.Footer>
    <Composer.Attachments />
    <Composer.SendButton />
  </Composer.Footer>
</Composer.Frame>

// SAI: boolean props
<Composer isThread isDMThread isEditing />
```

### Explicit Variants

- Tạo variant components rõ ràng thay vì boolean modes:
  - `<MenuItemCard />` và `<MenuItemRow />` thay vì `<MenuItem isCard />`
  - `<ChannelComposer />` và `<ThreadComposer />` thay vì `<Composer isThread />`

### State Management

- Lift state vào Provider components
- Decouple state từ UI qua context interface: `{ state, actions, meta }`
- Children over render props: `<DataTable>{children}</DataTable>` thay vì `renderRow={...}`

### React 19 APIs

- **KHÔNG `forwardRef`** — ref là regular prop trong React 19
- Dùng `use()` thay vì `useContext()`

---

## 17. Copywriting & Content Guidelines

### Vietnamese UI Text Rules

- **Active voice**: "Thêm món ăn" không phải "Món ăn sẽ được thêm"
- **Button labels cụ thể**: "Lưu thực đơn", "Xóa nhân viên", "Tạo chi nhánh" — KHÔNG "Lưu", "OK", "Xác nhận"
- **Error messages kèm hướng dẫn**: "Email không hợp lệ. Vui lòng nhập đúng định dạng." — KHÔNG chỉ "Lỗi"
- **Số dùng chữ số**: "8 chi nhánh" không phải "tám chi nhánh"
- **`&` thay "và"** khi thiếu space: "Sườn & Bì" trong badges
- **Loading**: "Đang lưu…", "Đang tải…" (kết thúc bằng `…`)
- **Placeholder**: "Tìm kiếm…", "Nhập email…" (kết thúc bằng `…`)
- **Empty states**: icon + tiêu đề + mô tả (giải thích tại sao trống) + CTA button
- **Confirmation dialogs**: action verb cụ thể cho destructive button ("Xóa món ăn" không phải "Xóa")

### Date & Number Formatting

- Ngày: `dd/MM/yyyy` (Vietnamese standard) — dùng `Intl.DateTimeFormat`
- Giờ: `HH:mm` (24h format)
- Tiền: `formatVND()` — KHÔNG hardcode format
- Số: `Intl.NumberFormat('vi-VN')` cho non-currency numbers

---

## 18. Design Quality Principles

> Nguồn: Frontend Design skill — tránh "AI slop" aesthetics

### Aesthetic Direction: Warm Professional

- **Tone**: Warm, trustworthy, traditional-meets-modern. Nhà hàng cơm tấm Việt Nam chuyên nghiệp
- **NOT generic**: Không Inter/Roboto/Arial, không purple gradients, không cookie-cutter layouts
- **Dominant + accent**: Warm amber-brown primary đậm + gold accent sắc nét. Không phân bổ màu đều
- **Intentional choices**: Mỗi quyết định thiết kế phải có lý do rõ ràng

### Per-Surface Aesthetic

| Surface  | Aesthetic              | Key Feeling                       |
| -------- | ---------------------- | --------------------------------- |
| Admin    | Clean professional     | Efficient, organized, trustworthy |
| POS      | Bold, touch-optimized  | Fast, clear, confident            |
| KDS      | Industrial utilitarian | Raw, high-contrast, no decoration |
| Employee | Warm, simple           | Welcoming, easy, personal         |
| Login    | Brand-forward          | Warm, memorable, premium          |

### Visual Polish Checklist

- [ ] Spacing consistent (4px grid)
- [ ] Color palette cohesive (warm family)
- [ ] Typography hierarchy clear (scan-friendly)
- [ ] Empty states designed (not broken UI)
- [ ] Loading states smooth (skeleton, not blank)
- [ ] Error states helpful (not just red text)
- [ ] Hover/active states provide feedback
- [ ] Focus rings visible on all interactive elements
- [ ] Animations subtle and purposeful
- [ ] Vietnamese text renders correctly (diacritics, line-height)
