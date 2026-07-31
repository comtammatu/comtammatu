# HRM proposal — Rostering overlay + HĐLĐ/probation semantics

**Trạng thái:** NHÁP — chờ owner phê chuẩn. Đảo một clause của D012 và amend
D026/D027; yêu cầu T3 full-debate theo `docs/agent/rules/workflow.md`. Không
code P5 (rostering) đến khi duyệt.

**Mối quan hệ với ADR 0019:** ADR `0019-hrm-roster-contract-options.md` đang
**Parked** chứa đúng các option này (rostering overlay, contract append-only,
probation explicit, payroll period-end selection). File này là bản chi tiết
để owner phê chuẩn; khi duyệt, **activate ADR 0019** (chuyển Status từ
`Parked` → `Accepted`) thay vì tạo ADR D100 trùng. Số "D100" chỉ là nhãn nội
bộ trong file này, không phải số ADR chính thức.

**Nguồn:** `docs/plan/hrm-f1-f15-plan.md` Bước 0. Đã qua codex T3 review +
verify claim mấu chốt (prorate `13−month`, RLS consumption phụ thuộc legacy,
contract DML hole, `shift_assignments` precedent).

---

## D100: Rostering overlay + semantics HĐLĐ/probation (NHÁP 2026-07-30)

**Decision (owner — chờ phê chuẩn):**

1. **Rostering = optional overlay.** Bổ sung bảng `shift_assignments` để
   owner/quản lý gán ca trước theo tuần; clock-in ưu tiên ca đã gán. Khi chưa
   gán, **giữ default-shift resolver hiện tại** (auto-derive theo wall-clock).
   Mandatory-reject clock-in ngoài ca là **policy switch riêng, sau operational
   proof**, không nằm trong increment này. Bảng lấy domain term `shift_assignments`
   (từng tồn tại rồi xóa theo `20260611103000`).
2. **Đảo clause rostering của D012.** D012 mục "KHÔNG rostering" được bãi bỏ.
   **GIỮ** các clause còn lại của D012: KHÔNG auto-late, KHÔNG auto-absent,
   KHÔNG leave-balance enforcement, KHÔNG multi-tier approval.
3. **Amend D026 IA + D027** chỗ restates no-rostering (`decisions.md:119,
   125-129`): rostering optional overlay giờ được phép; D027 (đơn vị chấm công
   = CA, 0.5 công/ca đã kết) không đổi.
4. **Semantics HĐLĐ:**
   - Lịch sử hợp đồng = **append-only** (revision tạo row mới + mark row cũ
     `expired`), không ghi đè. History bắt đầu từ migration D100 — KHÔNG
     synthesize các bản ghi đã bị `upsertActiveContract` ghi đè trong quá khứ;
     mỗi row hiện tại là baseline bất biến đầu tiên.
   - **Tách compensation amendment khỏi contract sequence**: thay lương KHÔNG
     tạo hợp đồng mới, KHÔNG tăng `contract_sequence`. Chỉ re-sign/gia hạn/
     từ loại = revision.
   - "Hợp đồng xác định thời hạn lần 3" = **2 HĐXĐT liên tiếp ngay trước**
     (không tính probation/amendment), không phải `contract_sequence = 3`.
     Cảnh báo là soft (không hard-block).
   - Natural-expiry: hợp đồng chạm `end_date` không touched → `status='expired'`.
5. **Semantics probation (theo `docs/ref/labor-contracts.md:28-33`):**
   - 85% lương chính thức là **mức tối thiểu**, không phải universal.
   - BHXH chỉ KHÔNG đóng khi thử việc là **hợp đồng thử việc RIÊNG**. Thử việc
     là clause trong HĐLĐ → **vẫn đóng BHXH**.
   - HR chọn `probation_arrangement` (none / separate_contract /
     probation_clause) + `probation_end_date` + `probation_salary` tường minh;
     không suy luận từ application role.
6. **Quy tắc chọn contract khi revision giữa tháng (Payroll V1):** Payroll đánh
   giá base compensation theo **contract active tại period end date / snapshot
   date** — không prorate giữa các contract trong cùng kỳ (vd thử việc kết thúc
   15/06, HĐ mới từ 16/06 → kỳ 06 dùng HĐ tại 2026-06-30). Prorate giữa tháng
   là Payroll V2, decision riêng.
7. **F15 đóng = D027 accepted:** timestamps chỉ sản xuất giờ hiển thị; pay =
   0.5 công/ca đã kết có credit (sau fix F8 `counts_for_workday`). KHÔNG hourly
   payroll.
8. **F13 deferral (owner-approve tường minh):** phase tối thiểu chỉ thêm DOB,
   bank_name, offboarding, employee detail page. Các trường HĐLĐ bắt buộc theo
   luật (địa chỉ thường trú, giới tính, ID issue date/place, residence —
   `labor-contracts.md:37-49`) **hoãn sang phase compliance sau** (P9), với
   owner-approve rõ ràng. Emergency contact giữ optional.

**Supersedes:** D012 mục rostering; D026 IA mục "KHÔNG rostering"; D027 mục
restates no-rostering. Giữ nguyên các clause khác của D012/D026/D027.

**Regression guards cập nhật:** `tasks/regressions.md` — guard D012-rostering
chuyển sang "rostering overlay optional"; giữ các guard payroll
(`PAYROLL-CALCULATE-MUST-BE-ATOMIC-RPC`, `PAYROLL-PRORATION-CAP-AT-STANDARD`,
`PAYROLL-2026-FIVE-BRACKET-AND-BHXH-CAP-STEP`, `ATTENDANCE-INSERT-SERVICE-ROLE-ONLY`).

**Canonical (khi duyệt):** `docs/plan/hrm-f1-f15-plan.md` (kế hoạch triển khai),
`docs/ref/labor-contracts.md`, `docs/ref/payroll-pit.md`.
