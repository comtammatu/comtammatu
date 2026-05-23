# Hôm nay (`/inventory`) — Design Shotgun

> **Date:** 2026-05-08 · **Phase 2** of inventory redesign · **Baseline:** matu-superapp DESIGN.md
>
> Five distinct redesign directions for the Inventory hero page. Each variant
> is a *philosophy*, not a shuffle of cards — pick the one whose **optimization
> target** matches how you actually use this page in real shifts.
>
> All variants use the new `matu-*` tokens, Be Vietnam Pro, border-first
> elevation, 8px radius, 4px spacing grid. The data contract
> (`InventoryDashboardData`) is unchanged — same KPIs, same alerts, same
> permission gates. We're rearranging information, not asking the server for
> different shapes.

---

## Current state — what we're replacing

```
┌ Eyebrow: Kho hàng · HQ ──────────────────────────────────────────┐
│ Bếp Trung Tâm                                                    │
│ Tagline...                                                       │
│ Giá trị tồn kho: 145.230.000 ₫                                   │
└──────────────────────────────────────────────────────────────────┘

▽ 3 main flow cards (3 columns)
  [Kiểm soát tồn]  [Nhập-Nhận hàng]  [Điều phối-SX]
   3 điểm KS        2 PO chờ           4 phiếu chạy
   (warning bg)     (info bg)          (info bg)

▽ 4 KPI cards (2/4 cols)
  [PO chờ: 2]  [TF: 4]  [Hết hạn: 5]  [Giá lệch: 3]

▽ 2-col panels: Tasks (6 items) + Alerts (mixed reorder/expiry)

▽ 2-col panels: Active transfers + Active stocktakes
```

**Pain:** 4 layers of cards repeating the same 5 numbers in different framings.
The page is a **scoreboard**, not a **plan**. Visual density is high but
information density is low — every number appears 2-3 times.

---

## Variant A — `STATUS LINE` · "One sentence tells the whole story"

> **Optimization target:** Owner / Super-manager who opens the page once a
> morning and once mid-shift. They want the *headline*, not the dashboard.

### Layout

```
─────────────────────────────────────────────────────────────────────
QA · BẾP TRUNG TÂM                                    [chọn site ▾]
Hôm nay · Thứ Sáu 8/5/2026

Tồn kho 145.230.000 ₫ · ổn định.
2 PO chờ duyệt · 4 phiếu đang chạy · 5 lô cận hạn dùng.
─────────────────────────────────────────────────────────────────────

┃ Việc cần làm  (6)                                       [xem hết →]
┃
┃ ● 2 PO cần theo dõi              Đẩy nhanh đơn mở trước GRN.    →
┃ ● 4 lô cần xử lý hạn dùng        Xuất các lô cận hạn trước.     →
┃ ● 1 nguyên liệu chạm ngưỡng      Sườn cọng — còn 8 kg / 15 kg.  →
┃ ● 1 phiên kiểm kê đang mở        ST-2042 · 78% xong.            →
┃ ● 3 dòng GRN cần kiểm tra giá    Lệch >10% so với PO 30 ngày.   →
┃ ● 4 transfer cần theo dõi        2 đến · 2 đi.                  →

┃ Đang chạy
┃   TR-2026-0118 → Sườn → CN Quận 1   [đang giao]
┃   TR-2026-0119 → Cơm → CN Tân Phú   [đã xác nhận]
┃   ST-2042 ▓▓▓▓▓▓▓░░  78% — Bếp TT
─────────────────────────────────────────────────────────────────────
```

### Why this works

- **Headline number lives in prose**, not in a card. The eye reads "ổn định"
  and parses the situation in 1 second. Cards repeat numbers; sentences make
  meaning.
- **One list, ordered by what matters**, not three columns of separate framings.
  Every row is identical structure: dot · title · context · arrow.
- **No tone backgrounds.** Severity lives in the dot color (`bg-matu-warning`,
  `bg-matu-destructive`, `bg-matu-success`). The page stays warm-paper
  neutral — no candy stripe.
- **No flow cards.** Top-nav + URL already navigates; the dashboard's job is
  *signal*, not navigation. Removing them saves a full screen height on mobile.

