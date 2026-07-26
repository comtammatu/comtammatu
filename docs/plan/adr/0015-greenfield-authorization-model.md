# ADR 0015 — Greenfield authorization model

**Status:** Accepted

**Decision owner:** Owner, 2026-07-27

## Context

The current authorization model binds one user to one Tenant and one Branch,
derives an application role from an HR position, carries that authority in JWT
claims, and combines role route gates with live permission grants. It cannot
represent Company-scoped office staff, multiple operational-site kinds, or
multi-site assignments without preserving legacy assumptions.

The Greenfield target needs one Company, one Tenant, and operational sites of
kind `central_warehouse`, `central_kitchen`, or `branch`. Revocation and row
isolation must not depend on a JWT role refresh.

The term PBAC is ambiguous between permission-based and policy-based access
control, so it cannot be a durable architecture name.

## Decision

- Keep Supabase Auth for identity and session management.
- Use standard JWT identity/session claims only. Do not place roles,
  capabilities, Tenant memberships, or site assignments in JWTs, and do not add
  a custom access-token hook in V1.
- Model Company membership, Tenant membership, and site assignment as separate
  live relations.
- Keep HR positions and departments independent from authorization. They may
  suggest onboarding choices but never create or change access.
- Use scoped RBAC: an access role contains capabilities and an explicit binding
  assigns that role to a principal at one `company`, `tenant`, or `site` scope.
- Bind scoped roles to the exact immutable Company membership, Tenant
  membership, or site-assignment lifecycle row. A later rehire/reassignment
  cannot reactivate an old binding.
- Treat membership/assignment lifecycle mutations as authorization-sensitive
  RPCs. Creating placement grants no role; ending placement cannot bypass
  privileged-binding protection.
- Use typed `AuthorizationPolicy` functions for Company, Tenant, and site
  decisions. They evaluate live membership, resource lineage/status, binding
  validity, capability scope, and session assurance.
- Make those database functions the only live membership/binding evaluator.
  TypeScript owns types, route admission, and UX projection, not a second
  authorization decision engine.
- Do not implement a generic policy engine, JSON rule DSL, runtime policy
  editor, explicit deny rows, or direct per-user capability grants in V1.
- Do not infer Company-to-Tenant or Tenant-to-site access. Cross-scope oversight
  requires an explicit capability and policy.
- Replace role-list route ACL with a typed route-capability registry. Route
  admission remains a coarse gate; RLS and domain RPCs are authoritative.
- Remove universal Owner bypass. Company administration is an explicit role and
  remains subject to scope, RLS, AAL, and domain invariants.
- Keep authorization tables non-exposed and deny direct authenticated writes.
  Expose only narrow `api` RPC entrypoints; role binding and revocation are
  audited and idempotent.
- Keep one versioned capability manifest and generate/check the SQL catalog,
  route registry types, and matrices against it.
- Persist an idempotent provisioning request before calling the external Auth
  Admin API so partial identity/membership creation can be reconciled.
- In V1, only Security Admin with AAL2 mutates human role bindings. Role
  assignment class, sensitivity floor, expiry ceiling, reason, and privileged
  approval remain enforced; human RPCs cannot grant machine-only roles. Access
  Admin is deferred until a separate onboarding operator exists.
- Bootstrap the first Security Admin through an owner-run, one-time, audited
  candidate script with exact target and identity checks. No permanent bypass
  is added.
- Keep site agents outside human roles. Each agent has a revocable identity for
  one site and never receives `service_role`.

## Consequences

- Greenfield cannot extract the current `profiles` scope columns,
  position-to-role mapper, `MODULE_ACL`, permission tables, Owner bypass, or
  custom JWT claim shape as target authority.
- Route code, navigation, Server Actions, RLS, RPCs, Realtime, and Storage share
  one capability vocabulary but retain their distinct enforcement
  responsibilities.
- Authorization reads live indexed relations rather than cached role claims.
  Performance optimizations require measurements and cannot weaken revocation.
- Small exceptions use additional narrow or temporary role bindings. A direct
  capability grant model or delegation matrix requires a demonstrated use case.
- The Greenfield Authority slice must be source-ready and candidate-proven
  before Branch Workspace migration.

## Revisit triggers

Reconsider a dedicated policy engine only when independent Tenant
administrators must author conditional runtime policies across multiple
domains, policy changes cannot use reviewed migrations, and typed policies show
measured duplication or latency.

Reconsider direct capability grants only when a real exception cannot be
represented by a narrow scoped role.

## Verification

- Office users perform Company actions without a fake Tenant or site.
- Company membership, Tenant membership, and site assignment alone grant no
  business action.
- Position changes have no authorization effect.
- Site bindings cannot cross site or site kind.
- Revoked or expired bindings are denied without waiting for a JWT role refresh.
- Injected legacy role/scope claims have no effect.
- Company administrators cannot bypass RLS or high-risk AAL requirements.
- Protected routes missing from the route-capability registry fail closed.
- Authorization-table DML is unavailable to authenticated clients.
- RLS and RPC tests cover the same subject/action/scope decision matrix.
- Rehire or reassignment cannot reactivate a prior binding.
- Explicit Tenant oversight capabilities have positive and negative descendant
  tests; parent membership alone never authorizes a site.
- Candidate MFA bootstrap/recovery and Realtime revocation-window evidence are
  recorded before go-live.
- Site-agent cross-site and human-workflow denial is verified in the Print &
  Devices/G6 slice.
