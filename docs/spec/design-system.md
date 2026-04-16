# Design System - Cơm Tấm Má Tư Web App

> Version: 9.0.0 | Updated: 2026-04-16
> Stack: Next.js 16.2 · React 19.2 · Tailwind CSS 4.2 · shadcn/ui · TypeScript 6.0

## Source of Truth

UI governance phai di theo config va runtime that su cua repo. Thu tu uu tien:

1. `packages/ui/components.json`
2. `apps/web/components.json`
3. `apps/web/app/globals.css`
4. `apps/web/app/layout.tsx`
5. Tai lieu nay

Tai lieu nay chi duoc mo ta nhung gi dang co that trong 4 nguon tren. Docs khong duoc invent theme, font, layer, hay preset moi.

## Active shadcn Preset

Preset hien tai cua du an:

- `style`: `radix-mira`
- `baseColor`: `taupe`
- `cssVariables`: `true`
- `menuColor`: `default`
- `menuAccent`: `subtle`
- primitive source: `packages/ui/src/components/*`

He thong nay duoc xem la preset cao nhat cho UI primitives. Moi rule moi phai phuc tung preset nay.

## Runtime Theme Notes

Theme direction hien tai duoc suy ra tu `globals.css`, khong tu prose marketing:

- `primary` va `sidebar-primary` nam trong nhom orange/rust
- `chart-1` -> `chart-5` nam trong nhom amber/orange
- exact token values song trong `apps/web/app/globals.css`

Docs khong duoc dat ten mot "art direction" rieng neu code/config khong co mot preset tuong ung.

## Runtime Typography Notes

Typography phai duoc mo ta theo mapping hien tai:

- `apps/web/app/layout.tsx` load `Inter`, `Be_Vietnam_Pro`, `Lora`, `IBM_Plex_Mono`
- `Inter` dang duoc gan vao `--font-sans`
- `apps/web/app/globals.css` dang map `--font-heading` ve `--font-sans`
- vi vay, `font-sans` va `font-heading` hien tai deu theo `Inter`

`Be_Vietnam_Pro`, `Lora`, va `IBM_Plex_Mono` co duoc load trong layout, nhung khong duoc coi la UI token contract chinh neu chua duoc map thanh token su dung that su trong `globals.css`.

## Token Contract

Nguon chinh xac: `apps/web/app/globals.css`. Tat ca values dung `oklch()`.

### Light mode (`:root`)

| Token                  | Value                        |
| ---------------------- | ---------------------------- |
| `background`           | `oklch(1 0 0)`               |
| `foreground`           | `oklch(0.147 0.004 49.3)`    |
| `card`                 | `oklch(1 0 0)`               |
| `card-foreground`      | `oklch(0.147 0.004 49.3)`    |
| `popover`              | `oklch(1 0 0)`               |
| `popover-foreground`   | `oklch(0.147 0.004 49.3)`    |
| `primary`              | `oklch(0.553 0.195 38.402)`  |
| `primary-foreground`   | `oklch(0.98 0.016 73.684)`   |
| `secondary`            | `oklch(0.967 0.001 286.375)` |
| `secondary-foreground` | `oklch(0.21 0.006 285.885)`  |
| `muted`                | `oklch(0.96 0.002 17.2)`     |
| `muted-foreground`     | `oklch(0.547 0.021 43.1)`    |
| `accent`               | `oklch(0.96 0.002 17.2)`     |
| `accent-foreground`    | `oklch(0.214 0.009 43.1)`    |
| `destructive`          | `oklch(0.577 0.245 27.325)`  |
| `border`               | `oklch(0.922 0.005 34.3)`    |
| `input`                | `oklch(0.922 0.005 34.3)`    |
| `ring`                 | `oklch(0.714 0.014 41.2)`    |
| `success`              | `oklch(0.627 0.154 154.032)` |
| `success-foreground`   | `oklch(0.982 0.018 155.826)` |
| `warning`              | `oklch(0.741 0.148 75.164)`  |
| `warning-foreground`   | `oklch(0.211 0.034 58.016)`  |
| `info`                 | `oklch(0.607 0.152 252.417)` |
| `info-foreground`      | `oklch(0.985 0.016 252.417)` |
| `sidebar`              | `oklch(0.986 0.002 67.8)`    |
| `sidebar-foreground`   | `oklch(0.147 0.004 49.3)`    |
| `sidebar-primary`      | `oklch(0.646 0.222 41.116)`  |
| `sidebar-primary-foreground` | `oklch(0.98 0.016 73.684)` |
| `sidebar-accent`       | `oklch(0.96 0.002 17.2)`     |
| `sidebar-accent-foreground` | `oklch(0.214 0.009 43.1)` |
| `sidebar-border`       | `oklch(0.922 0.005 34.3)`    |
| `sidebar-ring`         | `oklch(0.714 0.014 41.2)`    |
| `radius`               | `0.625rem`                   |

