# Current Tasks

> Active work tracker for the in-place `comtammatu` production track. v1.0.0 is operating on real branches; ongoing work is hardening + feature follow-ups. **Shipped history is condensed into one-line summaries** (durable detail lives in git, `tasks/regressions.md`, `tasks/lessons.md`); this file tracks ACTIVE + deferred work. Decisions referenced as `D0xx` live in `docs/plan/decisions.md`.
> Sắp theo **TRẠNG THÁI THẬT** (verify code + prod ledger 2026-06-16), không theo module. Nghẽn throughput lớn nhất = không có env non-prod (`.env.local` trỏ PROD) → mọi việc "needs running-app verify" đứng yên.

## Module status (snapshot)

M0–M7 + Auth + POS PWA + Realtime hardening + Shadcn primitive migration M1–M9 — **all SHIPPED**. External integrations VietQR + Momo are wired with production credentials and active in real branches. HĐĐT is active through Viettel S-invoice only.

## Agent-doable now (không cần owner quyết)

> Việc agent làm được ngay; migration vẫn đi flow file→PR→owner apply. Gate `typecheck/lint/build` trước khi đóng.

- [ ] **WS-3 — tách `grn-detail-client` (1548 dòng)** — file KHÔNG có realtime (0 `.channel()`) → split `_hooks/` + `views/` theo concern, không cần running-app verify. (2 shell còn lại có realtime → mục "Chặn: cần env".)
- [~] **Residual broad grants** — ✅ migration `20260616120000_revoke_cosmetic_grants_anon_authenticated.sql` đã viết (REVOKE 3 priv trên bảng hiện hữu + `ALTER DEFAULT PRIVILEGES` cho bảng mới + self-check) → **chờ owner apply** (prod: anon giữ trên 101 bảng, authenticated 102; cosmetic, KHÔNG exploit qua PostgREST). `bmidl_write` legacy `auth_role()` gộp vào α4c.
- [~] **HRM Đợt 2** (D026, không cần owner) — ✅ (a) tạo NV 1 bước (commit `dc8a756f`: `createEmployeeAccount` + saga rollback, bỏ field Profile UUID, lưu cả SĐT) → **chờ owner runtime-verify** create+login trên env thật. Còn: `updateEmployee` + ngưng việc (cần migration thêm `employees.end_date`); (c) nghỉ phép notify 2 chiều + quick-action "Xin nghỉ" + gộp pending toàn-CN; (d) đổi nhãn `/admin/staff` → "Tài khoản & phân quyền".
- [ ] **α4c — gỡ `can_access_branch`** — còn ~10 ref baseline + `20260609103000` re-create. T3 RLS rewrite ~10 policy. **CHẶN: không có env test** → rewrite RLS mù lên prod auth (leak/lockout) là quá rủi ro; chờ có dev/test Supabase rồi mới soạn + regression-test. (α4b đã ship `20260601810000`.)
- [x] **Ops reconciliation Momo desync** — ✅ commit `f575bfb7`: surface RPC `find_payment_order_desync` thành `FinanceException` thứ 6 ở cockpit `/finance` (tenant-wide, gate `finance:view`, completed-payment + order≠paid); verify prod = 0 desync hiện tại.
- [x] **L6 Finance migration-chain ADR** — ✅ `docs/plan/adr/0006-finance-migration-chain.md`: thứ tự retire GL (D020, 5 bước) + rollback deps + ranh giới operating-finance giữ lại.
- [x] **Print: gỡ cast + error-matcher chết** — ✅ commit `5d32dc8f` (drop `as never` → `toSupabaseJson`, bỏ matcher "migration chưa apply"). Deploy bundle vẫn = ops (xem "Chờ owner/ops").

## Đang làm (mostly done — tail nhỏ)

