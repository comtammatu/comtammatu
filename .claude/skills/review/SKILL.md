---
name: review
description: Review current changes against regression rules and quality gates before committing. Use before any commit or when asked to review code.
whenToUse: Before committing, when user says "review", "check my code", or "pre-commit check"
allowed-tools: Read, Grep, Glob, Bash(git diff*), Bash(git status*)
context: fork
---

Review current changes for regressions and quality issues.

## Current state

!`git status --short`

## Diff

!`git diff --stat`

## Checklist

### 1. Regression Rules

Read `tasks/regressions.md` and verify each applicable rule against the diff:

- CLIENT_IMPORT_BOUNDARY — any "use client" file importing barrel?
- REGEN_TYPES_AFTER_MIGRATION — new SQL function without db:types?
- UNIQUE_PER_TENANT — new UNIQUE constraint without tenant_id?
- GRANT_TABLE_AFTER_CREATE — new table without GRANT?
- NO_RAW_DB_ERRORS — raw error.message returned to client?
- VERIFY_DB_SCHEMA_BEFORE_QUERY — column names match database.types.ts?

### 2. Quality Gates

Read `.claude/rules/quality-gates.md` and verify:

- No `any` without justification
- Zod validation on all Server Action inputs
- Safe error responses (no raw DB errors)
- Import boundaries respected

### 3. Type Safety

- Array access with `?.` (noUncheckedIndexedAccess)
- No ignored TypeScript errors

## Output

Report as:

```
✅ PASS: [rule name]
❌ FAIL: [rule name] — [file:line] [description]
⚠️ WARN: [concern]
```
