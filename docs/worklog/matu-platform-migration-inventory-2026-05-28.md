# Migration Inventory — `~/matu-platform` → `comtammatu`

**Ngày:** 2026-05-28 · **Tác giả:** agent · **Trạng thái:** draft, observational only

Đây là bảng kiểm tra (delta inventory) các artifact tồn tại trong codebase cũ
`~/matu-platform` mà **có thể** cần được port sang `comtammatu`. Tài liệu này
KHÔNG đề xuất hành động; chỉ liệt kê gap và verification status để owner/PM
quyết định scope.

> **Quan trọng — không phải migration tuyến tính.** `comtammatu` là phiên bản
> rewrite (Next.js 16 + pnpm + Node 24 + locale-less + route group khác).
> Nhiều thứ ở matu-platform đã được **renamed**, **reorganized**, hoặc
> **deliberately dropped**. Mỗi item ở dưới đều ghi rõ trạng thái thực tế.

---

## 0. Tổng quan stack

| | matu-platform | comtammatu |
|---|---|---|
| Package manager | `bun@1.3.13` | `pnpm@10.33.0` |
| Node | `>=20` | `>=24` |
| Workspace ns | `@workspace/*` | `@comtammatu/*` |
| Locale routing | `[locale]` prefix + `next-intl` | none (locale-less, vi-only) |
| Route groups | `(dashboard) / (display) / (print)` | `(public) / (protected)` |
| Migrations đã apply | 187 | 375 (đi xa hơn) |
| Edge functions | 1 (`process-einvoice`) | 0 |
| Packages | `database, ui, eslint-config, typescript-config, i18n` | `database, ui, shared, security` |
| App router base | `app/[locale]/...` | `app/...` |

---

## 1. Routes — `apps/web/app/`

### 1.1 Routes CHỈ có ở matu-platform (CONFIRMED missing)