### Trade-offs

- ❌ Owners who liked the 3 flow cards as a "where do I start" prompt lose
  that scaffolding. (Counterpoint: the task list IS that prompt — better
  surfaced.)
- ❌ No giant number to screenshot for the LINE Group. (Counterpoint: the
  prose IS shareable: "Tồn 145M, 2 PO chờ, ổn".)
- ✅ Mobile fits 6 tasks + 3 active rows in a single screen — currently
  takes 4 scrolls.

### Best for

- **Roles:** owner, super_manager, area_manager
- **Devices:** desktop primary, mobile excellent
- **Frequency:** check 2-3× a day for 30 sec each

---

## Variant B — `BRIEFING` · "A morning newspaper for your business"

> **Optimization target:** Anyone who treats inventory as a daily ritual.
> Reads top-to-bottom like a Vietnamese morning paper. Be Vietnam Pro shines.

### Layout

```
═════════════════════════════════════════════════════════════════════
                                                          8 · 5 · 2026
                BẢN TIN VẬN HÀNH — BẾP TRUNG TÂM
                              ──────
═════════════════════════════════════════════════════════════════════

  TỒN KHO HÔM NAY
  Bếp Trung Tâm đang giữ tồn 145.230.000 ₫, tăng 3,2% so với hôm
  qua. Có 5 lô cận hạn cần xử lý trong 48 giờ tới và 1 nguyên liệu
  (Sườn cọng) đã chạm ngưỡng đặt lại.

  ──────────────────────────────────────────────────────────────────

  NHẬP HÀNG                                          [đến trang Nhập →]
  2 PO đang chờ NCC giao · giá trị 47M ₫
  3 dòng GRN tuần qua chênh giá so với PO trên 10%

      → PO-2026-0042  Hủ đựng canh · 154 cây · Tâm Thành    [chờ giao]
      → PO-2026-0043  Ly nhựa 650 · 80 cây · Phú An         [chờ giao]

  ──────────────────────────────────────────────────────────────────

  LUÂN CHUYỂN                                  [đến trang Điều phối →]
  4 phiếu đang chạy · 2 đến · 2 đi

      → TR-2026-0118  Sườn cọng → CN Quận 1            [đang giao]
      → TR-2026-0119  Cơm → CN Tân Phú                 [đã xác nhận]

  ──────────────────────────────────────────────────────────────────

  KIỂM SOÁT                                  [đến trang Kiểm soát →]
  1 phiên kiểm kê đang mở · 5 lô cận hạn dùng

      ST-2042  Bếp TT  ▓▓▓▓▓▓▓░░  78%
      Hành tím · còn 2 ngày · 6 kg · lô L-2025-1108
      Sườn cọng · còn 1 ngày · 8 kg · lô L-2025-1106

═════════════════════════════════════════════════════════════════════
```

### Why this works

- **Editorial layout = reading rhythm.** Sections separated by hairlines, not
  cards. Each section opens with one sentence stating the fact, then bullet
  rows with detail. Be Vietnam Pro's diacritics carry the warmth.
- **Numbers in context**, never naked. "Giá trị 47M ₫" attached to the count.
  "Tăng 3,2% so với hôm qua" gives the headline a *direction* — a delta is
  more actionable than an absolute.
- **Three sections mirror the three operational concerns** (Nhập / Luân
  chuyển / Kiểm soát) but as **headlines with stories**, not as flow tiles.

### Trade-offs

- ❌ Highest "newspaper feel" → may read as *informational* not *operational*
  for power users who want command-line density.
- ❌ Requires copy-writing discipline forever. Adds maintenance debt: every
  section has prose templates that grow stale.
- ❌ Delta calculations (`tăng 3,2%`) require yesterday's snapshot — extra
  data path. (Could mock for pilot, wire later.)
- ✅ This is the most *recognizably Mã Tư* design. No generic SaaS scoreboard.

### Best for

- **Roles:** owner, office staff, anyone who reads
- **Devices:** desktop excellent, mobile good (sections stack naturally)
- **Frequency:** morning open, evening close

