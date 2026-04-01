---
paths:
  - "apps/web/app/api/**"
---

# API Route Rules

- Rate limiting BEFORE auth check — don't waste API calls on locked accounts
- Webhook handlers MUST verify signatures server-side
- NO hardcoded credentials — use env vars
- `unsafe-eval` CSP only in development, NEVER production
- NEVER expose raw DB errors — use safe error wrapper
- Response shape: `{ success, data?, error?, meta? }`
- `custom_access_token_hook` MUST be SECURITY DEFINER
- `getUser()` returns `app_metadata` from DB, NOT from JWT
