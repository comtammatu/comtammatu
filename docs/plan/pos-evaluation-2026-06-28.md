# Đánh giá hệ thống POS — Má Tư

> Reconciled-through 49112fa17fec

Ngày: 2026-06-28
Phạm vi: toàn bộ luồng thu ngân POS (order → bếp → thanh toán → chốt ca), trên 3 thiết bị Desktop / Tablet / Mobile.

---

## 1. Tóm tắt điều hành

Tổng thể POS đang ở mức **khá tốt và dùng được trong sản xuất**. Phần "lõi" — máy trạng thái đơn hàng (state machine), tầng dữ liệu realtime, và độ phủ tính năng cho mô hình quán cơm tấm bán nhanh — vững và được thiết kế đúng trọng tâm. Không có lỗi sai tiền (no wrong-charge): mọi giao dịch đều khoá hàng (row-lock) và tính lại tổng tiền tại thời điểm thanh toán.

Điểm yếu lớn nhất **không nằm ở backend mà ở trải nghiệm chạm trên Tablet** — đúng thiết bị thu ngân chính. Cụ thể, màn hình bill/thanh toán (`bill-receipt-sheet.tsx`) là điểm nghẽn lớn nhất của toàn POS.

5 điểm quan trọng nhất:

- **Màn hình thanh toán là component tệ nhất:** nút "Đã thanh toán" và các nút tiền mặt nhanh render ở 32px (dưới chuẩn chạm), trong một Dialog căn giữa, footer không dính (non-sticky) nên nút xác nhận có thể trôi xuống dưới màn hình lúc cao điểm. **P1, tablet**
- **Tablet bị đối xử như desktop thu nhỏ:** menu kẹt 2 cột tới tận `xl` (1280px), cart và danh sách đơn không xem cùng lúc được trên iPad ngang 1024px. **P1, tablet**
- **Đơn mang về không có tên khách** — chỉ nhận diện bằng số thứ tự; quầy lấy đồ đông dễ đưa nhầm túi. **P1, all**
- **Lỗi typo focus-ring** trong `input-group.tsx` (working tree) đang làm mất viền focus trên ô tìm kiếm POS — một regression WCAG đang chuẩn bị ship. **P1, all**
- **Recovery UX của thanh toán khi retry còn cụt:** backend đúng (idempotent) nhưng giao diện hiện thông báo lỗi khó hiểu thay vì phục hồi sạch. **P1, gap**

Phần lớn vấn đề là **effort S–M** và tập trung vào vài file — sửa có trọng điểm sẽ nâng đáng kể tốc độ và độ an toàn lúc cao điểm.

---

## 2. Bảng điểm (Scorecard)

| Dimension | Score | Headline |
|---|---|---|
| Order Flow & State Machine | **8 / 10** | State machine vững — mọi mutation đều row-lock và short-circuit ở trạng thái terminal; chỉ còn vài đường nối UX khi replay idempotent. |
| Feature & Function Coverage | **7.5 / 10** | Vòng lặp cơm-trưa-nhanh mạnh và đúng phạm vi; lỗ hổng thật là nhận diện đơn mang về và cách diễn đạt "offline" cho trung thực — không phải thiếu tính năng enterprise. |
| UI & Design-System Adherence | **7 / 10** | Sạch về mặt contract (gates xanh, tái dùng primitive thật), nhưng màu trạng thái không có nguồn hình ảnh duy nhất và lỗi focus-ring đang regress POS search. |
| UX & Interaction Design | **6.5 / 10** | POS chạm-thật trưởng thành, nhưng nút được bấm nhiều nhất (bill pay) lại dưới 48px và lý do disable chỉ hiện khi hover — đều vô hình trên tablet cảm ứng. |
| Responsive Layout (Desktop/Tablet/Mobile) | **6 / 10** | Tách phone-first và safe-area tốt, nhưng Tablet thu ngân là desktop thu nhỏ và màn hình thanh toán có hit target dưới chuẩn trong dialog căn giữa dễ phải cuộn. |
| Performance & Client Architecture | **7.5 / 10** | Tầng realtime mạnh (patch-in-place, refetch gộp, store theo từng item); ma sát dồn ở cây render — tablet double-mount sidebar ẩn và orchestrator 2015-LOC re-render mỗi tick. |

---

## 3. Top ưu tiên (Roadmap)

Xếp hạng tổng hợp từ meta pass (ưu tiên tác động dịch vụ × tần suất × effort):

| Rank | Hạng mục | Vì sao | Form factor | Effort |
|---|---|---|---|---|
| 1 | Sửa regression chạm + layout của Dialog thanh toán (touch size cho confirm + nút tiền mặt, sticky footer / bottom Drawer) | Hành động được bấm nhiều nhất, rủi ro cao nhất mỗi ngày đang chạy ở 32px trong dialog dễ cuộn. Gói 3 P1 trong một file. | tablet | S–M |
| 2 | Thêm tên khách tùy chọn cho đơn mang về: nhập khi tạo, hiện trên tile + bag ticket | Rủi ro đưa nhầm túi mỗi ngày, lỗi chạm mặt khách. Một ô free-text tái dùng note plumbing. | all | M |
| 3 | Làm sạch recovery khi retry thanh toán (bỏ qua issue invoice khi `already_completed`; auto-refresh + giữ sheet mở khi `amount_mismatch`) | Backend đã đúng; biến hai dead-end khó hiểu thành phục hồi một-chạm trên hot path. | all | S |
| 4 | Hạ breakpoint SplitSidebar + menu-grid từ `xl` xuống `lg` và JS-gate SplitSidebar để tablet ngừng double-mount | Một thay đổi breakpoint sửa cả menu 2-cột chật, cho iPad ngang dual-pane, VÀ bỏ double-render danh sách đơn mỗi tick. | tablet | M |
| 5 | Promote một status→variant map duy nhất + mở rộng `pos-ui-design-contract.test.ts` cho cart-pane và bill footer | Diệt cùng-đơn-hai-màu và warning-overload tận gốc, đóng blind spot test. | all | M |
| 6 | Sửa typo focus-ring trong `input-group.tsx` | Một edit working-tree nối `ring-foregroundhas-` thành token không parse được, âm thầm mất viền focus — regression WCAG đang ship. | all | S |
| 7 | Hiện `disabledReason` inline + tách hành động phá hủy (Separator trước Hủy món; sắp lại pay vs Hủy) | Tablet không có lý do trên màn khi pay bị mờ; nút void nằm sát Đóng dễ chạm nhầm. | tablet/all | S |
| 8 | Thêm đường hoàn/hủy sau thanh toán có manager-gate (bắt buộc lý do, gắn cờ HĐĐT, có audit) | Đóng lỗ hổng toàn vẹn sổ sách / e-invoice khi nhầm đơn hoặc trả món. Tần suất thấp hơn, L effort. | all | L |
| 9 | Honesty pass: bỏ dòng hotkey không tồn tại, giữ X xóa cart luôn hiện trên mobile, mirror cờ split/merge của server | Cụm fix discoverability rẻ, gom batch. | all/mobile | S |
| 10 | Gộp success+warning thành một toast (hoặc bump `visibleToasts` lên 2 với duration warning dài) | Warning print-failed / lệch tiền có thể bị nuốt sau success 1.8s. | all | S |

