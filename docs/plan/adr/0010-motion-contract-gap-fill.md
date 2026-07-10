# ADR 0010 — Motion contract và gap-fill

**Trạng thái:** Accepted — Step 0 chốt phương án A (owner, 2026-07-10, D071); §G đã cập nhật; Phase 1 đang triển khai.\
**Nguồn ràng buộc:** Codex Outside Voice review (session `019f47e0-d4d8-76b2-8ac0-ee40afa261e7`) — owner đã đồng ý làm theo.\
**Tracker agent (English):** `tasks/todo.md` → section *Motion gap-fill (Codex rewrite)*.\
**Hợp đồng motion:** `docs/spec/design-system.md` § G.

---

## Vì sao viết lại

Plan kiểm kê trước đó đề xuất **Phase 1 gồm 7 hạng mục** (cart enter, POS grid fade, KDS ticket enter, KDS Focus↔Overview crossfade, POS sidebar status pulse, operator skeletons, list press). Codex Outside Voice **reject shape** đó vì:

1. **Xung đột Motion Contract § G** — `duration-300` đang khóa cho overlay/dialog/sheet enter–exit, không phải content/card/list enter trên app.
2. **Over-scope** — list press / grid fade / sidebar pulse / view crossfade không phải pain nóng nhất; hard-cut trên POS/KDS đôi khi đúng (thao tác ca cần nhanh, rõ).
3. **KDS false-positive** — animate theo key trên `displayOrders` sẽ nhầm snapshot refresh / filter / station / mode / ready removal với phiếu mới thật; tăng churn trên hot path realtime.
4. **Attention overload** — KDS đã có row pulse + age badge; thêm nhiều tín hiệu cạnh tranh dễ làm màn bếp ồn.

**Hướng chốt:** làm rõ contract trước → chỉ **2 tín hiệu state hot-path + loading skeletons**.

---

## Step 0 — Cổng Motion Contract (bắt buộc trước code)

### Vấn đề

§ G hiện khóa:

| Duration | Locked use |
| --- | --- |
| `duration-150` | `transition-colors` / focus-ring / border feedback trên control tương tác |
| `duration-300` | Overlay / dialog / sheet enter–exit (Radix `animate-in` / `animate-out`) |

Plan cũ dùng `duration-300` + `slide-in-from-*` cho cart line / KDS card / grid — **không khớp** bảng trên. Guard `motion-color-duration` cũng cấm `transition-colors` + `duration-300`.

### Quyết định cần owner (chọn một)

**Khuyến nghị (A) — mở hẹp content enter, không đụng `duration-300`:**

Cập nhật `docs/spec/design-system.md` § G trước khi code, thêm một hàng / đoạn rõ ràng kiểu:

> **One-shot content enter (app, hẹp).** Khi tín hiệu state change trên list/card/line (ví dụ dòng cart mới, phiếu KDS mới từ realtime INSERT), app MAY dùng `motion-safe:animate-in` với `fade-in` và/hoặc ring/opacity/transform hẹp, **`duration-150` only**. Không dùng `duration-300` cho content/card/list enter. Không slide dài / decorative. One-shot; clear key sau animation. Không áp cho search typing, filter/mode/station switch, hay snapshot refresh.

Hệ quả Phase 1:

- POS cart line: `motion-safe:` + `duration-150` (fade và/hoặc ring/transform hẹp) — **không** `slide-in-from-bottom` + `duration-300`.
- KDS new ticket: ring/fade ngắn `duration-150` — **không** `slide-in-from-top-2 duration-300`.

**Phương án (B) — không mở content enter trong § G:**

Không animate enter list/card. Phase 1 chỉ còn: (1) tín hiệu hẹp bằng `transition-colors` / ring `duration-150` nếu đã nằm trong contract hiện tại; (2) operator skeletons. Cart/KDS “enter” bị cắt hoặc thu về pulse/ring đã có pattern.

**Phương án (C) — nới `duration-300` cho content enter:**

Chỉ khi owner muốn giữ visual cũ của plan 7 mục. Phải sửa § G + giải thích vì sao overlay token dùng chung content — **không khuyến nghị** (Codex đã flag).

### Gate