- [~] **HRM per-shift (D027, NỀN)** — core + UI **ĐÃ LIVE**: migration `130000/160000/170000` (+Codex `120000/140000`) trên prod (owner-delegated apply 2026-06-15); scope-editor + position-default UI đã land (commit `f7438718`). **Tail = owner thao tác UI:** gán per-person checklist cho 7 chef Phước Hải + tạp vụ qua Select "Checklist mặc định" ở `/hr` (chef đa-khâu nên không có position-default; cashier/branch_manager đã có default). Owner còn quyết: cleaner Tạp vụ, cơ chế việc-tuần, phân vai tiền/tồn. Detail: `docs/worklog/hrm-redesign-2026-06-15.md`.
- [~] **HRM Đợt 1** — code (a)-(e) xong (bỏ 3 cột lừa, `cancelCheckoutRequest`, `staleOpenShift` nudge, xóa dead `checkIn/bulkCheckIn/checkOut`, nhãn "Ngày công"). Chỉ còn behavior-verify runtime (b)(c) → **chặn vì không có env non-prod** (xem dưới). `standard_days` clamp đi cùng Đợt 3.

## Chặn vì không có môi trường non-prod (đòn bẩy lớn nhất)

> `.env.local` trỏ PROD → agent không chạy app/daemon verify được. 1 staging/Vercel-Preview env (hoặc Supabase branch) gỡ băng cả cụm này.

- [ ] **WS-3 `pos-desktop-shell` (1989) + `order-detail-sheet` (1654)** — có realtime `.channel()` → split `_hooks/`+`views/` cần running-app verify. One PR per file. Goal = một concern rõ mỗi file (cohesion, KHÔNG đếm dòng).
- [ ] **E2E POS→payment→stock** — spec đã có (`e2e/payment-cash.spec.ts` assert stock_movements + fail-soft); thiếu wire vào CI (`ci.yml` chỉ chạy `pnpm test`) + staging/Preview + seeded test tenant. Runbook `docs/runbooks/inventory/pre-release-qa.md`.
- [ ] **Unused indexes (~231 prod)** — cần ≥1 chu kỳ (gồm month-end) `pg_stat_user_indexes` thật rồi mới DROP (`stats_reset` từng NULL → chưa đại diện).
- [ ] **Dead-RPC drop wave 2** — prod hiện `track_functions = none` → `pg_stat_user_functions` không tin được; cần bật tracking + traffic thật → 6-channel scan → wave ≤10. Tiers B/C/D per `RPC-DROP-MUST-SCAN-6-CHANNELS`.
- [ ] **Real POS→payment→KDS/print→HĐĐT smoke** — cần dev/test/staging + live provider creds. Stock leg out per **D016** (`20260611001000` live). Tail `consume_stock_for_order` removal: dưới Dead-RPC.

## Chờ owner quyết / ops

- [ ] **Định nghĩa metric (chặn dashboard polish)** — chốt `doanh thu` (P&L: HĐĐT phát hành vs tiền đã thu) + các khoản trừ của `lãi gộp` (blueprint §7.3 — 4 co-founder; `decisions.md:706`). Code đang dùng tạm `netRevenueBeforeVat − ingredientCost` để không chặn build. (2) device-signal tile chỉ xét lại nếu sau fail-silent wave vẫn sót lỗi in.
- [ ] **Dead-RPC candidates (13)** — `handle_new_user`, `has_position`, `post_payroll_journal`, `release_table`, `resolve_po_price(s_batch)`, `rotate_branch_override_code`, `set_branch_kind`, `sync_missing_permissions_from_template`, `transition_order_(item_)status`, `try_auto_approve_grn`, `update_my_profile`. Ký từng cái sau 6-channel scan; gồm tail `consume_stock_for_order` (D016). T3 migration per RPC.
- [ ] **Uptime monitor `/api/health`** — UptimeRobot (ops; route đã có).
- [ ] **HRM IA còn mở** — (a) payroll vào nav hay ẩn-chủ-đích (như D013); (b) gộp `/admin/staff` + `/hr`-employees ngay hay chờ W5; (c) selfie check-in có ai dùng không (nếu không → cân nhắc bỏ). D026 "Còn mở".
- [ ] **HRM Đợt 3 (payroll)** — chặn tới khi owner chốt bỏ Excel (D026 §3): UI `base_salary`+`dependents_count`, `calculatePayroll` eligibility theo base_salary (bỏ phụ thuộc 0-contract), `standard_days` cố định + clamp ≤ base (§1), Export Excel/CSV, view đối chiếu trước Duyệt, PIT trên phiếu, link `/hr`→`/hr/payroll`. IA: gom 5 tab → 3 trục Người·Ngày công·Lương.
- [ ] **F-018 Supplier "Khác"** — chọn 1: NCC chính thức / "Mua ngoài"+note / generic "Khác" (GRN hiện bắt `supplierId` dương).
- [ ] **transfer_ownership(p_new_user_id) RPC + UI** — chốt semantics (instant vs 2-phase, representative sync, audit shape, permission gate). Manual SQL UPDATE OK pilot. ADR 0005.
- [ ] **Print-agent deploy** — bundle v1.0.0 lên 3 chi nhánh (Phước Hải 0.2.0) + smoke `PRINTER_HOST=<ip> pnpm test:print`. (Migration `20260611120000`/`20260611150000` ĐÃ LIVE — chỉ còn deploy.)

