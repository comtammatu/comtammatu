# Inventory UI/UX Evidence Log

> Nhật ký evidence cho từng round QA UI/UX của Inventory.
>
> Đây là worklog sống. Không dùng file này làm source of truth thay cho runbook hoặc docs nghiệp vụ.

Updated: `2026-05-24`

---

## 1. Cách dùng

- Mỗi round QA phải mở từ [../../runbooks/inventory/pre-release-qa.md](../../runbooks/inventory/pre-release-qa.md).
- Mỗi finding phải đối chiếu [../../runbooks/inventory/ui-ux-rubric.md](../../runbooks/inventory/ui-ux-rubric.md).
- Mỗi route/CTA phải bám [../../runbooks/inventory/route-cta-matrix.md](../../runbooks/inventory/route-cta-matrix.md).
- Mỗi persona phải đi theo [../../runbooks/inventory/operator-journeys.md](../../runbooks/inventory/operator-journeys.md).

Không ghi kiểu “đã test qua” chung chung. Mỗi dòng phải có evidence cụ thể.

---

## 2. Wave kickoff

Điền trước khi chạy audit:

| Field | Value |
| ----- | ----- |
| Date | `2026-04-17` |
| Branch / Site under test | `Trụ sở chính`, `Chi nhánh Đất Đỏ`, employee boundary |
| Build / commit / branch | `main @ 4566090` |
| Test data snapshot | Local env có seeded accounts `super_manager`, `branch_manager`, `owner`, `cashier`; đã có sẵn transfer, issue, stocktake, receiving rows để đọc UI; round này không submit write action thật |
| Scope / wave | Wave 1 IA/nav + Wave 2 HQ dashboard/receiving + Wave 3 production shell + Wave 4 branch dashboard/transfers/issues/stocktake + Wave 5 owner/cashier boundary + Wave 6 placeholder sweep |
| Driver | Browser run bằng Playwright trên `http://localhost:3000`, evidence lưu ở `apps/web/tmp/ui-ux-qa-run/*` |

### 4-lens kickoff

| Lens | Owner | Notes / acceptance focus |
| ---- | ----- | ------------------------ |
| PM | `Codex` | Round này không sign-off; mục tiêu là xác nhận IA, CTA, và boundary UX trước khi mở full regression |
| BA | `Codex` | Bám `inventory.md`, `inventory-sop.md`, `inventory-rbac-matrix.md`, và role handoff để đối chiếu runtime |
| Senior Dev | `Codex` | Chạy local dev + browser audit không mutate dữ liệu; gom screenshot, summary JSON, console warnings |
| QA/QC | `Codex` | Ưu tiên log `P0/P1` trước, dùng rubric UI/UX để phân loại rõ live workflow vs placeholder |

---

## 3. Execution log template

