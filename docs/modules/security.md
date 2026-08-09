# Security Module

Rate limiting via Upstash Redis in `packages/security/`.

| Limiter | Limit | Window | Used by |
| --- | --- | --- | --- |
| `rateLimit` | 60 | 1 min | General API routes |
| `loginRateLimit` | 10 | 5 min | Login action |

Env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (see `.env.example`).
Missing env or Upstash failure **fails open** (availability over abuse
protection for MVP). Production must set both vars.

Topology and release gates: `docs/modules/infrastructure.md`.
