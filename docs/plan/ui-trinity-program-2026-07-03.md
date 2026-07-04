# Chương trình UI ba trụ — Dẫn đường · Soi lỗi · Thi công (2026-07-03)

> Reconciled-through 4be2bd3c
>
> Nguồn: T3 debate 5 lens (PM · UX/IA · Senior Dev · QA · HIG-Guidance) —
> transcript đầy đủ tại `docs/worklog/t3-ui-trinity-debate-2026-07-03.md`.
> Mọi định danh code, đường dẫn, tên gate giữ nguyên văn.

## 1. Chẩn đoán gốc

Vòng lặp "sửa từng cái UI mãi không hết" có **ba nguyên nhân xếp tầng**, không
phải một:

1. **Thiếu dẫn đường (Guidance)** — agent/dev cần build một surface nhưng docs
   không dẫn từ "tôi cần X" đến "dùng đúng pattern này, primitive này, vì lý do
   này". Bằng chứng: test mô phỏng 4 tình huống build thật thì 2 gãy hẳn ("thêm
   filter cho list", "surface duyệt mới"), 1 gãy nửa (row action destructive),
   chỉ 1 chuẩn (thêm KPI — vì có chuỗi job → contract → component → gate).
   Không có dẫn đường → tự chế → sinh nợ mới liên tục.
2. **Thiếu soi lỗi runtime (Enforcement)** — gate hiện tại toàn static/structural
   (token, i18n, archetype, shell registry: đều tốt). KHÔNG có tầng nào nhìn
   thấy: route mồ côi, mật độ layout sai viewport (lớp lỗi QA-1), lỗi render
   theo role, pixel drift. Ba lần "lọt" gần nhất (QA-1, 24 tile gap, office
   desktop khó dùng D063) đều chỉ bị mắt người bắt.
3. **Backlog usability đã chốt nhưng chưa thi công (Execution)** — hướng đi ĐÃ
   khóa trong D059 (branch-complete), D063 W3/W4 (desktop office), D062 (PWA);
   cộng thêm 8 đề xuất mới của lens UX (đều nằm trong khuôn quyết định cũ,
   không đảo hướng).

## 2. Ba trụ

### Trụ G — Dẫn đường kiểu HIG (phòng ngừa)

Mô hình Apple HIG: 3 tầng Foundations / Patterns / Components, giọng
prescriptive "Dùng X khi…, KHÔNG dùng khi…, thay bằng Y". Hiện trạng:
Foundations đã đạt chuẩn (token/typography/rhythm/motion contracts);
page-archetypes ≈ tầng Patterns cấp trang (tốt); **lỗ hổng = tầng interaction
patterns chưa được đặt tên** (4 stub "Decision" rải trong `docs/modules/ui.md`)
và **Component Registry thiếu cột "dùng khi / không dùng / thay thế / exemplar"**
(mới phủ ~24/56 component; `context-menu.tsx` đang WIP không có registry row
và không gate nào đòi — bằng chứng sống).

Slices: G-S1 mục lục + decision index cho `design-system.md` → G-S2 nâng cấp
registry (2 cột mới + backfill 56 component) → G-S3 section `## Interaction
Patterns` trong `ui.md` (7 job: nhập liệu · modality · destructive+confirm ·
feedback · filter/search · empty/loading/error · review-and-approve) → G-S4
gate chống mục nát (component nào không có registry row → CI fail) → G-S5
cross-link từ archetype recipes.

### Trụ E — Soi lỗi máy bắt (phát hiện)

Nguyên tắc: mở rộng máy móc CÓ SẴN (`scripts/check-ui-contract.mjs` là ratchet
engine trưởng thành; Playwright visual project đã tồn tại), không xây song
song, không dep mới, **không đưa pixel-diff vào PR gate** (runner CI 2-core đã
chứng minh wedge). Nhịp: per-PR static → pre-land local sweep → nightly
report-only → agent judge loop định kỳ (thay mắt owner).

Slices: E0 fix CSP `next.config.ts` derive từ `NEXT_PUBLIC_SUPABASE_URL`
(điều kiện tiên quyết mọi detector runtime — đang chặn cả browser smoke
POS/KDS) → E1 ratchet mới: gate `input` frozen-import (C2, ~27 file) + motion
budget (C1/C3 hóa ra ĐÃ enforce sẵn) → E2 test reachability tĩnh (bắt lớp
route mồ côi + "hàng đợi rỗng = mất cửa") → E3 visual lane (storageState
warehouse/branch-manager + `qa:visual` local + nightly workflow) → E4
route-health sweep DOM-assert theo role×viewport (console/500/overflow/
tap-target/col-count) → E5 agent judge loop có rubric, findings ghi QA-n vào
`tasks/todo.md`, mãi mãi advisory.

### Trụ U — Thi công usability (2 plane)

**Office — U0 "Chrome diet + job-first" (owner nêu đích danh 2026-07-03,
ưu tiên số 1 của plane này):**

