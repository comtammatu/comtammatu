# Kế hoạch tổng — xử lý dứt điểm toàn bộ (2026-07-03)

> Reconciled-through d69a0a48
>
> Umbrella plan: gom TOÀN BỘ việc còn thật sau phiên điều tra 2026-07-03
> (triage backlog 10-lane + T3 debate UI 5-lens + research realtime 6-lane)
> thành một trình tự thi công duy nhất. Chi tiết kỹ thuật sống ở plan con —
> file này chỉ giữ trình tự, điều kiện, và định nghĩa "xong dứt điểm".
>
> Plan con: `docs/plan/ui-trinity-program-2026-07-03.md` (UI) ·
> `docs/plan/realtime-sync-program-2026-07-03.md` (RT) · board `tasks/todo.md`.
> Thứ tự = wave, KHÔNG phải lịch ngày — mỗi wave xong (gate xanh + nghiệm thu)
> mới coi là qua; nhiều lane trong một wave chạy song song.

## Định nghĩa "dứt điểm"

1. **0 lỗi P1 sống** (5 cái tìm thấy 2026-07-03 đều đóng, có bằng chứng).
2. **Board sạch**: `tasks/todo.md` không còn dòng stale; mọi dòng mở đều có
   wave + owner rõ.
3. **3 chương trình đạt exit criteria** đã ghi trong plan con (UI Trinity §4,
   Realtime §5, backlog residual đóng theo Wave 4).
4. **Chống tái phát bằng máy**: mỗi lớp lỗi từng lọt có detector (ratchet /
   structural test / sweep / judge loop) — lỗi mới lọt gate → guard row trong
   tuần (learning loop `workflow.md`).
5. **Owner-lane rỗng**: 13 quyết định đã chốt, migrations đã apply, toggles đã
   bật, thiết bị thật đã smoke.

## Wave 0 — Mở khóa (chạy ngay, không chờ quyết định nào)

| Lane | Việc | Effort | Ai |
|------|------|--------|-----|
| A | CSP fix `next.config.ts` derive từ `NEXT_PUBLIC_SUPABASE_URL` (UI PR-1) — mở khóa e2e custom port, LAN device, browser smoke, mọi detector runtime | S | agent |
| B | RT-PR1 client hardening: hook wrapper + fix 2 bare-subscribe + filter `notification-popups` + KDS dedupe | S–M | agent |
| C | UI PR-2 ratchets: `input` frozen-import + motion budget + cấm `window.location.reload/assign` ngoài allowlist | S | agent |
| D | U0c-1 diệt 4 site full-reload (`import-export-menu`, `invoice-list`, `team-board-client`, `use-order-sync`) | S | agent |
| E | **Chốt 13 quyết định** (artifact §5 / plan con) — "đồng ý default" là đủ | — | **owner** |
| F | Apply migration thiếu `branch_stock_operator_actions` lên prod; bật Docker local; `npm i -g @openai/codex` | — | **owner** |

Điều kiện qua wave: A–D merged gate xanh; E–F xong (F có thể trượt sang song
song Wave 1 nhưng chặn role-sweeps + second-runtime review).

## Wave 1 — Nền tảng (song song 3 lane)

| Lane | Việc | Nguồn |
|------|------|-------|
| G-guidance | G-S1 index → G-S2 registry 56 component → G-S3 Interaction Patterns (7 job, gồm Feedback/pending + skeleton recipe) → G-S4 gate registry-coverage → G-S5 cross-link | UI plan trụ G |
| RT-bus | RT-PR2 migration bus (T3, file → PR → **owner apply**) → RT-PR3 mount 4 hàng đợi duyệt + orders list + Hub counts | RT plan §4 |
| U-office-core | U0a chrome diet ("một nhãn, một chỗ") → U0c-2 skeleton `loading.tsx` family chính → U0c-3 pending-state contract → U0c-4 press feedback default/sm | UI plan U0 |

