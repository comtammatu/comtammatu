# ADR 0011 — Database, auth, and realtime hardening

**Status:** Parked audit direction

**Revisit trigger:** a current runtime trace, security advisor result, or owner
priority re-opens one of the risks below.

## Decision

Database/auth/realtime hardening must be re-derived from current code, generated
types, applied target state and live measurements. A dated audit snapshot or
migration filename is never an apply plan.

Durable priorities:

1. Browser-executable functions default to least privilege. New
   `SECURITY DEFINER` functions carry an in-body authorization boundary and
   explicit revoke/grant policy.
2. RLS/RPC scope validates tenant and branch at the write boundary; UI visibility
   is not authorization.
3. Multi-row dependent writes are atomic RPCs; swallowed follow-up failures and
   partial imports are correctness bugs.
4. Realtime consumers coalesce burst refreshes and avoid tenant-wide client-side
   filtering when a narrower server scope exists.
5. `REPLICA IDENTITY FULL`, indexes and subscriptions require a measured runtime
   consumer; unused write amplification is removed only after fresh evidence.
6. Payroll self-read, cross-branch HR reads and dead RPC retention require an
   explicit product/security decision before policy changes.

## Parked risk map

Revalidate, do not assume current:

- default function privileges and browser execute surface;
- tenant/branch validation in permission helpers and RPCs;
- notification/POS realtime fanout and coalescing;
- replica identity and unused-index write amplification;
- payroll draft self-read and Branch Manager HR scope;
- atomicity of HR/menu/import workflows;
- dead RPCs, anonymous execute grants and audit-row fabrication.

## Execution boundary

Before implementation, create a fresh T3 plan with current evidence and split
additive DB changes from destructive cleanup. Preview verification, type
regeneration, deploy ordering and production apply follow
`docs/agent/rules/database.md`; this ADR grants no production mutation rights.
