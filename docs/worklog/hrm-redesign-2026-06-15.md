# HRM redesign — gom về trục Người · Ngày công · Lương (2026-06-15)

> Tiếp nối `hrm-truc-ngay-cong-2026-06-10.md` (P1 + P2). Owner phản hồi:
> workflow UX vẫn khó cho cả quản lý lẫn nhân viên; từng tính năng cần sắp xếp
> lại + bổ sung. Bản này là T3 contract cho đợt tái sắp HRM, áp phễu **D012**
> và quyết định "1 trục Ngày công". Debate 4 vai chạy bằng workflow đa tác tử
> (18 agents, phản biện đối kháng), verify trực tiếp code + prod.

## Bằng chứng (prod `iexwsuaqqenyjiskawoj`, SELECT-only, 2026-06-15)

| Chỉ số | Giá trị | Hệ quả |
| --- | --- | --- |
| `attendance_records` status | 46/46 `present`, 0 late/absent/half_day | taxonomy 4 trạng thái là **code chết**; cột Đi muộn/Vắng/Nửa ngày luôn = 0 (UI lừa dối) |
| `attendance_records.shift_id` NULL | 33/46 (72%) | mọi cơ chế suy trạng thái bằng so giờ-ca bất khả thi |
| Ca treo (`check_out` NULL & `date` < hôm nay) | 16/46 | payroll đếm `present` không xét `check_out` → tính trọn 1 công cho ca treo |
| `standard_days` (payroll-actions.ts:114-118) | đếm chỉ T2–T6 | quán mở 7 ngày → `working > standard`, prorate **không clamp** → lương > base |
| `employment_contracts` / `payroll_periods` / `payroll_entries` | 0 / 0 / 0 | `calculatePayroll` luôn fail "Không có hợp đồng"; lương thật 100% Excel |
| `employees.base_salary` > 0 / dependents > 0 | 0/32 / 1/32 | không nguồn nạp lương trong app |
| NV active có `default_checklist_template_id` | 6/32 | checklist adoption gần tắt sau P2 |
| `leave_requests` | 0 dòng | nghỉ phép chưa ai dùng |
| `checkIn`/`bulkCheckIn`/`checkOut` (hr/actions.ts) | 0 caller | dead code + comment provenance (vi phạm no-tombstone) |
| Lối vào `/hr/payroll` | 0 link từ nav/`/hr` (chỉ list→detail) | payroll **mồ côi** — chỉ vào bằng gõ URL (khác D013: chưa có quyết định ẩn-có-chủ-đích) |

> Lưu ý nav: nav đang trong đợt refactor office-shell (D019). Xác nhận lại điểm
> wiring chính xác (`nav-config.ts` / `office-nav.ts` / `module-nav.ts`) tại thời
> điểm implement; kết luận "payroll không có trong nhóm nav nào" giữ nguyên.

## Chẩn đoán gốc

1. HRM dựng **theo bảng dữ liệu** (5 tab = 5 bảng CRUD rời), không theo công việc của chủ.
2. **"Trục Ngày công" mới có tên, chưa có thân** — ngày công chỉ là số tính ngầm lúc tính lương, không phải surface.
3. **Taxonomy chấm công present/late/absent/half_day là chết** — chỉ ghi `present`; vắng = không có dòng.
4. **Vòng lương inert** — chưa từng chạy, thực tế Excel (đúng blueprint Phase 3 / todo M7).
5. **Phân ca đã bỏ vĩnh viễn** — ca chỉ là nhãn giờ; KHÔNG xây lại rostering.

## Debate 4 vai (condensed — bản đầy đủ: kết quả workflow `hrm-debate`)

**PM** — scope = sắp xếp lại IA `/hr` từ 5 tab "theo bảng" về **3 trục theo công việc**
(Người · Ngày công · Lương); hạ Ca + mẫu Checklist xuống "Thiết lập" (ít chạm);
trục Ngày công hợp nhất Chấm công + Nghỉ-phép-đã-duyệt + Việc-ca (dữ liệu đã hội
tụ sẵn trong `attendance-table`). PWA nhân viên: card ngày công + giờ thực, gỡ
kẹt kết ca, "Xin nghỉ" thành quick-action. KHÔNG mở rộng phạm vi DN.