### Quick wins (S effort, P0/P1)

| Hạng mục | Severity | File:line |
|---|---|---|
| Sửa typo focus-ring `ring-foregroundhas-` → thêm khoảng trắng | **P1** | `input-group.tsx:17` |
| Cho nút confirm bill `size="touch-lg"`; nút tiền mặt nhanh `size="touch"` | **P1** | `bill-receipt-sheet.tsx:1169-1180,1300-1338` |
| Hiện `disabledReason` inline cạnh nút pay (không chỉ `title=`) | **P2 → P1 cụm** | `bill-receipt-sheet.tsx:505-517,1325` |
| Hạ menu-grid + sidebar breakpoint xl→lg (layout fix) | **P1** | `pos-menu-grid.tsx:183-186`; `pos-sidebar-variants.tsx:42,92,110` |

---

## 4. Phân tích theo từng dimension

### 4.1 Order Flow & State Machine — 8/10

**Điểm mạnh giữ lại**
- Mọi mutation cộng thêm / kết thúc đều `SELECT ... FOR UPDATE` và short-circuit ở trạng thái terminal — re-tap được serialize, không double-issue.
- `submit-with-retry.ts:90` mint một UUID dùng lại qua các retry; `append_order_items` dedup theo `request_key` — phòng thủ thật cho order CREATION.
- Tính lại tổng tiền tại thời điểm pay, chặn cứng append-after-paid, webhook claim `request_id` unique.

**Vấn đề đã xác nhận**

| Severity | Form factor | Vấn đề | Khuyến nghị | Effort | Conf. | Evidence |
|---|---|---|---|---|---|---|
| **P2** | all | Re-tap tiền mặt idempotent vẫn cố issue HĐĐT lại và hiện toast lỗi khó hiểu. `confirmCashPaymentWithInvoice` gọi `createTaxInvoice` vô điều kiện khi `success`, kể cả khi đã `already_completed` → nhánh existing-invoice bắn lỗi cứng "Đơn hàng đã có hóa đơn". Không double-issue (constraint giữ), nhưng là failure gây hiểu lầm khi retry đơn đã đóng. | Short-circuit issue invoice khi `paymentResult.data.status==='already_completed'`, fetch+trả existing invoice. Một nhánh, không đổi schema. | S | high | `payment-actions.ts:1175-1199`; `20260625221432_order_payment_code_fixed.sql:616-634,662-674`; `finance/actions.ts:118-132,342-343` |
| **P3** | tablet | `amount_mismatch` khi pay là dead-end toast — tổng bill không tự refresh để re-confirm. Nhánh failure chỉ toast và return, không gọi `onOrderUpdated`, nên tổng hiển thị không cập nhật → thu ngân phải đóng/mở lại. Correctness đúng (không sai tiền), nhưng recovery UX cụt trên tablet. | Ở nhánh `amount_mismatch_recomputed`, auto-trigger `onOrderUpdated()` để re-pull đơn và giữ sheet mở để re-confirm một chạm. | S | high | `payment-actions.ts:1083-1090`; `bill-receipt-sheet.tsx:862-865,888`; `20260625221432_order_payment_code_fixed.sql:722-731` |

*(Đã loại: "Cash confirm RPC không có idempotency key" — bị refute, order row CHÍNH LÀ idempotency key; client UUID + dedup table là YAGNI cho quầy 1-2 nhân viên.)*

---

### 4.2 Feature & Function Coverage — 7.5/10

**Điểm mạnh giữ lại**
- Item-level discount thật, có preset và có audit (`discount-actions.ts:422`, `item-customizer.tsx:613`).
- MoMo đã gate off-by-default sau cả setting `PAYMENT_ENABLE_MOMO` và registered providers — config ngủ, không phải ma sát.
- Đơn-tender (một phương thức/bill) là giới hạn được ghi nhận, hợp lý cho HKD cash-first.

**Vấn đề đã xác nhận**

