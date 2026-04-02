# Lessons Learned

> Updated after every correction from user.
> Format: Pattern -> Rule -> Prevention

1. **Migration ordering matters for data constraints**
   - Pattern: Added CHECK constraint before cleaning up legacy data that violates it
   - Rule: Always UPDATE/DELETE violating rows BEFORE adding CHECK/NOT NULL constraints
   - Prevention: In migration, put data cleanup steps first, then DDL constraints. Use `NOT VALID` + `VALIDATE CONSTRAINT` for large tables.

2. **REVOKE must cover all DML operations**
   - Pattern: Revoked UPDATE but forgot INSERT/DELETE were still granted from initial migration
   - Rule: When switching to RPC-only, revoke all of INSERT/UPDATE/DELETE and drop any ALL policies
   - Prevention: After writing REVOKE, grep initial migration for matching GRANTs to confirm full coverage.

3. **Cross-reference role definitions across all docs**
   - Pattern: office defined as "HQ-wide" in role table but "own branch" in SELECT scope table
   - Rule: Role scope must be consistent across: enum comments, spec docs, RLS policies, HR/payroll docs
   - Prevention: When adding/modifying a role's scope, search all docs for that role name and update every reference.

4. **Verify build before marking task complete**
   - Pattern: Marked S2 tasks "completed" before running typecheck+build. Build failed on `boolean | null` mismatch and missing `system_settings` type stub.
   - Rule: Never mark done until `pnpm typecheck && pnpm build` output is green in terminal
   - Prevention: Run build immediately after writing code. When adding new DB tables, check generated `database.types.ts` first — if table is missing, add type stub before writing any code that references it.

5. **Follow session protocol strictly**
   - Pattern: Skipped Task Contract, domain skills, `/review`, roadmap update
   - Rule: Session protocol is mandatory, not optional — every step exists for a reason
   - Prevention: At session START, paste Task Contract template and fill it. At CLOSE, run `/review`, update roadmap, update lessons if corrected.

6. **Local verify must match CI pipeline exactly**
   - Pattern: `/verify` only ran typecheck + build, but CI also runs lint. Unused vars passed locally, failed on push.
   - Rule: `/verify` = `pnpm typecheck && pnpm lint && pnpm build` — must mirror CI steps exactly
   - Prevention: Updated `/verify` skill to include `pnpm lint`. Before adding any new CI step, update `/verify` to match.