### Dark mode (`.dark`)

| Token                  | Value                        |
| ---------------------- | ---------------------------- |
| `background`           | `oklch(0.147 0.004 49.3)`    |
| `foreground`           | `oklch(0.986 0.002 67.8)`    |
| `card`                 | `oklch(0.214 0.009 43.1)`    |
| `card-foreground`      | `oklch(0.986 0.002 67.8)`    |
| `primary`              | `oklch(0.47 0.157 37.304)`   |
| `primary-foreground`   | `oklch(0.98 0.016 73.684)`   |
| `secondary`            | `oklch(0.274 0.006 286.033)` |
| `secondary-foreground` | `oklch(0.985 0 0)`           |
| `muted`                | `oklch(0.268 0.011 36.5)`    |
| `muted-foreground`     | `oklch(0.714 0.014 41.2)`    |
| `accent`               | `oklch(0.268 0.011 36.5)`    |
| `accent-foreground`    | `oklch(0.986 0.002 67.8)`    |
| `destructive`          | `oklch(0.704 0.191 22.216)`  |
| `border`               | `oklch(1 0 0 / 10%)`         |
| `input`                | `oklch(1 0 0 / 15%)`         |
| `ring`                 | `oklch(0.547 0.021 43.1)`    |
| `success`              | `oklch(0.696 0.17 152.729)`  |
| `success-foreground`   | `oklch(0.982 0.018 155.826)` |
| `warning`              | `oklch(0.811 0.148 75.164)`  |
| `warning-foreground`   | `oklch(0.211 0.034 58.016)`  |
| `info`                 | `oklch(0.707 0.152 252.417)` |
| `info-foreground`      | `oklch(0.985 0.016 252.417)` |
| `sidebar`              | `oklch(0.214 0.009 43.1)`    |
| `sidebar-foreground`   | `oklch(0.986 0.002 67.8)`    |
| `sidebar-primary`      | `oklch(0.705 0.213 47.604)`  |
| `sidebar-primary-foreground` | `oklch(0.98 0.016 73.684)` |
| `sidebar-accent`       | `oklch(0.268 0.011 36.5)`    |
| `sidebar-accent-foreground` | `oklch(0.986 0.002 67.8)` |
| `sidebar-border`       | `oklch(1 0 0 / 10%)`         |
| `sidebar-ring`         | `oklch(0.547 0.021 43.1)`    |

### Chart tokens (light & dark same)

| Token     | Value                       |
| --------- | --------------------------- |
| `chart-1` | `oklch(0.879 0.169 91.605)` |
| `chart-2` | `oklch(0.769 0.188 70.08)`  |
| `chart-3` | `oklch(0.666 0.179 58.318)` |
| `chart-4` | `oklch(0.555 0.163 48.998)` |
| `chart-5` | `oklch(0.473 0.137 46.201)` |

### Radius scale (`@theme inline`)

| Token        | Value                        |
| ------------ | ---------------------------- |
| `radius-sm`  | `calc(var(--radius) * 0.6)`  |
| `radius-md`  | `calc(var(--radius) * 0.8)`  |
| `radius-lg`  | `var(--radius)` = `0.625rem` |
| `radius-xl`  | `calc(var(--radius) * 1.4)`  |
| `radius-2xl` | `calc(var(--radius) * 1.8)`  |
| `radius-3xl` | `calc(var(--radius) * 2.2)`  |
| `radius-4xl` | `calc(var(--radius) * 2.6)`  |

