# Security Module

## Overview

Rate limiting via Upstash Redis. Protects API routes and auth endpoints from abuse. Two pre-configured limiters with different thresholds.

**Owner:** `packages/security/`

## Components

| File                | Purpose                |
| ------------------- | ---------------------- |
| `src/rate-limit.ts` | Rate limiter instances |
| `src/index.ts`      | Barrel export          |

## Rate Limiters

| Limiter          | Limit       | Window     | Used By                                                        |
| ---------------- | ----------- | ---------- | -------------------------------------------------------------- |
| `rateLimit`      | 60 requests | 1 minute   | General API routes                                             |
| `loginRateLimit` | 5 attempts  | 15 minutes | Login action (`apps/web/app/(public)/(auth)/login/actions.ts`) |

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