| Wave | Persona | Site kind | Device | URL | CTA / step | Kết quả UI | Kết quả dữ liệu / downstream | Evidence | Severity | Owner | Status |
| ---- | ------- | --------- | ------ | --- | ---------- | ---------- | ---------------------------- | -------- | -------- | ----- | ------ |
| `1` | `branch_manager` | `branch` | `tablet` | `/inventory` | dashboard landing | Nav chỉ còn branch ops; quick actions `Nhận transfer`, `Cấp bếp`, `Tồn kho`, `Kiểm kê` hiện rõ, không lộ procurement | Không ghi write; mental model branch ops đúng nhịp nhận hàng -> cấp bếp -> kiểm kê | `branch-tablet-dashboard.png`, `summary.json` | `-` | `inventory/web` | `observed` |
| `1` | `branch_manager` | `branch` | `tablet` | `/inventory/transfers` | header `Tạo phiếu` | CTA tạo transfer xuất hiện như primary action ở góc phải dù màn này đang được dùng như inbound receive list cho branch | Không ghi write; downstream chưa bị mutate vì chưa submit dialog | `branch-tablet-transfers.png`, `summary.json` | `P1` | `inventory/web` | `open` |
| `1` | `branch_manager` | `branch` | `tablet` | `/inventory/issues` | header `Xuất báo cáo (sắp mở)` | Placeholder CTA vẫn render ngay header cạnh action live `Tạo phiếu cấp bếp`; mở dialog tạo phiếu gây warning a11y ở browser console | Không ghi write; downstream chưa tạo issue mới vì dialog chỉ mở để audit shell | `branch-tablet-issues.png`, `summary.json`, browser console | `P1` | `inventory/web` | `open` |
| `1` | `branch_manager` | `branch` | `mobile` | `/inventory` | open sidebar | Sidebar mobile mở được, nav đủ `Tổng quan`, `Tồn kho`, `Điều chuyển`, `Cấp bếp`, `Kiểm kê`, `Hạn dùng`, `Báo cáo`, `Nguyên liệu`; không phụ thuộc hover | Không ghi write; cho thấy branch mobile vẫn điều hướng được các flow chính | `branch-mobile-sidebar.png`, `summary.json` | `-` | `inventory/web` | `observed` |
| `1` | `branch_manager` | `branch` | `mobile` | `/inventory/issues` | open create dialog | Dialog `Tạo phiếu xuất kho` fit mobile nhưng header vẫn giữ placeholder `Xuất báo cáo (sắp mở)`; browser console báo thiếu `Description`/`aria-describedby` cho `DialogContent` | Không ghi write; chỉ audit dialog shell | `branch-mobile-issues.png`, browser console | `P2` | `inventory/web` | `open` |
| `1` | `branch_manager` | `branch` | `tablet` | `/inventory/stocktake` | header `Mở phiên kiểm kê` | Primary CTA render thành `Mo phien kiem ke`, mất dấu tiếng Việt; list/filter vẫn đọc được | Không ghi write; end-of-shift flow chưa được submit thật trong round này | `branch-tablet-stocktake.png`, `summary.json` | `P2` | `inventory/web` | `open` |
| `2` | `super_manager` | `headquarters` | `desktop` | `/inventory/receiving` | landing + quick links | Màn `Nhập hàng HQ` hiển thị rõ 3 step cards và deep links `Quản lý PO`, `Mở GRN`, `Đối soát hóa đơn`; hierarchy phù hợp HQ operator | Không ghi write; downstream chưa tạo PO/GRN/invoice mới trong round này | `super-desktop-receiving.png`, `summary.json` | `-` | `inventory/web` | `observed` |
| `3` | `super_manager` | `central_kitchen` | `desktop` | `/inventory/production` | open `Tạo lệnh sản xuất` dialog | Dialog create order render đúng trọng tâm nhưng browser console báo thiếu `Description`/`aria-describedby`; đây là regression a11y trên modal live | Không ghi write; chưa submit production order mới | `super-desktop-production.png`, `summary.json`, browser console | `P2` | `inventory/web` | `open` |
| `5` | `owner` | `tenant` | `desktop` | `/inventory` | dashboard landing | Owner vào được dashboard và vẫn thấy quick actions kiểu operator như `Nhập nguyên liệu`, `Điều chuyển`, `Kiểm kê`, `Báo cáo`; UX đang kéo owner vào mental model vận hành thay vì giám sát | Không ghi write; downstream không đổi nhưng boundary UX lệch docs role handoff | `owner-desktop-inventory.png`, `summary.json` | `P1` | `inventory/web` | `open` |
| `5` | `cashier` | `branch` | `desktop` | `/inventory` | direct route access | Route bị chặn đúng; user bị redirect về `/employee?forbidden=1&reason=insufficient-permission` | Không có quyền vào Inventory; ACL runtime đúng boundary | `cashier-desktop-inventory.png`, `summary.json` | `-` | `proxy/auth` | `observed` |

Quy ước:

