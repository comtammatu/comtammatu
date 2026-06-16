# UI/UX Baseline — Phase 0 đo (D032)

> Ngày: 2026-06-16 · Gắn: [decisions.md D032](../plan/decisions.md) (redesign = Hướng A hợp nhất + Hướng B nâng cấp thị giác)
> Phương pháp: workflow đa-tác-tử (44 agent, ~2.78M token) — mỗi surface audit theo
> [ui-ux-rubric.md](../runbooks/inventory/ui-ux-rubric.md) (6 trục + trục **data-correctness** thêm theo yêu cầu owner),
> mọi finding P0/P1 bị **verify đối kháng** (skeptic agent soi lại code + contract, loại finding không tự xác minh),
> clone/drift trích từ ratchet `scripts/check-ui-contract.mjs` đối chiếu phân loại D030.
> Đối chiếu CODE thực tế (không từ docs cũ). Authority: [design-system.md](../spec/design-system.md).

## 0. Cập nhật thực thi

- **W1 (Track G) — XONG.** ⚠️ Baseline dưới đây đo trên `fix/print-agent-retry-backoff` (stale, 144 file dirty của stream khác). Đối chiếu lại với **production `main`**: P0 fetch ~3.185 HĐ **đã fix sẵn** (commit `2a5f33d1` — `fetchTaxInvoicesPage` keyset-pagination, cả supplier-invoices). Phần Revenue còn lại fix ở **`b5609d27`** (main): bỏ `fetchTaxInvoices` unbounded re-fetch, dùng `invoice_attention_count` period-scoped có thẩm quyền từ `fetchFinanceDashboardSummary`, xóa hàm dead. Gate: tsc + eslint + ui-contract xanh; net −65 dòng.
- **⚠️ Hệ quả cho W2–W5:** baseline phản ánh branch stale, KHÔNG phải production. **Trước khi làm W2–W5, đối chiếu từng finding với `main`** — vài thứ có thể đã fix sẵn ở đó. (Đã spot-check: inventory double-glyph `45.000đđ` VẪN còn trên main → W2 còn hiệu lực.)

## 1. Scorecard (0–3/trục)

| Surface | Disc | Flow | State | Err | Resp | DS | Data | Avg | Pass |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| POS | 3 | 3 | 3 | 3 | 3 | 3 | 3 | **3.00** | ✅ |
| KDS | 3 | 3 | 3 | 3 | 3 | 3 | 3 | **3.00** | ✅ |
| Runner | 3 | 3 | 3 | 3 | 3 | 3 | 3 | **3.00** | ✅ |
| Admin Dashboard | 3 | 2 | 3 | 3 | 3 | 3 | 3 | 2.86 | ✅ |
| Finance (landing) | 3 | 3 | 3 | 3 | 3 | 2 | 3 | 2.86 | ✅ |
| Branch Dashboard | 3 | 2 | 3 | 3 | 3 | 2 | 3 | 2.71 | ❌ |
| Orders | 3 | 3 | 3 | 2 | 3 | 2 | 3 | 2.71 | ✅ |
| Employee | 3 | 2 | 3 | 2 | 3 | 2 | 3 | 2.57 | ❌ |
| Menu | 3 | 3 | 2 | 2 | 2 | 2 | 3 | 2.40 | ✅ |
| Finance · Revenue | 3 | 3 | 2 | 2 | 3 | 2 | 2 | 2.40 | ❌ |
| Inventory hub | 3 | 3 | 2 | 2 | 2 | 2 | 2 | 2.30 | ❌ |
| Finance · Invoices | 3 | 3 | 2 | 3 | 2 | 2 | **0** | 2.14 | ❌ |
| HR workspace | 3 | 2 | 2 | 2 | 3 | 1 | 2 | 2.10 | ❌ |

Trục: Disc=discoverability, Flow=workflow clarity, State=state feedback, Err=error prevention, Resp=responsive, DS=design-system consistency, Data=data correctness.

## 2. Phán quyết tổng

- **Frontline hoàn hảo (3.00):** POS, KDS, Runner — 3 surface khó nhất, lưu lượng cao nhất, **không một finding nào**. Design system đã *land* đầy đủ ở chỗ quan trọng nhất.
- **Discoverability = 3 trên cả 13 surface** — IA/CTA không phải vấn đề (track E đã hiệu quả).
- **Nợ tập trung, KHÔNG dàn trải:** điểm thấp dồn vào **Finance (over-fetch dữ liệu)**, **HR** (đang redesign D026/D027), và vài **fix surface lẻ** (padding, glyph tiền, toast/confirm). Đây là tinh chỉnh, **không phải đại tu**.
- Kết luận này xác nhận hướng **A+B** đúng: Hướng A (hợp nhất) nhỏ hơn lo ngại; phần lớn là Track G (Finance) + vài Track H lẻ.

## 3. Finding actionable đã verify (đã loại refuted)

**P0 — rủi ro dữ liệu/tiền (làm trước):**
- **Finance · Invoices — fetch không giới hạn ~3.185 HĐ.** `fetchTaxInvoices` ([finance/actions.ts:527](../../apps/web/app/(protected)/finance/actions.ts)) không `.range()`/date-filter/`.limit()`; `invoice-list.tsx` không set `pageSize` ⇒ DataTable tắt phân trang. Treo bảng + tải DB nặng → owner bỏ lỡ thao tác HĐĐT. (verify hạ P0→P1 về mức độ "treo chứ không sai số", nhưng vẫn là rủi ro lớn nhất.)

