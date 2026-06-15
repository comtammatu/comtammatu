# HRM — Bản checklist chuẩn hoá theo vị trí (2026-06-15)

> Nguồn: `Check List.xlsx` (owner cung cấp) → chuẩn hoá đa tác tử (workflow `hrm-checklist-normalize`).
> Mỗi việc gắn: **phase** (Đầu ca/Trong ca/Cuối ca) · **phạm vi** theo mô hình 2 ca/ngày (Mỗi ca / Mở-sáng / Đóng-chiều / Tuần) · **bắt buộc** · **tiêu chí xong**.
> Đây là bản DUYỆT trước khi seed `shift_checklist_templates`. Gắn với D026 §2 (checklist theo `positions.code`) + D027 (snapshot per-ca).

## Mapping vị trí → checklist (cập nhật theo PROD 2026-06-15)

Tên sheet Excel theo KHÂU/công việc, KHÔNG khớp 1-1 với `positions.code`. Phân bố NV thật: **cashier=14, chef=9, branch_manager=3, waiter=2 (sót), head_chef/kitchen_helper=0**.

- **cashier** (front: phục vụ + thu tiền) → **"Phục vụ"** (position-default). ⚠️ "Quầy" KHÔNG phải thu ngân — là **khâu bếp** (soạn đồ/đóng gói/KDS).
- **branch_manager** → **"Cửa hàng trưởng"** (position-default).
- **chef** (bếp, 9) → nhiều khâu (Nướng / Phụ bếp / Quầy / Bếp trưởng) dưới 1 position → **gán per-person** từng đầu bếp theo khâu (override). KHÔNG có position-default cho `chef`.
- **Tạp vụ** → chưa có position code → gán per-person (hoặc owner thêm `cleaner`).
- **waiter (2 sót)** → chuyển sang cashier (role-merge D012 trong DB chưa làm — task T3 riêng).

→ `20260615170000` chỉ set position-default cho **cashier + branch_manager**; bếp + tạp vụ gán per-person. (Annotation `code` ở tiêu đề mỗi mục dưới là theo TÊN sheet Excel, không phải mapping cuối.)

## ⚠️ CHẶN — phải xử lý hạ tầng TRƯỚC khi seed (verified trên code)

1. **Cột `scope` CHƯA tồn tại trong DB.** `shift_checklist_template_items` chỉ có `phase`/`done_definition`(≤240)/`is_required`/`title`/`sort_order`/`is_active`. Nếu seed nguyên si, 4 phạm vi (mỗi-ca/mở/đóng/tuần) **bị bỏ qua âm thầm** → mọi việc thành 'mỗi ca'.
2. **Lỗi vận hành trực tiếp nếu seed mà chưa lọc phạm vi:** RPC clock-in (D027) snapshot CÙNG template cho cả 2 ca, KHÔNG lọc ca; và gate kết-ca đếm MỌI item chưa xong (không lọc `is_required`). Hệ quả: NV **ca sáng** bị bơm item 'Đếm tiền cuối ca, chốt ca' / 'Tắt màn hình' (đóng-chiều) → không làm được → **bị KHÓA kết ca sáng**. ➜ phải lọc snapshot theo ca + (đề xuất) gate chỉ tính `is_required=true`.
3. **`is_required=false` hiện vẫn chặn kết ca** (gate không lọc required) → 'Lau cửa kính', 'Thay vỉ khi đen', 'Tưới cây'... vẫn ép xong. Cần thêm `AND is_required` vào gate để 'không bắt buộc' có nghĩa thật.

→ **2 hướng (owner chọn):** (a) thêm cột `scope` + sửa CHECK + sửa upsert + RPC clock-in lọc theo ca (ca sáng nhận `every_shift`+`opening`; ca chiều nhận `every_shift`+`closing`; `weekly` xử lý riêng); hoặc (b) tách **2 template sáng/chiều** mỗi vị trí. Khuyến nghị (a).

## Câu hỏi owner phải quyết

- **Phạm vi/scope:** chọn hướng (a) cột scope hay (b) 2 template sáng/chiều?
- **Gate kết ca:** chỉ chặn theo `is_required=true` (khuyến nghị) hay mọi việc đều bắt buộc (thì bỏ cột required)?
- **Vị trí Tạp vụ:** thêm `positions.code` mới `cleaner` (đồng bộ SQL mapper + TS twin) hay giữ template Global không gắn code?
- **Nướng → `chef`:** xác nhận map (Excel ghi nhầm Bộ Phận = 'Quầy').
- **Việc theo tuần** ('Nạp doanh thu' của Cửa hàng trưởng): cơ chế hiển thị (vd chỉ bơm vào ca chiều 1 ngày cố định/tuần)?
- **'Chấm công' có là item checklist không?** Hiện 3/7 vị trí có; clock-in đã là sự kiện hệ thống → nên BỎ khỏi mọi checklist (đồng nhất) hay THÊM cho đủ 7?
- **Phân vai tiền + tồn kho cuối ngày:** ai chốt số tổng (đề xuất: branch_manager đối chiếu doanh thu + chốt tồn; cashier/waiter chốt ca POS; bếp báo tồn khu mình) — để 6 việc 'báo cáo tồn kho' không thành 6 báo cáo trùng.
- **Hợp nhất với seed cũ:** template 'Phục vụ' đã có trong migration `20260610170000` (câu chữ khác + có 2 việc `trong_ca`: 'Lau bàn sau mỗi lượt khách', 'Thu gom chén dĩa dơ'). Bản mới bám Excel nên THIẾU 2 việc đó → giữ lại khi hợp nhất? (làm qua migration MỚI, không sửa file đã apply — no-tombstone).

## Phục vụ  ·  `waiter`  ·  19 việc

| # | Việc | Phase | Phạm vi | Bắt buộc | Tiêu chí xong |
|---|---|---|---|:--:|---|
| 1 | Lau muỗng nĩa | Đầu ca | Mỗi ca | ✓ | Muỗng nĩa sạch, khô, không vết bẩn, xếp gọn sẵn sàng phục vụ. |
| 2 | Lau bàn ghế, menu | Đầu ca | Mỗi ca | ✓ | Bàn ghế sạch không dầu mỡ; menu lau sạch và xếp ngay ngắn. |
| 3 | Vệ sinh khu vực phục vụ: quét rác | Đầu ca | Mỗi ca | ✓ | Sàn khu phục vụ sạch, không rác, không vụn thức ăn. |
| 4 | Setup bàn: muỗng nĩa, tăm ăn, khăn giấy | Đầu ca | Mỗi ca | ✓ | Mỗi bàn đủ muỗng nĩa, tăm, khăn giấy, đặt đúng vị trí. |
| 5 | Setup quầy buffet: nước mắm, ớt xay, ớt trái | Đầu ca | Mỗi ca | ✓ | Nước mắm, ớt xay, ớt trái đầy đủ, sạch, đặt sẵn tại quầy buffet. |
| 6 | Setup quầy pha chế: đá, trà tắc, rau má, cam, nước đường | Đầu ca | Mỗi ca | ✓ | Đá, trà tắc, rau má, cam, nước đường đủ và sẵn sàng tại quầy pha chế. |
| 7 | Kiểm tra tất cả đồ dùng, nguyên liệu | Đầu ca | Mỗi ca | ✓ | Đã kiểm đủ đồ dùng và nguyên liệu cho ca; thiếu thì báo bổ sung ngay. |
| 8 | Setup sọt đựng rác | Đầu ca | Mỗi ca | ✓ | Sọt rác có lót túi, đặt đúng vị trí, sẵn sàng sử dụng. |
| 9 | Mở màn hình phục vụ | Đầu ca | Mở (sáng) | ✓ | Màn hình phục vụ đã bật, hiển thị đúng, sẵn sàng nhận đơn. |
| 10 | Đếm tiền đầu ca, mở ca | Đầu ca | Mở (sáng) | ✓ | Tiền đầu ca đã đếm, đối chiếu khớp và ca được mở trên hệ thống. |
| 11 | Lau cửa kính | Đầu ca | Mỗi ca | — | Cửa kính sạch, không vết tay, không bụi mờ. |
| 12 | Vệ sinh khu phục vụ | Cuối ca | Mỗi ca | ✓ | Khu phục vụ sạch, bàn ghế gọn, sàn không rác và dầu mỡ. |
| 13 | Vệ sinh toàn bộ vật dụng: khay, hũ đựng | Cuối ca | Mỗi ca | ✓ | Khay, hũ đựng rửa sạch, để ráo, cất đúng vị trí. |
| 14 | Vệ sinh quầy buffet | Cuối ca | Mỗi ca | ✓ | Quầy buffet lau sạch, không dầu mỡ, đồ gia vị cất gọn. |
| 15 | Vệ sinh quầy pha chế | Cuối ca | Mỗi ca | ✓ | Quầy pha chế lau sạch, dụng cụ rửa sạch và cất gọn. |
| 16 | Xả nước thùng đựng đá | Cuối ca | Mỗi ca | ✓ | Thùng đá đã xả hết nước, lau khô bên trong, để ráo. |
| 17 | Tắt màn hình phục vụ | Cuối ca | Đóng (chiều) | ✓ | Màn hình phục vụ đã tắt đúng cách sau khi đóng ca. |
| 18 | Đếm tiền cuối ca, chốt ca | Cuối ca | Đóng (chiều) | ✓ | Tiền cuối ca đã đếm, đối chiếu khớp và ca được chốt trên hệ thống. |
| 19 | Kiểm tra, báo cáo tồn kho | Cuối ca | Đóng (chiều) | ✓ | Đã kiểm tồn kho cuối ngày và gửi báo cáo số lượng/hao hụt cho quản lý. |