Kèm: E2 reachability test + E3 visual lane nightly (chạy nền, không chặn).
Lane song song đang chạy sẵn: **D064 menu-limit/stock** (contract riêng
`docs/worklog/t3-menu-limit-stock-debate-2026-07-04.md`, PR-1 đã merge #231) —
PR-2 migrations M1+M3 (**owner apply**, bắt buộc trước khi bật lại posting) →
PR-3 gỡ hẳn ingredient-gate → M4 refund quota; giữ nguyên trình tự contract đó.
Điều kiện qua wave: routing-test 4 tình huống resolve doc-only (trụ G);
duyệt/orders/Hub live cross-device (RT-PR3 nghiệm thu 2 thiết bị);
office hết nhãn lặp + có pending feedback (ảnh 3 viewport).

## Wave 2 — Thi công diện rộng (song song, family-based)

- **U0b+U1 per family** (orders → finance → hr → inventory): width `xwide` +
  job-first reorder + xóa block lấp chỗ — một pass/family, một PR/family.
- **W4 master-detail orders** ở `xl:` (tách content `order-detail-sheet`
  trước — nuốt luôn WS-3 split tồn đọng).
- **RT-PR4 inventory sync** + delta fetch `updated_at` + fetch bounds còn sót
  (`fetchSuppliers`…).
- **Hub Today-spine** (feed + tile theo pha ca + cửa Duyệt persistent + CTA
  chuỗi việc) — sau khi owner chốt quyết định #2.
- **E4 route-health sweep** nightly (console/500/overflow/tap-target/
  col-count + coverage `loading.tsx`).
- **DB-1 sweep** log `error.code/details` server-side theo shell (≤43 file,
  mỗi shell một PR).
- **E2E re-add**: `payment-vietqr` + `edit-pending-pricing` vào gate sau khi
  root-cause CI multi-spec hang (thử job tách riêng / element-wait thay
  networkidle).

## Wave 3 — Hoàn thiện năng lực

- **D059 §4 extraction queue** (thứ tự khóa): GRN create → count-assignments
  → supplier-returns → HR approvals seam → production surface; mỗi lát gỡ
  tile bridge tương ứng (shrink-to-zero).
- **RT-PR5** freshness stamps (`data_as_of`) + cron run-log/alert qua
  notifications producer (đóng luôn mục "cron_run_log" tồn từ audit 06-21).
- **RT-PR6** POS menu sync (cuối, một mình — frontline).
- **U5** bottom-nav office curated + unbury HR approvals; **U6** ⌘K palette;
  **E5** judge loop định kỳ; **U0c-5** optimistic hot path (đi cùng bus);
  **U0c-6** View Transitions experiment.
- **PWA-1** Hub cài được (sau lát extraction đầu).

## Wave 4 — Đóng residual backlog

- i18n eslint mở rộng (`.ts`, expression-container, toast/throw) + hạ baseline.
- HRM: màn đối chiếu payroll trước duyệt (đợi owner chốt phạm vi Đợt 3).
- e2e inventory UI (warehouse_manager storageState) + `kds-queue` semantics
  (sau owner chốt #13) + `daily-limit` tz fix.
- Unused indexes + dead-RPC wave 2 — CHỈ sau ≥1 chu kỳ telemetry
  (`track_functions` bật ở Wave 0 #12, đợi tháng số liệu).
- Completion-auth D043, D031c partial payment, D028 metric — theo quyết định
  owner, mỗi cái một lát T3.

## Lane riêng của owner (song song mọi wave)

1. 13 quyết định (Wave 0-E). 2. Apply 2 migrations (thiếu + bus). 3. Toggles
dashboard (leaked-password, TOTP MFA, `track_functions`). 4. Docker + codex
local. 5. **Inventory reset bước 3–6** + ledger-fix D060 §5 (critical path
riêng, không thuộc 3 chương trình). 6. Print-agent deploy 3 chi nhánh +
UptimeRobot. 7. Smoke thiết bị thật cho job sàn (GRN create, Hub spine) khi
lát tương ứng land.

## Kỷ luật thi hành (không đổi)

- Một mối quan tâm mỗi PR; full gate fresh (`typecheck && lint && build` +
  test) trước merge; tier theo `workflow.md` (T3 = migration/RLS/money);
  migration = file → PR → owner apply; ratchet baseline chỉ giảm; mọi U slice
  kèm ảnh 3 viewport + tap budget; second-runtime review (codex) từng PR khi
  CLI hồi sinh; lỗi lọt → guard row trong tuần; worklog land xong thì promote
  & delete theo retention.
- Wave = trình tự phụ thuộc, không phải cam kết lịch. Không dùng tốc độ
  LLM làm cơ sở hứa ngày (bài học đã ghi).