**BA** — rules: mọi đề xuất qua phễu D012 (giảm thao tác hằng ngày, không thêm
nghi thức); helper `standard_days` phải shared giữa schedule + payroll (cùng 1
SSoT để khớp phiếu lương); `cancelCheckoutRequest` cần guard server (RLS) chống
race với approve; notification nghỉ phép theo bucket sẵn có; ngưng việc NV cần
`end_date` để payroll prorate đúng tháng nghỉ (engine đã giả định
terminated-within-period).

**Senior Dev** — approach theo 3 đợt (§ Lộ trình). Đợt 1 không phụ thuộc owner +
không đụng payroll; bug `standard_days` + clamp prorate chặn bởi câu hỏi "quán
mở 7 ngày?". Onboarding 1 bước = `createUser` + insert `employees` trong 1
transaction (rollback nếu insert lỗi). Dead code xóa sạch (no tombstone) rồi
regen `lint:i18n:baseline`. Risk chính: state machine `today-work-state` (nhắc
ca treo) + write action mới (`cancelCheckoutRequest`, đóng ca treo) → T3.

**QA/QC** — gates: full `pnpm typecheck && lint && build` + web/shared suites mỗi
PR; helper ngày-công có test khóa công thức = payroll; `cancelCheckoutRequest`
test guard race; xóa dead code phải verify 0 caller bằng grep 6-channel + regen
i18n baseline (count khớp). Verify lại nav wiring trước khi đụng IA.

## Quyết định từng tính năng (qua phễu D012)

| Tính năng | Sắp xếp lại | Bổ sung (GIỮ) | LOẠI |
| --- | --- | --- | --- |
| Nhân viên | tạo NV 1 bước (bỏ dán UUID); sheet chi tiết; SĐT vào bảng; đổi nhãn `/admin/staff` → "Tài khoản & phân quyền" | `updateEmployee` + ngưng việc (`is_active`+`end_date`) | field lương/contract/bank trong form tạo NV (sai nguồn lương, đụng Phase 3) |
| Ca làm | giờ check-in/out THỰC làm con số chính, ẩn ca khi `shift_id` NULL; cột "Đang dùng" | (chờ owner: ca còn giữ không) | rostering/đăng ký ca; "giờ mở cửa" (chặn tới khi owner chốt) |
| Checklist | đồng bộ cổng kết ca UI↔RPC; gỡ cột "X/Y bắt buộc" | nút "Gán theo vị trí" (RPC sẵn, chỉ match Global) — **gated owner** | ép bằng chứng ảnh mọi item; tầng duyệt từng item |
| Chấm công | bỏ 3 cột lừa dối → "Số công" + "Ca chưa kết"; nhãn "Treo"; nhắc ca treo; xóa dead code | nút "Đóng ca treo" (không auto theo end_time); ca treo không tính trọn công | auto-late; auto-absent theo `is_active` |
| Nghỉ phép | "Xin nghỉ" quick-action ở Hôm nay; gộp pending toàn-CN; "Hôm nay nghỉ phép" ở Hôm nay | notification 2 chiều; quản lý ghi nhận hộ (cả ngày đã qua) | số dư phép; tự ghi attendance/chặn chấm công; duyệt nhiều tầng |
| Ngày công | tab "Chấm công" → "Ngày công"; card tổng ở `/employee/schedule`; helper `standard_days` shared | **sửa bug `standard_days` 7 ngày + clamp ≤ base** — gated owner; surface lưới chốt-công **hạ ưu tiên** (Phase 3) | sinh tự động trễ/vắng/nửa-ngày; bảng `work_days` song song |
| Bảng lương | gỡ orphan (link `/hr`→`/hr/payroll`); empty-state dẫn dắt; PIT trên phiếu | nút Export Excel/CSV; view đối chiếu Ngày công trước Duyệt | bảng OT kiểu DN; sửa entry sau approved; ép wire BHXH/PIT bỏ Excel ngay |

