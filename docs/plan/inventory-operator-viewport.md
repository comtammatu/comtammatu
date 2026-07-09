# Inventory operator — viewport & flow (điều tra + đề xuất)

**Trạng thái:** Chờ owner chốt hướng — **chưa implement UI**.\
**Ngày:** 2026-07-09\
**Phạm vi:** Branch operator Inventory (`/br/[branchId]/stock/**`) và pattern embed từ Office Inventory.\
**Nguồn ràng buộc:** `docs/agent/rules/ui.md`, `docs/spec/design-system.md`, `docs/modules/ui.md` (Inventory / EMBED-WRAPPER).

---

## 1. Kết luận ngắn

Inventory operator **chưa tối ưu kiểu “một viewport + ScrollArea + Table body”** không phải vì thiếu primitive, mà vì **contract hiện tại cố ý dùng document-scroll** (cuộn cả trang trong shell `h-dvh`) và hầu hết màn stock chỉ là **EMBED-WRAPPER** nhúng Office Inventory.

Rule “first viewport = action/queue” trong `ui.md` áp mạnh cho **POS/KDS**, không khóa Inventory phải hard-fit như POS. `ScrollArea` gần như **không xuất hiện** trong stock; `DataTable` / `DocumentFormFrame` / `AppDetailFooter sticky` đã có nhưng **không tạo pane scroll riêng**.

---

## 2. Hiện trạng Inventory

### Shell chung (ràng buộc mọi màn stock)

- `(operator)/layout.tsx`: `h-dvh overflow-hidden` → main `flex-1 overflow-y-auto` → `AppPage density="compact"` → `OperatorBottomNav`.
- Một scroll chính ở **main**, không phải pane nội dung.
- Bottom nav chiếm chiều cao cố định; footer sticky dùng `chrome-safe-bottom`.

### Bản đồ theo nhóm màn

| Nhóm màn | Ví dụ route | Pattern hiện tại |
| --- | --- | --- |
| Hub | `/stock` | `BranchOperatorPage` + tile grid — document-scroll, ngắn |
| Catalog hub | `/stock/catalog` | `ItemGroup` drill-down — document-scroll |
| Catalog list | categories / ingredients / units / … | Embed settings Office + `DataTable` — document-scroll |
| LIST phiếu | PO, GRN list, transfer, stocktake list, issues, returns | EMBED → `*PageContent` + `AppToolbar` + `DataTable` (mobile card) — **cuộn cả trang**; header bảng **không sticky** |
| On-hand | `/stock/on-hand` | Embed `stock-client`: compact = `StockMobileGrid`/cards; desktop = `DataTable` — document-scroll |
| DOC tạo/sửa | GRN new, PO new, transfer new, waste, production new | `DocumentFormFrame` (Office) hoặc bare flex khi `embedded` + `AppDetailFooter sticky` — **body vẫn flow/document-scroll**, không `ScrollArea` |
| Nhận hàng / review GRN | `/stock/receive/[id]`, GRN draft review | `ItemGroup` cards + `AppDetailFooter sticky` — document-scroll + CTA dính đáy |
| Count / assignments | `/stock/count`, count-slips, assignments | Staff-runtime / embed — list/sheet; count dùng `ItemGroup`, sheet `overflow-y-auto` |
| Detail | PO / transfer / stocktake / issue `[id]` | Metadata + `DataTable` lines + `AppDetailFooter sticky={embedded}` — document-scroll |
| Reports | `/stock/reports` | Embed report — document-scroll |

### Primitive sẵn có vs mức dùng Inventory

| Primitive | Vai trò | Mức dùng trên stock operator |
| --- | --- | --- |
| `ScrollArea` (`packages/ui`) | Pane cuộn có height rõ | Dùng nhiều ở POS / self-order / team / notifications; **stock gần như 0** |
| `DataTable` | LIST/DETAIL chuẩn | Có — **không** tự sticky header, **không** tự fill chiều cao còn lại |
| `DocumentFormFrame` | Header + body + footer giấy tờ | Có — `scroll` mặc định `false`, **không tách pane** |
| Gate `scrollarea-no-max-height-only` | Cấm `ScrollArea` chỉ với `max-h-*` | Buộc height/flex rõ hoặc để layout/`DataTable` sở hữu scroll |

---

## 3. Nguyên nhân

1. **Không có rule “Inventory = single viewport / no nested scroll / hard-fit”.**\
   `ui.md` / design-system nhấn first-viewport cho **POS/KDS**; Inventory = “workflow-first, dense tables, sticky CTA khi DOC”.