---

## Variant C — `QUEUE` · "What do I do next, then next, then next?"

> **Optimization target:** Branch manager / kho operator on a phone, between
> tasks. Doesn't care about the big picture — cares about the next 3 actions.

### Layout

```
─────────────────────────────────────────
CN QUẬN 1 · CHI NHÁNH                  ▾
Hôm nay
─────────────────────────────────────────

   ❶  Nhận 2 phiếu đến
       TR-2026-0118 từ Bếp TT · Sườn
       TR-2026-0119 từ Bếp TT · Cơm
       [Mở phiếu]
   ──────────────────────────────────────
   ❷  Cấp bếp ca chiều
       Chuyển NL từ kho CN sang bếp CN
       trước giờ bán 16:00.
       [Tạo phiếu cấp bếp]
   ──────────────────────────────────────
   ❸  Xử lý 2 lô cận hạn dùng
       Hành tím · còn 2 ngày · 6 kg
       Sườn cọng · còn 1 ngày · 8 kg
       [Mở danh sách hạn dùng]
   ──────────────────────────────────────
   ❹  1 phiên kiểm kê đang mở
       ST-2042 · 78% xong
       [Tiếp tục đếm]
   ──────────────────────────────────────

   ⚐  Tồn 32.500.000 ₫ · 4 cảnh báo
─────────────────────────────────────────
```

### Why this works

- **Numbered list = mental queue.** Item ❶ is the first thing you do.
  ❷ is what you do after. Three numbered steps is the most you can hold in
  your head between physical tasks.
- **Each item is a complete task**: title + 2-line context + ONE action button.
  No drilling, no scanning columns.
- **Headline number demoted to footer marker.** It's not zero-weight — it's
  there as `⚐ Tồn 32.5M · 4 cảnh báo`. But it doesn't compete with the queue.
- **Touch-safe gap (12px) and 56px row height** match matu-superapp's
  frontline contract. Each item is one thumb tap.

### Trade-offs

- ❌ Owners checking 4 sites simultaneously hate this layout — too tall, too
  little overview.
- ❌ Action ordering is *opinionated*. Need a rule: receive → issue → expiry
  → stocktake → reorder → price-review. We bake it into `buildTasks()` already
  — extending it is straightforward but locks the order.
- ✅ Branch operators stop missing morning receives because they were buried
  under `Stocktake progress` and `Active transfers` panels.

### Best for

- **Roles:** branch_manager, branch_kho_operator, branch_kitchen_operator
- **Devices:** mobile primary (this is the design), tablet good, desktop OK
- **Frequency:** 5-10× per shift between physical tasks

---

## Variant D — `WORKBENCH` · "Owner running 4 sites from one screen"

> **Optimization target:** Super-manager / owner with multi-branch portfolio.
> Wants every site's status at a glance, then drills in. Desktop-first,
> table-dense.

### Layout

```
─────────────────────────────────────────────────────────────────────────
HÔM NAY · TOÀN HỆ THỐNG               [+] tạo PO   [↻]   [chọn site ▾]
─────────────────────────────────────────────────────────────────────────

Tổng tồn          PO chờ      Phiếu chạy   Hạn dùng     Lệch giá
145.230.000 ₫    2           4            5            3
═══════════════════════════════════════════════════════════════════════

  Site               Tồn         PO chờ  TF chạy  Hạn  Lệch  Việc
  ─────────────────────────────────────────────────────────────────
  Bếp Trung Tâm      145.0M ₫     2       2       5    3     6  →
  CN Quận 1            32.5M ₫    —       2       —    —     2  →
  CN Tân Phú           28.7M ₫    —       —       —    —     —  ✓
  Kho Tổng              0       —       —       —    —     —  ✓

═══════════════════════════════════════════════════════════════════════

  Bếp Trung Tâm — chi tiết                                  [thu gọn]
  ─────────────────────────────────────────────────────────────────
  ⚠  Sườn cọng chạm ngưỡng                          còn 8 kg → đặt
  ⚠  Hành tím cận hạn 2 ngày                        L-2025-1108
  ⚠  PO-2026-0042 chờ giao (NCC Tâm Thành 3 ngày)   theo dõi NCC
  ●  TR-2026-0118 đang giao đến CN Quận 1           [chi tiết]
  ●  ST-2042 đang đếm 78%                           [tiếp tục]
  ●  3 dòng GRN cần kiểm tra giá tuần qua           [mở danh sách]
─────────────────────────────────────────────────────────────────────────
```

