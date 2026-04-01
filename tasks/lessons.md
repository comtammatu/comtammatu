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
