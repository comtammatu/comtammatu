# @comtammatu/database

Supabase clients and generated types for the monorepo.

- Browser / server / service / middleware clients
- Generated `Database` types from the Production type-source schema

```bash
corepack pnpm db:types   # regenerate after migration applied to type source
```

Docs: [`docs/modules/database.md`](../../docs/modules/database.md),
[`docs/spec/database-schema.md`](../../docs/spec/database-schema.md).

**Constraint:** never runtime-import this package barrel from `"use client"`
components; type-only imports are allowed.