## Architecture

UI hien tai co 3 tang, khong co tang thu 4:

### 1. Foundation

Song trong `apps/web/app/globals.css`.

Chiu trach nhiem cho:

- CSS variables
- token mau
- token radius
- token ring/border/input
- chart tokens
- sidebar tokens
- base element styling

### 2. Primitives

Song trong `packages/ui/src/components/*`.

Day la cac shadcn/ui components da duoc copy vao repo va tuy bien tren nen preset hien tai. Vi du:

- `button`
- `table`
- `sidebar`
- `card`
- `badge`
- `dialog`
- `sheet`
- `tabs`
- `input`
- `select`

Primitive layer la nguon chuan toi cao cho behavior va styling co ban cua component.

### 3. App Composition

Song trong app web, chu yeu o:

- `apps/web/app/components/patterns.tsx`
- shell files nhu:
  - `apps/web/app/admin/components/admin-shell.tsx`
  - `apps/web/app/inventory/_components/inventory-shell.tsx`
  - `apps/web/app/hr/components/hr-shell.tsx`

Composition layer chi duoc phep sap xep va tai su dung primitive hien co. No khong duoc tro thanh mot design system song song.

## Public Contracts

Primitive contracts chinh thuc:

- `Button`
- `Table`
- `Sidebar`
- `Card`
- `Badge`

App composition contracts dang ton tai:

- `PageContainer`
- `PageHeader`
- `SectionCard`
- `FilterBar`
- `EmptyState`
- `EmptyStatePanel`
- `StatusBadge`
- `ActionIconButton`

Nhung wrapper nay chi hop le khi chung composition lai primitive va token hien co. Chung khong duoc dinh nghia spacing scale, density taxonomy, shell API, hay visual grammar moi vuot preset.

## Preset-First Rules

1. Khong override preset o muc primitive.
2. Khong tao "design language" rieng vuot qua `radix-mira` + `taupe`.
3. Khong tao layer moi nhu `components/v2` neu layer do chua ton tai trong repo.
4. Khong mo ta docs nhu the du an dang co mot preset/theme khac voi `components.json`.
5. Khong them wrapper moi chi de ep `padding`, `margin`, `size`, hoac `radius` khac preset.
6. Khi can nhat quan usage, uu tien dung lai primitive va wrappers hien co.
7. Khi can doi preset/runtime, phai doi config/code truoc roi moi cap nhat docs.

## Use This, Not That

Nen dung:

- `@comtammatu/ui/components/button`
- `@comtammatu/ui/components/table`
- `@comtammatu/ui/components/sidebar`
- `@comtammatu/ui/components/card`
- `@comtammatu/ui/components/badge`
- `apps/web/app/components/patterns.tsx` cho page/header/section/filter/empty/status/action khi wrapper do da du

Khong nen dung:

- primitive forks theo tung page
- wrapper moi chi de tao spacing grammar rieng
- docs noi ve typography/palette/surface grammar khong ton tai trong runtime
- references den `components/v2` hoac "V2 design direction" khi repo chua co layer do

## Accessibility

- Moi control tuong tac phai co visible focus state
- Keyboard navigation bat buoc hoat dong
- Touch target can phu hop voi ngu canh surface
- Reduced motion phai duoc ton trong
- Status colors phai giu contrast hop le

## Governance

1. Docs UI phai khop `components.json`, `globals.css`, va `layout.tsx`.
2. Khong import `theme.css` theo domain/page de override system.
3. Khong them static inline style vao foundation, shell, auth, hoac mobile chrome.
4. Khong them arbitrary Tailwind dimensions; mo rong token truoc khi mo rong usage.
5. Khong mo rong `patterns.tsx` thanh mot preset song song.
6. `pnpm typecheck && pnpm lint && pnpm build` phai xanh truoc khi ket luan task.

## Related Files

- `packages/ui/components.json`
- `apps/web/components.json`
- `apps/web/app/globals.css`
- `apps/web/app/layout.tsx`
- `packages/ui/src/components/*`
- `apps/web/app/components/patterns.tsx`
- `docs/modules/ui.md`