- [ ] Owner chọn A / B / C (khuyến nghị **A**).
- [ ] Nếu A hoặc C: PR/doc cập nhật § G **trước hoặc cùng** PR implement đầu tiên — không ship animation content enter khi contract chưa khớp.
- [ ] **Không implement UI** cho đến khi Step 0 được chốt.

---

## Phase 1 — chỉ 3 hạng mục

Mục tiêu: feedback state change trên luồng ca ngày, trong khung contract sau Step 0.

### 1. POS cart line enter khi thêm món

| | |
| --- | --- |
| **Vì sao** | Functional: cashier cần thấy món vừa chạm đã vào cart — hiện chỉ có qty/content pulse / remove exit. |
| **Files** | `apps/web/app/(protected)/br/[branchId]/pos/_components/cart-pane.tsx`; optional helper `_lib/cart-line-enter.ts` (hoặc tương đương cạnh cart). |
| **Cách làm** | Track key dòng vừa thêm (one-shot Set); apply `motion-safe:` enter theo Step 0 (ưu tiên `duration-150`); clear sau hết animation. Không animate lại khi qty đổi trên dòng đã có (đã có pulse). |
| **Acceptance** | Thêm món → dòng mới có tín hiệu enter ngắn; qty++ trên dòng cũ không replay enter; Reduce motion → không enter; không `transition-all`, không framer-motion. |
| **Rủi ro** | Key ổn định sai → flash lại khi re-render; đụng `duration-300` nếu quên Step 0. |

### 2. KDS tín hiệu phiếu mới thật (genuine new-ticket)

| | |
| --- | --- |
| **Vì sao** | Bếp cần biết phiếu mới từ POS, không phải mọi lần `displayOrders` đổi key. |
| **Files** | Hook testable mới (ưu tiên) dưới `kds/_hooks/` (ví dụ `use-kds-new-ticket-signal.ts`); wire hẹp vào `order-grid.tsx` / `focus-view.tsx` / `kds-board.tsx` tùy chỗ render ticket. **Không** animate toàn bộ `displayOrders` theo React key. |
| **Phân loại bắt buộc** | Chỉ coi là “new ticket” khi nguồn là **realtime INSERT** (hoặc tương đương đã chứng minh). **Không** animate khi: snapshot refresh / reconnect / polling stale / visibility refresh; đổi filter; đổi station; đổi Focus↔Overview; ready removal / reorder queue. |
| **Visual** | Hẹp: ring và/hoặc fade ngắn theo Step 0; tránh slide-from-top-300. Không chồng thêm pulse dài nếu row effect + age badge đã đủ — một tín hiệu ticket-level ngắn, rồi tắt. |
| **Acceptance** | INSERT mới → đúng 1 ticket được highlight; reconnect/filter/station/mode → **0** enter giả; unit/hook test cover các nhánh classify; Reduce motion tắt visual; không attention overload. |
| **Rủi ro** | False positive trên hot path; timer/render churn; a11y — visual-only không thay toast/audio đã có. |

### 3. Operator route loading skeletons

| | |
| --- | --- |
| **Vì sao** | Bottom-nav Home↔Shift↔Team↔Orders hard-cut trống; hiện chỉ có `loading.tsx` ở `settings/`, `stock/`, `menu-limits/` (+ KDS/Runner riêng). |
| **Files** | `(operator)/loading.tsx`; thêm `shift/`, `team/`, `orders/` `loading.tsx` nếu segment cần frame riêng; dùng `PageSkeleton` `density="compact"` (và `mobile` khi đúng pattern hub). |
| **Acceptance** | Chuyển tab operator chính → thấy skeleton ngay, không màn trắng; không skeleton custom ngoài `PageSkeleton`; không animation decorative. |
| **Rủi ro** | Nested loading flash; sai density so với hub. |

**Effort Phase 1 (ước):** S–M sau khi Step 0 xong — nhỏ hơn plan 7 mục cũ.

---

## Đã cắt khỏi Phase 1 (hoãn hoặc bỏ)