**Ghi chú:**
- SCHEMA (đã xác minh code): cột 'scope' KHÔNG tồn tại trong DB. shift_checklist_template_items + attendance_checklist_items chỉ có phase (CHECK dau_ca/trong_ca/cuoi_ca), done_definition (<=240 ký tự), is_required, title, sort_order, is_active (supabase/migrations/20260610170000_hr_checklist_template_library.sql). 'scope' là chiều phân loại MỚI task này thêm -> owner phải quyết: thêm cột scope + CHECK constraint hay không. Nếu không thêm cột, scope chỉ là metadata phía app, không persist được.
- SNAPSHOT PER-CA giờ là vấn đề SỐNG, không còn giả định: migration D027 20260615130000_hrm_per_shift_attendance.sql (uncommitted, chưa apply prod) re-key attendance thành 1 bản ghi / (employee,date,shift) và RPC employee_clock_in_with_checklist snapshot CÙNG MỘT default_checklist_template cho CẢ ca sáng lẫn ca chiều (dòng 207: i.template_id = v_template_id, không lọc theo ca). Hệ quả: 6 item opening/closing (Mở/Tắt màn hình, Đếm tiền mở ca/chốt ca, Kiểm tra-báo cáo tồn kho) SẼ lặp ở cả 2 ca -> NV ca chiều thấy 'Đếm tiền đầu ca, mở ca', NV ca sáng thấy 'chốt ca'. Hiện CHƯA có logic ẩn theo ca. Cần owner quyết hướng: (a) thêm cột scope + clock-in lọc item theo ca khi snapshot, hoặc (b) tách template riêng sáng/chiều (đã defer ở tasks/todo.md item 7-8, D026 §2).
- required=true cho 6 item opening/closing là ĐÚNG bản chất (tiền/đóng-mở/tồn kho), NHƯNG gate cuối-ca chặn checkout khi item required chưa xong (RPC employee_request_clock_out, dòng ~553 i.is_required=true) -> nếu item closing lặp sang ca sáng và bị tính required, NV ca sáng có thể bị CHẶN checkout vì chưa 'chốt ca'. Đây là bug vận hành trực tiếp nếu apply mà chưa lọc scope. Phải fix lọc-theo-ca TRƯỚC khi seed bộ này.
- PHASE: tất cả item trong danh sách đều đúng phase (dau_ca = setup/prep trước giờ bán; cuoi_ca = dọn/đóng sau bán). KHÔNG có item nào là việc làm-suốt-ca bị gán nhầm dau_ca.
- THIẾU phase trong_ca: danh sách Excel này KHÔNG có việc nào làm liên tục trong lúc bán, nhưng thực tế Phục vụ CÓ (seed hiện tại dòng 1056-1057 có 'Lau bàn sau mỗi lượt khách' + 'Thu gom chén dĩa dơ về khu rửa' = trong_ca). Theo kỷ luật KHÔNG bịa việc -> không tự thêm vào bộ này, nhưng owner nên cân nhắc bổ sung 2 việc trong_ca đó khi hợp nhất, vì bỏ trống trong_ca là thiếu sót thực tế cho vai trò Phục vụ.
- TRÙNG LẶP với seed hiện có cùng file (block 'Phục vụ' dòng 1051-1060): seed cũ có 'Lau bàn sau mỗi lượt khách', 'Thu gom chén dĩa dơ', 'Dọn rác cuối ca', 'Đếm tiền cuối ca và báo cáo' khác câu chữ. Bộ chuẩn hoá này bám Excel đề bài -> 2 nguồn lệch nhau. Owner phải quyết HỢP NHẤT (bộ mới thay seed cũ qua migration mới, không sửa file đã apply) để tránh template Phục vụ có 2 bản.
- scope 'weekly': không có việc nào trong danh sách Phục vụ thuộc theo-tuần. Nạp doanh thu cuối tuần thuộc thu ngân/quản lý -> KHÔNG thêm vào đây.
- 'Lau cửa kính' giữ required=false (vệ sinh thẩm mỹ, không tiền/ATTP/cốt lõi); owner nâng lên true nếu muốn ép mỗi ca.
- Chính tả: 'xọt đựng rác' -> 'sọt đựng rác' (giữ nguyên ngữ nghĩa). Đã rút gọn vài done_definition cho gọn-quan-sát-được, giữ nguyên dấu hiệu kiểm tra.
- KỶ LUẬT NO-TOMBSTONE: nếu owner đồng ý hợp nhất, KHÔNG sửa trực tiếp file migration đã apply (20260610170000); tạo migration mới INSERT/UPDATE template + (nếu thêm scope) ALTER TABLE ADD COLUMN scope + CHECK. Cập nhật RPC clock-in snapshot lọc theo ca trong cùng migration.

## Phụ bếp  ·  `kitchen_helper`  ·  20 việc

