# Security Module

## Overview

Security controls are split across a few focused modules. `packages/security/` owns Upstash Redis rate limiting; `apps/web/proxy.ts` owns auth/ACL, POS/KDS network gate, and feedback-host isolation; feedback actions own origin/CSRF checks.

**Owner:** `packages/security/`

## Components

| File                | Purpose                |
| ------------------- | ---------------------- |
| `packages/security/src/rate-limit.ts` | Rate limiter instances |
| `packages/security/src/index.ts`      | Barrel export          |
| `apps/web/proxy.ts`                   | Auth/ACL, POS network gate, feedback host gate |
| `apps/web/app/r/[token]/actions.ts`   | Public feedback origin and payload checks |

## Rate Limiters

| Limiter          | Limit       | Window     | Used By                                               |
| ---------------- | ----------- | ---------- | ----------------------------------------------------- |
| `rateLimit`      | 60 requests | 1 minute   | General API routes                                    |
| `loginRateLimit` | 5 attempts  | 15 minutes | Login action (`apps/web/app/(auth)/login/actions.ts`) |

Both use Upstash Redis sliding window algorithm.

## Environment Variables

```
UPSTASH_REDIS_REST_URL    # Upstash Redis REST endpoint
UPSTASH_REDIS_REST_TOKEN  # Upstash Redis auth token
```

## Usage Pattern

```typescript
import { loginRateLimit } from "@comtammatu/security";

const { success } = await loginRateLimit.limit(identifier);
if (!success) {
  return { success: false, error: "Too many attempts" };
}
```

## Failure Modes

| Failure             | Signal                         | Recovery                                                                                                            |
| ------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Upstash unreachable | Rate limit check throws        | **Fail open** — allow the request. Availability > abuse protection for MVP. Add monitoring alert when this happens. |
| Missing env vars    | Runtime error on first request | Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`                                                         |

## Design Rationale

- **Upstash over local Redis:** Serverless-compatible. No persistent connection needed. Works on Vercel Edge.
- **Separate login limiter:** Brute-force protection with stricter limits (5/15min vs 60/min).
- **Proxy as perimeter:** route ACL, branch-scope checks, feedback host split, and POS/KDS network gate stay in one request gateway rather than being reimplemented per page.

<!-- ORACLE-META
Written by codebase-oracle (manual) | 2026-04-02
Data: Direct source reading
Audience: new engineer | Confidence: 95%
Updated: rate-limit module plus proxy/feedback security boundary sync (2026-05-09)
Unknowns: 0
-->
