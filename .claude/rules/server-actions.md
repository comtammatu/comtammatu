---
paths:
  - "apps/web/app/**/actions/**"
  - "apps/web/app/**/actions.ts"
---

# Server Action Rules

- MUST validate ALL inputs with Zod schemas
- MUST verify tenant_id + branch_id ownership from auth context
- NEVER return raw Supabase/Postgres error.message to client
- Return shape: `{ success, data?, error?, meta? }`
- Multi-item stock operations → Postgres RPC (atomic transaction, not loop HTTP)
- Stock "adjust" = set to exact quantity, NOT "add"
- Import from `@comtammatu/database` barrel (OK for server-side)
- Branch scope from URL params — NEVER localStorage/Context/Zustand
- After `updateUser()` → MUST `refreshSession()` to mint new JWT
- Client-provided entity IDs → verify ownership before using