- `Kết quả UI`: toast, status badge, redirect, disabled state, layout note.
- `Kết quả dữ liệu / downstream`: tồn kho đổi, status entity đổi, bridge POS/recipe impact, report impact.
- `Evidence`: ảnh chụp, video, log, hoặc note “observed live”.

---

## 4. Defect summary

| ID | Severity | Route | Tóm tắt | Persona / device impact | Decision | Owner |
| -- | -------- | ----- | ------- | ----------------------- | -------- | ----- |
| `INV-UIUX-001` | `P1` | `/inventory/transfers` | `branch_manager` thấy CTA `Tạo phiếu` như primary action trên branch transfer list, trái với mental model nhận transfer là action mặc định của chi nhánh | Branch operator trên tablet/desktop rất dễ bị dẫn sang outbound transfer thay vì inbound receive flow | `fixed` | `inventory/web` |
| `INV-UIUX-002` | `P1` | `/inventory/issues` | Placeholder `Xuất báo cáo (sắp mở)` đang chiếm chỗ trên màn live branch ops, kể cả tablet/mobile | Branch operator bị nhiễu giữa workflow live và action chưa live, đặc biệt trên màn hình nhỏ | `fixed` | `inventory/web` |
| `INV-UIUX-003` | `P2` | `/inventory/issues`, `/inventory/production` | Modal live báo warning `Missing Description or aria-describedby={undefined} for {DialogContent}` khi mở | Ảnh hưởng accessibility và chất lượng UI của dialog tạo phiếu / tạo lệnh | `fixed` | `inventory/web` |
| `INV-UIUX-004` | `P2` | `/inventory/stocktake` | CTA chính hiển thị `Mo phien kiem ke`, mất dấu tiếng Việt | Branch operator thấy copy thiếu polish ở một hành động kiểm soát cuối ca quan trọng | `fixed` | `inventory/web` |
| `INV-UIUX-005` | `P1` | `/inventory` | Owner dashboard vẫn mang framing operator với quick actions live thay vì framing giám sát | Owner desktop dễ bị hiểu sai đây là workspace thao tác thường nhật, trái docs role handoff | `fixed` | `inventory/web` |

Decision rules:

- `open`: cần fix trước sign-off.
- `accepted`: boundary hiện tại chấp nhận, thường áp dụng cho placeholder rõ ràng.
- `fixed`: đã verify lại bằng evidence mới.

---

## 5. Historical sign-off snapshot - 2026-04-17

Snapshot from the first rendered round. Current decisions are superseded by
section 7.

| Gate | Result | Notes |
| ---- | ------ | ----- |
| `pnpm typecheck` | `pass` | Re-run sau khi cập nhật worklog round này |
| `pnpm lint` | `pass` | Re-run sau khi cập nhật worklog round này |
| `pnpm build` | `pass` | Re-run sau khi cập nhật worklog round này; warning Serwist/Turbopack không chặn build |
| All live routes covered in CTA matrix | `no` | Round này mới chạm dashboard, receiving, production shell, transfers, issues, stocktake, owner/cashier boundary |
| Persona journeys executed | `partial` | `branch_manager`, `super_manager`, `owner`, `cashier` đã chạy; `area_manager`, GRN detail, supplier invoice, expiry, reports, POS bridge chưa chạy |
| P0 resolved | `n/a` | Round 1 chưa log P0 mới |
| P1 resolved or explicitly accepted | `no` | Có `INV-UIUX-001`, `002`, `005` đang mở |
| Docs aligned (`inventory.md`, `SOP`, `RBAC`, UX contract) | `partial` | RBAC route boundary nhìn chung đúng, nhưng owner UX framing và branch transfer CTA đang lệch contract |

## 6. Contract V2 implementation evidence - 2026-04-27

Scope closed in this patch:

- `INV-UIUX-001`: `/inventory/transfers` now labels the branch manager primary CTA as `Cap bep`; the branch manager create dialog only exposes the intra-branch flow.
- `INV-UIUX-002`: `/inventory/issues` hides the export/report action on branch issue surfaces.
- `INV-UIUX-005`: owner/area dashboard quick actions were intended to use oversight framing, but this claim is superseded by the 2026-05-24 rendered rerun below.

