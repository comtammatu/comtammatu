# Daily close (chốt ngày chi nhánh) — T3 contract (2026-06-12)

Contract tổng hợp từ T3 debate 4 góc nhìn (PM/BA/Dev/QA) + grounding code/prod. Ưu tiên #2 của D015.
Trạng thái: spec chốt, **chờ 2 input trước khi code**: (1) kết quả paper-trial của Hoàng tuần này, (2) owner OK 4 quyết định ở cuối file.

Skill plan: repo rules = engineering + database + ui + workflow; external skills = none; runtime tools = repo search + prod SELECT-only; skipped = browser (chưa có UI).

## Phát hiện nền (đã verify code + prod)

- **Tầng chốt ca thu ngân ĐÃ HOÀN CHỈNH, không đụng**: `close-session-sheet.tsx` (đếm tiền theo mệnh giá → đối chiếu expected vs counted) + RPC `close_pos_session` (expected_cash = opening + cash-only; threshold max(50k; 0,5%); D8 không block variance — chỉ alert manager qua `trg_notify_pos_shift_variance`; carry-forward đơn unpaid D1) + `enqueue_shift_close_print` (idempotency `session:{id}:shift_close`, có discount_total). Lịch sử ca: `/br/[branchId]/settings/pos-sessions` (manager-only).
- **Tầng chốt NGÀY chưa tồn tại**: không bảng/RPC daily_close nào; `fiscal_periods`/`accounting_periods` đều là THÁNG; mảnh day-level hiện có đều là report theo range (`get_cash_variance_summary`, `fn_reconcile_sales_by_day`, `mv_daily_revenue` refresh 06:15 sáng hôm sau), không phải nghi thức xác nhận.
- **Prod chứng minh gap bằng số (14 ngày)**: 0/29 ca closed có variance note (acknowledgment 0%); 26/29 ca lệch ≠0, avg |497.864đ|, max 4,66tr; 1 ca treo open 70,6h (id=378, branch 2) không ai phát hiện; print phiếu chốt ca fail 9/27 (33%); HĐĐT tạo ≈1:1 nhưng KẸT chưa-issued 7–11 đơn/ngày (toàn bộ ở `draft`); push notification = 0 subscription (manager chỉ thấy alert nếu vào `/notifications`).

## Đồng thuận 4 góc nhìn

1. CÓ build, chỉ tầng chốt-ngày của branch manager; tầng thu ngân đóng băng theo D8.
2. Daily close = **nghi thức xác nhận + snapshot**, không phải report mới, không phải write-lock DB (M0). Exception: resolve hoặc acknowledge-có-lý-do, không hard-block kiểu doanh nghiệp.
3. Hệ quy chiếu tiền duy nhất trên màn = **tiền-đã-thu** (cash basis): doanh thu bucket theo `paid_at` VN-date (khớp `mv_daily_revenue`); variance két theo `closed_at` VN-date của ca (khớp `get_cash_variance_summary`). Hai trục được phép lệch, có chú thích — không ép khớp (prod có ca vắt 8 ngày). Không đưa lãi gộp/food-cost lên màn (định nghĩa metric đang chờ owner, tasks/todo.md:11).
4. Snapshot tính trực tiếp từ `orders`/`payments`/`pos_sessions` trong transaction chốt — KHÔNG đọc `mv_daily_revenue` (stale lúc chốt tối).
5. M0 = attestation row; **M1 (chặn mutation ngày đã chốt + adjustment event) chỉ build sau khi trial + tuần đầu chạy thật chứng minh nghi thức sống** (phễu D012: Hoàng bỏ ≥3/7 ngày giấy → không build lock, dừng ở màn read-only + confirm).
6. Mutation hợp lệ SAU chốt không bị cản (M0 lẫn M1): HĐĐT draft/signing→issued (cron reconcile), thanh toán đơn carry-forward vào ngày sau (tính doanh thu ngày thu), refund (= event mới + journal posted ngày phát sinh, snapshot gốc không đổi).

## Xung đột → phân xử

