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

7. **Domain terminology has a single source of truth**
   - Pattern: Ad-hoc hardcoded Vietnamese copy introduced drift terms (e.g. "Employee Portal" instead of canonical label, "Kiểm kê kho" instead of "Stocktake")
   - Rule: All domain/UI wording must come from one of three canonical sources: `docs/ref/glossary.md` (business meaning), `packages/shared/src/labels/vi.ts` (shared labels), or `apps/web/app/(protected)/inventory/_lib/dictionary.ts` (inventory-specific adapters). Never introduce new copy inline.
   - Prevention: When adding or changing copy, update the canonical source first (or in the same PR). Run `pnpm lint:copy` to catch drift. See regression rule TERMINOLOGY-SOURCE-OF-TRUTH.

8. **Do not fake preset UI with raw elements**
   - Pattern: Used plain `div` / `span` / `p` plus Tailwind classes to imitate preset-backed `Card`, `Badge`, `Button`, `Table`, or other shadcn primitives.
   - Rule: If a surface visually behaves like a primitive, it must use the project primitive directly. Never rebuild the same surface with raw elements, even if the result looks similar.
   - Prevention: Before writing any UI markup, map each visible surface to an existing primitive from `packages/ui/src/components/*`. If no primitive fits, stop and discuss instead of inventing a parallel pattern.

9. **Do not mix POS commercial close with KDS fulfillment**
   - Pattern: POS required `served` / KDS item completion before cashier could complete an order and release the table.
   - Rule: Payment closes the POS order; KDS state closes the kitchen work. `served` is fulfillment-only and must not release a table.
   - Prevention: Any payment or table-release change must test a dine-in order with unfinished KDS tickets: payment succeeds, order becomes `completed`, table becomes `available`, and KDS tickets stay unchanged.

10. **supabase-js typegen vs PostgREST runtime for M:1 FK joins**
    - Pattern: `select("*, parent(...)")` with `child.parent_id → parent.id` (M:1, no UNIQUE on FK column). supabase-js typegen marks the relation `isOneToOne: false` and infers TS type as `Parent[]`. PostgREST runtime returns a single `{ ... } | null` object. Code that follows TS inference (`row.parent?.[0]?.name`) reads `undefined` against the real object payload.
    - Rule: For M:1 embeds, treat the FK field as `{ ... } | null` (object), matching runtime. Use `row.parent as unknown as { ... } | null` (or pre-typed interface) to bridge supabase-js typegen quirk. Match `apps/web/app/(protected)/hr/attendance-table.tsx` (`record.shifts?.name`).
    - Prevention: Whenever you write `?.[0]?` on a select-embed, stop and check direction: if `child.fk → parent.pk` (M:1) it is an object, not an array; reserve `[0]` for reverse 1:M embeds.

11. **`pnpm db:types` MUST run after every supabase migration that adds/changes RPCs or tables**
    - Pattern: Applied a migration creating `fn_generate_b03_dn` RPC, wrote a server action calling `supabase.rpc("fn_generate_b03_dn", ...)`, ran `pnpm typecheck` (passed) + `pnpm lint` (passed) → ran `pnpm build` → FAIL with `Argument of type '"fn_generate_b03_dn"' is not assignable to parameter of type ...154 more...`. The RPC was missing from `database.types.ts`.
    - Rule: After ANY `supabase db push`, regenerate types BEFORE running gates: `supabase db push && pnpm db:types && pnpm typecheck && pnpm lint && pnpm build`. Skipping the regen leaves stale types that may pass turbo-cached typecheck but fail Next.js build's stricter inline TypeScript pass.
    - Prevention: Treat `db push → db:types` as a single atomic step; never invoke push without regen following. AGENTS.md already documents this; the lesson is to MENTALLY treat them as one command.

12. **Next.js 16.2 webpack + serwist intermittent cache poisoning**
    - Pattern: After regenerating `database.types.ts` mid-session, `pnpm build` failed with `uncaughtException TypeError: Cannot read properties of undefined (reading 'length') at ignore-listed frames` — error originates in Next.js / serwist internals, not user code. Compile passed; the failure was in the post-compile manifest step. Clearing `.next` + `.turbo` resolved.
    - Rule: When `pnpm build` fails with a `TypeError ... ignore-listed frames` from inside Next.js / serwist after a types regeneration, the cause is webpack/serwist manifest desync — not code. Clear `apps/web/.next` and `apps/web/.turbo` and rebuild. Use `pnpm clean:web && pnpm build` as the single recovery sequence.
    - Prevention: Added `pnpm clean:web` script at root (uses `node scripts/clean-web.mjs`, cross-platform). When changing types in mid-session, default to clean rebuild to avoid the trap.

13. **Bash `run_in_background` notification exit-code is unreliable; ALWAYS read the output file**
    - Pattern: Background `pnpm build` reported `exit code 0` in the system task-notification, but reading the output file showed `ELIFECYCLE Command failed with exit code 1` and a `Failed to type check` error. The notification mechanism does NOT reliably capture true exit status for chained pnpm/turbo invocations on Windows pnpm shim.
    - Rule: After every Bash `run_in_background` task completion, READ the output file before treating it as success. The summary `Tasks: N successful, M total` line in the file is authoritative; the notification's exit-code is advisory.
    - Prevention: Develop the habit `tail -10 <output_file>` immediately after each bg notification, treat the notification as "done" not "succeeded". For build/test gates, parse for `Failed:` token explicitly — exit-0 + `Failed:` line = real failure.