## Deferred post-pilot (parked có chủ đích)

- [ ] **POS calls provider trước DB lock** — RPC fail = orphan gateway order. DEFER-WITH-MITIGATION (idempotency 23505 đã có).
- [ ] **HĐĐT e-invoice post-pilot** — reconcile cron orphan `signing` (admin retry covers pilot); replace flow TT 78 (pilot cancel + manual portal); provider config encrypted `system_settings` (env-only OK single-tenant); PDF/XML persist + download UI (portal link OK). 3-way matching `supplier_invoices` ĐÃ SHIP (bỏ khỏi đây).
- [ ] **Branch Kitchen site split Phase 2** — dual-write + cutover; seed `inventory_locations` kitchen/warehouse per branch. RPC `commit_intra_branch_transfer` + `confirm_stock_issue` (draft→confirmed) đã có; chỉ chạy khi mở chi nhánh 2.
- [ ] **Refund partial-refund T3** — duyệt partial flip cả `payments.status='refunded'` → chặn refund phần còn lại (`create_refund` cần `completed`) + overstate `get_revenue_kpis.voided_amount`. `20260612120000` chỉ sửa nhãn `orders.payment_status`. (Gộp "Refunds flow gaps" cũ vào đây — không có gap riêng.)
- [ ] **H3b** `has_permission()` dual-source flip — tripwire, chỉ flip nếu có incident silent-demote thứ 2 (`tenants.owner_user_id` ship `20260601500000`). Per ADR 0005.
- [ ] **F-009 Stock master-detail drawer** — side-panel `stock-client.tsx` hiện chấp nhận được; chỉ làm nếu thành vấn đề UX.
- [ ] **P3 Login rate-limit fail-open** — fail-open + log đã có; chỉ thiếu bảng `security_events` (chờ wave đó). Agent làm được nếu owner duyệt kéo wave lên.
- [ ] **Audit `insurance_base_salary`/`gross_salary`** — defer tới khi payroll vào app (Đợt 3); hiện `employment_contracts`=0, payroll Excel → audit surface rỗng. Hạ tầng `log_audit()` đã có.
- [ ] **M5-Ext S8 / M7 residual** — calc + reports (AP aging, consumption variance, yield_factor, PIT 5 bậc, BHXH) ĐÃ wire & UI. Chỉ còn GL posting formal — moot khi còn HKD (D012/D013). Re-scope hoặc đóng.
- [ ] Automated E2E + staging env + inventory smoke runbook periodically — xem "Chặn: cần env".

## N/A while Má Tư is a Hộ kinh doanh (no formal BCTC)

- [ ] `voidJournalEntry` closed-period void mutates signed BCTC — moot: HKD files no BCTC (TT 152/2025); GL surface đang retire theo **D020** (code `voidJournalEntry`/`statement-actions.ts` đã gỡ). Revisit chỉ khi chuyển sang company form.

## Post-v1.0 (Tier 2)

> Owner trim 2026-06-10 (định hướng "phần mềm hỗ trợ Hộ Kinh Doanh" — see **D012**): Local-First/offline POS, VNPay, và Native POS migration (Flutter) ĐÃ LOẠI BỎ. Không đề xuất lại các hướng này.

- [ ] QR Self-Order tại bàn
- [ ] Loyalty / Vouchers
- [ ] Advanced Analytics
- [ ] Employee portal full features

