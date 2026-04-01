# Quality Gates

## Every Task

- [ ] `pnpm typecheck && pnpm build` pass
- [ ] No `any` without justification comment
- [ ] No raw DB errors returned to client
- [ ] No over-engineering — simplest solution that works
- [ ] Violates any rule in `tasks/regressions.md`?

## New Database Table

- [ ] GRANT SELECT, INSERT, UPDATE, DELETE TO authenticated
- [ ] RLS enabled + policies for ALL roles
- [ ] UNIQUE constraints composite with tenant_id
- [ ] PK: BIGINT GENERATED ALWAYS AS IDENTITY
- [ ] Money: NUMERIC(15,2). Time: TIMESTAMPTZ. Text: TEXT (no VARCHAR)
- [ ] `pnpm db:types` after migration

## New Server Action

- [ ] Zod input validation
- [ ] tenant_id/branch_id ownership verified from auth context
- [ ] Safe error response (no raw DB errors)
- [ ] Return shape: { success, data?, error?, meta? }

## New API Route

- [ ] Rate limiting before auth check
- [ ] Safe error response
- [ ] No hardcoded credentials

## New "use client" Component

- [ ] Import from `@comtammatu/database/supabase/client` — NEVER barrel
- [ ] Array access with `?.` (noUncheckedIndexedAccess)