## IA đề xuất

- **Quản lý:** gom 5 tab → **3 trục Người · Ngày công · Lương**. Ca + mẫu
  checklist → "Thiết lập" (ít chạm). `defaultTab` động: owner → Người, BM → Ngày
  công. Khi W5 gộp `/hr` vào `/ops` (Hoàng): mang Người + Ngày công + Thiết lập;
  **tách Lương** ở lại lớp Quản trị owner (Phase 3).
- **Nhân viên (PWA):** bottom-nav 4 mục, đổi "Lịch" → "Công" (gắn card ngày
  công); "Xin nghỉ" quick-action; fallback upload ảnh khi camera lỗi;
  `cancelCheckoutRequest` để staff tự rút yêu cầu kết ca.

## Lộ trình 3 đợt

- **Đợt 1** (sửa đau ngay; phần lớn **không cần owner**): dọn 3 cột lừa dối + "Số
  công"/"Ca chưa kết"; nhãn "Treo"; `cancelCheckoutRequest` + "đã gửi lúc HH:mm";
  nhắc ca treo trên `/employee`; xóa dead code + provenance; đổi nhãn tab → "Ngày
  công"; card ngày công + giờ thực cho nhân viên (helper shared). **Gated owner:**
  sửa bug `standard_days` + clamp.
- **Đợt 2** (NV/nghỉ phép/checklist): tạo NV 1 bước + `updateEmployee` + ngưng
  việc + SĐT; notification nghỉ phép 2 chiều + quick-action + gộp pending toàn-CN;
  checklist tùy owner (gán-theo-vị-trí *hoặc* xóa dead code); đổi nhãn
  `/admin/staff`.
- **Đợt 3** (lương đầy đủ = Phase 3 / M7, **chặn tới khi owner chốt bỏ Excel**):
  UI nhập base_salary + dependents + gỡ phụ thuộc 0-contract; Export Excel; view
  đối chiếu Ngày công; PIT trên phiếu.

## Dứt khoát KHÔNG làm

1. Rostering/phân ca/đăng ký ca/cho NV chọn ca (đã DROP vĩnh viễn, 0 dòng prod).
2. Auto-late / auto-absent / auto-đóng ca theo `end_time` (72% NULL shift; nghi thức DN).
3. Field lương/contract/bank trong form tạo NV (sai nguồn lương; đụng Phase 3).
4. Số dư phép / quỹ phép / duyệt nhiều tầng / ép bằng chứng ảnh mọi checklist item.

## Owner đã chốt (2026-06-15 → D026)

1. **Ngày công chuẩn:** `standard_days` = số công chuẩn cố định owner nhập/tháng + **clamp** `working/standard ≤ 1`. Bỏ công thức T2–T6. → bug Đợt 1 unblocked.
2. **Checklist:** GIỮ, gán theo `positions.code` mặc định + override theo người.
3. **Lương:** vào app qua `employees.base_salary` (UI nhập base_salary + dependents vào hồ sơ NV; gỡ phụ thuộc 0-contract). ĐẢO phần "LOẠI field salary trong form" của bảng dưới.
4. **Ca làm:** GIỮ, hạ xuống "Thiết lập"; màn nhân viên hiện giờ thực.

**Còn mở (owner trả lời sau):** payroll vào nav hay ẩn-có-chủ-đích; gộp `/admin/staff`+`/hr` ngay hay chờ W5; ảnh selfie có ai dùng.

## Rework per-shift (2026-06-15 → D027) — ĐỔI MÔ HÌNH NỀN

Owner xác nhận: **TOÀN BỘ NV làm 2 ca/ngày** (sáng 06–13, chiều 16–21, nghỉ trưa 13–16). Prod chứng minh mô hình 1-dòng/ngày KHÔNG ghi nổi: span vào→ra TB **7.0h** (= 1 ca), **49% không check-out**, mỗi người/ngày chỉ ghi được 1 ca (lúc sáng lúc chiều), 47 bản ghi/14 NV/7 ngày (adoption thấp). → Đảo giả định nền của bản debate này.