| # | Việc | Phase | Phạm vi | Bắt buộc | Tiêu chí xong |
|---|---|---|---|:--:|---|
| 1 | Bật cầu dao, hệ thống điện | Đầu ca | Mở (sáng) | ✓ | Cầu dao đã bật, đèn và thiết bị điện khu bếp hoạt động bình thường. |
| 2 | Chấm công vào ca | Đầu ca | Mỗi ca | ✓ | Đã chấm công thành công, hệ thống ghi nhận giờ vào ca. |
| 3 | Chỉnh trang đồng phục: đội nón, đeo tạp dề, đeo bảng tên | Đầu ca | Mỗi ca | ✓ | Đã đội nón, mang tạp dề sạch và đeo bảng tên đúng vị trí. |
| 4 | Chuẩn bị 2 nồi nước sôi | Đầu ca | Mỗi ca | ✓ | 2 nồi nước đã sôi, sẵn sàng dùng trước giờ bán. |
| 5 | Nấu cơm | Đầu ca | Mỗi ca | ✓ | Cơm chín đều, dẻo, đủ lượng phục vụ đầu ca. |
| 6 | Nấu canh | Đầu ca | Mỗi ca | ✓ | Canh đã chín, nêm vừa ăn, đủ lượng phục vụ đầu ca. |
| 7 | Trộn bì | Đầu ca | Mỗi ca | ✓ | Bì đã trộn đều thính và gia vị, để khay sẵn phục vụ. |
| 8 | Làm mỡ hành | Đầu ca | Mỗi ca | ✓ | Mỡ hành thơm, hành chín tới, đựng hũ sẵn để múc. |
| 9 | Cắt chả | Đầu ca | Mỗi ca | ✓ | Chả cắt đều miếng, xếp khay sẵn để phục vụ. |
| 10 | Cắt cà chua, dưa leo | Đầu ca | Mỗi ca | ✓ | Cà chua, dưa leo rửa sạch, cắt đều, để khay sẵn dùng. |
| 11 | Xay ớt | Đầu ca | Mỗi ca | ✓ | Ớt đã xay nhuyễn, đựng hũ sẵn trên quầy. |
| 12 | Chiên trứng | Đầu ca | Mỗi ca | ✓ | Trứng chiên chín đều, để khay sẵn phục vụ. |
| 13 | Kiểm tra rau củ và sơ chế | Đầu ca | Mỗi ca | ✓ | Rau củ tươi, đã loại bỏ phần hư, rửa và sơ chế xong, không còn nguyên liệu kém chất lượng. |
| 14 | Cho cơm vào nồi hấp khi chín | Trong ca | Mỗi ca | ✓ | Cơm chín được chuyển vào nồi hấp giữ nóng, luôn có cơm nóng sẵn để bán. |
| 15 | Vệ sinh tủ cơm | Cuối ca | Mỗi ca | ✓ | Tủ cơm sạch trong và ngoài, không còn cặn cơm hay mùi. |
| 16 | Vệ sinh nồi canh | Cuối ca | Mỗi ca | ✓ | Nồi canh rửa sạch, không còn cặn thức ăn, úp ráo. |
| 17 | Vệ sinh bếp gas | Cuối ca | Mỗi ca | ✓ | Bếp gas đã khóa van, mặt bếp sạch dầu mỡ, không còn lửa hay rò khí. |
| 18 | Vệ sinh dụng cụ, đồ dùng đã sử dụng | Cuối ca | Mỗi ca | ✓ | Dao, thớt, khay, dụng cụ đã rửa sạch và xếp gọn đúng nơi. |
| 19 | Vệ sinh khu vực bếp | Cuối ca | Mỗi ca | ✓ | Sàn, bàn bếp sạch dầu mỡ, rác đã đổ, khu bếp khô ráo gọn gàng. |
| 20 | Kiểm tra hao hụt, báo cáo tồn kho | Cuối ca | Đóng (chiều) | ✓ | Đã đếm tồn kho cuối ngày, ghi nhận hao hụt và gửi báo cáo tồn kho. |

**Ghi chú:**
- "Cho cơm vào nồi hấp khi chín" giữ phase=trong_ca (việc làm liên tục trong lúc bán, cho cơm vào hấp mỗi khi mẻ chín) — đúng theo bản chất; đã sắp lại vị trí sau khối sơ chế đầu ca cho hợp luồng.
- "Bật cầu dao, hệ thống điện" scope=opening (chỉ 1 lần đầu ngày). Danh sách gốc KHÔNG có việc đối ứng tắt cầu dao/điện cuối ca chiều (closing) — cần owner xác nhận có thêm việc tắt điện cuối ngày hay không (an toàn điện cuối ca).
- "Kiểm tra hao hụt, báo cáo tồn kho" giữ scope=closing (1 lần cuối ngày). Nếu owner muốn kiểm tồn sau cả ca sáng lẫn ca chiều thì đổi sang every_shift — cần owner quyết.
- Danh sách gốc không có việc theo tuần (weekly) cho vị trí Phụ bếp.
- Khối sơ chế đầu ca (nấu cơm, nấu canh, làm mỡ hành, trộn bì, cắt chả, xay ớt, chiên trứng...) gán scope=every_shift theo mô hình snapshot 2 ca/ngày — owner cần xác nhận khối lượng sơ chế ca chiều có giảm so với ca sáng không (nếu ca chiều chỉ bổ sung phần thiếu thì vẫn every_shift nhưng định mức khác).
- Toàn bộ 20 việc gốc giữ nguyên ngữ nghĩa, không bịa thêm/không bỏ; tất cả đều thuộc nhóm an toàn thực phẩm/an toàn gas/cốt lõi quy trình/tồn kho nên required=true — không có việc có-điều-kiện ("nếu dơ") hay phụ trong danh sách này.

## Quầy  ·  `cashier`  ·  13 việc

| # | Việc | Phase | Phạm vi | Bắt buộc | Tiêu chí xong |
|---|---|---|---|:--:|---|
| 1 | Chấm công vào ca | Đầu ca | Mỗi ca | ✓ | Đã bấm chấm công vào ca trên máy, hệ thống ghi nhận đúng ca (sáng/chiều). |
| 2 | Chỉnh trang đồng phục: đội nón, đeo tạp dề, đeo bảng tên | Đầu ca | Mỗi ca | ✓ | Mặc đủ đồng phục, đội nón, đeo tạp dề và bảng tên gọn gàng, sạch sẽ. |
| 3 | Kiểm tra nồi hấp cơm | Đầu ca | Mỗi ca | ✓ | Nồi hấp đủ nước, đã cắm điện và bật nóng, sạch và hoạt động bình thường, sẵn sàng hấp cơm. |
| 4 | Setup quầy bán: dụng cụ, nguyên liệu, đồ mang về | Đầu ca | Mỗi ca | ✓ | Quầy đầy đủ dụng cụ, nguyên liệu và đồ mang về (hộp, túi), xếp đúng vị trí sẵn sàng bán. |
| 5 | Mở máy KDS | Đầu ca | Mở (sáng) | ✓ | Màn hình KDS đã bật, lên đúng giao diện nhận đơn. |
| 6 | Đóng gói đồ chua vào túi zip | Trong ca | Mỗi ca | ✓ | Luôn có đủ túi zip đồ chua đã chia sẵn ở khu phục vụ, không để hết hàng giữa ca. |
| 7 | Đóng gói canh mang về | Trong ca | Mỗi ca | ✓ | Luôn có đủ phần canh mang về đã đóng kín ở khu phục vụ, không để hết hàng giữa ca. |
| 8 | Gói nguyên liệu còn thừa, cho vào tủ lạnh | Cuối ca | Mỗi ca | ✓ | Nguyên liệu thừa được bọc kín, ghi rõ và cất vào tủ lạnh đúng nhiệt độ. |
| 9 | Rửa sạch dụng cụ, đồ dùng đã sử dụng | Cuối ca | Mỗi ca | ✓ | Dụng cụ, đồ dùng đã rửa sạch, không dầu mỡ, để ráo đúng nơi quy định. |
| 10 | Dọn dẹp, vệ sinh quầy | Cuối ca | Mỗi ca | ✓ | Mặt quầy sạch, không dầu mỡ, rác đã đổ, dụng cụ sắp xếp gọn gàng. |
| 11 | Tắt máy KDS | Cuối ca | Đóng (chiều) | ✓ | Màn hình KDS đã tắt nguồn an toàn cuối ngày. |
| 12 | Kiểm tra, báo cáo nguyên liệu dư | Cuối ca | Đóng (chiều) | ✓ | Đã đếm nguyên liệu còn dư cuối ngày và ghi/báo cáo số liệu cho quản lý. |
| 13 | Kiểm tra hao hụt, báo cáo tồn kho | Cuối ca | Đóng (chiều) | ✓ | Đã đối chiếu hao hụt và ghi nhận/báo cáo tồn kho cuối ngày cho quản lý. |

