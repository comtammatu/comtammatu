# Security Module

Rate limiting via Upstash Redis in `packages/security/`.

| Limiter | Limit | Window | Used by |
| --- | --- | --- | --- |
| `rateLimit` | 60 | 1 min | General API routes |
| `loginRateLimit` | 10 | 5 min | Login action |
| `ttsRateLimit` | 20 shared | 1 min | Live POS/KDS `/api/operational-audio/speak?live=1` |

Env: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (see `.env.example`).
Missing env or Upstash failure **fails open** (availability over abuse
protection for MVP). Production must set both vars.

## Optional MFA (TOTP) and AAL2

Supabase Auth MFA (TOTP only in V1). Enrollment is **Owner-only** and never
mandatory.

| Concern | Behavior |
| --- | --- |
| Enroll / unenroll | Owner at `/settings/security` only; no staff MFA surface in V1. `mfa.enroll` passes issuer `Cơm Tấm Má Tư` so authenticator labels are not derived from Site URL host (`localhost:3000` breaks `otpauth` `Issuer:account` parsing) |
| Login | Owner with verified TOTP: challenge before post-login redirect; staff stay password-only |
| Role binding writes | RPC `set_auth_role_binding` requires JWT AAL2; UI step-up + retry on `aal2_required` |
| Role binding reads | Allowed at AAL1 |

Topology and release gates: `docs/modules/infrastructure.md`.