| Hạng mục | Xử lý |
| --- | --- |
| POS category/search grid fade | **Hoãn.** Nếu làm sau: **chỉ category switch**, **không bao giờ** khi gõ search (`useDeferredValue` / `useTransition` đã có — ưu tiên responsiveness). |
| KDS Focus ↔ Overview crossfade | **Hoãn / có thể bỏ.** Hard-cut mode switch chấp nhận được; tránh copy nhầm `team-workspace-tabs` thành keyed crossfade 300ms. |
| POS order sidebar status pulse | **Hoãn.** Nếu cần: toast / status badge / ring hẹp; **reorder nhảy vị trí là bài toán riêng**, không “solve bằng pulse”. |
| List press scale orders/dashboard | **Hoãn (polish).** Không Phase 1. |
| Self-order decorative (image fade, cart badge bump, category sticky crossfade) | **Blocked** tới khi có **browser QA evidence** chứng minh usability pain — không mở bằng “owner decide” chung chung. Spec: `docs/spec/self-order-motion-design.md`. |
| Page transition toàn app / decorative ERP | **Blocked** — cần **explicit policy override** + cập nhật § G. |

---

## Phase 2+ (mỏng, sau Phase 1 ổn)

Thứ tự gợi ý dưới ràng buộc Codex (chỉ functional state / loading; không decorative):

1. Append-draft line enter — reuse helper cart (cùng Step 0 duration).
2. KDS `loading.tsx` — board skeleton thay `PageSpinner` nếu flash layout còn đau.
3. Runner new-row enter — đối xứng exit hiện có; duration theo contract (không mặc định 300 content enter).
4. Hub queue badge one-shot khi count tăng — chỉ nếu audio/toast chưa đủ; tránh chồng KDS-style pulse.
5. POS table/takeaway gate ↔ menu — chỉ nếu hard-cut gây nhầm state; ưu tiên toast/success rõ hơn crossfade dài.
6. Mở rộng `loading.tsx` stock sub-routes traffic cao.
7. POS self-order approval row highlight — functional batch-new, scoped.
8. (Cuối hàng, sau evidence) category-only grid fade; sidebar status ring; list press polish.

Phase 3 chỉ mở khi có override/evidence: page transitions, self-order decorative, finance chart enter, mascot ngoài Runner.

---

## Non-goals (giữ nguyên)

- Không `framer-motion` / GSAP / react-spring
- Không `hover:scale-*` trên ERP
- Không decorative loop / parallax / scroll-reveal trên POS/KDS/Hub/Inventory
- Không `transition-all` / `motion-safe:transition-all`
- Không custom `@keyframes` ngoài `globals.css`
- Không animate `width` / `height` / `top` / `left`
- Không motion “cho đẹp” không gắn state change

---

## Verification checklist

### Trước / cùng implement

- [ ] Step 0 đã chốt; § G đã cập nhật nếu chọn A hoặc C
- [ ] `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`

### Browser smoke (bắt buộc cho Phase 1, không chỉ CI)

- [ ] POS: thêm món → cart line enter đúng một lần; qty++ không replay enter
- [ ] KDS: nhiều ticket — chỉ INSERT mới highlight; **reconnect** không flash hàng loạt
- [ ] KDS: đổi filter / station / Focus↔Overview → không enter giả
- [ ] KDS: ready removal / reorder → không animate như phiếu mới
- [ ] Operator: bottom-nav → skeleton compact, không màn trống
- [ ] OS **Reduce motion** → enter/pulse mới tắt (`motion-safe:` + global backstop)
- [ ] Không attention overload trên KDS (row pulse + age badge + tín hiệu mới vẫn đọc được)

### Regression / policy

- [ ] Không vi phạm guards `motion-color-duration`, `app-transition-all`
- [ ] Không thêm animation library

---

## Điều kiện bắt đầu code

1. Owner chốt Step 0 (**khuyến nghị A**).
2. Nếu A/C: cập nhật `docs/spec/design-system.md` § G (và mirror module note nếu cần) trước hoặc cùng PR đầu.
3. Implement theo thứ tự Phase 1: **2 (hook classify KDS) → 1 (cart) → 3 (skeletons)** — hoặc 3 song song vì độc lập contract visual.
4. Không mang lại 4 hạng mục đã cắt vào cùng PR Phase 1.

---

## Skill / review note (T1 doc-only)

Skill plan: repo rules = engineering + ui + workflow + skills; external skills = none; runtime tools = none; skipped = doc-only plan rewrite, no UI code.\
Review tier: **T1** (plan/docs only) — không implement trong lượt này.