**Ghi chú:**
- SỬA PHASE: 'Đóng gói đồ chua' và 'Đóng gói canh mang về' chuyển dau_ca → trong_ca vì bản chất phải bù liên tục khi hết hàng trong lúc bán (theo rule: việc làm-suốt-ca = trong_ca); done_definition đổi sang dấu hiệu 'luôn có đủ, không để hết giữa ca' để quan sát được. Nếu owner muốn coi đây thuần là setup đầu ca thì trả về dau_ca.
- File gốc KHÔNG có việc đếm tiền/mở-chốt ca cho vị trí Quầy nên không thêm (giữ kỷ luật không bịa việc). Nếu thực tế Quầy phải đếm tiền đầu/cuối ca thì owner cần bổ sung 2 việc: đếm tiền đầu ca (opening, required) + đếm tiền chốt ca (closing, required).
- 'Mở máy KDS' (opening) và 'Tắt máy KDS' (closing) chỉ làm 1 lần/ngày — snapshot theo-ca sẽ chỉ hiện ở ca sáng (mở) và ca chiều (tắt); owner xác nhận quy ước hiển thị này hợp lý.
- 3 việc chốt ngày ('nguyên liệu dư', 'hao hụt/tồn kho') để closing vì là báo cáo cuối ngày cho quản lý; nếu owner muốn kiểm cả cuối ca sáng thì đổi sang every_shift.
- required: tất cả việc đều là cốt lõi quy trình / ATTP / setup nên để true; không có việc có-điều-kiện ('nếu dơ') hay phụ trong file gốc.
- File gốc KHÔNG có việc nào theo tuần (weekly) cho vị trí Quầy.

## Nướng  ·  `chef`  ·  11 việc

| # | Việc | Phase | Phạm vi | Bắt buộc | Tiêu chí xong |
|---|---|---|---|:--:|---|
| 1 | Chấm công | Đầu ca | Mỗi ca | ✓ | Đã bấm chấm công vào ca; hệ thống ghi nhận đúng giờ và đúng ca. |
| 2 | Chỉnh trang đồng phục: đội nón, đeo bảng tên | Đầu ca | Mỗi ca | ✓ | Mặc đúng đồng phục, đội nón che tóc, đeo bảng tên gọn gàng trước khi vào bếp. |
| 3 | Nhóm than | Đầu ca | Mỗi ca | ✓ | Than hồng đều, đủ nhiệt, sẵn sàng nướng trước giờ bán. |
| 4 | Nướng sườn cây | Trong ca | Mỗi ca | ✓ | Sườn cây chín đều, không cháy khét, ra món kịp theo đơn. |
| 5 | Nướng sườn cốt lết | Trong ca | Mỗi ca | ✓ | Sườn cốt lết chín đều, không cháy khét, ra món kịp theo đơn. |
| 6 | Thay vỉ khi vỉ bị đen | Trong ca | Mỗi ca | — | Vỉ đang dùng sạch, không còn vỉ đen/đóng cặn trên lò. |
| 7 | Chà vỉ nướng | Trong ca | Mỗi ca | ✓ | Vỉ nướng được chà sạch cặn cháy trong lúc bán, không còn mảng đen bám thịt. |
| 8 | Rửa sạch dụng cụ, vỉ nướng đã sử dụng | Cuối ca | Mỗi ca | ✓ | Dụng cụ và vỉ nướng đã rửa sạch dầu mỡ, để ráo đúng nơi quy định. |
| 9 | Vệ sinh lò nướng | Cuối ca | Mỗi ca | ✓ | Lò nướng sạch tro than và dầu mỡ, không còn vụn thức ăn cháy. |
| 10 | Vệ sinh khu bếp | Cuối ca | Mỗi ca | ✓ | Sàn, bàn và khu bếp sạch dầu mỡ, rác đã đổ, dụng cụ xếp gọn. |
| 11 | Kiểm tra hao hụt, báo cáo tồn kho | Cuối ca | Đóng (chiều) | ✓ | Đã đếm tồn cuối ngày, ghi nhận hao hụt và gửi báo cáo tồn kho. |

**Ghi chú:**
- VERDICT: checklist đã chuẩn, chỉ chỉnh nhẹ câu chữ done_definition (Nhóm than, Thay vỉ) cho gọn. Không thêm/bớt việc; phase/scope/required đều hợp quy tắc.
- CODE MAP (cần owner xác nhận): ô Bộ Phận Excel ghi 'Quầy' nhưng nội dung (nhóm than, nướng sườn, vệ sinh lò) là vị trí Nướng/Bếp → map positions.code=chef. Đã verify trong migration 20260610170000: template seed cũ tên 'Nướng' tồn tại sẵn, KHÔNG có cột nào gọi là role/position code trên item — role_code ở bảng templates là legacy, selection không còn dùng. Vẫn cần owner chốt định danh template trước khi seed.
- SCOPE — ĐÃ XÁC MINH BẰNG CODE, KHÔNG CHỈ DOCS: bảng public.shift_checklist_template_items hiện CHỈ có cột phase (CHECK chỉ cho dau_ca/trong_ca/cuoi_ca), done_definition (<=240), is_required. KHÔNG có cột scope. Hàm upsert (migration 20260610170000 ~line 449-499) chỉ đọc title/phase/doneDefinition/isRequired → trường scope trong JSON sẽ bị BỎ QUA âm thầm khi seed. RPC clock-in (migration 20260615130000 employee_clock_in_with_checklist) snapshot toàn bộ item của template cho MỖI lần chấm công ca, KHÔNG phân biệt ca sáng/chiều → item closing 'Kiểm tra hao hụt' hiện sẽ xuất hiện ở CẢ 2 ca. Owner phải quyết: (a) thêm cột scope + sửa CHECK + sửa upsert + sửa snapshot RPC để lọc theo shift_id, hoặc (b) tách thành 2 template (sáng/chiều) gán theo shift_assignment. Chưa làm 1 trong 2 thì scope=closing CHƯA enforce được.
- 2-CA MODEL ĐÃ XÁC MINH: migration 20260615130000 seed đúng 2 ca global 'Ca sáng' 06:00–13:00 và 'Ca chiều' 16:00–21:00, attendance re-key theo (employee,date,shift). Khớp giả định mô hình 2 ca/ngày → scope every_shift cho đa số item là đúng (snapshot lặp 2 ca).
- required=false chỉ áp 'Thay vỉ khi vỉ bị đen' (điều kiện 'khi đen'); 'Chà vỉ nướng' giữ required=true (vệ sinh thiết bị/ATTP trong ca) — đúng quy tắc.
- PHASE: 'Nướng sườn cây/cốt lết', 'Thay vỉ', 'Chà vỉ' nằm cột Đầu ca trong Excel nhưng bản chất làm-suốt-ca → trong_ca (đã sửa, đúng). 'Nhóm than' giữ dau_ca vì là setup nhiệt trước giờ bán (đúng).
- Vị trí Nướng không có việc theo tuần (weekly) và không có việc mở-sáng riêng (opening) trong danh sách gốc — không bịa thêm. 'Chấm công' để every_shift (chấm công vào cho cả 2 ca).

## Tạp vụ  ·  `(chưa có code)`  ·  13 việc