2. **Archetype đã khóa document model:** LIST = `AppPage` + toolbar + `DataTable`; DOC = `DocumentFormFrame` + sticky footer; EMBED = bare `flex flex-col gap-3` trong operator `AppPage` — **cố ý cuộn trang**, không pane.
3. **Lịch sử kiến trúc:** một `PageContent` phục vụ Office + Branch (`embedded`). Office là desktop management (cuộn dài ổn); Branch PWA kế thừa cùng body → cảm giác “chưa tối ưu viewport” trên điện thoại.
4. **Primitive có nhưng chưa có “viewport shell” chuẩn cho Inventory.** POS đã có pattern `min-h-0 flex-1` + `ScrollArea`; Inventory chưa migrate sang đó, và gate ScrollArea còn **thận trọng** với nested scroll sai.
5. **Một phần đã “đủ tốt” theo contract cũ:** sticky CTA nhận hàng/GRN; compact filters; mobile cards — friction chủ yếu là **list dài + header/filter mất khi cuộn**, không phải thiếu CTA hoàn toàn.

---

## 4. Đề xuất pattern chuẩn

### Nên dùng viewport-locked shell

Header/filter sticky + body `min-h-0 flex-1` + `ScrollArea` (hoặc table body cuộn); footer sticky **ngoài** scroll:

- Phiếu thao tác tay: nhận hàng, GRN review/create (nhiều dòng), count slip, stocktake counting, transfer receive.
- LIST dày trên mobile khi filter + hàng dài: on-hand, PO/GRN/transfer queues — **ít nhất** sticky toolbar + body cuộn; desktop có thể giữ document-scroll nếu pagination ngắn.

### Giữ document-scroll

- Hub `/stock`, catalog index, settings drill-down ngắn.
- DETAIL đọc (metadata + lịch sử) khi không đang nhập số lượng.
- Reports / form ít dòng.

### Chuẩn hóa primitive

1. Một adapter kiểu **OperatorViewportShell** (hoặc mở rộng `DocumentFormFrame` khi `embedded`: header / `ScrollArea` body / `AppDetailFooter`) — không fork UI từng route.
2. LIST: `DataTable` + tùy chọn sticky `TableHeader` **trong** pane có height xác định (không `ScrollArea` + `max-h` mơ hồ).
3. Không nhét `ScrollArea` vào mọi chỗ; tránh **double scroll** (main `overflow-y-auto` + pane) — khi khóa viewport, main phải `overflow-hidden` và chỉ body pane cuộn.

### Khi nào KHÔNG dùng

Hub ngắn; overlay Sheet/Drawer đã có scroll riêng; form 1–3 field; màn đọc audit dài theo tài liệu.

---

## 5. Roadmap theo ưu tiên

### Phase 1 — ROI cao (thao tác kho trên sàn)

`receive/[id]`, GRN review/create embedded, `count` / stocktake count, transfer receive — viewport shell + sticky CTA (đã có) + body `ScrollArea` / `min-h-0`.

### Phase 2 — LIST hàng ngày

On-hand, PO list, GRN list, transfer/receive list, issues/waste approvals — sticky toolbar + pane list/`DataTable`; thống nhất mobile card trong pane.

### Phase 3 — Catalog & detail & Office parity

Catalog sublists, DETAIL lines; cân nhắc cùng shell trên `/inventory` desktop nếu muốn một contract; hub/catalog index giữ document-scroll.

---

## 6. Rủi ro / phụ thuộc

- **Double scroll** nếu không tắt `overflow-y-auto` của main khi page tự khóa viewport.
- **Bottom nav + safe area** vs `AppDetailFooter sticky` / `chrome-safe-bottom` — dễ che CTA hoặc thừa padding.
- **PWA `h-dvh` / keyboard** trên mobile khi focus ô số lượng (GRN/count).
- **EMBED + Office chung code:** đổi shell phải qua nhánh `embedded`, không phá Office `xwide`.
- **Gate `scrollarea-no-max-height-only`** và archetype LIST/DOC — cần cập nhật contract trước khi “hard-fit” hàng loạt.
- **ACL / tile matrix** không chặn layout, nhưng dense viewport không được đẩy action ngoài quyền xuống dưới fold.

---

## Tóm lại

Cảm giác thiếu ScrollArea/Table “khóa viewport” là đúng với trải nghiệm PWA, nhưng **không phải bug so với rule hiện tại** — Inventory đang theo **document workflow + embed Office**.

Bước tiếp theo hợp lý: **định nghĩa viewport shell cho phiếu thao tác (Phase 1)**, rồi mới siết LIST — không gắn `ScrollArea` đại trà.

### Quyết định cần owner

1. Chốt Phase 1 (viewport shell cho phiếu thao tác) trước khi code?
2. Có muốn cập nhật contract trong `ui.md` / design-system (Inventory MAY dùng viewport-locked shell khi DOC/LIST dày) trước Phase 1 không?
3. Phase 2–3 có đưa vào backlog ngay, hay chỉ Phase 1 rồi đánh giá lại?