Bằng chứng trùng lặp: một sub-page office hiện render cùng một nhãn 3–4 lần
trước khi tới nội dung — sidebar tier2 active + breadcrumb ở shell header
(`app-shell.tsx:310-348`) + title shell tự derive từ path
(`app-shell.tsx:142-148`, kèm `description` shell-level) + `AppPageHeader`
h1/description của trang (`surface.tsx:170`). Flag `suppressTitleHeading`
tồn tại = duplication đã biết nhưng đang vá bằng opt-out từng trang thay vì
sửa contract. Layout từng màn "lấp đầy cho có" — block không phục vụ job nào.

- **U0a — shell chrome diet (S):** contract mới "một nhãn xuất hiện đúng một
  lần mỗi viewport": shell header chỉ giữ breadcrumb (và chỉ khi depth ≥ 2;
  mobile thu về 1 link cha), BỎ title/description derive ở shell; trang là
  chủ sở hữu duy nhất của h1 + description qua `AppPageHeader`; xóa
  `suppressTitleHeading` sau khi hết caller. Đo: px dọc chiếm bởi chrome
  trước nội dung giảm; mỗi nhãn xuất hiện đúng 1 lần.
- **U0b — job-first composition per family (M/family):** mỗi sub-page tuyên
  bố primary job (đã là yêu cầu D058 §12/page-archetypes nhưng chưa operative)
  → viewport-1 phải phục vụ đúng job đó: xếp lại block theo job, XÓA block
  lấp chỗ; gộp chung pass với U1 width để mỗi family chỉ bị sờ một lần
  (width + chrome + job-reorder trong một pass/family, một PR/family).

**U0c — Perceived performance & feedback (owner nêu 2026-07-03, cả 2 plane):**

Bằng chứng "bấm như lag": `loading.tsx` chỉ 15/145 trang (nav = đứng hình trang
cũ chờ server render); 0 `useFormStatus` + 0 `useOptimistic` (không optimistic
UI, nhiều nút mutate không pending state; `useTransition` mới 74 file); press
feedback `active:scale` chỉ có ở button size touch/lg (`button.tsx:28-37`) —
size default/sm của office không có; 4 site reload/assign nguyên page thật:
`menu/import-export-menu.tsx:160`, `finance/invoice-list.tsx:469` (setTimeout
reload 1.5s), `team-board-client.tsx:224`, `use-order-sync.ts:111`.
Motion Contract § G đã chuẩn — đây là thi công thiếu, không phải contract sai.

- **U0c-1 (S):** diệt 4 full-reload site → `router.push`/`router.refresh` +
  state update (allowlist hợp lệ: pwa-toolbar SW update, /offline, dev-SW).
- **U0c-2 (S–M):** `loading.tsx` skeleton theo archetype cho các route family
  chính (LIST/DETAIL/DASHBOARD skeleton recipe — recipe vào trụ G, mỗi family
  một PR, ưu tiên office + hub).
- **U0c-3 (M):** pending-state contract — mọi nút mutate hiển thị
  pending/disabled qua form helpers + `useFormStatus`/`isPending`; audit 74
  site `useTransition` chưa wire pending visual.
- **U0c-4 (S):** press feedback cho button size default/sm (primitive
  `packages/ui` + amend § G — vẫn functional-only, `transition-transform`).
- **U0c-5 (M, sau):** optimistic UI cho hot path sàn (duyệt/từ chối queue,
  count entry) — cẩn trọng, đi cùng realtime bus để reconcile.
- **U0c-6 (S, experiment):** Next.js View Transitions (native browser, không
  lib mới — hợp § G) bật flag thử trên office nav, đo rồi mới giữ.

Trụ E nhận detector mới: ratchet cấm `window.location.reload/assign` ngoài
allowlist; structural check `loading.tsx` coverage theo route family; rubric
judge loop thêm mục "nút bấm có pending feedback không".

**Office tiếp theo:** U1 gộp vào U0b (width `xwide` D063 W3 đi cùng pass) →
U2 tách content `order-detail-sheet` khỏi Sheet chrome rồi master-detail
inline ở `xl:` (D063 W4) → U5 mobile office: bottom-nav curated theo module,
diệt band rỗng, wire `mobileTopBar`, kéo duyệt HR khỏi chỗ chôn → U6 ⌘K
palette (D032-B(4), bù luôn việc icon-rail collapse che mất tier2).

Trụ G nhận thêm 2 rule từ finding này: "one label, one place" (nhãn/diễn giải
không lặp giữa shell và page) và "mọi block phải phục vụ job đã tuyên bố —
không có block trang trí/lấp chỗ"; rubric judge loop (E5) thêm mục chấm
"chrome-to-content ratio" + "block nào không phục vụ job".