| # | Việc | Phase | Phạm vi | Bắt buộc | Tiêu chí xong |
|---|---|---|---|:--:|---|
| 1 | Chấm công vào ca | Đầu ca | Mỗi ca | ✓ | Hệ thống ghi nhận giờ vào ca đúng, trạng thái chấm công đầu ca hiển thị thành công. |
| 2 | Chỉnh trang đồng phục: đội nón, đeo bảng tên | Đầu ca | Mỗi ca | ✓ | Mặc đồng phục gọn gàng, đội nón và đeo bảng tên đầy đủ trước khi vào việc. |
| 3 | Vệ sinh khu vực nhà vệ sinh | Đầu ca | Mỗi ca | ✓ | Nhà vệ sinh sạch, không mùi hôi, sàn khô, đủ giấy và xà phòng. |
| 4 | Lau chùi bồn rửa tay, mặt gương | Đầu ca | Mỗi ca | ✓ | Bồn rửa tay và mặt gương sạch bóng, không vết nước, không cặn bẩn. |
| 5 | Tưới cây | Đầu ca | Mỗi ca | — | Cây được tưới đủ ẩm, đất không úng nước, lá xanh tươi. |
| 6 | Dọn đĩa chén khách ăn xong | Trong ca | Mỗi ca | ✓ | Bàn khách ăn xong được dọn sạch ngay, không tồn đĩa chén dơ trên bàn. |
| 7 | Rửa chén dĩa | Trong ca | Mỗi ca | ✓ | Chén dĩa rửa liên tục, không dồn ứ, luôn đủ chén dĩa sạch để phục vụ. |
| 8 | Quét dọn phòng lạnh, khu vực phục vụ khi dơ | Trong ca | Mỗi ca | — | Khi phát hiện dơ, phòng lạnh và khu phục vụ được quét sạch, không rác, không thức ăn rơi vãi. |
| 9 | Lau sàn khu vực bếp khi dơ | Trong ca | Mỗi ca | — | Khi phát hiện dơ, sàn bếp được lau khô ráo, không dầu mỡ, không trơn trượt. |
| 10 | Dọn dẹp, vệ sinh sạch sẽ bàn ghế | Cuối ca | Mỗi ca | ✓ | Bàn ghế sạch, không dầu mỡ, xếp ngay ngắn về vị trí cuối ca. |
| 11 | Dọn dẹp, vệ sinh sạch sẽ khu vực phục vụ | Cuối ca | Mỗi ca | ✓ | Khu phục vụ sạch, sàn khô, không rác, gọn gàng cuối ca. |
| 12 | Rửa sạch chén, dĩa, muỗng nĩa | Cuối ca | Mỗi ca | ✓ | Toàn bộ chén, dĩa, muỗng nĩa rửa sạch, để khô ráo và xếp đúng nơi quy định. |
| 13 | Dọn dẹp nhà vệ sinh sạch sẽ | Cuối ca | Mỗi ca | ✓ | Nhà vệ sinh sạch, không mùi, sàn khô, thùng rác được đổ trước khi đóng ca. |

**Ghi chú:**
- CODE chưa gán (giữ '(chưa có code)'). Xác minh trong code: bộ position canonical chỉ có 11 mã English (owner, super_manager, branch_manager, warehouse_manager, production_manager, head_chef, kitchen_helper, chef, cashier, waiter, office) tại supabase/migrations/20260610230000_canonical_position_codes_lean.sql + twin POSITION_CODE_TO_STAFF_ROLE ở packages/shared/src/auth/types.ts. KHÔNG có mã tạp vụ/cleaner; 'office' = Nhân sự/Hành chính. Excel ghi Bộ Phận 'Quầy' nhưng nội dung 100% là tạp vụ/vệ sinh. Owner cần quyết: (a) thêm position mới (vd cleaner) vào bộ canonical + cập nhật cả SQL mapper lẫn TS twin trong cùng PR, hay (b) giữ template Global không gắn code.
- Phase đã sửa đúng: 4 việc làm liên tục trong lúc bán ('Dọn đĩa chén khách ăn xong', 'Rửa chén dĩa', 'Quét dọn khi dơ', 'Lau sàn bếp khi dơ') đặt ở trong_ca — không để nhầm ở dau_ca. Phần còn lại: setup vệ sinh đầu ca = dau_ca, đóng-vệ-sinh cuối ca = cuoi_ca.
- Scope: toàn bộ every_shift (lặp cả ca sáng 06:00–13:00 lẫn ca chiều 16:00–21:00). Vai trò tạp vụ không có việc tiền/đếm tiền/mở-đóng POS (opening/closing) và không có việc theo tuần (weekly) — phù hợp; không bịa thêm.
- required: an toàn thực phẩm/vệ sinh cốt lõi/chấm công = true; việc CÓ ĐIỀU KIỆN 'khi dơ' (quét dọn phòng lạnh, lau sàn bếp) và việc phụ (tưới cây) = false.
- Chu trình hợp lệ, KHÔNG gộp: nhà vệ sinh (vệ sinh đầu ca vs dọn cuối ca), rửa chén (trong_ca liên tục vs rửa sạch cuối ca), khu phục vụ (quét khi dơ trong_ca vs vệ sinh cuối ca) — đây là setup → liên tục → đóng. Owner xác nhận nếu muốn gộp.
- Chuẩn hóa câu chữ: thống nhất điều kiện 'khi dơ' cho cả 2 việc có điều kiện; done_definition viết lại theo dấu hiệu quan sát được (vd 'khi phát hiện dơ' đặt đầu câu cho 2 việc có điều kiện).
- Cân nhắc owner: 'Tưới cây' bản chất làm 1 lần/ngày nên có thể là opening; giữ every_shift theo mặc định setup và nguyên tắc không suy diễn quá mức — owner quyết nếu muốn đổi sang opening.

## Cửa hàng trưởng  ·  `branch_manager`  ·  15 việc

| # | Việc | Phase | Phạm vi | Bắt buộc | Tiêu chí xong |
|---|---|---|---|:--:|---|
| 1 | Chỉnh trang đồng phục, đeo bảng tên | Đầu ca | Mỗi ca | ✓ | Đồng phục gọn gàng, đeo bảng tên đúng vị trí trước giờ vào ca. |
| 2 | Điểm danh nhân sự đầu ca | Đầu ca | Mỗi ca | ✓ | Đã điểm danh đủ nhân sự ca, ghi nhận người vắng và đi trễ. |
| 3 | Kiểm tra đồng phục, tác phong nhân viên | Đầu ca | Mỗi ca | ✓ | Nhân viên mặc đúng đồng phục, sạch sẽ, đeo bảng tên trước giờ bán. |
| 4 | Kiểm tra món: cơm, canh, bì, chả, trứng | Đầu ca | Mỗi ca | ✓ | Các món đủ số lượng, đạt chất lượng và an toàn để bán trong ca. |
| 5 | Kiểm tra vệ sinh khu vực khách ngồi | Đầu ca | Mỗi ca | ✓ | Bàn ghế và sàn khu khách sạch, không rác hay dầu mỡ trước giờ bán. |
| 6 | Kiểm tra vệ sinh quầy, khu vực nướng | Đầu ca | Mỗi ca | ✓ | Quầy và khu nướng sạch, dụng cụ đúng vị trí, sẵn sàng vận hành. |
| 7 | Kiểm tra vệ sinh nhà vệ sinh | Đầu ca | Mỗi ca | ✓ | Nhà vệ sinh sạch, đủ giấy và xà phòng, không mùi trước giờ bán. |
| 8 | Kiểm tra chứng từ xuất-nhập nguyên liệu | Đầu ca | Mở (sáng) | ✓ | Chứng từ xuất-nhập nguyên liệu khớp với thực nhận đầu ngày. |
| 9 | Kiểm kê tồn kho đầu ngày so với thực tế | Đầu ca | Mở (sáng) | ✓ | Tồn trên app khớp đếm thực tế, chênh lệch đầu ngày đã ghi nhận. |
| 10 | Giám sát vận hành, an toàn thực phẩm trong ca | Trong ca | Mỗi ca | ✓ | Suốt ca khu vực sạch, món đảm bảo an toàn, sự cố được xử lý ngay. |
| 11 | Thống kê hao hụt nguyên liệu trên app | Cuối ca | Đóng (chiều) | ✓ | Đã nhập đủ số hao hụt nguyên liệu cuối ngày vào app. |
| 12 | Thống kê tồn kho cuối ngày trên app | Cuối ca | Đóng (chiều) | ✓ | Đã cập nhật tồn kho cuối ngày trên app, có số liệu để đối chiếu. |
| 13 | Đối chiếu doanh thu cuối ngày | Cuối ca | Đóng (chiều) | ✓ | Doanh thu trên app khớp tiền mặt và chuyển khoản, chênh lệch đã giải trình. |
| 14 | Lên đơn nhập hàng cho ngày hôm sau | Cuối ca | Đóng (chiều) | ✓ | Đơn nhập hàng ngày mai đã lập đủ mặt hàng và số lượng cần đặt. |
| 15 | Nạp doanh thu vào tài khoản công ty (giữ lại tiền đầu ca) | Cuối ca | Tuần | ✓ | Đã nộp doanh thu tuần vào tài khoản công ty, giữ đủ tiền đầu ca. |