### Why this works

- **Top strip = portfolio summary.** 5 numbers, all branches summed. Same
  granularity matu-superapp DESIGN.md prescribes for "operations strip".
- **Site grid = dense scan.** 4 sites × 6 columns fit in 240px height. A
  green check (`✓`) means "no work" — quickly drops a site from your mental
  load. Currently the dashboard makes you click into each one.
- **Selected-site drill-in** (collapsible) replaces the second-half panels.
  Click a row → see that site's task list inline. No route change, no scroll
  reset.
- **No flow cards, no KPI cards.** The site row IS the KPI card.

### Trade-offs

- ❌ Branch operators logged into a single site see an overpowered layout.
  Solution: D collapses to **Variant C** for `siteKind === "branch"`.
- ❌ Wider than mobile — needs `lg:` breakpoint to feel right. Mobile gets a
  vertical version (one site per accordion).
- ❌ Adds a UX state (which site is expanded) — small but real. URL param
  `?expand=<id>` keeps it shareable.
- ✅ Owner finally sees all 4 sites at once instead of cycling.

### Best for

- **Roles:** owner, super_manager (the people with cross-site permission)
- **Devices:** desktop primary, tablet good, mobile via Variant C fallback
- **Frequency:** 1× per day for 2 minutes — the "is everything OK?" check

---

## Variant E — `THREE STEPS` · "Tonight's plan in three numbered acts"

> **Optimization target:** Bếp Trung Tâm / Central Kitchen specifically.
> Every day = 3 acts: receive raw materials → produce → ship to branches.
> Tells you which act you're in.

### Layout

```
─────────────────────────────────────────────────────────────────────
BẾP TRUNG TÂM · THỨ SÁU 8/5/2026                       [Site ▾]  [↻]
─────────────────────────────────────────────────────────────────────

   ╔═════════════════════════════════════════════════════════════╗
   ║  HÔM NAY                                                    ║
   ║  Bếp Trung Tâm · giữ 145.230.000 ₫ tồn · 5 cảnh báo         ║
   ╚═════════════════════════════════════════════════════════════╝

  ▽ ❶  NHẬN NGUYÊN LIỆU                                      ✓ 2/3
     2 PO đã GRN · 1 PO còn chờ NCC.
     ─────────────────────────────────────────────────────────────
     PO-2026-0042  Hủ đựng canh · Tâm Thành          [theo dõi →]
     ▢ kiểm tra 3 dòng giá lệch >10% trong tuần      [mở GRN →]

  ▽ ❷  SẢN XUẤT                                                ●  đang chạy
     2 lệnh sản xuất hôm nay.
     ─────────────────────────────────────────────────────────────
     SX-2026-0021  Sườn cốt lết · 80 phần            [tiếp tục →]
     SX-2026-0022  Cơm · 320 hộp                     [tiếp tục →]
     ▢ ưu tiên xuất 2 lô hành tím cận hạn (1-2 ngày)

  ▽ ❸  XUẤT VỀ CHI NHÁNH                              ✓ 2/4 hoàn tất
     2 phiếu đã giao xong · 2 đang chạy.
     ─────────────────────────────────────────────────────────────
     TR-2026-0118  → CN Quận 1   Sườn  20kg          [đang giao]
     TR-2026-0119  → CN Tân Phú  Cơm  150 hộp        [đã xác nhận]

─────────────────────────────────────────────────────────────────────
   ⚐  1 nguyên liệu chạm ngưỡng · 1 phiên kiểm kê 78%
─────────────────────────────────────────────────────────────────────
```

### Why this works

- **Three acts = the actual day.** Bếp TT really does run this loop. The
  page mirrors the kitchen's mental model rather than imposing a generic
  "dashboard" mental model on it.