| matu-platform route | Mục đích | Priority | Ghi chú |
|---|---|---|---|
| `[locale]/signup` | User registration page | **P0** | Không có flow đăng ký ở comtammatu. Verify với owner: signup có còn nằm trong scope không? |
| `[locale]/invite/[token]` | Member invitation accept flow | **P0** | Đi cùng với email template `invite.html`. Verify đã có member-onboarding flow nào ở comtammatu chưa. |
| `[locale]/no-workspace` | Workspace selector / fallback | P1 | Có thể đã thay bằng `access-denied` ở comtammatu. |
| `[locale]/(dashboard)/today` | Dashboard home (per-day operator view) | P1 | comtammatu thay bằng `admin/dashboard`. Verify nội dung. |
| `[locale]/(dashboard)/analysis` | Owner Analysis V0 report | P1 | Code đi kèm: `apps/web/lib/reports/owner-analysis-report.ts`, `components/analysis/owner-analysis-charts.tsx`. comtammatu có `admin/reports/revenue` nhưng không chắc cover bằng Owner Analysis V0. |
| `[locale]/(dashboard)/branches` (list) | Branches list trang chính | P1 | Likely thay bằng `admin/settings/branches` ở comtammatu — verify. |
| `[locale]/(dashboard)/branches/[branchId]/cancel-requests` | Branch cancel-requests | **P0** | Không tìm thấy ở comtammatu. Branch operator cần workflow này. |
| `[locale]/(dashboard)/branches/[branchId]/payment-requests` | Branch payment requests | **P0** | Không tìm thấy ở comtammatu. Có liên quan đến VietQR manual flow. |
| `[locale]/(dashboard)/branches/[branchId]/social-orders` | Social orders (Telegram intake) | **P0** | Đi cùng `api/social-orders/*`. Tâm điểm pilot. |
| `[locale]/(dashboard)/branches/[branchId]/devices` | Device link/management per branch | P1 | comtammatu có một số ở `admin/settings/printers` nhưng device link chưa rõ. Liên quan task `LAUNCH-DEVICE-OPS-RUNBOOK`. |
| `[locale]/(dashboard)/branches/[branchId]/print-formats` | Per-branch print format editor | **P0** | Đi cùng `print_format_templates` table + RPC `publish_print_format_template`. Spec: `docs/print-formats.md`. |
| `[locale]/(dashboard)/branches/[branchId]/seating` | Seating/table layout config | P1 | comtammatu có `admin/settings/tables` + `admin/settings/areas` — verify đã cover. |
| **HRM module** (toàn bộ) | | | |
| `[locale]/(dashboard)/hrm/leave` | Đăng ký nghỉ phép admin | **P0** | comtammatu có `employee/permissions` ở góc nhân viên, nhưng admin-side leave management chưa thấy. |
| `[locale]/(dashboard)/hrm/operational-roles` | Quản lý operational roles (Cashier/KDS/Runner/…) | **P0** | Code RPC liên quan: migration `tenant_operational_roles`. |
| `[locale]/(dashboard)/hrm/shifts` | Định nghĩa ca làm | **P0** | Pre-req cho shift-register/schedule. |
| `[locale]/(dashboard)/hrm/shift-work` | Phân ca | **P0** | |
| `[locale]/(dashboard)/hrm/staff` | Staff directory admin | **P0** | comtammatu có `admin/staff` nhưng không chắc đã cover. |
| `[locale]/(dashboard)/hrm/roles` | Roles definition | **P0** | |
| **Inventory deltas** | | | |
| `[locale]/(dashboard)/inventory/adjustments/*` | Stock adjustments (new/edit/draft/[id]) | **P0** | KHÔNG có ở comtammatu. Regression `STOCK-COUNT-CONSUMPTION-NOT-WASTAGE` phụ thuộc. |
| `[locale]/(dashboard)/inventory/requisitions/*` | Yêu cầu vật tư từ branch → Kho Tổng | **P0** | KHÔNG có ở comtammatu. Là core của Inventory Daily Ops. |
| `[locale]/(dashboard)/inventory/warehouses/*` | CRUD warehouses | **P0** | KHÔNG có ở comtammatu. |
| `[locale]/(dashboard)/reports/inventory` | Inventory reports tab | P1 | comtammatu có `inventory/reports/` + `admin/reports/inventory-value` + `admin/reports/stock-movement` — verify cover toàn bộ. |
| `[locale]/(dashboard)/reports/wastage` | Wastage report | P1 | comtammatu có `inventory/waste/*` nhưng admin-level wastage report chưa rõ. |
| `[locale]/(dashboard)/reports/finance` | Finance report (legacy) | P2 | Likely covered by `admin/finance/*` mới (broader scope). |
| `[locale]/(dashboard)/reports/audit` | Audit report | P1 | comtammatu có `admin/staff/audit` nhưng không có audit report tổng. Đi cùng `api/audit/export` missing. |
| **Print preview group** | | | |
| `[locale]/(print)/inventory/receipts/[id]` + `/print` | Print-friendly receipt preview | P1 | comtammatu có thể đã chuyển sang print-agent flow; verify. |
| **Mobile/PWA group** | | | |
| `[locale]/m/inventory` + `/[job]` + manifest | Mobile inventory PWA (PDA app) | P2 | Plan: `docs/plans/operator-pwa.plan.md`. Verify với owner xem có còn trong scope không. |
| `[locale]/m/pda` + manifest | PDA wedge scanner app | P2 | Cùng plan. comtammatu có `(public)/scan/*` nhưng khác use case. |

### 1.2 Routes ĐÃ ĐƯỢC RENAME (không cần migrate, chỉ verify ngữ nghĩa)

| matu-platform | comtammatu | Verified |
|---|---|---|
| `(dashboard)/inventory/counts/*` | `inventory/stocktake/*` | ✅ Confirmed (stocktake = inventory counts) |
| `(dashboard)/inventory/receipts/*` | `inventory/grn/*` | ✅ Confirmed (GRN = Goods Receipt Note) |
| `(dashboard)/inventory/materials/*` | `inventory/ingredients/*` | ✅ Confirmed |
| `(dashboard)/feedback/*` | `(protected)/admin/feedback/*` | ✅ |
| `(dashboard)/reports/*` | `(protected)/admin/reports/*` | ✅ |
| `(dashboard)/settings/*` | `(protected)/admin/settings/*` | ✅ |
| `(dashboard)/hrm/attendance` | `(protected)/employee/attendance` | ✅ (góc nhìn employee) |
| `(dashboard)/hrm/payroll` | `(protected)/employee/payslip` + `hr/payroll` | ✅ |
| `(dashboard)/hrm/schedule` | `(protected)/employee/schedule` | ✅ |
| `(dashboard)/profile` | `(protected)/employee/profile` | ✅ |
| `(display)/branches/[branchId]/kds` | `(protected)/br/[branchId]/kds` | ✅ |
| `(display)/branches/[branchId]/runner` | `(protected)/br/[branchId]/runner` | ✅ |
| `[locale]/self-order/[token]` | `(public)/r/[token]` | ✅ |
| `[locale]/login` | `(public)/(auth)/login` | ✅ |

