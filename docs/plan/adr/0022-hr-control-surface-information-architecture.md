# ADR 0022 — Company HR and Branch people-operations information architecture

**Status:** Accepted — 2026-08-01

**Decision owner:** Owner

**Review tier:** T3 — authorization, sensitive HR data, payroll, multi-surface routing

## Context

HR surfaces mixed company administration, branch people ops, and personal
self-service without clear scope labels. Abstract deep-nav labels
(`Người · Thời gian · Lương · Quy tắc`) and concurrent multi-domain loads made
workspaces hard to scan. This ADR covers UI information architecture and URL
state only — not schema, RLS, ACL, payroll math, or attendance semantics.

## Decision

Adopt three presentation planes:

| Plane | Canonical family | Scope | Owns |
| --- | --- | --- | --- |
| Company HR | `/hr/*` | Entire tenant | Employee records, HĐLĐ, accounts/permissions, attendance, roster, payroll, HR setup |
| Branch people ops | `/br/[branchId]/team` + `/shift/*` | Exact branch in URL | Team board, roster, attendance, checkout/leave approval |
| Personal self-service | `/me/*` | Authenticated actor only | Own clock, tasks, schedule, leave, profile, payslip |

Company HR deep-nav labels (exact): **`Hồ sơ nhân viên`** (`/hr`),
**`Chấm công & ca làm`** (`/hr/attendance`), **`Bảng lương`** (`/hr/payroll`),
**`Thiết lập nhân sự`** (`/hr/setup`).

Branch Manager labels (exact): **`Nhân sự chi nhánh`** (`/team`),
**`Ca làm & chấm công`** (`/shift/*` peers: roster, attendance, checkout-approvals,
leave-approvals). Assigning the company shift catalog to branch employees is not
editing company-wide shift definitions.

Rules:

- Keep four Company HR route homes; normalize hierarchy inside each home.
  Do not merge all HR into one dashboard or create a route per tab.
- Accounts stay a peer view on `/hr` (`?view=accounts`), not a separate top-level
  module. Detail permissions remain `/hr/staff/[id]/permissions`.
- Display scope on Company HR lists uses
  `branch=all|office|<branchId>`; write authority is re-derived by
  Server Action / RPC / RLS.
- One control type per information level: shell deep nav for workspaces,
  `AppPageTabs` for modes, toolbar for dataset views/filters, `FormDialog` /
  `AppDialog` for short tasks. No second shell, local module-nav, or KPI mosaic.
  A compact **`Cần xử lý`** lane appears only when work exists.
- HR positions are not a second authorization layer. Payroll snapshot stays in
  HR; payment stays in Finance. ADR 0012 remains authoritative for `/me/*`.

## Consequences

- Live IA contract for screens lives in `docs/ref/screen-context-map.md` §2.8
  and Branch team/shift sections; archetypes in `docs/spec/page-archetypes.md`;
  auth/HR permission boundary in `docs/modules/auth.md`.
- Implementation may load only the active view/tab and split oversized clients;
  that is delivery detail, not a second SSOT.
- Capability/scope hardening still follows current ACL/RLS and ADR 0015 target
  cutover; this ADR does not invent a parallel permission model.

## Out of scope

Schema, RLS, payroll formulas, attendance business rules, notification redesign,
and Branch personal-route retirement beyond ADR 0012 compatibility redirects.
