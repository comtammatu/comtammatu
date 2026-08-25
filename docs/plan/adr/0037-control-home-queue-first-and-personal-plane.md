# ADR 0037 — Queue-first Control Home and personal plane separation

**Status:** Accepted — Owner 2026-08-12 (Q1–Q3 resolved per review recommendations; external review amendments folded).

**Decision owner:** Owner, 2026-08-12

**Review tier:** T2 — control-surface UX, employee self-service routing, attention loaders

**Amends:** ADR 0012 (office landing + `/me` plane), ADR 0022 (personal plane scope), ADR 0033 item 7 (`/me` Work CTA removal + operations grid assumption)

**Related:** ADR 0033 (Work attention row), ADR 0019 (workday credit — independent)

**Supersedes proposal:** Early “EmployeeTodayStrip + module grid” mockups; Owner rejected module launcher grid on `/` and Work-only inbox panel.

**External review (2026-08-12):** Accept *with amendments* — singleton DETAIL scoped; proxy gate predicate defined; doc/test blast radius in phases.

## Context

Office and central staff (`accountant`, `central_supply_ops`, `central_kitchen_lead`, `self_service` including pure VP) clock in/out daily and handle cross-module work (PO, GRN, Work tasks, HR approvals), but Control Home today mixes conflicting jobs:

| Surface today | Problem |
| --- | --- |
| **`/` Control Home** | Module shortcut grid duplicates sidebar; **`Cần xử lý`** deep-links mostly LIST even when count = 1; no personal punch state for office actors |
| **`/me`** | Workday stepper landing (`StaffWorkdayPageContent`); conflates **workplace** with **`Trang cá nhân`** |
| **Login routing** | `getDefaultRedirect(self_service)` → `/me`; pure VP blocked from `/` unless `hr:view_employee` |

Personal attendance actions use **`/me/clock`**. The **daily workplace hub is `/`**, not `/me`: **`/me` = `Trang cá nhân`** (Avatar → profile, schedule, leave, payslip) — not post-login landing.

Pain observed (Owner workshop 2026-08-12): stacking command bar + Work panel + **`Cần xử lý`** + **`Phân hệ`** exceeds one mobile viewport and duplicates sidebar navigation; Work got special preview treatment while Finance/Inventory queues use the same attention pattern — inconsistent; the Owner **`Điều hành` / `Nền tảng`** grid on `/` adds no “today” value over the sidebar.

| Option | Verdict |
| --- | --- |
| A. Redirect module-holding staff to `/me` on login | Rejected — breaks finance/inventory first-job |
| B. Embed full `/me` on `/` | Rejected — pollutes Control Home; Owner must not see employee punch UI |
| C. Compact strip only (keep module grid) | Rejected — grid still duplicates sidebar |
| **D. Queue-first `/` + office command bar + `/me` = `Trang cá nhân`** | **Accepted** |

## Decision

### 1. Queue-first Control Home (`/`)

**One layout archetype** for all Control Surface roles that land on `/`: sidebar = module navigation only (no module tile grid on `/`); body = one **`Cần xử lý`** unified `AppSection` ItemGroup with rows for ALL modules (Work, Finance, Inventory, HR, Orders, Print…); office-only `AppTodayCommandBar` above it (§2).

Rules:

- **No module launcher grid** on `/` for **any** role (including Owner). Remove `ModuleLinks` / `Điều hành` / `Nền tảng` sections from `ControlSurfaceOverview`; retire copy keys `operationsTitle`, `foundationTitle`, `shortcutsTitle` when the grid is removed.
- **No Work-only inbox panel** on `/`. Work due tasks appear as **one** `Cần xử lý` row (`Việc đến hạn / quá hạn`) per ADR 0033 — same pattern as PO, GRN, HR approvals.
- **Singleton resolution (scoped):** when bucket `count === 1` **and** the bucket owns an addressable **DETAIL** route, the row shows **document title** and `href` opens DETAIL. When `count > 1`, or the bucket is LIST-first / queue-only, the row stays bucket-labelled and `href` opens filtered **LIST**. Implement via extended `ControlHomeAttentionItem` (`documentTitle?`); Phase B replaces `head: true` counts with `select(...).limit(2)` where DETAIL applies — **no schema changes**.