### 1.3 Routes CHỈ có ở comtammatu (newer; không liên quan migration)

`admin/dashboard`, `admin/accounting/periods`, `admin/crm`, `admin/finance/*`,
`br/[branchId]/pos`, `br/[branchId]/menu-limits`, `employee/clock`,
`employee/permissions`, `employee/shift-register`, `payment/momo/return`,
`access-denied`, `orders`, `notifications`, `inventory/waste/auto/approvals`,
`inventory/expiry`, `inventory/issues`, `inventory/supplier-invoices`,
`inventory/supplier-returns`, `inventory/receiving`, `inventory/dashboard`,
`inventory/drafts`, `inventory/production`, `inventory/stock`,
`inventory/settings/{thresholds,expiry,qc}`.

---

## 2. API routes — `apps/web/app/api/`

### 2.1 API CHỈ có ở matu-platform (CONFIRMED missing)

| matu-platform | Mục đích | Priority |
|---|---|---|
| `api/audit/export` | Export audit log (CSV/XLSX) | **P0** — đi cùng `reports/audit` page |
| `api/self-order/[token]` | Self-order session read | **P0** — chưa rõ comtammatu cung cấp qua đâu (Server Action vs route handler) |
| `api/self-order/[token]/items` | Self-order add/remove items | **P0** — như trên |
| `api/self-order/[token]/payment-requests` | Self-order tạo payment request | **P0** — đi cùng VietQR/MoMo |
| `api/social-orders` (list) | List social orders (Telegram intake) | **P0** |
| `api/social-orders/corrections` | Social order corrections workflow | **P0** |
| `api/social-orders/telegram` | Telegram webhook nhận order | **P0** — feature riêng biệt, đi cùng `branches/[branchId]/social-orders` |

> **Lưu ý:** comtammatu KHÔNG có folder `api/self-order` hoặc `api/social-orders`.
> Cần verify với code owner: self-order flow ở comtammatu (`(public)/r/[token]`)
> có dùng Server Actions thay vì route handlers không? Nếu có → đã cover.
> Nếu KHÔNG → đây là gap thật.

### 2.2 API CHỈ có ở comtammatu (newer)

`api/ai/enrich-feedback`, `api/branch-presence`, `api/cron/{feedback-daily-report,
feedback-retention, hddt-archive, hddt-daily-summary, hddt-reconcile,
kds-maintenance, telegram-flush}`, `api/debug/claims`, `api/health`,
`api/webhooks/momo`.

---

## 3. Supabase

### 3.1 Edge Functions — `supabase/functions/`

| Function | matu-platform | comtammatu | Priority |
|---|---|---|---|
| `process-einvoice/` | ✅ (`index.ts` 20KB, `viettel-payload.ts`, `viettel-response.ts`, `number-to-words.ts`) | ❌ | **P0** |

> Worker xử lý queue HĐĐT Viettel S-Invoice (TT78). Pop pending invoices →
> validate tenant settings → POST to Viettel API → mark issued/failed/awaiting-lookup.
> comtammatu có `api/cron/hddt-{archive,daily-summary,reconcile}` (Vercel cron)
> nhưng chưa có worker phát hành HĐĐT chính. **Verify:** comtammatu đã thay
> bằng cơ chế gì để phát hành invoice cho Viettel?

### 3.2 SQL scripts — `supabase/scripts/`

| File | Mục đích | Priority |
|---|---|---|
| `2026-05-12-bootstrap-first-owner.sql` | Seed initial owner row sau cài đặt | P1 — chỉ dùng 1 lần khi cài đặt môi trường mới |
| `reset-pos-orders-bills.sql` | Reset POS data cho UAT/test | P2 — dev utility |

