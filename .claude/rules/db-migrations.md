---
paths:
  - "supabase/migrations/**"
---

# Database & Migration Rules

- Every new table: `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.<table> TO authenticated`
- Every new table: `ALTER TABLE ENABLE ROW LEVEL SECURITY` + policies for ALL roles
- UNIQUE constraints on tenant-scoped tables: `UNIQUE(field, tenant_id)` — never global
- PK: `BIGINT GENERATED ALWAYS AS IDENTITY`. Money: `NUMERIC(15,2)`. Time: `TIMESTAMPTZ`. Text: `TEXT` (no VARCHAR)
- Parameters with DEFAULT must come AFTER required parameters in CREATE FUNCTION
- Each migration file MUST have unique timestamp
- Auth hook functions: MUST be SECURITY DEFINER to bypass RLS
- NEVER apply migrations before PR merge — write file → PR → merge → owner runs `supabase db push`
- After migration merged & applied → `pnpm db:types`
- Before column rename: query `information_schema.columns` to verify actual schema
- After column rename: `pg_proc WHERE prosrc ILIKE '%old_name%'` to find stale functions
- Materialized views: UNIQUE index + `GRANT SELECT TO authenticated` in same migration
