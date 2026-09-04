# ADR 0037 — Queue-first Control Home and personal plane separation

**Status:** Accepted — Owner 2026-08-12

**Decision owner:** Owner, 2026-08-12

**Amends:** ADR 0012 (office landing + `/me` plane), ADR 0022 (personal plane
drops own Work tasks), ADR 0033 (`/me` Work CTA removed; due tasks on `/`).

Runtime compose: [`docs/ref/screen-context-map.md`](../../ref/screen-context-map.md)
§2.4 / §2.4B and [`docs/spec/page-archetypes.md`](../../spec/page-archetypes.md)
LANDING. This ADR owns the landing and personal-plane decision; do not treat
shipped implementation phases as current work.

## Decision

- One queue-first `/` for every Control Surface role that lands there: sidebar
  is module navigation; body is one `Cần xử lý` section. No module launcher
  grid on `/` for any role, including Owner. No Work-only inbox panel on `/`.
- When attention `count === 1` and the bucket owns an addressable DETAIL route,
  the row opens DETAIL (Finance exceptions, GRN, Work tasks). Other buckets
  stay LIST.
- `/me/*` is `Trang cá nhân` (profile, schedule, leave, payslip). Not
  post-login landing; not daily work hub. Punch stays at `/me/clock`, reached
  from the `/` office command bar. Owner remains denied `/me` (ADR 0012).
- Default landing: `owner`, office/central roles, and `self_service` → `/`;
  branch operators → `/br/[branchId]`. `self_service` may enter `/` when JWT
  `user_role === "self_service"` and `has_permission(null, 'self:access')`.
  Do not require `hr:view_employee`. Branch-floor roles must not reach `/`
  via capability alone.

## Out of scope

HRM `/hr/attendance` tab split (ADR 0019); moving schedule/leave/payslip onto
`/`; Owner KPI mosaic on `/`; singleton DETAIL for buckets without addressable
DETAIL routes.
