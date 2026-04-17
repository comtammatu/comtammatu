# Inventory UI/UX Rubric

> Dùng để audit Inventory theo góc nhìn nhân viên thật, không chỉ theo checklist chức năng.
>
> Áp dụng cho toàn bộ `/inventory/*` đang live và các cầu nối vận hành có ảnh hưởng trực tiếp đến cảm nhận tồn kho hằng ngày.

Updated: `2026-04-17`

---

## 1. Scope và source of truth

Luôn đối chiếu theo thứ tự này:

1. [docs/ref/inventory.md](../../ref/inventory.md)
2. [docs/ref/inventory-sop.md](../../ref/inventory-sop.md)
3. [docs/ref/inventory-rbac-matrix.md](../../ref/inventory-rbac-matrix.md)
4. [docs/worklog/inventory/inventory-ux-contract.md](../../worklog/inventory/inventory-ux-contract.md)
5. [docs/modules/ui.md](../../modules/ui.md)

Boundary:

- Không audit theo gu thẩm mỹ cá nhân.
- Không đề xuất UI vượt khỏi design system hiện tại.
- Nếu UI đúng chức năng nhưng làm user hiểu sai bước tiếp theo, vẫn tính là fail UX.

---

## 2. Severity chuẩn

| Severity | Khi nào dùng | Ví dụ |
| -------- | ------------ | ----- |
| `P0` | Chặn tác vụ hằng ngày, gây thao tác sai nghiệp vụ, hoặc khiến user không thể hoàn tất flow chính | Không thấy CTA nhận hàng ở chi nhánh, confirm sai vai trò, mất action chính trên mobile |
| `P1` | User vẫn làm được nhưng rất dễ hiểu sai, bỏ sót bước, hoặc đi chậm đáng kể | Sau `received` không có gợi ý sang `Cấp bếp`, toast/state không đủ rõ, placeholder copy gây hiểu nhầm là đã live |
| `P2` | Lệch visual, responsive, a11y, hoặc discoverability nhưng chưa phá workflow | Hover-only action trên desktop, badge màu khó hiểu, spacing làm table khó quét |

Nếu một issue chạm cả chức năng và UX, ưu tiên severity cao hơn.

---

## 3. Cách chấm từng màn

Mỗi trục chấm theo thang `0-3`:

| Điểm | Ý nghĩa |
| ---- | ------- |
| `0` | Fail rõ ràng, cản flow hoặc gây hiểu sai nặng |
| `1` | Làm được nhưng ma sát cao, cần training hoặc đoán nhiều |
| `2` | Dùng được, còn điểm rối nhỏ hoặc thiếu phản hồi |
| `3` | Rõ, nhất quán, dễ thao tác, hợp vai trò và thiết bị |

Màn chỉ được coi là pass khi:

- không có `P0`;
- không có `P1` chưa chấp nhận;
- điểm trung bình từng trục chính không dưới `2`;
- trục `Workflow clarity` và `State feedback` không được dưới `2` ở các flow live.

---

## 4. Sáu trục audit bắt buộc

### 4.1 Action Discoverability

**Câu hỏi chính:** User có nhìn ra việc cần làm ngay mà không phải dò mò không?

Pass signals:

- CTA chính nổi bật, gần vùng ngữ cảnh của tác vụ.
- Không ẩn action quan trọng sau hover trên thiết bị cảm ứng.
- Dashboard và list view đều dẫn được sang bước tiếp theo.

Fail patterns:

- Action chính chỉ xuất hiện trên desktop hover.
- User phải mở nhiều route mới hiểu phải bấm gì tiếp.
- Có quá nhiều CTA đồng cấp, không rõ nút nào là “next best action”.

Evidence cần chụp:

- trạng thái trước khi click;
- vị trí CTA;
- thiết bị và viewport.

### 4.2 Workflow Clarity

**Câu hỏi chính:** UI có phản ánh đúng mental model vận hành đã chốt không?

Pass signals:

- `Receiving` rõ là hub nhập hàng HQ.
- `Cấp bếp` được hiểu là bước chuẩn của branch ops, không phải ngoại lệ.
- `Production` chỉ lộ đúng vai trò.
- `Danh mục` không trùng entry với `Settings`.

Fail patterns:

- wording làm user hiểu nhầm flow;
- một bước nghiệp vụ bị tách quá xa khỏi bước ngay trước/sau;
- chi nhánh bị dẫn sang procurement;
- oversight role bị kéo vào thao tác operator.

