# ADR-0013: Rate Limit Fallback Policy

Status: proposed
Date: 2026-05-07 (renumbered from matu-superapp ADR-0003 dated 2026-05-06)
Decision owner: Tech Lead + Security Owner

> **Note on numbering:** This ADR was matu-superapp's ADR-0003. comtammatu's ADR-0003 is `cutover-rollback`. Per ADR reconciliation 2026-05-07 (option A2 diff+merge), this ADR was renumbered to 0013 to avoid collision. Content unchanged.

## Context

The platform needs rate limits for auth-sensitive routes, provider webhooks, branch network agents, and high-risk mutations. A hosted backing service can fail or become unreachable; the product must decide whether to fail open or fail closed per surface.

comtammatu currently uses Upstash for rate limiting at `apps/web/proxy.ts` and login flow. Without an explicit policy, fail-open vs fail-closed choices drift per developer.

## Decision Needed

Define fallback behavior for each surface:

- Auth/login and password flows.
- Payment/e-invoice webhooks.
- POS payment/refund mutations.
- Branch print/network agents.
- Admin bulk actions.

## Recommendation

Use per-surface policy:

- Fail closed for admin destructive actions and suspicious auth bursts.
- Fail open with audit for payment/e-invoice webhooks after signature verification, because dropping provider events can create reconciliation incidents.
- Fail closed for unsigned or invalid webhooks.
- Fail open with local logging for low-risk read routes.

The implementation must expose one shared policy map instead of ad hoc fallback choices.

## Acceptance Gates

- Policy map exists in `packages/security`.
- Tests cover backing-service unavailable cases for every high-risk surface.
- Logs/audit distinguish allowed fallback from normal pass.
- Operator runbook states what to inspect when fallback activates.
- No provider secret or full payload is logged during fallback.

## Consequences

- Security behavior becomes explicit and reviewable.
- Provider integrations must be designed around idempotency and replay, not only synchronous success.
- comtammatu's existing Upstash fail-open observability gets formalized via this policy map.

## Cross-References

- ADR-0009: Background Jobs Runtime — provider calls invoked from queue consumers follow this policy.
- `tasks/regressions.md`: `RATE-LIMIT-FALLBACK-EXPLICIT` (to be added).
