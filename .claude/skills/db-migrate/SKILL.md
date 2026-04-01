---
name: db-migrate
description: Create a new Supabase migration file with proper conventions. Use when adding tables, columns, functions, RLS policies, or any database changes.
whenToUse: When user asks to add tables, modify schema, create functions, add RLS policies, or any database changes
argument-hint: [description of migration]
allowed-tools: Read, Write, Bash(pnpm db:types), Grep, Glob
context: fork
---

Create a new Supabase migration for: $ARGUMENTS

## Pre-flight

1. Read `docs/spec/database-schema.md` for current schema
2. Read `.claude/rules/db-migrations.md` for migration rules
3. Read `tasks/regressions.md` — check: GRANT_TABLE_AFTER_CREATE, UNIQUE_PER_TENANT, AUTH_HOOK_SECURITY_DEFINER, PG_FUNC_DEFAULTS_LAST

## Timestamp

Current migrations:
!`ls supabase/migrations/ | tail -5`

Generate next timestamp: `YYYYMMDDHHMMSS_<snake_case_name>.sql`

## Migration Checklist

For every new table:

- [ ] `BIGINT GENERATED ALWAYS AS IDENTITY` for PK
- [ ] `NUMERIC(15,2)` for money, `TIMESTAMPTZ` for time, `TEXT` for strings
- [ ] `tenant_id BIGINT NOT NULL REFERENCES public.tenants(id)`
- [ ] `ALTER TABLE ENABLE ROW LEVEL SECURITY`
- [ ] RLS policies for ALL roles (SELECT/INSERT/UPDATE/DELETE)
- [ ] `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.<table> TO authenticated`
- [ ] `UNIQUE(field, tenant_id)` for tenant-scoped uniqueness

For every new function:

- [ ] Required params before DEFAULT params
- [ ] `SECURITY DEFINER` if reading RLS-protected tables in auth context
- [ ] `GRANT EXECUTE ON FUNCTION ... TO authenticated`

## After Writing

1. Write migration file to `supabase/migrations/`
2. Update `docs/spec/database-schema.md` with new tables/columns
3. Remind user: "Run `supabase db push` then `pnpm db:types`"