- **Progress markers (✓ 2/3, ● đang chạy)** show act completion at a glance.
  Looking at the page tells you what time of day it is operationally.
- **Side-bar cross-cutting concerns** (reorder, stocktake, price review) get
  demoted to footer reminders — they're not part of the day's flow but they
  matter weekly.
- **Variant per `siteKind`:** central_warehouse gets a different 3-step set
  (procure / store / dispatch), branch gets (receive / issue / sell).
  Same shell, different labels. Reuses the data contract perfectly.

### Trade-offs

- ❌ Most opinionated of the five. If a kitchen's day doesn't fit 3 acts
  (e.g. a holiday with mass receiving), the page feels mis-framed.
- ❌ Requires `siteKind`-specific copy in 3 places. Maintenance overhead.
- ❌ Owners with 4 sites need to switch sites to see each — same problem as
  current. (Solution: pair Variant E with Variant D as a `?view=portfolio`
  toggle.)
- ✅ Single most "the system understands my work" feeling. Highest
  user-delight ceiling of the five.

### Best for

- **Roles:** central kitchen operator, kho HQ operator, branch operator
  (with `siteKind`-scoped copy)
- **Devices:** desktop primary, mobile good (acts collapse vertically)
- **Frequency:** anchor page — opened first thing, kept open all day

---

## Side-by-side comparison

| Aspect                  | A · STATUS LINE | B · BRIEFING | C · QUEUE | D · WORKBENCH | E · THREE STEPS |
| ----------------------- | --------------- | ------------ | --------- | ------------- | --------------- |
| Information density     | High            | Medium       | Low       | Highest       | Medium          |
| Reading time            | 5 sec           | 30 sec       | 3 sec     | 10 sec        | 15 sec          |
| Mobile-first            | ✓               | ✓            | ✓✓        | ✗ (D→C)       | ✓               |
| Best for owners         | ✓✓              | ✓            | ✗         | ✓✓✓           | ✗               |
| Best for branch ops     | ✓               | ✗            | ✓✓✓       | ✗ (D→C)       | ✓               |
| Best for central kitch. | ✓               | ✓            | ✓         | ✗             | ✓✓✓             |
| Brand expression        | Medium          | Highest      | Low       | Lowest        | High            |
| Implementation effort   | Low             | Medium       | Lowest    | High          | Medium          |
| New data needed         | None            | Yesterday %  | None      | Multi-site agg| None            |
| Risk of mis-framing     | Low             | Medium       | Medium    | Low           | High            |

---

## Recommendation logic

**If you want one page that ages well across all roles and sites:** **Variant A**.
Lowest risk, highest reuse, mobile-excellent. Trades headline brand expression
for operational clarity. Ships fastest.

**If you want the page to feel uniquely Mã Tư from day one:** **Variant B**.
Editorial tone is rare in B2B SaaS and the brand's "warm operational paper"
identity loves it. Higher copy debt, but distinctive forever.

**If you want the page to actually change behavior on the floor:** **Variant
C** for branches, **Variant E** for Bếp TT, **Variant D** for owners. This is
the *split-by-role* answer. Highest implementation cost (3 layouts) but
highest fit.

**If you want to ship Phase 2 fastest and iterate:** **Variant A** as a
v1, then layer **Variant E**'s 3-step structure later when you've seen real
usage.

---

## Decision request

Pick one of:

- **(a)** Variant A · STATUS LINE — fastest, most universal
- **(b)** Variant B · BRIEFING — most distinctive Mã Tư voice
- **(c)** Variant C · QUEUE — frontline-first
- **(d)** Variant D · WORKBENCH — owner-first
- **(e)** Variant E · THREE STEPS — kitchen-first
- **(f)** Hybrid: A + E by `siteKind` (operational default + kitchen-aware)
- **(g)** Hybrid: D + C by `siteKind` (owner default + branch frontline)

Once picked → next step is `/design-html` → high-fidelity HTML mock with real
matu-* tokens → I port to React using `matu-surface.tsx` adapters → ship to
`/admin/kitchen-sink-hom-nay` for visual review → cut over `/inventory` page.