**Mô hình mới (D027) — owner đã chốt cả 3 lựa chọn:**
- Chấm công theo **CA** (1 bản ghi/ca; unique `employee,date,shift`); **mỗi ca vào/ra riêng** (4 mốc/ngày).
- **Ca làm = XƯƠNG SỐNG**, phạm vi **Global** (1 bộ chung cả 4 chi nhánh), đặt ở "Thiết lập"; auto-nhận ca theo giờ check-in.
- **Ngày công:** đủ 2 ca = 1 công, 1 ca = 0.5 công (`half_day` có nghĩa thật); `working_days = Σ_ngày(min(ca,2)×0.5)`.
- **Checklist theo từng ca** (snapshot riêng sáng/chiều).

**Đảo thứ tự ưu tiên:** Thiết lập Ca (Global, đủ 2 ca) → chấm công per-shift → ngày công → lương. **Ca là bước 1.**

**Tác động lên bảng "Quyết định từng tính năng" ở trên (cập nhật):**
- *Ca làm:* GỠ "ít giá trị" → NỀN. Thiết lập Ca phải seed 2 ca Global + đảm bảo mọi chi nhánh có ca (lý do 72% `shift_id` NULL).
- *Chấm công:* thêm per-shift sessions; `today-work-state` thành 2-ca/ngày; clock-in tìm ca theo giờ → tạo bản ghi cho ca đó (không còn "đã chấm hôm nay" chặn ca 2); checkout/cancel theo ca đang mở.
- *Ngày công:* `working_days = Σ ngày(min(ca,2)×0.5)`; Đợt-1 (a) "Số công = số dòng" → sửa thành công = Σ ca/2 sau rework.
- *Checklist:* snapshot per ca.

**Slice T3 (schema migration → file→PR→owner applies; env dev trỏ prod, KHÔNG test local):** migration (đổi unique + `shift_id` NOT NULL + cho phép shift Global + seed 2 ca + backfill `shift_id` dòng cũ theo `resolveDefaultShiftId`) → clock flow per-shift → `today-work-state` 2-ca → ngày-công recompute → checklist per-ca → UI Thiết lập Ca (Global) + màn nhân viên hiển thị 2 ca.

## Câu hỏi owner phải quyết (gate từng đợt) — ĐÃ CHỐT 1–4 ở D026; per-shift ở D027; phần "Còn mở" trên

1. **[chặn bug Đợt 1]** Quán mở thật 7 ngày hay có ngày nghỉ tuần cố định?
   `standard_days` tính theo gì? Lương vượt base khi làm cuối tuần là cố ý (trả
   thêm) hay lỗi cần clamp ≤ base? "1 công" = chấm-vào đủ hay phải có `check_out`?
2. **[chặn Đợt 2 checklist]** Checklist ca còn dùng thật không? Nếu giữ: gán theo
   `positions.code` mặc định hay chỉ cần nút "gán theo vị trí" chạy theo nhu cầu?
3. **[chặn Đợt 3]** Khi nào chuyển payroll Excel → app? Nguồn lương ở
   `employees.base_salary` hay khôi phục UI hợp đồng? HKD Má Tư có thực đóng BHXH?
4. **[IA]** "Ca làm" còn giữ hay bỏ hẳn khỏi HRM? Payroll thêm vào nav hay ghi
   quyết định ẩn-có-chủ-đích? Gộp `/admin/staff` + `/hr`-employees ngay hay chờ
   W5? Ảnh selfie check-in có ai xem/dùng không?

## Trạng thái

- [x] Contract viết trước khi code (file này).
- [x] Owner chốt 4 quyết định nền → `decisions.md` **D026** (2026-06-15).
- [ ] Đợt 1: tracked `tasks/todo.md` (no-owner items + bug `standard_days` theo D026 §1).
- [ ] Đợt 2/3: theo D026 (checklist `positions.code`, NV CRUD, lương qua `base_salary`).
- [ ] Còn mở: payroll-nav / gộp staff+hr / selfie review — chờ owner.
