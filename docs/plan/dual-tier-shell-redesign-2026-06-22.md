# Redesign 2 tầng: Shell điều hướng + relayout từng page (Office, Finance, Branch) — 2026-06-22

> **⚠️ SNAPSHOT (kế hoạch redesign) — Reconciled-through `637d0bbd` (2026-06-22).** Doc là kế hoạch thực thi; các wave land dần qua PR — verify trạng thái thật vào code/git trước khi tin. Quyết định bền nằm ở `decisions.md` (xem §7).

Owner chốt redesign **Layout Shell** + **UI từng page** của 3 nhóm route: Office
(admin/hr/menu/orders), Finance, Branch Management.

Quyết định đã khoá (owner):
- **Độ sâu UI page = relayout/polish TRONG Custom Theme hiện tại** — route page lên
  `surface.tsx` primitives, dọn slop, chuẩn hoá padding/rhythm. KHÔNG đổi
  màu/font/token, KHÔNG nhận diện mới.
- **Tier-1 = icon rail hẹp** (kiểu VS Code/Slack, hover ra tooltip), luôn hiện.

Phạm vi: **35 page / 4 shell** (Office 20, Finance 8 — 1 dùng chung với Office,
Branch command/settings 7). Nguồn khảo sát: workflow discovery 2026-06-22
(7 agent), khớp code thật.

---

## 1. Vì sao có việc này

Mọi shell back-office đang render `resolveOfficeNavGroups(role)` (≈9 mục office)
rồi mới append deep-nav của module → nav toàn cục lặp nguyên khối trên mọi màn,
đẩy deep-nav thật xuống dưới (Inventory ~15 mục dưới 9 mục office; mobile phải
cuộn hết office mới tới module). Đây là cái giá của D019 §1 (1 sidebar phẳng,
jump-anywhere). Dual-tier hoà giải: tier-1 (rail icon) giữ jump-anywhere ở dạng
nén; tier-2 (panel) chỉ deep-nav module đang mở → hết lặp.

## 2. Contract path: làm TẠI CHỖ, không viết lại design-system

Toàn bộ thay đổi shell nằm trong **`apps/web/app/components/app-shell.tsx`** (file
shell duy nhất trong allowlist) + 4 nav resolver. Rail = `<Sidebar
collapsible="none">` (cột icon cố định) + panel = khối `<Sidebar variant="inset">`
hiện có, **cùng một `SidebarProvider`/`SidebarInset`/`<main>`**.

Hệ quả governance:
- KHÔNG thêm `*-shell.tsx`, KHÔNG thêm `SidebarProvider`/`<main>` → baseline
  `shell-registry*` giữ nguyên, qua `lint:ui-contract`.
- CHỈ cần: vá **D019** (decision mới) + nới câu chữ **design-system.md §A/§B**
  ("một sidebar" = rail icon + panel trong cùng provider) + reconcile
  `docs/modules/ui.md` cùng PR (`lint:doc-staleness` fail-closed). Không đổi token,
  không raise baseline.
- Nếu (về sau) làm rail thành surface nav RIÊNG/`SidebarProvider` thứ 2 → mới phải
  sửa §A/§B nặng + raise baseline. **Plan này KHÔNG đi đường đó.**

## 3. Shell dual-tier — thiết kế

`AppShell` bỏ nhận `navGroups[]` phẳng, nhận 2 prop:

```ts
tier1: ShellNavItem[];   // rail icon: module-switcher cross-module, phẳng, icon-only
tier2: ShellNavGroup[];  // panel: deep-nav của module đang mở (có nhóm)
// prop `collapsible` BỎ — rail luôn "none", panel luôn "offcanvas"
```

**Tách resolver (giữ nav-as-data + MODULE_ACL SSoT):**
- Tier-1 (mới, trong `office-nav.ts`): `resolveOfficeRailItems(role, branchId)` =
  dedupe của `resolveAdminNavGroups` + `resolveWorkspaceItems` +
  `resolveBranchManagementItems`. **Luôn truyền home branchId** → sửa lỗi nhóm
  branch-management nhấp nháy giữa các module. pos/kds/runner vẫn ngoài rail.
- Tier-2 (per module): finance `resolveFinanceNav` (giữ nguyên), inventory
  `resolveInventoryNav` (giữ nguyên, vẫn branch-reactive), admin
  `resolveOfficeDeepNav` (mới, = 2 nhóm Điều hành/Quản lý), hr/menu/orders =
  1 nhóm landing (panel không rỗng), branch `resolveBranchDeepNav` (mới).

**Active-state (tái dùng `isNavItemActive`):** rail = coarse prefix-match,
`findActiveRailItem` sort href dài-trước (để `/admin/reports` thắng `/admin`);
panel = `findActiveNavItem(tier2, …)` như cũ. 2 list tách nhau → hết tranh chấp.

**Mobile (`WorkspaceBottomNav` nhận `{tier1,tier2}`):** bottom-bar = tier-2
(deep-nav module — most-tapped), thêm tab "Mô-đun" mở tier-1, tab "Menu" mở drawer
2 phần (tier-1 header + tier-2 body). `selectBottomNavItems` chỉ flatten trong
tier-2. Inventory `MobileTopBar`/`InventoryBranchFilter` không đụng tới.

