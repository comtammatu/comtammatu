# ADR 0037 — Control home is a coordination surface; `/me` stays personal

**Status:** Accepted (Owner 2026-08-12; amended Owner 2026-09-05)

**Decision owner:** Owner

**Amends:** ADR 0012 (office landing + `/me` plane), ADR 0022 (personal plane
drops own Work tasks), ADR 0033 (`/me` Work CTA removed; due work on `/`).

**Supersedes on `/` only:** the 2026-08-12 “one `Cần xử lý` section; no module
pulse; no data beyond a count badge” lock. Personal-plane rules are unchanged.

Runtime: [`docs/ref/screen-context-map.md`](../../ref/screen-context-map.md)
§2.4 / §2.4B and [`docs/spec/page-archetypes.md`](../../spec/page-archetypes.md)
LANDING. This ADR owns `/` and `/me` placement; do not implement chrome here.

## Decision

### 1. `/` is the L0 coordination home

Every Control Surface role that lands on `/` gets **one home with three
ordered regions**, ACL-gated, not a module launcher and not a second Finance
or Inventory cockpit:

1. **Mine** — punch (office command bar), my due Work, my unread
   notifications. Not profile, payslip, or leave forms (those stay `/me`).
2. **Coordinate** — cross-module work that needs a human today (dispatch,
   approvals, exceptions that span Kho / Finance / HR / Orders / Work).
3. **Modules** — one pulse per admitted module (Kho, Finance, HR, Orders,
   Work). Each pulse shows the **operating numbers that decide the next
   click** and a named next action into that module. Empty pulses omit.

Sidebar remains module navigation. Body is the day picture; it must not be
only a flat count list.

`count === 1` with an addressable DETAIL may still open DETAIL. That is a
shortcut, not the page shape.

### 2. What `/` must not become

Rejected on `/`: a `LinkCardGrid` of every L0 app; a company P&L / revenue
chart mosaic (those stay `/finance`); a department Kanban; embedding
`/inventory` radar+sheet or `/work` board chrome; moving `/me` profile,
schedule, leave, or payslip onto `/`.

### 3. Personal plane (unchanged)

`/me/*` is `Trang cá nhân`. Not post-login landing; not the daily hub. Punch
stays at `/me/clock` from the `/` command bar. Owner remains denied `/me`
(ADR 0012). Due Work and coordination stay on `/`, not as a Work CTA on `/me`.

### 4. Default landing (unchanged)

`owner`, office/central roles, and `self_service` → `/`. Branch operators →
`/br/[branchId]`. `self_service` may enter `/` when JWT `user_role ===
"self_service"` and `has_permission(null, 'self:access')`. Do not require
`hr:view_employee`. Branch-floor roles must not reach `/` by capability alone.

## Out of scope

HRM `/hr/attendance` tab split (ADR 0019). Branch `/br/[branchId]` hub.
Rebuilding `/inventory` (module ca surface; own allowlist). Implementation
phases of the three regions.

## Consequences

The 2026-08-12 queue-only body is retired as the `/` contract. Runtime
`ControlSurfaceOverview` + `loadControlHomeAttention` (one `ItemGroup`) no
longer matches this ADR until rebuilt. `/inventory` is not bound by this
decision.

## Verification

- `/` shows Mine / Coordinate / Modules when the actor has items; omits empty
  regions; never a full-app launcher grid or Finance chart mosaic.
- Office punch still reaches `/me/clock` from `/`. Owner never lands `/me`.
- Branch-pinned roles still land `/br/[branchId]`.
- One due Work task may open DETAIL; many stay a Mine row into `/work`.