Runtime evidence:

- `pnpm typecheck`: pass.
- `pnpm lint`: pass.
- `supabase migration list --linked --output json`: new migration `20260427103652` is local-only.
- `supabase db push --linked --include-all --dry-run`: would push only `20260427103652_inventory_pilot_contract_v2.sql`.
- `supabase db lint --linked --schema public,auth,storage --level warning --fail-on none --output json`: pass command with existing warnings only (`transition_order_item_status`, `toggle_profile_active`, `save_station_categories`, `confirm_goods_receipt_note`, `create_supplier_return_from_stock`, `create_order`, `enqueue_provisional_bill`, `storage.search_by_timestamp`).
- `pnpm build`: pass on final rerun. Earlier transient runs failed once after Serwist service-worker bundling and once during a diagnostic non-standard `NODE_ENV=development` run; those did not reproduce in the final production build.

Grep evidence:

- Runtime issue options remain `consumption | writeoff | other`; `kitchen_use` only appears in retired comments and rejection tests.
- New RPC gates enforce `inventory:transfer_create`, `inventory:transfer_ship`, and `inventory:transfer_receive`.
- POS consumption now raises `default_consumption_location_missing` instead of falling back to `default_receive`.

## 7. IF-007 rendered rerun - 2026-05-24

Scope: rerun the stale Inventory UI/UX evidence after the current App Router
route-group migration and after the legacy `matu-*` layer was removed. This
round does not mutate Inventory data.

| Field | Value |
| ----- | ----- |
| Date | `2026-05-24` |
| Driver | Playwright Chromium against `http://localhost:3000` |
| Evidence | `/tmp/comtammatu-inventory-if007-rerun-2026-05-24T02-55-15-448Z/summary.json` plus first run `/tmp/comtammatu-inventory-if007-2026-05-24T02-49-31-258Z/summary.json` |
| Test data note | `cashier.datdo@comtammatu.vn` and `cashier.phuochai@comtammatu.vn` failed password auth against the connected Supabase project, while owner/super/branch/waiter/chef accounts passed. Negative Inventory ACL was rerun with `waiter.datdo@comtammatu.vn`, another POS-floor role without Inventory grant. |

### Rerun results

| Persona | Device | URL | Result | Evidence | Decision impact |
| ------- | ------ | --- | ------ | -------- | --------------- |
| `branch_manager` | `tablet` | `/inventory` | Dashboard renders branch ops: `Nhận`, `Cấp bếp`, `Kiểm kê` present. | `branch-tablet-dashboard.png`, rerun `summary.json` | observed |
| `branch_manager` | `tablet` | `/inventory/transfers` | Primary transfer language now exposes `Cấp bếp`; old `Tạo phiếu` finding no longer reproduces as the headline issue. | `branch-tablet-transfers.png`, rerun `summary.json` | `INV-UIUX-001=fixed` |
| `branch_manager` | `tablet` | `/inventory/issues` | Live `Tạo phiếu` remains; placeholder `Xuất báo cáo (sắp mở)` is absent. Opening the dialog still logs missing `DialogContent` description. | `branch-tablet-issues.png`, rerun `summary.json` | `INV-UIUX-002=fixed`, `INV-UIUX-003=open` |
| `branch_manager` | `tablet` | `/inventory/stocktake` | `Mở phiên kiểm kê` renders with Vietnamese accents; `Mo phien kiem ke` absent. | `branch-tablet-stocktake.png`, rerun `summary.json` | `INV-UIUX-004=fixed` |
| `branch_manager` | `mobile` | `/inventory` | Mobile dashboard renders `Hôm nay` and `3 luồng vận hành chính`; the earlier `Tổng quan` needle was stale. | `branch-mobile-dashboard.png`, rerun `summary.json` | observed |
| `owner` | `desktop` | `/inventory` | Owner can enter Inventory but still sees operator CTAs: `Đơn đặt hàng`, `Phiếu nhập`, `Điều chuyển`, `Kiểm kê`. | `owner-desktop-inventory.png`, rerun `summary.json` | `INV-UIUX-005=open` |
| `super_manager` | `desktop` | `/inventory/receiving` | Receiving landing has `Quản lý PO`, `Mở GRN`, `Đối soát`. | first-run `super-desktop-receiving.png`, first-run `summary.json` | observed |
| `super_manager` | `desktop` | `/inventory/production` | Create production button is visible but disabled because no BOM is configured; no dialog warning reproduced on this path. | `super-desktop-production.png`, rerun `summary.json` | production half of `INV-UIUX-003` not reproduced |
| `waiter` | `desktop` | `/inventory` | POS-floor role is blocked at `/access-denied?reason=insufficient-permission&from=%2Finventory`. | `waiter-desktop-inventory-denied.png`, rerun `summary.json` | ACL boundary observed |