### 3.3 Snippets/Templates — `supabase/{snippets,templates}/`

| File | Mục đích | Priority |
|---|---|---|
| `templates/invite.html` | Email template member invitation | **P0** nếu giữ invite flow (xem §1.1) |
| `snippets/` (empty) | — | — |

### 3.4 Migrations — `supabase/migrations/`

comtammatu (375) đi xa hơn matu-platform (187). KHÔNG cần backport migration.
Verify cross-check: migration names mới ở comtammatu nên cover đầy đủ schema
matu-platform đã expose. Có file `_rollback/` ở comtammatu — khác convention.

---

## 4. Packages

| Package | matu-platform | comtammatu | Action |
|---|---|---|---|
| `database` | ✅ | ✅ | — (re-generated types) |
| `ui` | ✅ | ✅ | — (likely refactored) |
| `eslint-config` | ✅ (dedicated package) | ❌ (root `eslint.config.mjs`) | comtammatu cố ý gộp về root. Không port. |
| `typescript-config` | ✅ (dedicated package) | ❌ (root `tsconfig.base.json`) | Như trên. Không port. |
| `i18n` (`@workspace/i18n` + `vi.master.json`) | ✅ | ❌ | comtammatu locale-less vi-only. Chỉ `packages/shared/src/messages/`. **Decision needed:** giữ vi-only hay khôi phục i18n catalog? |
| `shared` | ❌ | ✅ (ai, auth, feedback, format, hddt, kds, labels, menu, messages, payroll, providers, runner, settings, telegram, time, types, utils) | — |
| `security` | ❌ | ✅ | — |

---

## 5. `apps/web/components/` — Top-level component folders

matu-platform giữ `apps/web/components/` với 22 thư mục: `analysis, audit, auth,
brand, dashboard, feedback, hrm, inventory, kds, menu, mobile-inventory,
mobile-pda, notifications, pos, print, realtime, reports, runner, self-order,
settings, social-orders` (+ một số file riêng lẻ).

comtammatu không có `apps/web/components/` ở root — toàn bộ đã được phân tán
thành (a) `_components/` co-located với route, (b) `packages/ui/`,
(c) `packages/shared/`. Verify từng folder dưới đây xem có còn thiếu component
ở phía comtammatu không:

| matu-platform folder | Verify mapping |
|---|---|
| `components/analysis/` | → `admin/reports/revenue/_components/`? Owner Analysis V0 chưa migrated. |
| `components/audit/` | → `admin/staff/audit/_components/`? |
| `components/auth/` | → `(public)/(auth)/_components/`? |
| `components/brand/` | → `packages/ui/brand/`? |
| `components/dashboard/` | → admin layout components. |
| `components/feedback/` | → `admin/feedback/_components/` + `(public)/r/_components/`. |
| `components/hrm/` | → likely chưa migrate (xem HRM routes ở §1.1). |
| `components/inventory/` | → `inventory/_components/`. |
| `components/kds/` | → `br/[branchId]/kds/_components/` + `packages/shared/kds/`. |
| `components/menu/` | → `admin/menu/` (?) hoặc `packages/shared/menu/`. |
| `components/mobile-inventory/` | → dropped nếu PWA inventory không port. |
| `components/mobile-pda/` | → dropped nếu PDA app không port. |
| `components/notifications/` | → `notifications/_components/`. |
| `components/pos/` | → `br/[branchId]/pos/_components/`. |
| `components/print/` | → `packages/shared/?` hoặc `apps/print-agent/`. |
| `components/realtime/` | → `packages/shared/?` |
| `components/reports/` | → `admin/reports/_components/`. |
| `components/runner/` | → `br/[branchId]/runner/_components/` + `packages/shared/runner/`. |
| `components/self-order/` | → `(public)/r/[token]/_components/`. |
| `components/settings/` | → `admin/settings/_components/`. |
| `components/social-orders/` | → likely chưa migrate. |

---

## 6. `apps/web/lib/` — Utility helpers

matu-platform có **~60 file** ở `apps/web/lib/` (root + 4 subdir: `audit/, inventory/, reports/, supabase/`).
comtammatu chỉ có **~9 file** ở `apps/web/lib/` (3 subdir: `actions/, messages/, network/`).

