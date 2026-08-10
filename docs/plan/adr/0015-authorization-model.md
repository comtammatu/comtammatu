# ADR 0015 — Authorization model

**Status:** Accepted

**Decision owner:** Owner, 2026-07-27

## Context

The current model binds one user to one Tenant and one Branch, derives an
application role from an HR position, carries authority in JWT claims, and
combines role route gates with live permission grants. It cannot represent
Company-scoped office staff, multiple operational-site kinds, or multi-site
assignments without legacy assumptions. Revocation must not wait on JWT role
refresh. “PBAC” is ambiguous and must not name the architecture.

Production target after cutoff `baf3720f8` is one Company, one Tenant, and
sites of kind `central_warehouse`, `central_kitchen`, or `branch` — not a
repository fork.

## Decision

- Keep Supabase Auth for identity/session. Replace authority behind existing
  database, auth, route, and module seams — no parallel app/package tree.
- Standard JWT identity/session claims only. No roles, capabilities, Tenant
  memberships, or site assignments in JWTs; no custom access-token hook in V1.
- Model Company membership, Tenant membership, and site assignment as separate
  live relations. HR positions/departments never create or change access.
- Scoped RBAC: an access role holds capabilities; a binding assigns that role
  at one `company`, `tenant`, or `site` scope, tied to the exact immutable
  membership/assignment lifecycle row (rehire cannot reactivate an old binding).
- Membership/assignment mutations are authorization-sensitive RPCs. Placement
  alone grants no role.
- Typed `AuthorizationPolicy` database functions are the only live
  membership/binding evaluator. TypeScript owns types, route admission, and UX
  projection — not a second decision engine.
- No generic policy engine, JSON rule DSL, runtime policy editor, explicit deny
  rows, or direct per-user capability grants in V1.
- No inferred Company→Tenant or Tenant→site access; cross-scope oversight needs
  an explicit capability and policy.
- Replace role-list route ACL with a typed route-capability registry. Route
  admission is coarse; RLS and domain RPCs are authoritative.
- Remove universal Owner bypass. Company administration is an explicit role
  subject to scope, RLS, AAL, and domain invariants.
- Authorization tables non-exposed; deny direct authenticated writes. Narrow
  `api` RPC entrypoints only; binding/revocation audited and idempotent.
- One versioned capability manifest generates/checks SQL catalog, route
  registry types, and matrices.
- Persist an idempotent provisioning request before Auth Admin API calls.
- V1: only Security Admin with AAL2 mutates human role bindings. Bootstrap the
  first Security Admin via an owner-run, one-time, audited candidate script.
  Site agents stay outside human roles (one site, never `service_role`).

Live interim contracts until cutover: `packages/shared/src/auth/`,
`docs/modules/auth.md`, `docs/spec/role-route-matrix.md`.

## Consequences

- Production cannot drop `profiles` scope columns, position-to-role mapper,
  `MODULE_ACL`, permission tables, Owner bypass, or custom JWT claims as target
  authority until callers cross the new seam.
- Route/nav/Server Actions/RLS/RPC/Realtime/Storage share one capability
  vocabulary with distinct enforcement responsibilities.
- Authorization reads live indexed relations; performance work cannot weaken
  revocation.
- Exceptions use narrow/temporary role bindings; direct grants need a
  demonstrated use case.
- Revisit a policy engine or direct grants only when typed policies show
  measured failure modes (multi-admin authored policies, or exceptions that
  cannot be a narrow role).

## Verification

- Office users act at Company scope without a fake Tenant/site; membership alone
  grants no business action; position changes have no auth effect.
- Site bindings cannot cross site/kind; revoked/expired bindings deny without
  JWT role refresh; injected legacy claims have no effect.
- Company admins cannot bypass RLS or high-risk AAL; missing route-capability
  registry entries fail closed; auth-table DML unavailable to authenticated.
- Rehire cannot reactivate a prior binding; parent membership alone never
  authorizes a site; site-agent cross-site denial verified in Print & Devices.