### Current decision snapshot

| ID | Decision after rerun | Notes |
| -- | -------------------- | ----- |
| `INV-UIUX-001` | `fixed` | Branch transfer route no longer reproduces the old primary-CTA mismatch. |
| `INV-UIUX-002` | `fixed` | Branch issues route no longer shows the placeholder export/report action. |
| `INV-UIUX-003` | `fixed` | Superseded by section 8: branch issue dialog no longer emits missing `DialogContent` description warning. Production dialog could not be opened because the product correctly disables create until BOM exists. |
| `INV-UIUX-004` | `fixed` | Stocktake CTA accent is correct in rendered QA. |
| `INV-UIUX-005` | `fixed` | Superseded by section 8: owner dashboard now uses oversight framing and hides operator CTAs/nav items. |

### Current final call

- `ready`
- **`not ready`**

Reason:

- IF-007 stale-status cleanup is complete.
- Follow-up section 8 closes the two remaining rendered defects from this rerun.
- Test-data drift: cashier seeded passwords are not valid against the connected Supabase project; POS-floor negative ACL was covered by waiter instead.
- Still not covered in this rerun: area manager, GRN detail, supplier invoice, expiry/report detail, and POS bridge flows.

## 8. IF-007 follow-up fix evidence - 2026-05-24

Scope: close the two remaining rendered defects from section 7 without broad
Inventory redesign.

| Field | Value |
| ----- | ----- |
| Driver | Playwright Chromium against `http://localhost:3000` |
| Evidence | `/tmp/comtammatu-inventory-owner-a11y-2026-05-24T03-07-25-321Z/summary.json` |

| ID | Result | Evidence |
| -- | ------ | -------- |
| `INV-UIUX-005` | `fixed` | Owner `/inventory` renders `Giám sát`, `3 điểm giám sát chính`, `Xem tồn`, `Xem cảnh báo`; forbidden operator text `Đơn đặt hàng`, `Phiếu nhập`, `Điều chuyển`, `Kiểm kê` is absent. Screenshot: `owner-desktop-inventory.png`. |
| `INV-UIUX-003` | `fixed` | Branch manager opens `/inventory/issues` create dialog; missing `DialogContent` description warnings count is `0`, and placeholder `Xuất báo cáo (sắp mở)` remains absent. Screenshot: `branch-tablet-issues-dialog.png`. |
| Branch regression | `pass` | Branch dashboard still renders operator wording `Nhận`, `Cấp bếp`, `Kiểm kê`. Screenshot: `branch-tablet-inventory.png`. |

### Follow-up final call

- `ready`
- **`not ready`**

Reason:

- The five tracked rendered `INV-UIUX-*` defects are now fixed.
- Full Inventory sign-off is still not ready because this follow-up did not
  cover area manager, GRN detail, supplier invoice, expiry/report detail, POS
  bridge flows, or the cashier seed-password drift noted above.