Phần lớn đã được tái phân bổ vào `packages/shared/`. Nhưng các file dưới đây
cần verify xem có còn dùng và đã port chưa:

| matu-platform `lib/*.ts` | Có còn cần? |
|---|---|
| `inventory/*` (helpers) | **P0** — đi cùng inventory routes thiếu. |
| `audit/*` | P1 — đi cùng audit export. |
| `reports/owner-analysis-report.ts` | P1 — Owner Analysis V0. |
| `parse-form.ts`, `parse-line-item-csv.ts` | P1 — utility chung. |
| `dashboard-routing.ts`, `dashboard-nav.ts` | P1 — sidebar IA logic. |
| `mobile-pda.ts` | P2 — chỉ cần nếu giữ PDA. |
| `csv.ts`, `safe-redirect.ts`, `zod-date.ts` | P1 — utility. Có thể đã sang `packages/shared/utils/`. |
| `branch-*.ts`, `material-*.ts`, `menu-item-*.ts`, `social-order-*.ts`, `pos-db.ts` | Verify xem packages/shared đã cover chưa. |

> Action: chạy diff sâu hơn để ra danh sách cụ thể "file lib X đã port sang
> `packages/shared/Y/Z.ts` chưa" — quá chi tiết để liệt kê trong inventory này.

---

## 7. Docs — `docs/`

### 7.1 Docs CHỈ có ở matu-platform (cần verify migrate)

| matu-platform doc | Mapped tại comtammatu | Action |
|---|---|---|
| `docs/identifier-conventions.md` | Không thấy. | **Port** vào spec identifier conventions doc nếu owner mở scope. |
| `docs/technical-debt.md` | Không thấy. | **Port** vào reference hoặc task tracker nếu owner mở scope. |
| `docs/local-development.md` | Có `docs/runbooks/` nhưng chưa rõ local dev. | Verify, **port nếu thiếu**. |
| `docs/architecture.md` | Có `docs/architecture/` folder ở comtammatu. | Verify nội dung khớp; nếu khác → reconcile. |
| `docs/product-surfaces.md` | Phân tán vào `docs/modules/web-app.md` + `docs/runbooks/pos-kds/`. | Cross-check coverage. |
| `docs/print-formats.md` | `docs/runbooks/pos-kds/print-agent-pilot.md` (partial). | Spec chính của `print_format_templates` cần đảm bảo có. |
| `docs/web-ui-system.md` | `docs/spec/design-system.md` (refactored). | Verify "dashboard contract" claims đã được port. |
| `docs/inventory-manager-operating-plan.md` | `docs/ref/inventory.md` + `docs/runbooks/inventory/operator-journeys.md`. | Cross-check 4 operator questions, mutation rules. |
| `docs/inventory-ops-v1-uat-runbook.md` | `docs/runbooks/inventory/pre-release-qa.md` + `ui-ux-rubric.md`. | OK. |
| `docs/inventory-pilot-readiness.md` | Không tìm thấy. | **Port** vào inventory pilot readiness runbook nếu owner mở scope. |
| `docs/three-branch-pilot-ops-runbook.md` | `docs/worklog/pilot-hardening-readiness-2026-05-24.md` (partial). | Reconcile vào `docs/runbooks/pilot/` (nếu owner xác nhận pilot vẫn live). |
| `docs/web-role-based-qa-runbook.md` | `docs/runbooks/inventory/pre-release-qa.md` (partial). | Verify coverage role-based. |
| `docs/print-agent-ops-runbook.md` | `docs/runbooks/pos-kds/print-agent-pilot.md`. | Verify operational details. |
| `docs/inventory-pilot-evidence/` (folder template) | Không có ở comtammatu. | **Port** structure nếu pilot vẫn live. |

### 7.2 Plans — `docs/plans/` (matu-platform)

| Plan | Status | Priority |
|---|---|---|
| `operator-pwa.plan.md` | Pending (đi cùng m/inventory + m/pda routes) | P2 — verify owner còn muốn không |
| `three-branch-pilot-launch.plan.md` | Pending — đi cùng 5 task `LAUNCH-*` | **P0** nếu pilot vẫn live |

### 7.3 Spikes — `docs/spikes/` (matu-platform)