Evidence cần chụp:

- nav;
- dashboard;
- empty state;
- copy của CTA hoặc badge gây lệch mental model.

### 4.3 State Feedback

**Câu hỏi chính:** Sau mỗi click, user có biết hệ thống đã làm gì chưa?

Pass signals:

- toast, badge, stepper, status, empty state và redirect ăn khớp nhau.
- User nhìn vào detail page biết ngay đang ở bước nào.
- Những flow save-on-blur hoặc async refresh có phản hồi rõ.

Fail patterns:

- click xong không có feedback;
- status đổi nhưng UI không giải thích tác động;
- reload xong mất ngữ cảnh;
- silent failure do RLS/GRANT khiến user tưởng thao tác thành công.

Evidence cần chụp:

- trước click;
- sau click;
- downstream UI affected;
- nếu được, dữ liệu đổi ở màn tiếp theo.

### 4.4 Error Prevention / Recovery

**Câu hỏi chính:** UI có ngăn lỗi và cho đường hồi phục tử tế không?

Pass signals:

- destructive action có confirm dialog hợp lý;
- blocked state giải thích được nguyên nhân và bước kế tiếp;
- form validation xảy ra trước khi user commit sai dữ liệu.

Fail patterns:

- lỗi chung chung, không biết sửa gì;
- cancel/confirm thiếu guard;
- user bị kẹt ở trạng thái dở dang không biết quay về đâu;
- placeholder trông giống action thật.

Evidence cần chụp:

- error toast/copy;
- disabled state;
- validation state;
- recovery path được đề xuất.

### 4.5 Responsive Ergonomics

**Câu hỏi chính:** Trên đúng thiết bị của vai trò đó, thao tác có còn mượt không?

Pass signals:

- `HQ / super_manager`: desktop-first nhưng không vỡ trên tablet.
- `central_kitchen`: tablet thao tác được với các action chính.
- `branch_manager`: mobile/tablet không mất cột hoặc action quan trọng.
- Không phụ thuộc hover cho thao tác cần dùng hằng ngày.

Fail patterns:

- mobile chỉ còn table cụt, không đủ data để quyết định;
- button/icon quá nhỏ hoặc nằm ngoài vùng chạm;
- dialog form dài nhưng không giữ được ngữ cảnh;
- action bị đẩy xuống dưới fold mà không có tín hiệu.

Evidence cần chụp:

- desktop;
- tablet;
- mobile;
- nếu khác nhau theo role thì ghi rõ.

### 4.6 Design-System Consistency + Accessibility

**Câu hỏi chính:** Màn có còn đúng preset và không tạo ma sát a11y không?

Pass signals:

- dùng đúng primitive `Button`, `Card`, `Badge`, `Table`, `Dialog`, `Input`, `Select`.
- icon-only button có `aria-label`.
- badge không chỉ dựa vào màu để truyền trạng thái.
- focus, contrast, readable copy, keyboard path ở mức hợp lý.

Fail patterns:

- div giả primitive;
- action quan trọng chỉ khác nhau bằng màu;
- thiếu label ở form;
- text/trạng thái khó quét trên nền hiện tại.

Evidence cần chụp:

- vùng primitive bị sai;
- icon-only action;
- trạng thái focus;
- badge/status khó hiểu.

---

## 5. Cách dùng rubric trong từng wave

| Wave | Trục cần ưu tiên |
| ---- | ---------------- |
| Wave 1 — IA/nav | `Action discoverability`, `Workflow clarity` |
| Wave 2 — HQ journey | `Workflow clarity`, `State feedback`, `Error prevention` |
| Wave 3 — Central kitchen | `Workflow clarity`, `Error prevention`, `Responsive ergonomics` |
| Wave 4 — Branch journey | cả 6 trục, đặc biệt `Responsive ergonomics` |
| Wave 5 — Oversight | `Workflow clarity`, `Action discoverability` |
| Wave 6 — Placeholder sweep | `Workflow clarity`, `Error prevention` |

---

## 6. Rule khi kết luận

- UI pass nhưng UX fail: `fail`.
- UX đúng nhưng action chính bị mất trên thiết bị mục tiêu: `fail`.
- Placeholder rõ ràng, không hứa quá mức, không chặn flow live: có thể `accepted`.
- Placeholder giống action thật hoặc làm user kỳ vọng sai: tối thiểu `P1`.