**Branch Hub:** U3 "Today spine" — mở trang là thấy: trạng thái ca → feed việc
cần xử lý (duyệt, phiếu kiểm dở, tồn thấp, hạn dùng, chốt ngày) → tile theo
pha ca (Đầu ca / Cuối ca, tái dùng từ vựng D052), kèm cửa "Duyệt" luôn hiện
có badge (hết cảnh hàng đợi rỗng = mất lối vào) + CTA chuỗi việc (xác nhận GRN
→ đối soát hóa đơn NCC) → U4 extraction D059 §4 giữ nguyên thứ tự khóa: GRN
create trước → count-assignments → supplier-returns → HR approvals seam →
production → U7 PWA-1 Hub cài được (sau lát extraction đầu).

## 3. Thứ tự PR (một mối quan tâm mỗi PR)

| # | Việc | Effort | Ghi chú |
|---|------|--------|---------|
| PR-0 | Land WIP 17 file (lane D063 đang chạy) | — | CHẶN mọi baseline `--write`; chặn U4 slice 2 |
| PR-1 | E0 CSP fix | S | Mở khóa mọi detector runtime |
| PR-2 | E1 ratchets (input + motion) | S | Sau PR-0 |
| PR-3 | G-S1 index/mục lục | S | Song song được |
| PR-4 | G-S2 registry 56 component + cột dùng-khi | M | `context-menu.tsx` làm row đầu |
| PR-5 | G-S3 Interaction Patterns + G-S5 cross-link | M | |
| PR-6 | G-S4 gate registry-coverage | S | |
| PR-7 | E2 reachability test | M | |
| PR-8 | E3 visual lane + nightly | M | |
| PR-9 | E4 route-health sweep | M | Nightly; chưa vào PR gate |
| PR-10 | E5 judge loop | S | Advisory |
| U-lane | **U0a chrome diet trước** (sau PR-0 vì app-shell.tsx đang trong WIP) → U0b+U1 pass/family → U2→U7 | S–M mỗi lát | Chạy song song từ PR-3, page families không đụng file E/G |

## 4. Tiêu chí thoát chương trình

- 4 tuần sau khi trụ E land: lỗi UI owner tự phát hiện mà lẽ ra gate phải bắt
  ≈ 0; mỗi lần lọt → thêm guard row ngay trong tuần.
- Số tile bridge sang office của role chi nhánh giảm đơn điệu → 0 (D059).
- 4 tình huống routing-test resolve được CHỈ bằng docs, không cần đọc source.
- Nightly sweep flake < 10%; check nào kêu láo → hạ cấp/xóa (zero-noise).
- Mỗi U slice: bộ ảnh 3 viewport trong PR body + tap budget tuyên bố và đạt.

## 5. Ngoài phạm vi (bác, không bàn lại)

Native rewrite (D062) · design system mới / đổi token (D044) · shell thứ hai
(D045/D063) · single responsive shell (D058 §1) · sửa taxonomy 12 archetype ·
pixel gate per-PR trên runner hiện tại · dep UI/visual mới (Chromatic, Percy,
Storybook, axe) · PWA-3/4 trước PWA-1 · mô hình inventory (D060 đã khép).

## 6. Điểm chờ owner chốt (kèm default đề xuất — chỉ cần "đồng ý" là chạy)

1. Nâng runner CI để visual check chặn PR? **Default: chưa — nightly
   report-only, xét lại sau khi trụ E ổn định.**
2. ~~"Khó dùng" đã được phủ hết chưa?~~ **ĐÃ TRẢ LỜI (owner 2026-07-03):**
   pain đích danh = breadcrumb/header trùng lặp chiếm diện tích + layout từng
   màn không có mục tiêu ("lấp đầy cho có") → thành slice U0a/U0b, ưu tiên
   số 1 plane Office. Còn job nào đau thêm → nêu tên, thành slice mới.
3. Từ vựng section Hub "Đầu ca / Cuối ca" + thứ tự ưu tiên feed (duyệt → phiếu
   kiểm dở → tồn thấp → hạn dùng → chốt ngày). **Default: duyệt như đề xuất.**
4. Slot bottom-nav curated mỗi module office (vd Kho: Hôm nay · GRN · PO · Đối
   soát). **Default: đề trong từng slice PR, owner chỉnh tại chỗ.**
5. Phạm vi ⌘K palette. **Default: nav + tra mã đơn.**
6. Deep link finance → `/orders?...` dạng display-filter (refund vẫn chỉ khởi
   tạo trong /orders). **Default: đồng ý.**
7. Ngôn ngữ tầng guidance + hiệu lực decision tree. **Default: `ui.md` giữ
   tiếng Việt (grandfather); tree = advisory-but-review-anchored (PR làm khác
   phải nêu lý do), gate giữ deterministic-only.**
8. Nghiệm thu mỗi U slice. **Default: bằng chứng Playwright là đủ; owner
   walkthrough 5 phút chỉ cho lát chạm job sàn hằng ngày (GRN create, Hub
   spine).**