**Ghi chú:**
- SCHEMA: DB chỉ lưu phase/done_definition/is_required trên shift_checklist_template_items (CHECK phase IN dau_ca/trong_ca/cuoi_ca). 'scope' (every_shift/opening/closing/weekly) là TẦNG THIẾT KẾ chuẩn hoá, CHƯA có cột DB và CHƯA wire vào code/RPC — owner cần quyết có thêm cột scope (hoặc dùng quy ước 2 ca riêng template) trước khi snapshot per-shift dùng được scope.
- ĐÃ SỬA scope 2 việc đếm kho đầu ngày: 'Kiểm tra chứng từ xuất-nhập nguyên liệu' và 'Kiểm kê tồn kho đầu ngày so với thực tế' đổi every_shift→opening (chỉ đếm 1 lần đầu ngày, không lặp ca chiều). Nếu thực tế cửa hàng kiểm kê CẢ 2 ca thì owner đổi lại every_shift.
- CHỒNG LẤN tồn kho: 'Kiểm kê tồn kho đầu ngày' (dau_ca/opening) vs 'Thống kê tồn kho cuối ngày' (cuoi_ca/closing) — đã định danh rõ là 2 lần đếm khác thời điểm (đầu vs cuối ngày). Owner xác nhận đây đúng là 2 việc, không phải 1 việc bị tách.
- THÊM 1 việc trong_ca 'Giám sát vận hành, an toàn thực phẩm trong ca' để khoả lấp lỗ hổng phase: template gốc 100% là dau_ca + cuoi_ca, không có việc làm-suốt-ca dù bản chất quản lý là giám sát liên tục khi bán. ĐÂY LÀ VIỆC SUY RA, không có trong file gốc — cần owner duyệt giữ/bỏ. Nếu owner muốn giữ nguyên 14 việc gốc thì xoá item này.
- 'Nạp doanh thu vào tài khoản công ty' scope=weekly: KHÔNG khớp snapshot theo ca (snapshot lặp mỗi ca). Owner cần quyết cách hiển thị — vd chỉ bơm vào checklist ca chiều cuối tuần — nếu không sẽ lặp ở mọi ca hoặc không bao giờ hiện.
- Toàn bộ scope=closing (hao hụt, tồn kho cuối, đối chiếu doanh thu, lên đơn nhập) chỉ chạy ở snapshot ca CHIỀU; không lặp ở ca sáng. Cần guard ở tầng sinh snapshot để opening/closing/weekly không rò sang ca sai.
- Việc MỞ CA đặc thù quản lý (đếm tiền đầu ca/để tiền thối, bật cầu dao-điện, mở màn hình/KDS) KHÔNG có trong template gốc của vị trí này. Nếu Cửa hàng trưởng phải tự mở ca thì owner bổ sung item phase=dau_ca scope=opening; hiện CHƯA thêm vì kỷ luật không bịa việc ngoài file gốc.
- Bỏ tên người và rút gọn câu chữ; mọi done_definition đã đưa về dấu hiệu quan sát được. Không sửa ngữ nghĩa việc gốc nào.

## Bếp trưởng  ·  `head_chef`  ·  10 việc

| # | Việc | Phase | Phạm vi | Bắt buộc | Tiêu chí xong |
|---|---|---|---|:--:|---|
| 1 | Chỉnh trang đồng phục: đội nón, đeo bảng tên, mặc tạp dề | Đầu ca | Mỗi ca | ✓ | Đội nón, đeo bảng tên, mặc tạp dề đầy đủ và gọn gàng trước giờ phục vụ |
| 2 | Kiểm tra nguyên liệu đầu ngày: thịt, rau, gia vị | Đầu ca | Mở (sáng) | ✓ | Thịt, rau, gia vị đủ số lượng, còn tươi, trong hạn dùng, không hư hỏng |
| 3 | Kiểm tra hàng nhận từ kho và nhà cung cấp | Đầu ca | Mở (sáng) | ✓ | Hàng nhận đúng số lượng, đạt chất lượng, đã đối chiếu khớp phiếu giao |
| 4 | Vệ sinh khu vực làm việc đầu ca | Đầu ca | Mỗi ca | ✓ | Bàn bếp, dụng cụ và sàn khu vực làm việc sạch, khô, sẵn sàng phục vụ |
| 5 | Sản xuất món và tạo lệnh sản xuất | Trong ca | Mỗi ca | ✓ | Món được làm đủ theo nhu cầu bán, lệnh sản xuất được ghi nhận trên hệ thống |
| 6 | Đảm bảo an toàn thực phẩm | Trong ca | Mỗi ca | ✓ | Thực phẩm bảo quản đúng nhiệt độ, không lẫn sống-chín, dụng cụ sạch suốt ca |
| 7 | Báo cáo khối lượng sản phẩm đã sản xuất | Cuối ca | Đóng (chiều) | ✓ | Số lượng từng món đã sản xuất trong ngày được ghi nhận và gửi báo cáo |
| 8 | Kiểm tra nguyên liệu tồn cuối ngày | Cuối ca | Đóng (chiều) | ✓ | Số lượng nguyên liệu còn tồn cuối ngày đã được đếm và ghi nhận |
| 9 | Lập đề xuất mua hàng cho ngày hôm sau | Cuối ca | Đóng (chiều) | ✓ | Đề xuất mua hàng cho ngày mai đã lập đủ mặt hàng và gửi đi |
| 10 | Vệ sinh toàn bộ khu vực làm việc cuối ca | Cuối ca | Mỗi ca | ✓ | Bếp, dụng cụ, tủ và sàn dọn sạch, không dầu mỡ, rác đã đổ trước khi đóng bếp |

**Ghi chú:**
- Schema thực tế trong code (apps/web/app/(protected)/hr/checklist-types.ts) hiện CHỈ có phase/doneDefinition/isRequired/sortOrder — KHÔNG có trường scope. Trường scope trong output này là phần chuẩn hoá theo mô hình 2 ca/ngày do đề bài định nghĩa, chưa có chỗ lưu trong DB/template hiện tại; owner cần quyết có mở rộng schema (cột scope + CHECK) hay bỏ scope.
- 2 việc kiểm tra đầu ngày (nguyên liệu + hàng nhận kho/NCC) gán scope opening vì có chữ "đầu ngày" và hàng thường về buổi sáng. Nếu quán nhận hàng/nhập nguyên liệu cả ca chiều thì owner đổi sang every_shift.
- "Báo cáo khối lượng sản phẩm" gán cuoi_ca + closing (chốt 1 lần cuối ngày). Nếu bếp trưởng báo sản lượng theo từng ca thì đổi sang every_shift — cần owner xác nhận nhịp báo cáo.
- 2 việc vệ sinh là 2 việc gốc riêng biệt KHÔNG trùng: đầu ca (dau_ca/every_shift) = setup sẵn sàng phục vụ; cuối ca (cuoi_ca/every_shift) = tổng vệ sinh đóng bếp. Đã thêm hậu tố "đầu ca"/"cuối ca" vào title để phân biệt rõ.
- "Sản xuất và tạo lệnh sản xuất" giữ ở trong_ca (chuyển từ dau_ca của file gốc) vì bản chất làm liên tục theo nhu cầu bán. Nếu quán sản xuất gộp 1 lần trước giờ mở bán thì đổi về dau_ca — cần owner quyết.
- Tất cả 10 việc required=true: không có việc có điều kiện ("nếu dơ") hay phụ; toàn bộ là ATTP / cốt lõi quy trình / kiểm tồn-mua hàng. Không có việc theo tuần (weekly) cho vị trí này.

## Thư viện việc dùng chung (đồng nhất giữa các vị trí)