| Severity | Form factor | Vấn đề | Khuyến nghị | Effort | Conf. | Evidence |
|---|---|---|---|---|---|---|
| **P1** | all | Đơn mang về không có tên khách / nhãn lấy đồ — chỉ nhận diện bằng số thứ tự. Tile chỉ render `#sequence` + giờ + tổng + badge ưu tiên. Quầy đông 5+ túi "ready" → khớp bằng số trống là chậm và dễ sai. | Thêm MỘT ô free-text "Tên khách" tùy chọn khi tạo đơn mang về (tái dùng order-note plumbing hoặc một cột), hiện trên tile và bag/kitchen ticket. Không phone/loyalty. | M | high | `pos-takeaway-gate.tsx:45-49,92-110`; `invoice-form-section.tsx:148`; `bill-receipt-sheet.tsx:510` |
| **P2** | tablet | "PWA offline" gây hiểu lầm — mọi payment/mutation hard-block khi offline; service worker là NetworkOnly cho mọi write. Background-Sync queue có bundle nhưng KHÔNG wire vào write handler. **LƯU Ý:** chặn cash-confirm offline là CỐ Ý và ĐÚNG (tránh HĐĐT mồ côi theo NĐ70/2025) — đừng làm offline cash queue. Lỗi là cách diễn đạt "offline-capable" thiếu trung thực + zero tolerance với chớp wifi 3-10s. | Re-scope docs/messaging: "PWA" = app cài được + reload nhanh, KHÔNG phải order offline. Tùy chọn: làm mềm hard-block thành retry/grace window ngắn. | S | high | `sw.js` (NetworkOnly + `caches.delete('pages')`); `bill-receipt-sheet.tsx:490-494,507-508` |
| **P2** | all | Không có đường refund / void-after-paid. Re-pay bị chặn, cancel/void RPC từ chối đơn đã paid. Nếu thu ngân confirm nhầm đơn hoặc khách trả món sau thanh toán → chỉ còn workaround ngoài hệ thống, lệch sổ và HĐĐT đã phát. | Thêm action "hủy đơn đã thanh toán" / cash-refund có manager-gate: bắt buộc lý do, đảo payment, gắn cờ HĐĐT để điều chỉnh, có audit. Phạm vi hẹp — không phải returns subsystem. | L | high | `payment-actions.ts:616`; `discount-actions.ts:74` |
| **P3** | all | Nút split/merge hiện cả khi server feature đã tắt → dead-end tap. Client gate `canShowSplit/canShowMerge` chỉ theo order state, không mirror cờ `split_merge_disabled` của server. | Thread cờ split/merge-enabled qua permission/flags fetch ở `page.tsx` và ẩn entry khi disabled, giống cách payment methods đã gate. | S | high | `discount-actions.ts:115`; `order-detail-sheet.tsx:1073-1083` |
| **P3** | desktop | Hotkey overlay quảng cáo shortcut "1–9 chọn bàn nhanh" không tồn tại. Chỉ F2/F4/F9/F10 được wire. Tag "(đang phát triển)" hạn chế tác hại nhưng vẫn chiếm chỗ trong overlay được coi là authoritative. | Cách rẻ và trung thực: xóa dòng. Nếu thật cần digit-key jump thì implement. | S | high | `hotkey-overlay.tsx:37`; `pos-desktop-inner.tsx:1538-1560` |
| **P3** | all | Giảm giá/phụ thu cấp-đơn không tới được trên cart trước khi gửi. Chỉ gate trên đơn unpaid đã tạo. Thu ngân thương lượng tổng tròn trước khi gửi phải gửi bếp trước → mở lại → giảm. | Chỉ nếu thương lượng giá trước-gửi là thực tế hằng ngày: thêm một affordance "giảm giá đơn" trên hàng subtotal cart. Verify đã dùng trước khi build (có thể YAGNI). | M | medium | `order-detail-sheet.tsx:1069-1072`; `item-customizer.tsx:613` |

*(Đã loại: per-line discount "over-built" — code thật có audit, claim không-dùng là speculative; no split tender — proposer tự rate P3/YAGNI; MoMo maintenance surface — config ngủ, không có defect actionable.)*

---

### 4.3 UI & Design-System Adherence — 7/10

**Điểm mạnh giữ lại**
- Sạch về mặt cơ chế: contract gates xanh, tái dùng primitive thật.
- Swipe-delete/row-tap tiles đã được baseline là floor chấp nhận (`design-system.md:708`).

**Vấn đề đã xác nhận**