**RSC + state an toàn:** server layout vẫn chỉ truyền `module` id serializable
(icon resolve client qua `OFFICE_ICON_MAP`); finance realtime channel giữ ở mức
shell (1 SidebarProvider, không remount); inventory tier-2 vẫn rebuild theo
`?branchId`, rail branch-agnostic.

**Regression net (risk: resolver hiện KHÔNG có test):** thêm unit test
`resolveOfficeRailItems` + membership MODULE_ACL theo role TRƯỚC khi refactor.

## 4. Definition of Done mỗi page (relayout trong theme)

`AppPage` (width: wide=table/dashboard, default=form/detail, narrow=form 1 cột;
density compact chỉ cho cockpit dày) → `AppPageHeader` (H1, eyebrow, meta period,
≤2 action, breadcrumb 1 back-affordance, tabs qua `AppPageTabs`) → `AppToolbar`
filter → `AppSection`/`Card` chrome → `AppEmptyState` cho mọi nhánh rỗng/guard/error.

Gate cứng/page: body trong `AppPage` (no root `p-*`/`max-w-*`); H1 qua
`AppPageHeader`; empty/guard = `AppEmptyState` (không bare div, không `throw`);
chrome = `AppSection` (no inline `rounded+border+bg-card`); filter = `AppToolbar`;
tabs = `AppPageTabs` ở header slot; stack `gap-{4|3}` không `space-y-*`; radius
đúng tier; 1 back-affordance; copy qua `messages.*` (không VI inline / eslint-disable).

## 5. Waves (D019: 1 route-family / 1 primitive-wave / PR)

| Wave | Nội dung | Page |
|---|---|---|
| **0** | **Foundation (BLOCKS ALL):** dual-tier rail tại chỗ trong `app-shell.tsx` + tách resolver + `findActiveRailItem` + bottom-nav 2 tầng + resolver tests + vá D019/§A§B. Primitive chung mới: `KpiRow`, `DescriptionList`, `LinkCardGrid`; retire alias `SurfaceLinkCard`→`AppLinkCard` | shell + lib |
| **1** | **ADMIN core** (traffic cao, slop nhiều): dashboard 388 dòng, staff, reports, audit filters, permissions `<dl>`→`DescriptionList` | 8 |
| **2** | **ADMIN/SETTINGS** (cấu trúc): `SettingsPageFrame`→bọc `AppPage` (1 sửa, 7 page lên rhythm); hoist owner-guard về layout; templates bỏ `throw` | 7 |
| **3** | **HR + MENU + ORDERS** (hội tụ tabs): `/menu` bỏ raw `UrlTabs`→`AppPageTabs`; **fix bug payroll `[periodId]` 2 tab trùng nội dung**; types ra khỏi page | 5 |
| **4** | **FINANCE** (page-shell contract): `/finance/revenue` thiếu `AppPage`; `[date]` guard bare-div→`AppEmptyState`; loader `_lib`; bỏ `throw`; `/finance/summary` thêm authz re-check | 7 |
| **5** | **Cross-shell IA:** `/admin/reports/inventory-value` vào từ Finance nhưng đổi nguyên shell → **cần owner quyết** (A: thêm route `/finance/inventory-value` dưới FinanceShell; B: giữ 1 route nhưng entry không đổi shell) + gate KPI theo `getInventoryValueVisibility` | 1 |
| **6** | **BRANCH command+settings:** dashboard 539 dòng tách config; hub gate ACL per-tile; kds query scope tenant/branch; chuẩn hoá title/description | 7 |

Thứ tự: 0 → 1 → 2 → 3 → 4 → 5 → 6. Sau Wave 0, **Wave 3/4/6 chạy song song
được** (route-family rời nhau); 1+2 tuần tự (cùng `/admin`); 5 chờ 1+4.

## 6. Verify mỗi wave

`pnpm typecheck && pnpm lint && pnpm build` xanh → `lint:ui-contract` **baseline
không tăng** (phải GIẢM khi dọn slop) → `lint:regression-guards` →
`lint:i18n:baseline` (wave gỡ VI inline) → `lint:doc-staleness` (Wave 0 / wave
sửa surface.tsx) → preview screenshot desktop+mobile từng route (padding 1 lần,
H1 đúng scale, active ring+bg, empty=AppEmptyState) → review pass riêng
(code-reviewer/verifier, không tự duyệt). Đính kèm before/after + baseline-delta.

## 7. Decision đang mở

- **Wave 5 (inventory-value cross-shell):** chọn A hay B (xem bảng). Quyết muộn
  được — phụ thuộc Wave 0/1/4. Ghi vào đây + `decisions.md` khi chốt.
- **Mobile model:** default = bottom-bar tier-2 + tab "Mô-đun". Owner có thể đảo
  sang bottom-bar = tier-1 nếu muốn ưu tiên chuyển module.

## 8. Nguồn

Spec đầy đủ (English, agent-internal): shellSpec + wavePlan từ workflow
`wf_9d873421-b96` (2026-06-22). D019: `docs/plan/decisions.md:96`. Contract:
`docs/spec/design-system.md` §A/§B + `docs/agent/rules/ui.md`.