| Việc chuẩn | Phase | Phạm vi | Bắt buộc | Tiêu chí xong | Vị trí dùng |
|---|---|---|:--:|---|---|
| Chấm công vào ca | Đầu ca | Mỗi ca | ✓ | Đã chấm công vào ca trên hệ thống; ghi nhận đúng giờ và đúng ca (sáng/chiều). | kitchen_helper, cashier, chef, (cleaner-chưa-có-code), waiter (ngầm qua 'mở ca') |
| Chỉnh trang đồng phục: đội nón, đeo tạp dề, đeo bảng tên | Đầu ca | Mỗi ca | ✓ | Mặc đủ đồng phục: đội nón, mang tạp dề sạch, đeo bảng tên đúng vị trí trước giờ vào ca. | kitchen_helper, cashier, chef, head_chef, branch_manager, (cleaner-chưa-có-code) |
| Kiểm tra hao hụt, báo cáo tồn kho | Cuối ca | Đóng (chiều) | ✓ | Đã đếm tồn kho cuối ngày, ghi nhận hao hụt và gửi báo cáo cho quản lý. | waiter, kitchen_helper, cashier, chef, head_chef, branch_manager |
| Rửa sạch dụng cụ, đồ dùng đã sử dụng | Cuối ca | Mỗi ca | ✓ | Dụng cụ, đồ dùng đã rửa sạch dầu mỡ, để ráo và xếp gọn đúng nơi quy định. | waiter, kitchen_helper, cashier, chef |
| Vệ sinh khu vực làm việc cuối ca | Cuối ca | Mỗi ca | ✓ | Sàn, bàn và khu vực sạch dầu mỡ, rác đã đổ, dụng cụ xếp gọn, khô ráo trước khi đóng ca. | waiter, kitchen_helper, cashier, chef, head_chef, (cleaner-chưa-có-code) |
| Đếm tiền đầu ca, mở ca | Đầu ca | Mở (sáng) | ✓ | Tiền đầu ca đã đếm, đối chiếu khớp và ca được mở trên hệ thống. | waiter, branch_manager (gợi ý bổ sung), cashier (gợi ý bổ sung) |
| Đếm tiền cuối ca, chốt ca | Cuối ca | Đóng (chiều) | ✓ | Tiền cuối ca đã đếm, đối chiếu khớp và ca được chốt trên hệ thống. | waiter, branch_manager (qua 'Đối chiếu doanh thu'), cashier (gợi ý bổ sung) |
| Mở màn hình phục vụ / máy KDS | Đầu ca | Mở (sáng) | ✓ | Màn hình phục vụ/KDS đã bật, lên đúng giao diện, sẵn sàng nhận đơn. | waiter (màn hình phục vụ), cashier (KDS) |
| Tắt màn hình phục vụ / máy KDS | Cuối ca | Đóng (chiều) | ✓ | Màn hình phục vụ/KDS đã tắt nguồn an toàn cuối ngày. | waiter (màn hình phục vụ), cashier (KDS) |
| Đảm bảo an toàn thực phẩm trong ca | Trong ca | Mỗi ca | ✓ | Suốt ca: thực phẩm đúng nhiệt độ, không lẫn sống-chín, dụng cụ sạch; sự cố xử lý ngay. | head_chef, branch_manager (qua 'Giám sát vận hành, ATTP') |
| Kiểm tra, báo cáo nguyên liệu dư / tồn kho cuối ngày | Cuối ca | Đóng (chiều) | ✓ | Đã đếm nguyên liệu dư/tồn cuối ngày và ghi nhận/báo cáo số liệu cho quản lý. | cashier, branch_manager, head_chef |
| Lập đề xuất mua hàng / đơn nhập cho ngày hôm sau | Cuối ca | Đóng (chiều) | ✓ | Đề xuất/đơn nhập cho ngày mai đã lập đủ mặt hàng và số lượng, đã gửi đi. | branch_manager, head_chef |

## Mâu thuẫn / điểm cần thống nhất

- SCOPE LEAK + CLOCK-OUT GATE (NGHIÊM TRỌNG, đã xác minh code, không chỉ docs): RPC clock-in employee_clock_in_with_checklist (20260615130000 dòng 207) snapshot TOÀN BỘ item của template theo i.template_id = v_template_id, KHÔNG lọc shift → mọi item scope=opening/closing/weekly lặp ở CẢ ca sáng lẫn ca chiều. Đồng thời gate clock-out employee_request_clock_out (20260609100000 dòng 108-116) đếm count(*) WHERE is_done=false KHÔNG có filter is_required → CHẶN checkout khi BẤT KỲ item nào (kể cả required=false) chưa xong. Hệ quả trực tiếp: NV ca sáng bị bơm item 'Đếm tiền cuối ca, chốt ca' / 'Tắt màn hình' / 'Báo cáo tồn kho cuối ngày' (closing) → không thể hoàn thành → BỊ KHÓA checkout ca sáng. Phải fix lọc-theo-ca TRƯỚC khi seed bất kỳ bộ nào có scope khác every_shift.
- scope KHÔNG TỒN TẠI trong DB (đã xác minh): shift_checklist_template_items + attendance_checklist_items chỉ có phase (CHECK chỉ dau_ca/trong_ca/cuoi_ca), done_definition (<=240), is_required, title, sort_order, is_active. Trường 'scope' trong toàn bộ 7 bộ sẽ bị BỎ QUA âm thầm khi seed (upsert chỉ đọc title/phase/doneDefinition/isRequired). 4 chiều scope (every_shift/opening/closing/weekly) là tầng phân loại MỚI chưa persist được → owner phải quyết (a) ALTER TABLE ADD COLUMN scope + CHECK + sửa upsert + sửa snapshot RPC lọc theo shift, hoặc (b) tách 2 template sáng/chiều gán theo shift_assignment. Chưa làm 1 trong 2 thì MỌI scope != every_shift đều vô nghĩa.
- 'Kiểm tra hao hụt/báo cáo tồn kho' xuất hiện ở 6/7 vị trí (waiter, kitchen_helper, cashier, chef, head_chef, branch_manager) — đồng nhất phase=cuoi_ca, scope=closing, required=true. KHÔNG xung đột phân loại, nhưng nếu để required=true mà chưa lọc scope thì sẽ chặn checkout ca sáng ở cả 6 vị trí (xem conflict 1). Ngoài ra chồng việc: cùng 1 ca chiều, 6 người cùng 'báo cáo tồn kho' — owner cần làm rõ ai là người chốt số cuối (thường head_chef/branch_manager chốt, các vị trí khác chỉ đếm khu của mình) để done_definition không bị hiểu là 6 báo cáo trùng.
- 'Đóng gói đồ chua / canh mang về' (cashier) đã được phân loại trong_ca trong bộ Quầy, nhưng đây là quyết định người soạn ĐÃ CHUYỂN từ dau_ca→trong_ca. Nếu owner coi là setup thuần đầu ca thì lệch với cách waiter setup quầy (dau_ca). Cần thống nhất: việc bù-liên-tục-khi-hết-hàng = trong_ca, việc bày-sẵn-1-lần = dau_ca.
- Title 'Vệ sinh dụng cụ/đồ dùng đã sử dụng' diễn đạt khác nhau giữa các vị trí: waiter='Vệ sinh toàn bộ vật dụng: khay, hũ đựng', kitchen_helper='Vệ sinh dụng cụ, đồ dùng đã sử dụng', cashier='Rửa sạch dụng cụ, đồ dùng đã sử dụng', chef='Rửa sạch dụng cụ, vỉ nướng đã sử dụng'. Cùng bản chất (cuoi_ca/every_shift/required) nhưng câu chữ lệch → nên chuẩn hoá 1 mẫu, cho phép hậu tố đặc thù ('khay, hũ' / 'vỉ nướng').
- 'Vệ sinh khu vực (cuối ca)' title lệch: waiter='Vệ sinh khu phục vụ', kitchen_helper='Vệ sinh khu vực bếp', chef='Vệ sinh khu bếp', cashier='Dọn dẹp, vệ sinh quầy', head_chef='Vệ sinh toàn bộ khu vực làm việc cuối ca', cleaner='Dọn dẹp, vệ sinh sạch sẽ khu vực phục vụ'. Cùng phase/scope/required → chuẩn hoá mẫu 'Vệ sinh khu vực làm việc cuối ca' + biến thể khu (phục vụ/bếp/quầy).
- 'Đối chiếu doanh thu cuối ngày' chỉ có ở branch_manager (cuoi_ca/closing/required) NHƯNG waiter có 'Đếm tiền cuối ca, chốt ca' và file gốc Quầy KHÔNG có việc tiền. Owner cần làm rõ phân vai tiền cuối ngày: ai chốt ca POS (waiter/cashier) vs ai đối chiếu tổng doanh thu (branch_manager) — tránh 1 việc tiền bị tính 2 lần hoặc bỏ sót ở Quầy.
- 'Nạp doanh thu vào tài khoản công ty' (branch_manager) là scope=weekly DUY NHẤT trong cả 7 bộ. Với mô hình snapshot theo-ca, scope=weekly KHÔNG có cơ chế hiển thị (sẽ lặp mọi ca hoặc không bao giờ hiện). Cần owner quyết cơ chế (vd chỉ bơm vào checklist ca chiều thứ N hằng tuần) — đây là chiều scope thứ 4 chưa có hạ tầng.
- Vị trí 'Tạp vụ' KHÔNG có canonical code (bộ chỉ có 11 mã: owner, super_manager, branch_manager, warehouse_manager, production_manager, head_chef, kitchen_helper, chef, cashier, waiter, office). Excel ghi Bộ Phận='Quầy' nhưng nội dung 100% tạp vụ/vệ sinh. Các việc dùng-chung (chấm công, đồng phục, vệ sinh cuối ca) của Tạp vụ chưa thể gắn vị trí → owner quyết thêm code mới (vd cleaner) đồng bộ SQL mapper + TS twin POSITION_CODE_TO_STAFF_ROLE, hay giữ template Global không code.
- Phase chấm công: kitchen_helper/cashier/chef đều để 'Chấm công' phase=dau_ca/scope=every_shift (đồng nhất). waiter KHÔNG có item 'Chấm công' tường minh (chỉ có 'Đếm tiền đầu ca, mở ca'). branch_manager/head_chef cũng KHÔNG có 'Chấm công' (chỉ có 'Chỉnh trang đồng phục'). Không xung đột phân loại nhưng THIẾU đồng bộ: nếu chấm công là việc checklist chuẩn cho mọi NV thì waiter/branch_manager/head_chef nên có; nếu chấm công là hành vi hệ thống (clock-in screen) thì nên BỎ khỏi mọi checklist để tránh trùng (chef/kitchen_helper/cashier đang coi nó là item checklist trong khi bản thân clock-in đã là sự kiện hệ thống).