| Spike | Đã apply chưa? |
|---|---|
| `spike-auth-access-rls-rpc-realtime-audit.md` | Verify với `docs/modules/auth.md`. |
| `spike-hrm-scope-rbac-pbac-reset.md` | Verify — đi cùng HRM routes (§1.1). |
| `spike-inventory-daily-ops-ia.md` | ✅ APPLIED — comtammatu inventory đã có Command Center IA. |
| `spike-owner-analysis-financial-health.md` | Partial — Owner Analysis V0 chưa migrate. |
| `spike-web-content-density-audit-2026-05-19.md` | Verify với `docs/spec/design-system.md`. |
| `mobile-pwa-pda-inventory-print-agent-visual.png` | Visual reference for PWA — chỉ cần nếu giữ m/inventory. |

---

## 8. Pending tasks chưa migrate từ `matu-platform/tasks/todos.md`

### 8.1 Three-Branch Pilot Launch (5 tasks, P0 nếu pilot live)

| Task ID | Tóm tắt |
|---|---|
| `LAUNCH-SCOPE-FREEZE` | Đóng scope launch Week 0 cho 3 chi nhánh (Đất Đỏ, Phước Hải, Bà Rịa). |
| `LAUNCH-BRANCH-DATA-CHECKLIST` | Fill branch readiness data: tables/menu/prices/staff/devices/printers/templates. |
| `LAUNCH-CASHIER-KDS-SMOKE` | Smoke test Floor→Order→Bếp→KDS→Thu→In bill cho `cash` và `vietqr_manual`. |
| `LAUNCH-DEVICE-OPS-RUNBOOK` | Verify device install/link/replace/rollback cho `DD-*`, `PH-*`, `BR-*`. |
| `LAUNCH-THREE-BRANCH-ACCEPTANCE` | 3 ca liên tiếp/branch không sai sót → accept. |

### 8.2 Inventory Real-Branch UAT (5 tasks, P0)

| Task ID | Tóm tắt |
|---|---|
| `INVENTORY-REAL-BRANCH-UAT` | UAT happy path + partial receive + permission split. |
| `INVENTORY-THREE-BRANCH-DATA-READINESS` | Branch warehouse/unit conversions/cost basis/opening stock cho 3 branch. |
| `INVENTORY-STOCK-COUNT-CADENCE` | Shift-open exception review + shift-close pilot SKU count + weekly full count. |
| `INVENTORY-FORM-UX-AUDIT` | Audit form requisition/transfer/GRN/count/adjustment/PO/production trên phone/tablet/desktop. |
| `INVENTORY-PILOT-EVIDENCE-PACKAGE` | Template folder lưu screenshot/evidence cho mỗi UAT. |

### 8.3 Tech debt / Payment (3 tasks)

| Task ID | Tóm tắt |
|---|---|
| `INVENTORY-FINANCE-AP-BOUNDARY-SIGNOFF` | Verify inventory copy không claim AP/AR/net-profit. |
| `PAYMENT-WEBHOOK-EVENTS` | Idempotent webhook boundary cho MoMo/Bank/Casso/SePay/VNPay/wallet. (comtammatu đã có `api/webhooks/momo` — verify đã đủ idempotent chưa.) |
| `WEB-ESLINT-DISABLE-AUDIT` | Audit `eslint-disable` comments trong web source. |

### 8.4 Đã DONE ở matu-platform (chỉ tham khảo, không port lại)

`INVENTORY-IA-RESTRUCTURE-SPEC`, `INVENTORY-SIDEBAR-IA-GUARDRAIL`,
`INVENTORY-COMMAND-CENTER-V0`, `INVENTORY-EXCEPTION-QUEUE`,
`INVENTORY-MOVEMENT-SCOPE`, `INVENTORY-UAT-ROLE-LENSES`,
`PRINT-FORMAT-DYNAMIC-RENDERER`, `PRINT-FORMAT-EDITOR-PREVIEW`,
`WEB-TYPE-CAST-DEBT-GUARD`, `EINVOICE-PROVIDER-FIXTURES`, `OWNER-ANALYSIS-V0`.