| Bucket | count = 1 behaviour |
| --- | --- |
| Finance exceptions | DETAIL (already per-item href — exemplar) |
| Inventory GRN | DETAIL → `/inventory/grn/[id]`, title = GRN code |
| Work tasks due | DETAIL → `/work/tasks/[id]`, title = task title |
| Inventory PO | Filtered LIST (no `[id]` route; D1 list-first) |
| YCM / supplier invoices | LIST href unchanged |
| HR approvals (leave + checkout union) | LIST → `/hr/attendance?tab=approvals` |
| Print jobs / refunds / notifications | LIST with status/tab filter |

- **Empty state:** when punch done (or not required) and attention empty → `Không có việc cần xử lý ngay`; **sidebar/drawer remains the module entry** (no dead end on phone).
- **Owner** never sees office punch command bar (`canAccess(role, "me")` is already false for Owner — no redundant extra check required).
- Branch floor roles stay on `/br/[branchId]/*` — unchanged.

### 2. `AppTodayCommandBar` (office actors only)

**New component** in `apps/web/app/_components/` — mirrors compose of `BranchTodayStatus` / branch operator control bar (single row, not a dashboard). Render above **`Cần xử lý`** when **all** hold: `canAccess(role, "me")` (excludes Owner); `getTodayWorkState().attendanceRequired === true`; `getTodayWorkState().status` is not `missing_profile` or `not_required`. Load `getTodayWorkState()` in the **page RSC** for `/` — **not** inside `loadControlHomeAttention` allSettled buckets (work-state outage must not blank the queue).

| `TodayWorkState.status` | Command bar |
| --- | --- |
| `not_started` | `Ca` (if assigned) + **`Chấm công vào`** → `/me/clock` |
| `working` | `Giờ vào` + **`Kết ca`** → `/me/clock` |
| `checkout_pending` | Pending copy + link |
| `done` | Collapse or one-line success |
| `missing_branch` | Recovery copy → `/me/clock` |
| `missing_profile` | **Hidden** (profile setup elsewhere) |
| `not_required` | **Hidden** |

**Do not show:** checklist, team approvals, schedule/leave/payslip, Work task list. **V1:** no duplicate **`Chưa chấm công hôm nay`** row in `Cần xử lý` — command bar only (personal status ≠ queue item).

### 3. `/me` = `Trang cá nhân` (not workplace)

`/me/*` is the **personal account plane** (Avatar → `Trang cá nhân`): profile, schedule, leave, payslip, account settings. **Not** post-login landing; **not** daily work hub. Punch remains at **`/me/clock`**, reached from the **`/`** command bar.

Refactor `/me/page.tsx`: replace the workday stepper hero with a **profile-first hub** (links to `/me/schedule`, `/me/profile`, `/me/payslip`, …); **remove the Work CTA** from `/me` — Work surfaces on the `/` attention row (amends ADR 0033 §7). Branch operator `/br/.../shift` unchanged; ADR 0012 Owner denial of `/me` unchanged.

### 4. Login and proxy routing

| Actor | Default landing |
| --- | --- |
| `owner` | `/` |
| `accountant`, `central_*`, **`self_service` (all VP)** | `/` |
| Branch operators | `/br/[branchId]` |