**P1 — data-correctness Finance:**
- **Finance · Revenue — re-fetch đè số có thẩm quyền.** `revenue/page.tsx:181` gọi lại `fetchTaxInvoices()` để đếm HĐ chờ, ghi đè `dashboardSummary.invoice_attention_count` (đã có từ `get_finance_dashboard_summary`) ở `revenue-client.tsx:798` → **2 con số khác nhau cho cùng dữ liệu**.
- **Finance · Revenue — lệch phạm vi.** Trang "Doanh thu · [kỳ]" hiển thị hàng-chờ-HĐ **toàn thời gian** (không truyền date-range) → owner hành động trên HĐ ngoài kỳ.

**P1 — surface lẻ (Track H):**
- **Inventory — double glyph tiền** `45.000đđ`: `dashboard-client.tsx:491-492` nối `currencySuffix='đ'` sau `formatVND` (đã tự có `đ`).
- **Menu — toggle phá doanh thu không guard:** `item-table.tsx:174-187` (gương ở `category-table.tsx`) tắt món khỏi POS ngay khi click, **không confirm, không toast** → 1 misclick gỡ món bán được khỏi POS.
- **Branch Dashboard — vi phạm padding:** `dashboard/page.tsx:209` đặt `className="md:p-6"` trên `<AppPage>` (phải dùng `density`).
- **Menu — `CardContent` tự pad** `p-5 sm:p-6` (`menu/page.tsx`) phá rhythm AppPage+Card.
- **Employee — copy hardcode** vượt messages SSoT: `CHECKLIST_PHASE_LABELS` + fallback error inline (`employee/tasks/tasks-client.tsx`).
- **Finance · Invoices — cột tiền thiếu `font-mono tabular-nums`** ở header (`invoice-list.tsx:565`).

**Ledger-scan (font-mono) — typography số liệu:** lặp ở Finance Invoices header + HR payroll (HR defer).

## 4. Suspect đã CLEAR (verify xác nhận đúng — không sửa)

- **Orders — "Doanh thu đã thu" sum đúng toàn bộ filtered set, loại đơn chưa thu** (D031 C5 đã fix, verified).
- **Inventory — `priceReviewCount` fetch thật** (không còn hardcode 0).
- **Menu — cấu trúc & độ chính xác dữ liệu đúng.**
- Loạt P1 bị refuted/hạ P2: finance-invoices state-feedback & responsive, orders filter-grid & pagination-copy, inventory empty-state copy, employee schedule double-count → không phải debt thật.

## 5. Kết luận clone/drift (ratchet)

Đúng như D030: **allowlist phần lớn là sàn false-positive, không phải backlog**. Migratable thật rất ít:
- **Status SSoT (real-debt, 2):** `INVOICE_STATUS_VARIANT` (`finance/revenue/[date]/page.tsx`) + `ITEM_STATUS_META` (`orders/order-detail-sheet.tsx`, đã dùng `ORDER_ITEM_STATUS_LABELS_VI` — chỉ gộp variant) → StatusBadge registry.
- **VND money-line (real-debt, 1 phần):** `inventory/purchase-orders/new/new-po-client.tsx` — dòng tiền (`unitPrice*qty`) nên dùng `formatVND`; giữ `toLocaleString` cho qty/count (D029).
- `use-is-mobile`: phần lớn **đã migrate** sang DataTable hoặc non-debt (master-detail stock/inventory-value — D030). `shell-registry`, `app-arbitrary-sizing`: **irreducible by design**. HR status maps: **deferred D026/D027**.

## 6. Thứ tự wave đề xuất (map vào D031 track + D032 B)

| Wave | Track | Scope | Lý do |
| --- | --- | --- | --- |
| **W1** | G | Bound `fetchTaxInvoices` (range + date) + `pageSize` cho invoice-list; bỏ re-fetch ở revenue, dùng `invoice_attention_count`; scope hàng-chờ theo kỳ | Mang P0 duy nhất + 3 P1 data-correctness; cùng đụng 1 surface → làm gộp |
| **W2** | H | Inventory double-glyph; Menu confirm (`confirm()` từ `@comtammatu/ui`, KHÔNG `window.confirm`) + success toast | 1 bug tiền nhìn thấy + 1 lỗ errorPrevention mất doanh thu; nhỏ, biệt lập |
| **W3** | H | Padding contract (branch-dashboard `density`, menu `Card size`) + copy SSoT (employee tasks, runner tile) | Đóng pattern padding + hardcode-copy lặp; mỗi chỗ 1 file, rủi ro thấp |
| **W4** | F | Gộp 2 status map real-debt vào StatusBadge registry + header tiền `font-mono tabular-nums` | Status clone non-HR duy nhất; **loại trừ toàn bộ HR/employee status (defer D026/D027)** |
| **W5** | B (D032) | Sau khi A đủ phủ: tách info-hue, bật dark mode, chiều sâu dashboard, ⌘K; gom P2 polish (KpiCard adoption inventory, signal-không-chỉ-bằng-màu) | Lớp thị giác đi sau nền hợp nhất |

## 7. Off-limits / defer

- **HR workspace (avg 2.10, DS=1)** — vùng redesign active D026/D027. Finding (payroll `toLocaleString`→`formatVND`, thiếu `font-mono`, status maps) **gói vào HR redesign**, không sửa lẻ.
- P2 backlog (inventory 6, menu 6, employee 7, hr 4…) = nguyên liệu cho Hướng B/polish, không chặn A.
