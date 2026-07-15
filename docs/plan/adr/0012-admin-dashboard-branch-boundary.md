# ADR 0012 — Admin Dashboard and Branch surface boundary

**Status:** Accepted

**Decision owner:** Owner, 2026-07-15

## Context

The product exposed three overlapping concepts: Branch, Office, and domain
workspaces. Branch Manager and Cashier could discover or deep-link into some
top-level tenant routes because those routes reused capability keys that also
protect legitimate Branch-native orders and stock work. Owner navigation was
fragmented across Finance, HR, Payroll, and Settings shortcuts instead of one
explicit control-plane entry.

## Decision

- The only product planes are **Admin Dashboard** and **Branch**. Public and
  utility routes are not product planes.
- Admin Dashboard is Owner-only. Its route families remain at `/admin`,
  `/menu`, `/orders`, `/inventory`, `/finance`, `/branches`, and `/hr`.
- Branch Manager and Staff complete daily work under `/br/[branchId]/*`.
  Disallowed Admin Dashboard URLs and post-login `returnTo` values fall back to
  the assigned Branch home.
- `module-acl.ts` remains the access authority. The `admin_dashboard` key owns
  surface admission; reusable capability keys such as `inventory` and `orders`
  continue to protect Branch-native routes.
- Owner remains Branch-first after login. Branch Hub and the multi-branch
  picker expose one truthful `/admin` entry.
- `/admin` is a launcher built from existing Design System primitives. It does
  not show invented KPIs; executive indicators require their own canonical
  data contracts.
- Current Office shell and navigation identifiers are renamed to Admin
  Dashboard terminology. Existing module URLs do not move in this decision.

This supersedes the earlier independent-workspace wording in D017, the older
`Quản trị` chrome label in D019, D050 point 1 and its Office-side scope label,
D076 section 6, and D077 sections 4–5 wherever they preserve Branch Manager
access to Office workspaces or retain Office as a product plane.

## Consequences

Branch Manager loses tenant-level menu and HR entry, while Branch-native menu
limits, team, approvals, settings, orders, and stock capabilities remain
available through their existing route and permission gates. Cashier keeps
Branch-native orders but cannot enter `/orders`.

Finance behavior, SePay/MoMo reconciliation, database schema, route moves, and
Owner KPI implementation remain separate slices.

## Verification

- Owner reaches every Admin Dashboard family and sees complete owner discovery.
- Branch Manager and Cashier cannot enter or preserve `returnTo` for any Admin
  Dashboard family.
- Branch-native orders, stock, menu limits, team, settings, and approvals keep
  their existing capability and branch-scope behavior.
- No visible `Văn phòng` entry remains; `/admin` is registered as a `HUB`.
- Targeted route/ACL tests, generated route matrix, UI contract lint, full T3
  gates, and phone/tablet/desktop browser smoke are required before landing.