## Shipped (condensed — see git / `regressions.md` for detail)

- **2026-06-15/16** — HRM per-shift attendance + checklist rework (D026/D027): 2 ca Global + attendance re-key `(employee,date,shift,tenant)` + scope/phase EN + position-default checklist + 7 template/95 việc; migrations `130000/160000/170000/180000/181000` LIVE; scope-editor + position-default UI (commit `f7438718`). orders.customer_count drop (`20260616100000`, p1–p6 live). Settings: HKD identity card + `update_tenant_identity` RPC.
- **2026-06-13** — POS/KDS/Runner fulfillment simplification (collapse `preparing`→pending; Runner live queue only); **D017** steps 4–5 (Admin L0 Tenant Command + Branch Command day-metrics). super_manager removal (**D018**, `20260613110000`) + dead role-string cleanup (`20260613130000`) applied to prod + verified (super_manager/area_manager stripped from 37 fns + 13 RLS policies).
- **2026-06-14** — Supabase advisor waves (prod): definer revoke Wave 5 (161→158), `auth_rls_initplan` 20→0, FK covering indexes (145→141). Worklogs `docs/worklog/supabase-{definer-revoke-wave5,rls-initplan,fk-indexes}-2026-06-14.md`. Migration files `20260614090000/091000/092000` committed (`2cfe8c00`).
- **2026-06-11** — UX E2E B1–B6 (ready→handoff, peak >15 đơn, fail-silent print/HĐĐT/runner alerts, fewer-taps, visual pass, W4.4 DataTable twins→0); UI molecule **D014** W0–W4 (loading/error/404 frames, StatusBadge SSOT + 3 vocab-vs-DB bug fixes, formatVND single style, KpiCard canonical, Empty/Confirm single path, DataTable canonical 6 real consumers); print-agent bitmap-only + VietQR on payment receipt; owner template editor + `packages/print-render` (agent esbuild single-file); HRM Phase 2 (drop `shift_assignments` + HR keys 9→5 + rename `hr:approve_checkout`).
- **2026-06-10** — HRM "1 trục Ngày công": leave grants backfill + drop shift-register flow + drop `shift_requests`; canonical position codes (lean to 11, English-only mappers, push-targeting fix); Branch Manager default-shift on clock-in + branch employee list; BM attendance simplification.
- **2026-06-09** — HKD Finance/Admin surface cleanup (operating finance default, accounting hidden per D013); Employee Portal mobile-first overhaul (multiple distill/motion/IA passes); per-role checklist templates; protected route-map + nav contract; checkout-approval flow.
- **2026-05-30** (git `ac95f841..43a3ec4b`) — HĐĐT B2B double-issue guard; payroll-draft + attendance-bypass + `stock_transfer_items` + RLS-policy-dedup fixes; `requireBranchScope` ×22; clock-in graceful shift-window; **baseline-first migration consolidation** (`00000000000000_baseline.sql` + forward chain, 358 archived) + managed-surfaces companion.
- **2026-05-27 — Shell helpers refactor** — `with-action.ts` (`withActionPositional`/`customAuth`/`afterSuccess`) + `rpc-error-map.ts`; all `Skip withAction` annotations removed (WS-1b/2 closed); WS-3 concern-split done for `order-actions` / `grn-actions` / `production-actions` / inventory `actions` (client-shell decomposition is the remaining tail — see Agent-doable + Chặn-env).
- **2026-05-24** — Pilot hardening (snapshot-doc refresh, schema source-ladder, route-group migration, network-gate D9); Interface closure IF-001..012 (retired `matu-*` pilot layer, UI guards, Finance-Basic landing); Pre-deploy + M4 Payments + M6 Finance P0 (refund RPCs, webhook idempotency + MoMo tenant-binding + server-recompute total, audit-log RPC-only + PII strip, HĐĐT cancel-reason ≥20); Network gate D9 + VietQR/Momo live + HĐĐT via Viettel; Sprint 6 Inventory UX (F-017 PO display id, server-side GRN drafts).
- **Auth foundation** — H3 intermediate access scoping replaced by explicit branch grants / tenant-level permissions (no intermediate scope remains). Legacy `employees_manage`/`shifts_manage` verified absent.