- `getDefaultRedirect(self_service)` → **`/`** (not `/me`).
- **`/` proxy gate for `self_service`:** allow when JWT `user_role === "self_service"` **and** tenant probe `has_permission(null, 'self:access')` succeeds (same probe as existing `/me` gate in `proxy.ts`). **Do not** require `hr:view_employee` for pure VP.
- **Invariant:** branch-floor roles (`branch_manager`, `cashier`, …) must **not** reach `/` via capability alone — proxy rejects non-`self_service` on `/` before module ACL (preserve `control-home-attention-static` branch exclusion).
- Reword `homeHrBypass` consistently with relaxed gate so pure VP is not bounced by `resolveModuleFromPath("/") → "owner"`.
- **Interim QA note:** Phase A may ship before Phase C — pure VP still lands `/me` until login/proxy merge; not a regression.

### 5. Unchanged

- Work domain, ACL, RPC authority (ADR 0033 core); payroll/workday math (ADR 0019); branch hub compose (exemplar: `branch-today-status.tsx`, `branch-queue-section.tsx`); ADR 0033 §6 — one Work attention row on `/`; `/` does not become a Work shell.

## Consequences

- Amends ADR 0012: office actors workplace = `/`; `/me` retains punch route but is not landing or daily hub.
- Amends ADR 0022: `/me` plane drops “own tasks” (Work on `/`).
- Amends ADR 0033 §7 as above.
- `ControlSurfaceOverview` loses module grids; attention queue is primary body.
- Static tests and i18n baseline updated per phase table below.

## Implementation phases

| Phase | Deliverable | Proof / blast radius |
| --- | --- | --- |
| **A** | Remove `ModuleLinks` grids; queue-only `/`; add `AppTodayCommandBar` in `app/_components/` | Static: no `operationsModules` on `/`; no `KpiCard` on `/`; Owner smoke: no command bar; office smoke: bar ≤ 2 lines at 390px |
| **B** | Scoped singleton DETAIL: Finance (keep), GRN loader, Work due action | `limit(2)` queries; manual count=1 → DETAIL; HR/print/refunds stay LIST |
| **C** | `login-destination.ts`, `proxy.ts` gate, `/me` profile hub | `login-destination.test.ts`, `scope.test.ts`; rewrite `control-home-attention-static` proxy assertions (keep branch-floor exclusion) |
| **D** | Docs + archetypes + matrix | Rewrite `screen-context-map` §2.4/§2.4B; regenerate `role-route-matrix.md` via `scripts/gen-role-route-matrix.mjs`; update `page-archetypes` LANDING (remove Owner grid variant); `lint:ui-contract`; i18n baseline for retired copy keys |

Recommended order: **A → B → C → D**. B backend may parallel A.

**Mobile smoke (390px, ADR 0012 precedent):** first viewport = header + command bar (when visible) + first queue row, punch CTA one tap from `/`; empty state = single message + sidebar/drawer reachable for module nav; Owner = queue only, no grid, no command bar; pure VP = lands `/`, bar when attendance required, no HR approval rows without permission, direct `/hr` still gated.

## Out of scope

- HRM `/hr/attendance` tab split (ADR 0019); moving schedule/leave/payslip onto `/`; Owner KPI mosaic on `/`; branch bottom-nav / KDS semantics; singleton DETAIL for buckets without addressable DETAIL routes.

## Owner Accept record (Owner 2026-08-12)

- Q1 Zero module tiles on `/` for Owner — **Accept**: sidebar only; empty state must not dead-end.
- Q2 Singleton DETAIL — **Accept scoped**: Finance exceptions, GRN, Work tasks only; rest LIST.
- Q3 Duplicate “Chưa chấm công” attention row — **Decline V1**: command bar only.

Accept package: queue-first `/`, `AppTodayCommandBar`, `/me` = `Trang cá nhân`, `self_service` → `/`, Amends ADR 0012 / 0022 / 0033 §7 / 0035 §5 as written.

## Canonical

- `docs/ref/screen-context-map.md` §2.4, §2.4B
- `apps/web/app/_components/control-surface-overview.tsx`
- `apps/web/app/_lib/control-home-attention.ts`
- `apps/web/app/_components/app-today-command-bar.tsx` (new, Phase A)
- ADR 0012, ADR 0022, ADR 0033