| Xung đột | Phân xử |
|---|---|
| Gate ca-open: BLOCK (PM/BA/Dev) vs WARN (QA sợ Hoàng kẹt — ca 378 treo 70,6h) | **BLOCK + lối thoát tại chỗ**: còn ca open của branch → không chốt được, màn hiện ca treo + CTA "Đóng ca" ngay tại màn (branch_manager có `pos:close_shift`). Không dead-end. Trial đo tần suất để xác nhận hay hạ xuống warn. Trước rollout phải dọn ca 378 + làm rõ vì sao branch 2 ngừng đóng ca sau 06-10. |
| "pgTAP cho RPC mới" vs thực tế repo | QA đúng: repo KHÔNG có pgTAP — convention là psql DO-block BEGIN…ROLLBACK trong `supabase/tests/`, CI chưa chạy DB test. Test daily-close theo convention hiện hữu, chạy trên local stack (baseline + ~34 forward). Harvest pgTAP (D015 mục a) là dự án hạ tầng riêng, daily close không block trên nó. |
| Immutability tuyệt đối, không reopen (BA) vs reopen có gate (Dev) | Có `reopen_business_day` nhưng: permission riêng `pos:reopen_day` chỉ owner/super_manager (Hoàng tự chốt không tự mở), reason bắt buộc, `log_audit` giữ snapshot cũ trong old/new payload — bảng giữ bản mới nhất, audit giữ lịch sử. Không có state thứ 3 "locked" (đó là việc của khóa kỳ tháng/quý — D013). |
| Reuse `get_cash_variance_summary` vs "không viết lại cái đã có" | RPC finance tự gate `finance:view` mà branch_manager không có; nới gate = chạm finance cockpit. Chấp nhận copy ~15 dòng predicate aggregate vào RPC mới, ghi chú nguồn — rẻ hơn mọi phương án khác. |
| Route riêng vs chôn vào settings (W5 IA pending) | Route riêng `/br/[branchId]/daily-close` + ModuleKey `daily_close` — nghi thức hằng ngày không nằm dưới "Cài đặt". W5 land sau thì move route là việc nhỏ. |

## Contract

**UI Authority declaration** (bắt buộc theo ui.md): surface = màn chốt ngày chi nhánh; primary user job = branch manager xác nhận ngày bán sạch trong ≤3 tap; route family = `/br/[branchId]/daily-close` (branch-scoped, mobile-first 1 cột); change type = UX flow mới; primitives = AppPage/AppPageHeader, KpiCard, Item/ItemGroup + StatusBadge, Button touch (min-h-12), confirm() từ @comtammatu/ui, FormDialog + TextareaField (reopen), loading/error frames W0.

**Schema** — bảng `daily_closes`: id identity PK, tenant_id, branch_id, close_date DATE, status CHECK ('closed','reopened'), closed_by/closed_at, reopened_by/reopened_at/reopen_reason, note, snapshot JSONB NOT NULL, cột typed để aggregate: total_revenue, cash_revenue, transfer_revenue, session_count, total_cash_variance, unpaid_order_count, invoice_stuck_count, print_fail_count. UNIQUE(tenant_id, branch_id, close_date). Vắng row = chưa chốt. RLS + GRANT SELECT to authenticated; không grant INSERT/UPDATE — mutation chỉ qua RPC.

**RPC** (SECURITY DEFINER, verb_noun, lỗi map qua rpc-error-map):
1. `get_daily_close_status(branch_id, date)` → checklist JSONB: ca (closed list + open blocking), variance tổng + per-session, desync payment-order (logic `find_payment_order_desync` inline), độ phủ HĐĐT (completed vs issued + tuổi kẹt), print fail (+ link re-enqueue, idempotency cũ chống double), đơn treo carry-forward, row đã chốt nếu có. Là SSOT snapshot — `close_business_day` gọi lại chính nó.
2. `close_business_day(branch_id, date, note?)` → BLOCK chỉ 2: còn ca open của branch; date tương lai. Mọi thứ khác WARN ghi `exceptions[{code,count,ack_reason}]` vào snapshot. Idempotent: ON CONFLICT trả `already_closed=true` (an toàn double-tap). `log_audit` mỗi lần.
3. `reopen_business_day(branch_id, date, reason)` → gate `pos:reopen_day`, reason bắt buộc, audit. Adjustment RPC: DEFER (ledger event sẵn có refunds + journal_entries + audit đủ cho v1; nâng cấp nếu trial cho thấy hồi tố thật).

**Permission**: 2 key mới `pos:close_day` (owner/super_manager/branch_manager) + `pos:reopen_day` (owner/super_manager). Migration PHẢI update role_templates KÈM sync rows hiện hữu (bài học bug leave 0-grants).

**Ngày zero-session** (quán nghỉ): không bắt buộc chốt, không backfill; cho phép chốt noop tự nguyện (note "nghỉ") để phân biệt quên-chốt.

**Rollout/rollback**: PR1 = migration thuần (owner apply, zero runtime impact) → PR2 = shared keys + ACL + labels + action + UI (deploy SAU apply). Cờ `DAILY_CLOSE_ENABLED` default false (pattern HDDT_*_ENABLED): off = ẩn nav + action từ chối. Rollback = tắt cờ + quay về form giấy chuẩn hóa từ trial (form giấy giữ làm SOP dự phòng, không vứt). Không bao giờ migration ngược.

