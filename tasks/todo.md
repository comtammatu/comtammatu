# Current Tasks

> Active work tracker for the in-place `comtammatu` production track. This file
> contains only active, blocked, or explicitly owner-gated work. Durable failure
> rules live in `tasks/regressions.md`; decisions live in
> `docs/plan/decisions.md`; shipped history lives in git.
>
> Sắp theo **trạng thái thật**. Không dùng file này cho wishlist, ý tưởng sản
> phẩm chưa duyệt, hay tính năng mở rộng scope khi chưa có `D0xx` phê duyệt.

## Current System Snapshot

Production is running in-place on this repo. External payment/invoice surfaces
currently in scope: VietQR, MoMo, and Viettel S-invoice. Ongoing work is
hardening, HRM/payroll completion, print-agent rollout, DB guard cleanup, and
verification infrastructure.

Current checkout branch `codex/ui-component-governance` contains in-flight UI/IA,
HR, Finance, and branch-settings work. Treat those changes as checkout-state
until gated, but do not reopen plan rows that are already represented by code in
this checkout.

## Agent-Doable Now

> Việc agent có thể làm không cần quyết định sản phẩm mới. Migrations vẫn đi
> flow file -> PR -> owner apply. Gate `pnpm typecheck && pnpm lint && pnpm build`
> trước khi đóng implementation task.

- [ ] **WS-3 — split `grn-detail-client`** — file không có realtime channel; tách `_hooks/` + `views/` theo concern, giữ hành vi hiện tại.
- [~] **Residual broad grants** — migration `20260616120000_revoke_cosmetic_grants_anon_authenticated.sql` đã land; follow-up definer revoke cũng có `20260616170000_revoke_anon_execute_secdef.sql`. Không còn code task ở đây; chỉ verify prod ledger trước khi owner apply lại ở môi trường nào còn thiếu. Phần `bmidl_write` legacy `auth_role()` gộp vào `α4c`.
- [~] **HRM Đợt 2** (D026) — tạo NV 1 bước đã land; HR create form trong checkout đã thu `base_salary`/`dependents_count`/ID/bank. Còn thật: `updateEmployee` cho hồ sơ HR, ngưng việc (`employees.end_date`), xác minh notification nghỉ phép 2 chiều + pending toàn chi nhánh, quyết định đổi nhãn `/admin/staff` từ "Nhân viên" sang "Tài khoản & phân quyền" ở module/nav, rồi chạy gate + runtime/owner verify cho flow HR.
- [~] **HRM payroll/base_salary** (D026/D031) — checkout đã có payroll HKD đơn giản: `calculatePayroll` đọc `employees.base_salary`, lọc `is_active && base_salary > 0`, tính công theo 2 ca/ngày, PIT theo legal-version, và `/hr` có tab/link vào `/hr/payroll`. Còn thật: `standard_days` owner nhập + clamp (code hiện còn đếm T2-T6), export CSV/Excel, màn đối chiếu trước duyệt, atomic RPC cho calculate+status, và runtime verify.
- [ ] **UI ratchet real-debt bridge** — chỉ burn down debt thật đã nêu trong `docs/spec/design-system.md` khi nó đi cùng route-family work hiện tại. Dùng `pnpm audit:ui-components -- --family <family>` để chọn file theo route-family trước khi sửa. HR lane trong checkout đã đưa direct `Table` và route-local `STATUS` maps về 0; phần còn lại ở HR là dialog/confirm flow đã có chủ. Lanes tiếp theo: Inventory high-risk panels, Finance table/card remnants, rồi POS/KDS operational adapter exceptions. Không mở cleanup PR để chase `reframe` allowlists hoặc false-positive về 0.

## Blocked: No Non-Prod Runtime

> `.env.local` đang trỏ PROD. Các việc dưới đây cần staging/Vercel Preview hoặc
> Supabase branch để chạy app/daemon và test hành vi mà không chạm production.

- [ ] **WS-3 realtime shells** — split `pos-desktop-shell` và `order-detail-sheet`; cả hai có realtime `.channel()` nên phải behavior-verify trên app chạy thật.
- [ ] **E2E POS -> payment smoke** — cần CI wiring + seeded test tenant + staging/Preview. Stock assertion không thuộc chain hiện tại vì D016 vẫn tắt POS stock consumption.
- [ ] **Real POS -> payment -> KDS/print -> HĐĐT smoke** — cần env test có provider creds; stock leg vẫn off theo D016.
- [ ] **α4c — remove `can_access_branch`** — còn khoảng 10 ref baseline + `20260609103000` recreate; cần RLS regression-test trước khi viết migration.
- [ ] **Unused indexes** — cần một chu kỳ `pg_stat_user_indexes` đại diện, gồm month-end, rồi mới chọn DROP.
- [ ] **Dead-RPC drop wave 2** — cần bật `track_functions`, lấy traffic thật, chạy 6-channel scan, rồi drop theo wave nhỏ.

## Owner / Ops Gated

- [ ] **Metric definitions** — chốt `doanh thu` cho dashboard là HĐĐT phát hành hay tiền đã thu, và các khoản trừ của `lãi gộp`.
- [~] **HRM per-shift tail** (D027) — core + UI đã live; owner còn gán per-person checklist cho 7 chef Phước Hải + tạp vụ, và chốt `cleaner`, việc-tuần, phân vai tiền/tồn.
- [ ] **HRM IA open calls** — `/hr` đã có tab/link direct-support vào payroll trong checkout; còn chốt có đưa payroll vào nav discovery hay giữ direct-only, gộp `/admin/staff` + `/hr` employees ngay hay chờ W5, và selfie check-in có ai xem/dùng không.
- [ ] **Dead-RPC candidates** — ký từng RPC sau 6-channel scan; gồm tail `consume_stock_for_order` của D016.
- [ ] **F-018 Supplier "Khác"** — chọn 1: NCC chính thức, "Mua ngoài" + note, hoặc generic "Khác".
- [ ] **`transfer_ownership(p_new_user_id)` RPC + UI** — chốt semantics instant vs 2-phase, representative sync, audit shape, permission gate.
- [ ] **Uptime monitor `/api/health`** — ops setup external monitor.
- [ ] **Print-agent deploy** — bundle v1.0.0 lên 3 chi nhánh, Phước Hải nâng từ 0.2.0, rồi smoke `PRINTER_HOST=<ip> pnpm test:print`.