| Severity | Form factor | Vấn đề | Khuyến nghị | Effort | Conf. | Evidence |
|---|---|---|---|---|---|---|
| **P1** | all | Cùng một order status render màu semantic khác nhau giữa table-gate và order-list. Đơn "served/chờ thanh toán" = success/green trên tile nhưng warning/yellow trong list badge; đơn active = warning trên tile nhưng default trong list. Trên tablet split sidebar thấy cùng đơn hai màu cạnh nhau — vi phạm "one workflow state, one visual source of truth". | Derive tone OperationalTile từ CÙNG map status→variant mà `getPosOrderStatusInfo` dùng. Promote map vào `table-order-visual-state` / `order-status-display` và consume ở cả hai. | M | high | `pos-table-gate.tsx:56-65,63`; `_lib/order-status-display.ts:66,72-76` |
| **P1** | all | Class focus-ring của InputGroup bị mangle trong working tree thành token không hợp lệ `ring-foregroundhas-[[data-slot]...`. Tailwind không parse → mất màu viền focus, âm thầm regress viền high-contrast WCAG 2.4.7/1.4.11 đã landed ở `86136ae3`. Ảnh hưởng POS menu search và bill inputs. | Chèn khoảng trắng thiếu: `focus-visible]:ring-foreground has-[[data-slot]...`. Chọn rõ ràng giữa `ring-foreground` (high-contrast) và `ring-ring/30` (HEAD), apply một lần. | S | high | `git diff packages/ui/src/components/input-group.tsx` line 17 |
| **P2** | all | ToggleGroup service-mode thứ hai (ungated) hand-roll màu primary-fill. `cart-pane.tsx` hardcode `data-[state=on]:bg-primary ... border-r border-border h-full` — đúng thứ contract test cấm. Test chỉ regex-scan `posDesktopSource`, không đọc cart-pane → toggle song song lọt gate. | Cho cart-pane toggle dùng cùng treatment `variant='outline' size='touch' spacing={0}` như selector đã gate; bỏ bg-primary/border-r/h-full bespoke. Mở rộng test đọc cả cart-pane. | M | high | `cart-pane.tsx:297,309`; `pos-ui-design-contract.test.ts:117-120,14` |
| **P2** | tablet | Text body/giá scale theo viewport width (`sm:` type steps) trái rule no-viewport-scaling. Tablet thu ngân (~768-1024) nằm vắt qua ranh giới `sm` nên cùng line item render khác cỡ giữa tablet 768 và 1024. | Chọn một cỡ theo vai trò cho mỗi element, bỏ responsive bump. Nếu muốn readout to hơn trên tablet lớn → density mode, không phải `sm:` steps. | S | high | `pos-line-item-compact.tsx:195,256`; `cart-pane.tsx`; `design-system.md:172` |
| **P3** | all | Màu warning bị overload — active-count, served, và pulse content-change đều vàng. Khi nhiều đơn chờ pay, header count + rows + line vừa sửa cùng glow vàng, làm loãng tín hiệu của trạng thái thật sự cần xử lý. | Dành warning cho served=chờ-thanh-toán. Active-count badge → neutral; quantity-delta → info. Document status→color map. | S | medium | `order-list-pane.tsx:63`; `order-status-display.ts:75`; `pos-line-item-compact.tsx:184` |
| **P3** | all | SheetTitle scale bị override không nhất quán. Một số sheet force `text-base`, số khác giữ `text-sm`. Sheet operational tương đương render header hai cỡ khác nhau. | Quyết một POS sheet-title scale (`text-base` là tự nhiên) hoặc thêm size prop cho SheetTitle, apply đồng nhất. | S | high | `sheet.tsx:122`; `order-detail-sheet.tsx:1125`; `order-item-actions-sheet.tsx:116`; `item-customizer.tsx:340`; `archived-orders-sheet.tsx:250` |
| **P3** | all | Chiều cao search-box không single-source. Menu search force `h-11`; primitive là `h-7`, contract reserve `h-10` cho form/* layer. `archived-orders-sheet` hardcode `h-10`. | Route search box qua shared search-shell height (hoặc thêm size `pos-search` documented vào InputGroup) và bỏ `h-11` ad-hoc. | S | medium | `pos-menu-grid.tsx:313`; `archived-orders-sheet.tsx:122,136`; `design-system.md:267-275` |
| **P3** | mobile | Swipe-delete và row-tap tiles bị trùng giữa cart-pane và order-item-row (hai bản của cùng pattern với `rounded-none` reset). Đã baseline nên không vi phạm contract, nhưng là hai bản sao. | De-duplicate full-height row-tap thành một Item/Button adapter consume bởi cả hai. Ưu tiên thấp; làm khi đụng file. | M | high | `cart-pane.tsx:362,384`; `order-detail/order-item-row.tsx:171`; `design-system.md:707-708` |

*(Đã loại: quantity badge `w-12` clip multi-digit — speculative, không có evidence clip thật, YAGNI.)*

---

### 4.4 UX & Interaction Design — 6.5/10

**Điểm mạnh giữ lại**
- POS chạm-thật trưởng thành: item-action button đều `size=touch` (48px), cart submit `touch-lg` (56px).
- Hành động phá hủy (void/cancel SENT order) đã gate reason-dialog + server min-5-char (audit trail).
- `disabledReason` được tính kỹ, nêu đúng blocker.

**Vấn đề đã xác nhận**

| Severity | Form factor | Vấn đề | Khuyến nghị | Effort | Conf. | Evidence |
|---|---|---|---|---|---|---|
| **P1** | tablet | Nút "Đã thanh toán" render ở default 32px, không phải touch scale như mọi nơi khác. Hành động được bấm nhiều nhất, rủi ro cao nhất lại sub-48px giữa bill content bận → mời chạm nhầm. Nằm giữa hai outline button (In tạm tính, Hủy) nên ở layout rộng "Hủy" chiếm slot phải-dễ-với nhất, không phải pay. Không test nào pin cỡ footer này → regress thầm lặng. | Cho confirm `size="touch-lg"` và làm nổi bật; sắp lại để pay là target cuối/lớn nhất, tách khỏi Hủy. Thêm assertion pin cỡ nút confirm bill. | S | high | `bill-receipt-sheet.tsx:1316-1329`; `button.tsx:24-25,31-32`; `cart-pane.tsx:417` |
| **P1** | all | "Hủy món" phá hủy nằm sát "Đóng" trong stack đều `gap-2`, không separator/divider/grouping. Trên thiết bị chạm lúc rush, nhắm Đóng có thể trúng void. Cả hai đều `size=touch` và Hủy món mở reason dialog (one-cancel recoverable), nhưng thiếu tách không gian là hazard chạm nhầm thật. | Chèn `<Separator className="my-1" />` trước nút "Hủy món" (hoặc đẩy xuống dưới "Đóng" với margin top thêm). | S | high | `order-item-actions-sheet.tsx:151,228-242,253-261` |
| **P1** | all | Preset toast đơn (1 visible, 1.8s) có thể nuốt warning sau success. Payment confirm bắn success rồi warning print-failed; close-session bắn success + variance-breach + print warning liên tiếp. Một slot → warning sau bị evict sau success 1.8s, dễ miss lúc rush. Warning print-failed/lệch tiền bị miss có chi phí vận hành thật. | Khi warning đi kèm success, emit MỘT toast gộp để warning supersede success. Hoặc bump `visibleToasts=2` và giữ warning `duration>=6000ms`. | S | high | `responsive-toaster-presets.ts:44,47`; `bill-receipt-sheet.tsx:869-887`; `close-session-sheet.tsx:124` |
| **P2** | tablet | Lý do disable nút pay chỉ surface qua `title=` (hover-only) — vô hình trên tablet cảm ứng. Khi nút pay mờ, thu ngân trên tablet không có giải thích trên màn đúng lúc cao điểm cần. | Render `disabledReason` thành dòng inline ngay trên/dưới nút pay khi disabled. Giữ `title=` làm bonus desktop. | S | high | `bill-receipt-sheet.tsx:505-517,1325` |
| **P2** | mobile | Swipe-to-delete trong cart hoàn toàn không discoverable trên mobile. `<sm` nút delete ẩn trừ khi `isDeleteRevealed`, nút X chỉ `sm:inline-flex` → phone KHÔNG có affordance xóa nào hiện. Xóa phụ thuộc hoàn toàn vào left-swipe không ai biết; tap row mở customizer. Chặn một thao tác sửa cơ bản. | YAGNI fix: giữ X nhỏ luôn hiện cả trên mobile (bỏ prefix `sm:`) và cân nhắc bỏ swipe machinery (`use-swipe-reveal`, 158 LOC). | S | high | `cart-pane.tsx:362-364,418`; `use-swipe-reveal.ts` |
| **P2** | all | Tên món dựa vào gradient + text-shadow để có contrast trên ảnh tùy ý. Dòng trên của tên 2-dòng nằm trên mid-stop `via-black/35`, không đảm bảo WCAG 1.4.3 trên ảnh sáng/nhạt dưới ánh đèn quầy — rủi ro chạm nhầm món. | Đậm gradient (`from-black/90 via-black/55`) hoặc thêm scrim band bán-trong-suốt sau tên thay vì dựa gradient + shadow. | M | medium | `pos-menu-grid.tsx:139,162-169` |
| **P2** | desktop | Hotkey global F9/F10/? fire khi modal/sheet đang mở → stack sheet. `useKeyboardShortcut` đăng ký trên window keydown không có enabled flag / modal-open guard. F2 tự-guard (return sớm khi cart có item hoặc bàn đã chọn) nên không corrupt cart — narrow từ "data-corruption" xuống sheet-stacking. | Pass `enabled={!anyModalOpen}` tính từ các open-state booleans hiện có. Hook đã hỗ trợ arg `enabled`. | S | high | `pos-desktop-inner.tsx:1531-1570,963-970`; `use-keyboard-shortcut.ts` |
| **P3** | all | Help overlay quảng cáo shortcut không có handler: "1–9 chọn bàn nhanh (đang phát triển)" và "Esc đóng sheet" — nhưng chỉ F2/F4/F9/F10/? được đăng ký. Esc chỉ đóng sheet vì Radix xử lý per-dialog; global "hủy thao tác" không tồn tại. | Bỏ dòng "1–9 (đang phát triển)", và sửa lại dòng Esc phản ánh đúng hành vi (Esc đóng sheet đang active). | S | high | `hotkey-overlay.tsx:37,44`; `pos-desktop-inner.tsx:1531-1570` |
| **P3** | all | Không undo khi xóa một-item cart. Xóa cả-cart đã confirm-gated, void/cancel SENT order đã reason-dialog-gated; chỉ còn gap client-side single-item draft. Re-add vài chạm; undo-snapshot state machine là YAGNI cho quán 1-2 nhân viên. | Tùy chọn: success toast với action "Hoàn tác" restore item từ snapshot, tái dùng `toast.action` pattern. Phạm vi chặt vào client-side single-item. | M | medium | `cart-pane.tsx:368,423`; `use-print-job-alerts.ts:71-76` |
| **P3** | mobile | Customizer disabled Add không cho lý do gần khi discount invalid. Rule `discountValid` và field reason ở xa phía trên scroll. Trên phone thu ngân có thể không nối disabled Add với reason chưa điền. | Hiện helper inline ngắn cạnh Add bị disable ("Cần lý do chiết khấu ≥3 ký tự"), mirror pattern `disabledReason` của bill. | S | medium | `item-customizer.tsx:696-709,218-219` |
| **P3** | desktop | Focus ring là 1px, dễ mất trên grid nút dày. Commit gần đây đã chuyển sang màu ring high-contrast; chỉ còn độ dày. Hại persona keyboard-operator. | Bump lên `ring-2` với `ring-offset-2` ở focus-visible cho control POS. | S | high | `button.tsx:8` |
| **P3** | all | Close-session progress 2-bước đọc như wizard reviewable nhưng commit không thể đảo ở step 1. Irreversibility ĐÃ được cảnh báo ở confirm dialog blocking trước commit ("Sau khi chốt... không thể mở lại") nên thu ngân không bị lừa — chỉ còn gợi ý progress-bar-as-wizard cosmetic. | Relabel progress step-1 để không ngụ ý step 2 editable (hoặc bỏ progress bar, present step 2 như "Đã chốt" confirmation). Không redesign. | S | medium | `close-session-sheet.tsx:172,90-95,273` |
| **P3** | all | Empty cart là `<p>` muted low-emphasis, không phải shared empty state. Menu grid dùng `AppEmptyState`. Impact gần-zero (đây là resting state); swap thuần polish. | Swap sang `AppEmptyState` với icon cho nhất quán. KHÔNG thêm CTA auto-focus-search. | S | medium | `cart-pane.tsx:323-330`; `pos-menu-grid.tsx:302-309` |

*(Đã loại: quick-reason chips desync — refuted, giá trị server validate luôn đúng; no optimistic feedback giữa tap và customizer — refuted, double-tap idempotent; help toggle Shift+? brittle — refuted, binding hoạt động trên hầu hết bàn phím.)*

---

### 4.5 Responsive Layout: Desktop / Tablet / Mobile — 6/10

**Điểm mạnh giữ lại**
- Tách phone-first và xử lý safe-area tốt.
- `item-customizer` là `side=bottom h-dvh` với sticky confirm — cap đúng viewport, luôn với tới được.

**Vấn đề đã xác nhận**

| Severity | Form factor | Vấn đề | Khuyến nghị | Effort | Conf. | Evidence |
|---|---|---|---|---|---|---|
| **P1** | tablet | Menu grid tablet không bao giờ quá 2 cột; sidebar fixed 384px ăn ~45-50% chiều rộng iPad dọc. `TabbedSidebar` là hard `w-96` (`md:flex xl:hidden`); grid là `grid-cols-2` với rung kế chỉ ở `xl:grid-cols-3` (1280px) — không có rung `lg:`. Đây là thiết bị thu ngân chính lúc rush. | Cho sidebar tablet width fluid dưới `xl` (`w-80 lg:w-96` hoặc `w-[clamp(20rem,32vw,24rem)]`) và thêm rung `lg:grid-cols-3` để iPad ngang 1024px được 3 cột. | S | high | `pos-sidebar-variants.tsx:42`; `pos-menu-grid.tsx:183-186` |
| **P1** | all | Nút confirm bill + nút tiền-mặt-nhanh render 32px (`h-8`), dưới chuẩn chạm, trên surface dễ lỗi nhất. Nút suggestion tiền mặt và DialogFooter (in tạm tính/confirm-paid/cancel) không có size prop → default `h-8` ngay cạnh method-select đúng `touch-lg` (56px). Đây đúng là thứ thu ngân bấm dồn dập lúc cash rush. | Cho nút tiền-mặt-nhanh và confirm/print footer `size=touch` (`min-h-12`). Không tái cấu trúc layout. | S | high | `bill-receipt-sheet.tsx:1169-1180,1300-1338,1112`; `button.tsx:23-25,29-32` |
| **P1** | all | Nút confirm thanh toán có thể trôi xuống dưới fold: Dialog căn giữa, footer không sticky, không dùng width trên tablet. Bill là Dialog căn giữa (`top-1/2 left-1/2`, `overflow-y-auto`, `max-h-[calc(100dvh-2rem)]`) cap `sm:max-w-lg` (~512px). Cash flow một cột stack method + totals + cash input + 6 suggestions + change + invoice form trước một DialogFooter KHÔNG sticky. Mọi surface POS khác dùng bottom Drawer/Sheet. | Pin confirm/cash chính vào sticky bottom footer trong dialog (rẻ nhất), hoặc render thành `side=bottom` Drawer trên touch như item-customizer. Tùy chọn: widen + two-column cash-entry trên `md+`. | M | high | `bill-receipt-sheet.tsx:1036-1037`; `dialog.tsx:64,97-113`; `item-customizer.tsx:334` |
| **P2** | tablet | Tablet (md..xl) không xem được cart và order-list cùng lúc. Dưới `xl` (1280px) sidebar là tabbed variant — cart và active-orders là tab loại trừ nhau; `SplitSidebar` chỉ render `xl+`. iPad ngang 1024px phải tab qua lại giữa dựng đơn mới và xem hàng đợi. | Hạ ngưỡng SplitSidebar từ `xl` xuống `lg` (1024px) để tablet ngang được dual-pane; ghép tự nhiên với fix `lg:grid-cols-3`. | M | high | `pos-sidebar-variants.tsx:42,92,110,140` |
| **P3** | tablet | Kbd hint D/T service-mode hiện trên tablet không bàn phím qua `md:inline-flex`. Kbd D/T và `⌘Enter` KbdGroup gate `hidden md:inline-flex` → hiện trên tablet touch-only không bàn phím, chiếm chỗ trong cart 384px đã chật và ngụ ý shortcut không bấm được. | Gate Kbd hint trên capability fine-pointer/hover (hoặc cờ `hasKeyboard`) thay vì breakpoint `md`. | S | high | `cart-pane.tsx:303,315,487` |
| **P3** | tablet | Multi-order picker list dùng chiều cao pixel cố định có thể clip footer trên viewport thấp. ScrollArea `h-64`/`sm:h-72` thay vì `flex min-h-0 flex-1`. Tần suất thực tế thấp. | Thay `h-64/sm:h-72` bằng `flex min-h-0 flex-1` + max dvh-relative để list co thay vì overflow. Cơ hội. | S | medium | `multi-order-table-picker.tsx:71,143-144` |
| **P3** | tablet | Không xử lý orientation đâu trong cây POS. Zero utility `landscape:/portrait:/orientation`. Tablet xoay nhảy từ dọc sang ngang không adapt layout. (`item-customizer` sticky đã mitigate concern "controls compete for 380px".) | Xử lý cơ hội bằng cách thêm rung `lg:` grid/split ở trên (cover case landscape-1024). Không cần breakpoint landscape riêng cho counter tablet cố định hướng. | S | medium | `invoice-form-section.tsx:96`; `item-customizer.tsx:334` |
| **P3** | mobile | CTA session-orders mobile hug mép phải không có left bound, không nhất quán. `SESSION_ORDERS_BAR_CLASS = fixed right-3 bottom-0` (no inset-x) → float một mình mép phải, khác `ACTION_BAR_CLASS` full-width `fixed inset-x-3`. | Center hoặc full-width bar session-orders để khớp các state action-bar khác, hoặc thêm `max-w + mx-auto`. | S | high | `pos-mobile-action-bar.tsx:39-40,36-37` |

*(Đã loại: POS tree hard-remount ở 768px JS breakpoint — fix đề xuất mâu thuẫn design cố ý, YAGNI; cart note hint ẩn dưới sm — lowest-value; orderTargetRow context bar phone thiếu affordance — refuted, mobile header đã có context label + onBack.)*

---

### 4.6 Performance & Client Architecture — 7.5/10

**Điểm mạnh giữ lại**
- Tầng realtime mạnh: patch-in-place, refetch gộp (coalesced), store theo từng item.
- Children memo'd kỹ — blast radius re-render phần lớn được contain.
- Menu card lazy/async image + per-item external-store subscription (một tick `sold_today` chỉ re-render một card).

**Vấn đề đã xác nhận**

| Severity | Form factor | Vấn đề | Khuyến nghị | Effort | Conf. | Evidence |
|---|---|---|---|---|---|---|
| **P1** | tablet | Cả hai desktop sidebar mount đồng thời — tablet render subtree SplitSidebar ẩn mỗi realtime tick. `sidebars` render CẢ TabbedSidebar (`md:flex xl:hidden`) VÀ SplitSidebar (`xl:flex`) khi `!isMobile`. Trên tablet (768-1024, dưới xl) SplitSidebar CSS-hidden nhưng mount đầy đủ → OrderListPane + CartPane render song song. `sidebarContentProps` là mega-memo tươi nên memoization không skip → active-orders filter+map chạy hai lần/tick. | Gate SplitSidebar sau JS breakpoint (`useMediaQuery('(min-width:1280px)')`) để tablet chỉ instantiate TabbedSidebar. SSR-safe default về tablet variant. | M | high | `pos-desktop-inner.tsx:1772-1793`; `pos-sidebar-variants.tsx:42,92,110` |
| **P2** | all | Active-orders list re-render mọi card khi bất kỳ một đơn đổi. `ActiveOrdersList` map orders thành inline JSX không có per-row memoized component; `OrderCardSummary` là plain function. `use-order-sync` trả array identity MỚI mỗi tick → full map re-run. Hottest render path lúc rush; với double-mount (P1) chạy hai lần. | Extract component `OrderCard` memoized (props: order, multiOrderFlag, onViewDetail, onViewBill) và đảm bảo callbacks `useCallback`-stable; `React.memo` chỉ re-render card đổi status. | S | high | `order-history.tsx:262-315,152,323`; `use-order-sync.ts:530,553` |
| **P2** | all | Ba sheet nặng nhất static import và luôn mount (~3.7K LOC khi cold load). OrderDetailSheet (1628) + BillReceipt (1344) + ItemCustomizer (716) static import render vô điều kiện. Parse/eval cost vào first-paint chunk trước khi thu ngân mở gì. Codebase đã dùng `next/dynamic` cho peer nhẹ hơn. (Downgrade từ P1: PWA mở một lần/ca nên cold load hiếm.) | Code-split `next/dynamic{ssr:false}` và warm qua `useEffect` post-first-paint (hoặc on first table/order tap) để chunk resident trước khi payment bắt đầu. KHÔNG lazy-load on-open (tái tạo rủi ro chunk-load giữa payment). | M | medium | `pos-desktop-inner.tsx:31-33,1883-1999,56-85` |
| **P2** | all | Orchestrator 2015-LOC là single re-render hub (~24 useState) re-run ~12 derivation mỗi realtime tick. `PosDesktopInner` giữ ~24 useState và consume `usePosOrders` trực tiếp → bất kỳ sheet toggle/menu tap/realtime tick re-render toàn body và re-eval useMemo. Children memo'd nên blast radius contain, nhưng per-render work của parent chạy mỗi event. | YAGNI-bounded, ĐỪNG rewrite sang reducer. Extract state điều phối modal/sheet (billOrderId, orderDetailId, customizerItem, pickerTableId, archived/close/hotkey flags) ra sibling overlay-coordinator để sheet-toggle/menu-tap churn không re-run order/table memos. | L | medium | `pos-desktop-inner.tsx:293-379,203-220,329-335,1782-1790` |
| **P3** | tablet | Không virtualize menu grid (50-150 card). PosMenuGrid render mọi item visible; view "all" flatMap mọi category. Mitigate tốt (memo'd, lazy image, per-item subscription) nhưng 100+ image element + subscription vẫn phình mount/scroll trên tablet yếu. | Chỉ nếu thiết bị thật thấy jank: thêm CSS `content-visibility:auto` per category section (gần-zero code). KHÔNG thêm virtualization dependency trừ khi profiling chứng minh. | M | medium | `pos-menu-grid.tsx:256-265,189-197,172-200` |
| **P3** | mobile | Resume có thể stack 3-4 refetch đồng thời trên mobile. `useOrderSync` chạy stale poll 20s VÀ visibilitychange handler, cả hai gọi `refreshAll`; order-detail + bill-receipt sheet mỗi cái thêm visibilitychange + reconnect-SUBSCRIBED refetch. Các coalescer riêng → một resume mobile-Safari với sheet mở fire 3-4 RPC trên kết nối hạn chế. (Correctness-justified.) | Chấp nhận như hiện tại trừ khi network panel thiết bị thật thấy burst; nếu cần thêm module-level last-resume-refetch timestamp để skip nếu cái khác fire trong ~1s. | M | medium | `use-order-sync.ts:621-630,638-648`; `order-detail-sheet.tsx:583`; `bill-receipt-sheet.tsx:626-664` |

*(Đã loại: menuLimitRows materialize full menu mỗi categories-identity change — dep là stable RSC seed, compute một lần; CartPane subscribe full snapshot — total/quantity đã useMemo, cost trivial; no streaming/Suspense inner panes — single page-level Suspense phù hợp cho PWA mở một lần/ca, YAGNI.)*

---

## 5. Chủ đề xuyên suốt & lỗ hổng (từ meta pass)

### Chủ đề xuyên suốt

1. **Dialog bill/thanh toán (`bill-receipt-sheet.tsx`) là component tệ nhất của POS.** Một file sinh finding ở 4/6 dimension, tất cả tụm vào hành động được bấm nhiều nhất, rủi ro cao nhất trong ngày: confirm + 6 nút tiền mặt ở 32px (vs sibling touch-lg 56px); là surface POS DUY NHẤT dùng Dialog căn giữa với footer không sticky → confirm trôi dưới fold; `disabledReason` chỉ surface qua `title=` (vô hình trên tablet); `amount_mismatch` toast không refresh tổng. Đây không phải sáu vấn đề mà là **một component bị bỏ quên, thoát khỏi cuộc migration touch-ergonomics mà phần còn lại của POS đã hoàn thành.**

2. **Không có single source of truth cho status→color, và contract test lẽ ra enforce nó lại có lỗ scope.** Cùng status render màu khác nhau qua các surface; warning overload ba cách trên một màn. Gốc rễ là thiếu một status→variant map được promote. Compound: `pos-ui-design-contract.test.ts` chỉ regex-scan shell+inner → toggle service-mode thứ hai trong cart-pane và bill-footer button size regress không bị phát hiện. **Lớp enforcement có blind spot đúng ở các file đã drift.**

3. **Tablet (thiết bị thu ngân chính) bị đối xử như desktop thu nhỏ — hại cả responsive LẪN perf.** Tablet 768-1024 liên tục rơi vào vùng chết giữa breakpoint: menu kẹt 2-cột tới `xl=1280` không rung `lg`; cart và order-list loại trừ nhau tới `xl`; Kbd hint hiện trên tablet không bàn phím; và CÙNG SplitSidebar gated-xl bị mount-nhưng-ẩn trên tablet, double-render active-orders mỗi tick. **Lựa chọn breakpoint `xl` là gốc rễ xuyên suốt: hạ ngưỡng split/grid xuống `lg` đồng thời sửa layout VÀ bỏ perf double-mount.**

4. **Trung thực về affordance: POS quảng cáo tương tác không implement và giấu tương tác có thật.** `hotkey-overlay.tsx:37` liệt kê 1-9 và global Esc không có handler; ngược lại affordance xóa cart duy nhất trên mobile là swipe không ai biết. **Mental model của thu ngân lệch hệ thống với hành vi thật — quảng-cáo-nhưng-vắng và có-mặt-nhưng-giấu là hai mặt của cùng món nợ discoverability.**

### Lỗ hổng (gaps — không thuộc dimension nào)

| Severity | Lỗ hổng | Tóm tắt | Evidence |
|---|---|---|---|
| **P1** | Recovery UX khi replay idempotent không nhất quán trên pay path | Backend đúng (row-lock, short-circuit, recompute) nhưng CẢ HAI case replay lành tính đều cho thu ngân thấy lỗi cứng / dead-end thay vì phục hồi sạch. Cùng một pattern thiếu: dịch outcome safe-backend thành đường tiến một-chạm. | `payment-actions.ts:1175-1199,1083-1090`; `finance/actions.ts:118-132`; `bill-receipt-sheet.tsx:862-865,888` |
| **P1** | Định danh đơn mang về không toàn vẹn qua luồng fulfillment | Đơn mang về không nhãn người end-to-end (không capture lúc tạo, không trên tile, không trên bag/kitchen ticket) — chỉ số thứ tự. Cắt ngang order-create + tile + print ticket nên không dimension nào sở hữu "thu ngân khớp túi với khách được không". | `pos-takeaway-gate.tsx:45-49,92-110`; `invoice-form-section.tsx:148` |
| **P2** | Không có đường sửa sau-thanh-toán → lệch CẢ sổ sách LẪN HĐĐT đã phát | Đây là gap toàn-vẹn-dữ-liệu, không chỉ thiếu feature. Confirm nhầm đơn hoặc trả món sau pay buộc workaround ngoài hệ thống → desync cash drawer reconciliation và e-invoice. | `payment-actions.ts:616`; `discount-actions.ts:74` |
| **P3** | Feature server-gated render affordance client không mirror cờ → dead-end tap thầm lặng | Pattern lặp lại: client hiện action server có thể từ chối (split/merge gate chỉ theo order state, không theo `split_merge_disabled`). Fix hệ thống: thread server capability flags qua `page.tsx` permission fetch và ẩn affordance disabled, như payment methods đã làm. | `discount-actions.ts:115`; `order-detail-sheet.tsx:1073-1083` |

---

## 6. Đánh giá riêng theo thiết bị

### Desktop
Desktop là form-factor khoẻ nhất. Bàn phím F2/F4/F9/F10 hoạt động, dual-pane SplitSidebar đủ chỗ ở `xl+`. Vấn đề còn lại chủ yếu là phụ và keyboard-only: hotkey global fire khi modal mở (gây stack sheet, **P2**), overlay quảng cáo shortcut không tồn tại (**P3**), và focus ring 1px hơi mỏng trên grid nút dày (**P3**). Dùng tốt, chỉ cần polish discoverability và một guard modal-open.

### Tablet (thiết bị thu ngân chính)
**Đây là thiết bị quan trọng nhất và cũng yếu nhất.** Tablet bị đối xử như desktop thu nhỏ: menu kẹt 2 cột tới 1280px nên iPad ngang 1024px chật một cách không cần thiết, cart và order-list không xem cùng lúc được, và màn hình thanh toán — thứ thu ngân bấm dồn dập lúc cao điểm — có nút 32px dưới chuẩn chạm trong một dialog căn giữa có thể trôi nút confirm xuống dưới fold. Cộng thêm `disabledReason` chỉ hiện khi hover (vô hình trên cảm ứng) và SplitSidebar ẩn vẫn double-render mỗi tick. **Đây là nơi roadmap phải ưu tiên: rank 1, 4, 6, 7 đều nhắm thẳng vào trải nghiệm tablet và phần lớn là effort S–M.**

### Mobile (thiết bị dự phòng)
Mobile dùng được như backup nhưng có vài gap discoverability rõ: affordance xóa item trong cart hoàn toàn ẩn (chỉ left-swipe không ai biết, **P2**) — chặn một thao tác sửa cơ bản; resume có thể stack 3-4 refetch trên kết nối hạn chế (**P3**, correctness-justified); và CTA session-orders hug mép phải không nhất quán (**P3**). Vì là thiết bị phụ, các vấn đề này đúng severity P2/P3 — đáng sửa cụm trong honesty pass nhưng không khẩn như tablet.

---

## 7. Ghi chú phương pháp

Báo cáo này được tạo bởi một **quy trình multi-agent debate**: một proposer đề xuất finding → hai critic phản biện độc lập → một judge phân xử (giữ/loại/tinh chỉnh) → một meta pass tổng hợp chủ đề xuyên suốt, lỗ hổng cross-cutting, và xếp hạng ưu tiên cuối.

- **Đọc code thật:** mọi finding gắn evidence dạng `file:line` (và `migration:line` cho RPC). Không suy diễn từ docs/tracker/memory.
- **Đã loại có lý do:** các đề xuất bị critic refute hoặc judge reject (ví dụ "cash confirm thiếu idempotency key", "per-line discount over-built") đã được loại khỏi phần finding và ghi rõ lý do — không liệt kê như defect.
- **Severity P0..P3** và **form factor** (desktop/tablet/mobile/all) giữ verbatim theo phán xử.
- **Confidence** (high/medium) phản ánh độ chắc của bằng chứng; các item medium thường kèm khuyến nghị "verify trước khi build" để tránh YAGNI.
- Báo cáo không bịa finding ngoài dữ liệu đã phân xử; chỉ diễn đạt lại và sắp ưu tiên.