**Ratchet phải né**: vnd-format-ssot (formatVND), status-label-ssot (labels vào `packages/shared/src/labels/vi.ts`), stat-card-ssot (KpiCard), responsive-double-render + use-is-mobile-budget=0 (không twin/useIsMobile mới), no-native-dialog, heading-scale/button-height/icon-size, comment English-only (khỏi regen i18n-baseline).

**File list dự kiến**: migration ~400 dòng; permissions.ts +2 key; module-acl.ts; nav-config; labels/vi.ts; `daily-close/page.tsx` ~120 + client ~250–350 + actions ~120 (withAction + Zod) + loading/error ~40. Ước lượng human-pace: **6–8 ngày công, ~2 tuần lịch** (gồm vòng PR + owner apply + deploy ordering; test migration qua local stack vì không còn dev DB).

## Test plan (QA)

- **SQL test** `supabase/tests/daily_close_*_test.sql` (psql DO-block, local stack): happy path + audit; block ca-open (kèm CTA data); double-close idempotent; reopen permission + audit; RLS chéo branch + cashier bị từ chối; timezone biên 23:59/00:01 VN; ca đóng sau nửa đêm gán đúng trục; snapshot bất biến khi refund/void sau chốt; mutation hợp lệ sau chốt KHÔNG bị chặn (webhook muộn, invoice flip issued, trả tiền đơn carry-forward).
- **Unit** (tsx --test): Zod schema, error map không leak raw message, permission flag threading.
- **Regression giữ nguyên**: `close_pos_session` không đổi 1 dòng; trigger variance vẫn fire (so count notification trước/sau deploy); print idempotency key cũ; carry-forward D1; `/finance/reconciliation` + `mv_daily_revenue` khớp snapshot cùng quy ước ngày sau refresh; `accounting_periods` tháng không bị đụng.
- **Nghiệm thu prod**: 3 tối × 2 chi nhánh chạy song song form giấy — pass khi 100% buổi khóa được không cần dev, ≤5 phút/chi nhánh, 0 lệch không-giải-thích-được với /finance, nhịp tầng ca không đổi. Fixture lấy số thật: ca lệch 4,66tr, ngày kẹt 9 invoice, ngày print fail 3/3. Ngưỡng đỏ day-level calibrate từ trial — không được đỏ >50% số ngày (chống alarm fatigue kiểu variance_note 0%).

## Form giấy cho Hoàng (7 tối, ~2 phút/tối — dữ liệu quyết định spec)

Mỗi tối, mỗi chi nhánh ghi: (1) giờ bắt đầu + kết thúc chốt (trước/sau 0h?); (2) thiết bị trong tay (điện thoại/tablet/máy quầy); (3) số ca trong ngày + ca nào còn open lúc chốt, lý do, xử lý thế nào (gọi thu ngân? tự đóng?); (4) tiền: có ĐẾM LẠI két cuối ngày không hay tin số từng ca — nếu đếm, ghi số đếm vs số cộng ca; (5) tổng lệch quỹ ngày + nguyên văn note khi có lệch (làm preset reasons); (6) số đơn treo chưa thu; (7) phiếu chốt ca có in được không, fail thì làm gì; (8) có nhìn/đếm hóa đơn điện tử kẹt không hay coi là việc của owner; (9) có cần BẢN IN chốt ngày không (dán sổ/đưa Má Tư?); (10) ngày bỏ chốt: lý do. Cuối tuần: đối chiếu chéo số giấy vs query prod (phép validate quan trọng nhất); đếm số lần phải SỬA ngày đã chốt + lý do (quyết adjustment/reopen).
Gate phễu D012: Hoàng hoàn thành <4/7 ngày → không build M1 lock; mục nào Hoàng không ghi suốt 7 ngày → cắt khỏi v1.

## Chờ owner OK (default đã đề xuất, chỉ cần gật/chỉnh)

1. Hệ quy chiếu màn ngày = tiền-đã-thu (cash basis) — ghi vào decisions.md khi land (độc lập với quyết định metric dashboard đang treo).
2. 2 permission key mới + role mapping như trên.
3. M1 lock gated theo kết quả trial (không cam kết trước).
4. Thứ tự ưu tiên giữ D015: sau land đuôi treo, trước expense capture; RPC daily-close là ứng viên đầu tiên cho SQL-test coverage.

## Follow-ups ngoài scope (đã ghi nhận)

- Bug refund CHECK violation (`reverse_payment_and_post` set `payment_status='refunded'` bị `orders_payment_status_check` cấm) — task chip riêng đã tạo, nên fix trước khi quán dùng refund.
- `docs/user-guides/pos/flows/pos-09-close-session.md` còn mô tả approval >200k đã retire theo D8 — cập nhật khi đụng tới user-guides.
- Ca 378 treo 70,6h + branch 2 ngừng đóng ca sau 06-10: Hoàng xác nhận nguyên nhân trong trial (ngừng bán hay quên) — điều kiện dọn dẹp trước rollout.
