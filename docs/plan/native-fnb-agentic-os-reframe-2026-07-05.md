# Native F&B Agentic OS — Reframe workflow (2026-07-05)

> Reconciled-through `976af8cf6`. Kế thừa & hoàn tất, KHÔNG đảo:
> `agentic-os-blueprint.md` (lớp tự động hoá), `master-execution-plan-2026-07-03.md`
> (wave UI Trinity + Realtime), `decisions.md` **D019/D050/D055/D058/D059/D066/D067**.
> Nguồn thiết kế: map code thật + 3 lens design + 3 critic (workflow 2026-07-05).
>
> Plan này CHỈ giữ trình tự + hợp đồng. Chi tiết kỹ thuật sống ở plan con đã dẫn.

## 0. Bản chất — directive ≈ hoàn tất D058/D059, không phải làm mới

Directive owner ("Office cũng là Hub", "Branch Picker thành màn chính từ đầu", đồng
bộ layout mobile/tablet, biến thành Agentic OS + trợ lý mỗi nhân viên) **trùng ~90%
với endgame D058/D059 đã chốt nhưng chưa thi công xong**. Đọc đúng để không tự đảo
quyết định của chính mình:

| Directive owner | Nghĩa tương thích (khuyến nghị) | Cạm bẫy (đảo quyết định — cần decision mới) |
|---|---|---|
| "Branch Picker = màn chính từ đầu" | `/br` thành cửa vào chung sau auth cho **mọi** role (D059 §3 "context picker: chi nhánh \| site trung tâm \| văn phòng"). Compatible. | — (không đảo gì) |
| "Office cũng là Hub" | Office **tới được từ `/br`** qua đúng 1 card "Văn phòng" (owner-only) + 2 plane **dùng chung PRIMITIVES** (1 `AppHeader`/`AppBottomNav`/`PwaToolbar`, D058 §1). | Gộp office+operator thành **1 shell**, hoặc **ném tile module Office vào Hub** → D058 §1 bác "single responsive shell (B)"; D059 §2 bác "ném Office vào Hub… quá cồng kềnh". Cần decision mới amend. |
| "Đồng bộ layout, mobile/tablet" | Hoàn tất D058 primitive-unify + đồng bộ breakpoint + hợp đồng tablet cho Hub. | Thêm shell mới (rail desktop cho operator) → shell-registry gate (D059 §5) cần owner decision. |
| "Trợ lý mỗi nhân viên" | `AssistantStrip` first-person trên **operator plane** trên số liệu queue + spine `notifications` **đã có**, copy qua `vi.ts`. | Đặt strip lên `/br` (GATE archetype, chrome-less) mà chưa amend `page-archetypes.md`. |
| "Agentic OS tự động hoá mọi vấn đề" | **Mở rộng** `agentic-os-blueprint`: nudge deterministic ngay; detector shadow gate sau. | Xây detector shadow + promotion UI như điều kiện critical-path của reframe (R&D 1 tenant, không thuộc reframe). |

