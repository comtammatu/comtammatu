# Design System — Cơm Tấm Má Tư

> Version: 5.0.0 | Updated: 2026-04-14
> Stack: Next.js 16.2 · React 19.2 · Tailwind CSS 4.2 · shadcn/ui · TypeScript 6.0

## Source of Truth

Design system có đúng một nguồn sự thật vận hành:

1. `apps/web/app/globals.css`
   Đây là nguồn compile/runtime cho token, utility và shared surface classes.
2. Tài liệu này
   Đây là nguồn quyết định sản phẩm, governance và contract implementation.

Hai nơi này phải khớp 1:1. Nếu token trong `globals.css` thay đổi mà spec chưa đổi, spec được xem là lỗi thời và phải được cập nhật ngay.

## Design Direction

Hướng chính thức là `Warm MD3`.

- Brand accent: burnt orange
- Surface: warm white
- Semantic status: success / warning / info / destructive
- Typography: Be Vietnam Pro cho trải nghiệm tiếng Việt-first
- Mục tiêu: đọc nhanh, vận hành dài giờ, tương thích dữ liệu dày và touch-first

Không còn dùng hướng `red/zinc minimal` làm chuẩn chính thức.

## Kiến trúc hệ thống UI

Design system được chia thành 3 tầng:

### 1. Foundation

Bao gồm:

- Color tokens
- Typography scale
- Spacing scale
- Radius
- Elevation
- Motion
- Focus ring
- Touch target
- Safe-area utilities

Foundation được định nghĩa ở `apps/web/app/globals.css`.

### 2. Recipes

Shared recipe layer là contract bắt buộc cho page-level composition:

- `PageContainer`
- `PageHeader`
- `FilterBar`
- `SectionCard`
- `EmptyState`
- `StatusBadge`

Recipe API hỗ trợ:

- `surface: "admin" | "inventory" | "pos" | "kds" | "employee" | "auth"`
- `density: "comfortable" | "compact" | "touch"`
- `tone: "neutral" | "success" | "warning" | "danger" | "info"`

Các helper class/variant chung được export từ `@comtammatu/ui`.

### 3. Surface variants

Surface được phép khác nhau ở:

- Density
- Emphasis
- Contrast
- Touch affordance
- Status presentation

Surface không được:

- Tự remap semantic token
- Tự tạo palette riêng
- Tự định nghĩa shell riêng nếu chỉ khác visual
- Import domain-level theme override CSS như pattern mặc định

## Token contract

### Core colors

Các token runtime chính nằm ở `@theme inline` trong `globals.css`:

- `background`
- `foreground`
- `primary`
- `primary-foreground`
- `secondary`
- `secondary-foreground`
- `accent`
- `accent-foreground`
- `muted`
- `muted-foreground`
- `card`
- `card-foreground`
- `border`
- `input`
- `ring`
- `destructive`
- `destructive-foreground`
- `success`
- `warning`
- `info`

### Surface semantics

- `surface-raised`
- `surface-sunken`
- `state-pending`
- `state-processing`
- `state-ready`
- `state-cancelled`

### Sidebar semantics

- `sidebar`
- `sidebar-foreground`
- `sidebar-primary`
- `sidebar-primary-foreground`
- `sidebar-accent`
- `sidebar-accent-foreground`
- `sidebar-border`
- `sidebar-ring`

### Typography tokens

- `font-sans`
- `font-mono`
- `text-data`
- `text-label`
- `text-caption`

### Layout tokens

- spacing: `space-1` → `space-12`
- radius: `radius-sm` → `radius-xl`
- elevation: `elevation-1` → `elevation-3`
- z-index overlays: `z-overlay-1` → `z-overlay-5`

## Surface defaults

### Admin

- Density: `comfortable`
- Mood: calm, data-dense, low noise
- Sidebar/header dùng shared shell contract

### Inventory

- Density: `comfortable`
- Có thể tăng emphasis cho operator workflows
- Được phép dùng scoped alias variable để map legacy inventory UI về global tokens
- Không được remap utility classes hoặc tạo theme CSS override mới

### POS

- Density: `touch`
- Touch target tối thiểu `44x44`, ưu tiên `56x56`
- CTA và action phải rõ trạng thái disabled/loading/error

### KDS

- Density: `touch`
- High contrast, distance readable
- Dark presentation được phép như một surface variant, không phải token system riêng

### Employee

- Density: `compact` trên mobile, `comfortable` ở sections dài
- Navigation dưới cùng và mobile header phải dùng shared shell rules

### Auth

- Có thể dùng brand emphasis mạnh hơn
- Vẫn phải đi qua cùng token và shared panel contract

## Shell contract

Shell logic vẫn ở app layer, nhưng visual contract phải thống nhất:

- Root shell dùng shared shell class/helper
- Header sticky + backdrop + border rhythm thống nhất
- Sidebar dùng shared sidebar surface contract
- Main content dùng spacing rhythm nhất quán
- Mobile nav/header phải có safe-area handling chung

Không tạo shell mới nếu chỉ khác visual. Khi cần shell mới, phải extend shared contract trước.

## Accessibility rules

- Mọi control tương tác phải có visible focus state
- Keyboard navigation bắt buộc hoạt động qua sidebar, dialog, sheet, dropdown, filter bar
- Touch-first surfaces phải đạt minimum touch target
- Reduced motion phải được tôn trọng
- Status colors phải giữ contrast hợp lệ với text và border

## Performance rules

- Không thêm client boundary chỉ để styling
- Static visual styling phải nằm trong token, utility hoặc shared recipe
- Inline style chỉ chấp nhận cho giá trị thật sự dynamic:
  - runtime width/height
  - chart coordinates
  - third-party primitive constraints
- Không import per-domain theme CSS
- Không duplicate recipe layer ở từng domain nếu khác biệt chỉ là visual

## Governance

Các rule sau là bắt buộc:

1. Không commit spec UI khác ngoài file này làm nguồn sự thật cạnh tranh.
2. Không import `theme.css` ở domain/page để override system.
3. Không thêm static inline style vào foundation, shell hoặc auth/mobile chrome.
4. Không map status màu trực tiếp trong feature page nếu đã có tone/recipe tương ứng.
5. Khi cần token mới, thêm vào `globals.css` trước rồi mới dùng ở component.
6. Khi cần visual khác cho surface, thêm variant ở shared recipe/helper trước rồi mới rollout vào page.

## Implementation checkpoints

Khi làm UI mới hoặc refactor UI cũ, tối thiểu phải kiểm:

- Đúng `surface`, `density`, `tone`
- Dùng shared recipe trước khi custom
- Không có `theme.css` import
- Không có static inline style ngoài whitelist
- `pnpm typecheck && pnpm lint && pnpm build` xanh

## Related files

- `apps/web/app/globals.css`
- `apps/web/app/components/foundation/ui-patterns.tsx`
- `packages/ui/src/lib/design-system.ts`
- `docs/modules/ui.md`
- `tasks/regressions.md`