## Khuyến nghị triển khai

- FIX HẠ TẦNG TRƯỚC KHI SEED (chặn): trong cùng 1 migration mới (KHÔNG sửa file đã apply 20260610170000/20260615130000 — kỷ luật no-tombstone), làm 2 việc: (1) ALTER TABLE shift_checklist_template_items + attendance_checklist_items ADD COLUMN scope text NOT NULL DEFAULT 'every_shift' + CHECK (scope IN ('every_shift','opening','closing','weekly')); (2) sửa employee_clock_in_with_checklist để snapshot LỌC theo ca: ca sáng nhận scope IN ('every_shift','opening'), ca chiều nhận scope IN ('every_shift','closing'); scope='weekly' xử lý riêng (chỉ bơm theo lịch tuần). Cập nhật upsert đọc thêm trường scope.
- SIẾT GATE CLOCK-OUT theo is_required: hiện gate đếm MỌI is_done=false (dòng 108-116) → việc required=false ('Lau cửa kính', 'Thay vỉ khi đen', 'Quét khi dơ', 'Lau sàn bếp khi dơ', 'Tưới cây') vẫn chặn checkout, mâu thuẫn với ý nghĩa required=false. Đề xuất owner: thêm AND i.is_required = true vào count gate để required=false là tuỳ chọn thật. (Nếu owner muốn mọi việc đều bắt buộc thì nên bỏ luôn cột is_required cho khỏi gây hiểu nhầm.)
- Tạo 'thư viện việc dùng-chung' (shared task library) canonical cho 12 việc lặp ở >=2 vị trí (xem sharedTasks): mỗi việc 1 title + phase + scope + required + done_definition chuẩn, các vị trí tham chiếu thay vì chép tay → loại drift câu chữ (vệ sinh dụng cụ, vệ sinh khu vực, chấm công, đồng phục, kiểm tra tồn kho, mở/tắt thiết bị, đếm tiền mở/chốt ca). Cho phép hậu tố đặc thù vị trí ('khay/hũ', 'vỉ nướng', 'KDS' vs 'màn hình phục vụ').
- Chuẩn hoá 'Mở/Tắt thiết bị đầu-cuối ngày' thành 1 cặp việc dùng-chung: 'Mở màn hình phục vụ/KDS' (dau_ca/opening) + 'Tắt màn hình phục vụ/KDS' (cuoi_ca/closing). waiter dùng biến thể 'màn hình phục vụ', cashier dùng 'KDS' — giữ phase/scope/required đồng nhất.
- Quyết phân vai TIỀN & TỒN KHO cuối ngày để tránh trùng 6 báo cáo: đề xuất chỉ branch_manager 'Đối chiếu doanh thu cuối ngày' + chốt tổng tồn; cashier/waiter chỉ 'chốt ca POS' khu mình; các vị trí bếp (kitchen_helper/chef/head_chef) chỉ 'báo cáo tồn nguyên liệu khu mình'. Viết done_definition rõ phạm vi ('khu của mình' vs 'toàn cửa hàng') để 6 việc không bị hiểu là 6 báo cáo trùng.
- Bổ sung 'Chấm công vào ca' cho waiter/branch_manager/head_chef NẾU owner coi chấm công là item checklist chuẩn (hiện chỉ 3/7 vị trí có) — HOẶC bỏ hẳn 'Chấm công' khỏi mọi checklist vì clock-in đã là sự kiện hệ thống tách biệt (tránh việc người dùng phải tự tick 'đã chấm công' sau khi hệ thống đã ghi nhận). Chọn 1 trong 2 cho đồng nhất 7 bộ.
- Quyết cơ chế scope=weekly ('Nạp doanh thu vào tài khoản công ty'): vì snapshot theo-ca không có chiều tuần, đề xuất tách riêng — chỉ bơm item này vào checklist ca chiều của 1 ngày cố định trong tuần (vd Chủ nhật), hoặc tạo loại task 'theo tuần' riêng ngoài luồng snapshot per-shift. Không để chung scope với opening/closing.
- Quyết định position code cho 'Tạp vụ': nếu thêm 'cleaner' vào bộ canonical, phải cập nhật ĐỒNG THỜI trong cùng PR: (1) SQL mapper staff_role_from_position_code + position_code_from_staff_role (20260610230000), (2) TS twin POSITION_CODE_TO_STAFF_ROLE ở packages/shared/src/auth/types.ts. Nếu không thêm code thì để template Global (branch_id IS NULL) không gắn code và tài liệu hoá rõ.
- Hợp nhất template waiter với seed cũ (block 'Phục vụ' dòng 1051-1060 trong 20260610170000) qua migration mới (INSERT/UPDATE, KHÔNG sửa file đã apply): seed cũ có thêm 2 việc trong_ca ('Lau bàn sau mỗi lượt khách', 'Thu gom chén dĩa dơ về khu rửa') mà bộ Excel mới THIẾU — owner cân nhắc giữ 2 việc trong_ca này để waiter không bị trống phase trong_ca (đây là việc thực tế có, không phải bịa).
- Sau khi chốt phân loại, regen baseline lint (pnpm lint:i18n:baseline) nếu có đụng comment/string trong code; chạy pnpm lint:rules-mirror + lint:guard-sync nếu migration đụng vùng mirror SQL↔TS hoặc guard prod-db. Ghi quyết định owner (scope column hay 2-template, cleaner code hay không, gate is_required) vào docs/plan/decisions.md NGAY để các agent khác không dựng lại từ docs cũ.