> **Lưu ý:** `OWNER-ANALYSIS-V0` đánh là done ở matu-platform nhưng code
> (`apps/web/lib/reports/owner-analysis-report.ts`) chưa thấy ở comtammatu —
> đây là tình huống "done ở matu nhưng chưa port" (xem §1.1 và §6).

---

## 9. `scripts/` (root) ở matu-platform

| Script | Mapped ở comtammatu? | Priority |
|---|---|---|
| `audit-context-budget.ts` | Không thấy. | P1 — context budget guardrail |
| `audit-web-type-debt.ts` | Không thấy. | P1 — TS unsafe-cast guard |
| `audit-web-ui.ts` | comtammatu có `scripts/check-ui-contract.mjs` (khác implement). | Verify cover. |
| `emit-i18n.ts` | Không cần nếu locale-less. | P2 (dropped) |
| `generate-matu-brand-assets.mjs` | Không thấy. | P1 — brand assets generator |

---

## 10. Đề xuất hành động (NEXT STEPS — pending owner decision)

> **KHÔNG thực hiện cho đến khi owner xác nhận từng nhóm.**

**Round 1 — Critical gap verify (P0):**
1. Self-order API (`api/self-order/*`) — confirm comtammatu cover bằng Server Actions hay là thật sự thiếu.
2. Social-orders + Telegram intake (`branches/[branchId]/social-orders` + 3 API routes) — có còn trong scope không?
3. E-invoice edge function `process-einvoice` — comtammatu thay bằng gì? Có cần port lại không?
4. HRM admin routes (leave, shifts, operational-roles, staff) — pre-req cho payroll close.
5. Inventory adjustments + requisitions + warehouses routes — pre-req cho stock count cadence.
6. Branch print-format editor — pre-req cho `LAUNCH-DEVICE-OPS-RUNBOOK`.
7. Signup + invite/[token] + invite email template — flow đăng ký mới còn cần không?

**Round 2 — Operational backlog (P0/P1):**
- Three-Branch Pilot 5 tasks — nếu pilot still live, dán nguyên vào `tasks/todo.md` của comtammatu.
- Inventory Real-Branch UAT 5 tasks — như trên.
- Owner Analysis V0 — port code + report.

**Round 3 — Docs reconciliation (P1):**
- Port identifier conventions, technical debt, and local development notes nếu chưa có.
- Cross-check spike/plan đã được absorb hay chưa.
- Port `inventory-pilot-evidence/` folder structure nếu pilot live.

**Round 4 — Optional/dropped (P2):**
- Decision needed: PWA m/inventory + m/pda có còn trong scope không?
- Decision needed: i18n catalog (multi-language) có cần khôi phục không?

---

## 11. Cảnh báo & giả định

- **Inventory rename mapping** (`counts→stocktake`, `receipts→grn`, `materials→ingredients`) là suy luận từ tên thư mục; chưa diff nội dung. Cần verify schema/RPC name khớp.
- Một số route ở matu-platform đã được "covered" theo các route khác ở comtammatu (ví dụ `(dashboard)/branches/[branchId]/menu` → `admin/menu` + per-branch menu-limits) — chưa verify functional parity. Risk: feature ngầm bị mất.
- `apps/web/components/*` ở matu-platform có 22 folder; chưa diff từng folder với `_components/` của comtammatu. Cần sweep riêng.
- `apps/web/lib/*` của matu-platform có ~60 file utility; chỉ liệt kê high-level. Cần sweep riêng để biết file nào đã port sang `packages/shared/`.
- matu-platform đang dùng `bun` + `next-intl` + `[locale]`; comtammatu loại bỏ locale prefix. Hệ quả: tất cả URL/sitemap/canonical/deep-link cũ sẽ KHÔNG match. Nếu pilot users đã có bookmark cũ → cần redirect map.

---

## 12. Tài liệu liên quan

- `AGENTS.md` (comtammatu) — agent entry rules
- `docs/agent/rules/engineering.md` — engineering constraints
- `docs/spec/design-system.md` — design-system contract
- `docs/worklog/pilot-hardening-readiness-2026-05-24.md` — current pilot status
- `docs/worklog/architecture-audit-2026-05-27.md` — architecture audit
- `tasks/todo.md` (comtammatu) — active backlog
- `~/matu-platform/tasks/todos.md` — legacy pending backlog