**Kết luận:** thi công theo cột giữa (hoàn tất D058/D059, khoác lớp "Agentic OS /
trợ lý"). Cột phải là cổng quyết định §8 — chỉ làm khi owner ghi decision mới.

## 1. North star (1 đoạn)

`/br` thôi làm picker owner-only, trở thành **Hub = cửa vào duy nhất sau auth** cho
mọi role: một **context picker** liệt kê thứ bạn được vào (site vận hành: chi nhánh /
kho / bếp) + (owner) đúng 1 card "Văn phòng", site mặc định pre-highlight. `/br` GIỮ
**chrome-less GATE archetype**. "Office là Hub" đạt bằng cách Office **được vào từ
Hub** + **2 plane dùng chung PRIMITIVES** (D058 §1) — KHÔNG gộp shell, KHÔNG ném tile
Office vào Hub (D059). "Trợ lý" = một `AssistantStrip` first-person, addressed theo
role, render từ **queue-count + spine `notifications` đã có** (không phải LLM, không
trí tuệ mới) — mỗi loop mở deep-link tới RPC `SECURITY DEFINER` sẵn có để người bấm.
Money/tax/labor mãi mãi R1-alert-only.

## 2. IA / route tree + landing per role

**Không thêm route family.** Đổi cái `/br` render + đổi ai đáp xuống đó. Plane
`/br/[branchId]/*` giữ nguyên cấu trúc.

```
/                    → 302 → /br     (station-PIN + returnTo vẫn bypass)
/br                  → HUB context picker (chrome-less GATE)              ← reframe
/br/[branchId]       → operator home (nguyên trạng)
/br/[branchId]/pos|kds|runner|dashboard|settings|team|stock|shift|more    (nguyên trạng)
/finance /orders /inventory /menu /hr /branches /admin/settings           (nguyên trạng — plane Office giữ chrome riêng, D058)
```

**Rewrite cascade** (`resolveBranchHubDestination`, `packages/shared/src/auth/branch-hub.ts`):
gộp `station → desktop-admin → office → operator-home → admin-picker → default` về **3 nhánh**:
1. station-PIN bypass (nguyên trạng) → `/br/{id}/{station}`.
2. **degenerate bypass (DEFAULT):** role sàn khoá 1 site, không có card Văn phòng →
   `redirect()` thẳng `/br/{id}` (ít chạm, an toàn D067 "nhìn là thấy, chạm là biết").
3. còn lại → `/br` (Hub tự branch theo role **trong trang**, không trong resolver).

`resolvePostLoginRedirect` `returnTo` **giữ nguyên** — deep-link/re-auth giữa phiên
đáp đúng chỗ; chỉ fallback kế thừa `/br`. `getDefaultRedirect` chỉ còn dùng cho
degenerate-bypass office (xem §8 Q4).

> ⚠️ Baseline đúng: office HÔM NAY đáp `/employee` (`ADMIN_ROLES=["owner"]`,
> `branch-hub.ts:43-44`), KHÔNG phải `/finance`. `finance` ACL cho office
> (`module-acl.ts` allowedRoles=`["owner","office"]`) nhưng KHÔNG route login về đó.

| Role | Card SITES | Card OFFICE | Highlight mặc định |
|---|---|---|---|
| owner | mọi site active | 1 card "Văn phòng" (owner-only) | site gần nhất / bypass |
| branch_manager | chi nhánh của mình | — (native trong operator, D059) | chi nhánh |
| cashier / chef | chi nhánh của mình | — | **auto-skip → `/br/{id}`** |
| warehouse_manager | site kho (central_supply) | — | CS home |
| production_manager | site bếp (central_kitchen) | — | CK home |
| office | — (không site vận hành) | Văn phòng | degenerate → office landing (§8 Q4) |

Unification "free": `selectOperatorBranchScope` đã trả `allowedBranches` rỗng cho
office + site kind-matched cho central role. Khoá site = data (`allowedBranches.length===1`).
Hub **là** cửa đổi-chi-nhánh khi vào; `BranchSwitcher` in-site giữ cho điều hướng sâu.

**Đồng bộ route (bắt buộc, không phải phụ chú):** widen `branch_picker` MODULE_ACL cho
mọi hub-role (CHỈ quyền *xem Hub*, không data mới) phải sync **5 chỗ** +
`corepack pnpm gen:route-matrix`:
`module-acl.ts` · `route-resolution.ts` · `route-map.ts` · `nav-config.ts` ·
`protected-route-module-coverage.test.ts` (+ `module-acl-matrix.test.ts` re-pin).
Cross-branch `/br/{other}` vẫn chặn bởi branch-match (`resolvePostLoginRedirect`) +
proxy branch-scope ACL — reframe KHÔNG nới data access.

## 3. Đồng bộ layout + mobile/tablet (honor D058)

Không shell mới liên-plane. **Hoàn tất D058 §1 primitive-unify:** extract 1 `AppHeader`
dùng cho cả 2 plane, 1 `AppBottomNav` (đã shared), 1 `PwaToolbar`; 2 chrome plane giữ
riêng. Cùng **spatial grammar 3 zone**: Context (AppHeader) → CTA (1 việc kế) → Live
Queue (`ItemGroup`, count = badge) → Tile directory (`/more` overflow). Operator home
đã render ~90% grammar này; extract để Office tái dùng đúng thứ tự.

| Component | Xử lý | Ghi chú |
|---|---|---|
| `AppHeader` | **extract mới → dùng 2 plane** | Office bỏ `<header>` inline (D058 §1) |
| `AppBottomNav` / `AppLinkCard` / `LinkCardGrid` / `AppPage` / `AppSection` / `Item*` / `Badge` | **reuse** | primitive queue-row + picker |
| `Sidebar` / `AppShellPaddingBoundary` / `BranchSwitcher` | **reuse** trong plane Office | KHÔNG bê sang operator (xem §8 Q3) |
| `WorkspaceBottomNav` | **refactor** `md:hidden`→`lg:hidden` | **gated** bởi test tablet dưới |
| `KpiCard`/`KpiRow` | **reuse, scope-gated** | Office desktop + branch_manager overview; cấm trên central home (D066 §4) |
| `AssistantStrip` | **NEW (1 file)** | operator plane; §4 |
| `resolveOperatorNav` | **NEW nếu** làm rail operator | chỉ khi §8 Q3 = B |

**Kiểm soát stat-card đúng nguồn:** ratchet `stat-card-ssot` + KpiCard-lock
(`design-system.md` § Metric Card Role) + D066 §4 (cấm KPI doanh thu trên home
kind≠branch). **KHÔNG** có "ratchet D067" — D067 là quyết định hẹp (viết lại Kho Tổng
native), không phải doctrine "no stat-card" chung.

**Regression tablet (Phase-1 exit gate, không phải footnote):** hôm nay 768–1023px
Office thấy `Sidebar` (`md:block`) nên đổi tier-1 module chạy được. Sau `md→lg`, dải
đó rớt về `WorkspaceBottomNav` (chỉ tier-2 module active, cap `MAX_VISIBLE_ITEMS=5`,
tier-1 sau drawer "Mô-đun"). **Test chấp nhận:** ở 800px, mọi module Office + mọi
sub-tab tier-2 tới được **≤2 chạm** qua drawer "Mô-đun" — verify trên viewport thật,
không assert suông. Trước khi flip breakpoint.

**Hợp đồng tablet Hub (mockup-first):** `/br` là chrome mới → phải thêm entry HUB vào
`page-archetypes.md` + mock portrait-tablet (thứ tự zone, strip có sticky không) TRƯỚC
code. Cột: mobile 1, tablet-portrait 2, desktop 3 (LinkCardGrid có sẵn).

## 4. Trợ lý (assistant) per role

`AssistantStrip` = `EmployeePanel(tone)` + `Item`/`Badge` + 1 dòng lead first-person,
keyed theo `notifications.target_roles[]`, số từ **`fetchBranchQueueCounts` đã có**.
Copy = **template `vi.ts` tham số hoá** (count/time là arg) — cấm literal tiếng Việt
inline (i18n `no-grow`; re-baseline là Phase-1 exit). Live update **reuse
`BranchOpsRefresh`/`useRealtimeRefresh` ĐÃ mount** (`(operator)/layout.tsx:67`,
channel `branch:{id}:ops`) — KHÔNG phải "PR3 pending". Đặt: thay panel "Cần xử lý" ở
operator home (net-neutral). **KHÔNG đặt trên `/br`** (GATE chrome-less) trừ khi amend
archetype. Zero ACL change (`target_roles[]` RLS + `has_permission` đã lọc đúng role).

| Role | Persona (loop mở) — chỉ cái LIVE | Nguồn (đã có) | Next-action (RPC/route sẵn có) | Rung |
|---|---|---|---|---|
| cashier | "Ca mở HH:MM · N đơn chờ TT · chưa chốt ca" | session open-at, open-order, `pos.shift_variance` | `/br/{id}/pos` | R1 |
| chef | "N vé chờ bếp · M vé >12′ · món X hết" | `kds_queue_tickets`, `pos.kds_out_of_stock` | `/br/{id}/kds` | R1 |
| warehouse_manager | **đúng 4 mục D067 §3**: phiếu nhập dở · đơn chờ nhận PO · duyệt kiểm kê · duyệt hao hụt | `draftGrns`, `openPurchaseOrders`, 2 duyệt | `/stock/grn`, `/stock/stocktake` | R1 |
| production_manager | "N lệnh SX nháp · chuyến về chờ nhận" | `draftProductionOrders`, `inboundTransfers` | `/stock/production` | R1 |
| branch_manager | "Duyệt: kết ca · nghỉ · kiểm kê · hao hụt" | 4 count pending đã live | `approve_leave_request`, `complete_stocktake` | R1 |
| owner | "N CN: doanh thu / lệch quỹ / HĐĐT lỗi" | `mv_daily_revenue` + count | drill `/finance`/`/orders` | R1 |

> ⚠️ **KHÔNG** đưa `stock_low`/`expiry` vào feed warehouse (D067 §3 loại rõ 2 cái này
> cho kho vừa reset). Briefer/Daily-Closeout là **[DESIGNED chưa build]** → không đưa
> vào persona live, để bucket LATER.

## 5. Agentic automation (mở rộng blueprint)

**NGAY (deterministic, hiện ngay):** (1) producer `pos.session_stale` (nudge chốt
ca cuối ngày, dedup `session_stale:{session_id}`) + backfill `dedup_key`; (2) strip
render count đã có + `scan_inventory_alerts` đã emit; (3) 4 count duyệt đã live.

**SAU (owner-greenlit, phase riêng — KHÔNG critical-path reframe):** bảng
`agent_decisions` + detector shadow Cash Sentinel / Till Anomaly / Compliance
(write-only, soak ~20–30 ngày phục vụ, R0→R1 owner gate) — đúng stage
`agentic-os-blueprint`. Rồi Telegram dispatcher, Briefer (Daily/Weekly/Monthly),
Price Watch R2, Service Janitor R3 (auto-actor duy nhất: `cleanup_kds_tickets_as_system`,
`cleanup_abandoned_payments` — idempotent/reversible), Owner Copilot. **Ranh giới UI
cứng:** row money/tax/labor chỉ có nút "Xem", không "Tự động xử lý".

## 6. Phase + exit criteria

- **P0 — Primitive parity (vô hình).** Extract `AppHeader` dùng 2 plane + hoàn tất
  D058 primitive-unify sau adapter Office hiện có. **Exit:** `pnpm lint && pnpm test`
  xanh, `check-ui-contract` pass, 5 module Office render y nguyên.
- **P1 — Breakpoint/tablet sync + AssistantStrip v1.** `WorkspaceBottomNav` md→lg
  (sau khi test tablet ≤2-chạm pass) + ship `AssistantStrip` count tĩnh trên operator
  home, copy `vi.ts`. **Exit:** test tablet 800px ≤2 chạm pass; strip render count
  tĩnh đúng per role; live-decrement reuse `BranchOpsRefresh` (KHÔNG chặn exit);
  i18n re-baseline. RT-01 (`webhook_events` publication) **ra khỏi** wave này — thuộc
  realtime-sync-program.
- **P2 — Hub-as-home cutover.** Rewrite `resolveBranchHubDestination` → 3 nhánh;
  **degenerate-bypass là DEFAULT cùng commit** (fail-safe ít chạm, không chờ §8 Q2);
  `br/page.tsx` render SITES + (owner) Văn phòng card; widen `branch_picker` ACL +
  **sync 5 chỗ** + `gen:route-matrix`. **KHÔNG** re-root `OperatorLayout` (§8 Q3).
  **Exit:** mọi role đáp `/br` hoặc bypass; coverage test xanh; không còn landing
  `/employee` treo.
- **P3 — Automation deterministic.** `pos.session_stale` + dedup backfill; strip
  render nudge. **Exit:** nudge live, không detector shadow mới.
- **P4 — (owner-greenlit) Office-as-hub polish + agentic shadow wedge + (nếu Q3=B)
  rail operator.** Tách riêng, sau khi owner chốt §8.

## 7. Migration & rủi ro

- **Reframe IA/UI: 0 migration, 0 RLS, 0 shell mới** — cưỡi scope + ACL primitive sẵn
  có. Migration additive chỉ ở P3 (`session_stale`, dedup backfill), owner-apply
  (D047 file→PR→owner, không `DROP`).
- **Blast-radius cao nhất:** rewrite cascade `branch-hub.ts` (unit-test nặng) +
  widen `branch_picker` MODULE_ACL (edit ACL thật duy nhất — chỉ *xem Hub*, phải sync
  5 chỗ + route-matrix).
- **1 mặt QA hành vi:** flip `md→lg` Office ở 768–1023 — gate bằng test tablet §3.
- **Mockup-first = hợp đồng:** entry HUB trong `page-archetypes.md` + mock tablet
  TRƯỚC code; PR redesign trích ID amendment. i18n: mọi lead-line + label qua `vi.ts`.
- **HKD:** không tự động hoá BCTC/payroll-formal; trợ lý chỉ surface loop vận hành.

## 8. Cổng quyết định owner

> ✅ **Chốt 2026-07-05 (D068):** Q1=A · Q2=A · Q3=A (tablet dọc) · Q4 tone=first-person.
> Q5 còn mở (không chặn Phase 0–3).

1. ✅ **"Office cũng là Hub" — mức độ.** **A — context picker**, Office vào qua 1 card
   "Văn phòng" owner-only + share primitives (hoàn tất D058/D059, không đảo). *(Loại B:
   gộp shell / ném tile Office vào Hub — cần decision mới amend D058 §1 + D059.)*
2. ✅ **Role sàn 1 chi nhánh.** **A — auto-skip** thẳng `/br/{id}` (ít chạm, D067).
   DEFAULT cùng commit rewrite cascade.
3. ✅ **Operator desktop/tablet.** **A — bottom-nav mọi bề rộng** (tablet cầm **dọc**,
   breakpoint `lg`, không shell mới). Shell-registry gate (D059 §5) không kích hoạt.
4. ✅ **Tone trợ lý = first-person** ("Bạn chưa chốt ca"), khớp directive "trợ lý mỗi
   nhân viên". Office landing + count-on-card gộp vào Q5 (còn mở).
5. ⬜ **Còn mở — Office landing + count trên card Hub + promotion detector.** Office
   (không site) vào `/br`: degenerate về `/employee` (nay) hay `/finance`? Card Hub
   hiện ≤1 count-badge (bound `operational-data-contract`, archetype HUB) hay để trống
   (D066 §4 chặt hơn)? Ai flip detector R0→R1 (toggle `/admin/settings` hay flag PR) +
   ngưỡng `session_stale`? *(Chỉ cần trước khi bật detector shadow ở P4 — không chặn P0–3.)*

## Load-bearing files

`packages/shared/src/auth/branch-hub.ts` (rewrite cascade) ·
`packages/shared/src/auth/module-acl.ts` (widen `branch_picker` — edit ACL thật) ·
`packages/shared/src/auth/scope.ts` (`returnTo` giữ nguyên) ·
`apps/web/app/page.tsx` + `apps/web/proxy.ts` (degenerate bypass) ·
`apps/web/app/(protected)/br/page.tsx` (render Hub) ·
`apps/web/app/components/app-shell.tsx` + `.../(operator)/layout.tsx` (extract `AppHeader`, KHÔNG re-root) ·
`apps/web/app/components/workspace-bottom-nav.tsx` (`md→lg`, gated) ·
`apps/web/app/(protected)/br/[branchId]/(operator)/dashboard/data.ts` (`fetchBranchQueueCounts` → `AssistantStrip`) ·
`packages/shared/src/labels/vi.ts` (key trợ lý tham số hoá) ·
`docs/spec/page-archetypes.md` + `docs/spec/design-system.md` (entry HUB, TRƯỚC code) ·
migration additive `pos.session_stale` + dedup backfill (P3).
