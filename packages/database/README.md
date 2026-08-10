# @comtammatu/database

Supabase clients and generated types for the monorepo.

- Browser / server / service / middleware clients
- Generated `Database` types from the Production type-source schema
  (`enloyfnuerqgaqderbwb` — see [`supabase/README.md`](../../supabase/README.md))

```bash
SUPABASE_PROJECT_ID=enloyfnuerqgaqderbwb corepack pnpm db:types
```

Docs: [`docs/modules/database.md`](../../docs/modules/database.md),
[`docs/spec/database-schema.md`](../../docs/spec/database-schema.md),
[`docs/modules/infrastructure.md`](../../docs/modules/infrastructure.md).

**Constraint:** never runtime-import this package barrel from `"use client"`
components; type-only imports are allowed.
