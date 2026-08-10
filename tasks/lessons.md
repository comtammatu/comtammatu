# Lessons Learned

> Durable, prose-only insight that is **not yet** enforced by a lint/test/hook.
> This file is a staging area, not an archive: when a lesson becomes mechanical,
> promote it to a guard or a `tasks/regressions.md` rule; when it becomes stable
> architecture, promote it to the relevant module / `docs/agent/rules/` doc —
> then delete it here. Keep only what is still prose-only and still load-bearing.
> Format: Pattern -> Rule -> Prevention.

1. **supabase-js typegen vs PostgREST runtime for M:1 FK joins**
   - Pattern: `select("*, parent(...)")` with `child.parent_id → parent.id` (M:1, no UNIQUE on FK column). supabase-js typegen marks the relation `isOneToOne: false` and infers TS type as `Parent[]`. PostgREST runtime returns a single `{ ... } | null` object. Code that follows TS inference (`row.parent?.[0]?.name`) reads `undefined` against the real object payload.
   - Rule: For M:1 embeds, treat the FK field as `{ ... } | null` (object), matching runtime. Use `row.parent as unknown as { ... } | null` (or pre-typed interface) to bridge supabase-js typegen quirk. Match `apps/web/app/(protected)/hr/attendance/attendance-table.tsx` (`record.shifts?.name`).
   - Prevention: Whenever you write `?.[0]?` on a select-embed, stop and check direction: if `child.fk → parent.pk` (M:1) it is an object, not an array; reserve `[0]` for reverse 1:M embeds.

2. **turbo `test` cache masks cross-package source-introspection failures**
   - Pattern: A test in package A reads ANOTHER package's source via `readFileSync` and asserts on its content (e.g. `packages/shared/src/kds/__tests__/auto-kitchen-print-trigger.test.ts` reads `apps/web/.../pos/print-actions.ts` and asserts it keeps `deferred_to: "kds_completion"`). Deleting/moving code in `apps/web` does NOT invalidate `@comtammatu/shared#test`'s turbo cache (cache key is package-scoped), so local `pnpm test`/`pnpm verify` replays a STALE pass while fresh CI fails.
   - Rule: When a change deletes/moves source that a cross-package source-introspection test reads, the per-package turbo cache will not catch the break locally — caught a `sendToKitchen` deletion only at CI (2026-06-17).
   - Prevention: After deletions/moves of code that any test reads as a file, run `pnpm exec turbo run test --force` locally before pushing. Treat a green cached `pnpm test` as "inputs unchanged", not "verified". CI runs fresh and is authoritative.

3. **Code that depends on an unapplied migration must never sit on the `main` ref, even unpushed**
   - Pattern: A fast-forward of local `main` put RPC-calling code onto the branch while its additive migration was still only a file. A parallel session then pushed `main`; Vercel auto-deployed production from it, and `/orders`, food-cost, and the consumption-variance report ran against three RPCs that did not exist in production for ~3h15m (2026-07-10). `/orders` was the worst case: it destructures only `{ data }` from the `rpc()` call, so the missing function surfaced as **0 orders / 0 revenue** instead of an error.
   - Rule: "Unpushed" is not a safety boundary in a repo where other sessions share the working tree and push `main`. Migration-dependent code stays on a feature branch until the migration is applied to production; apply first, then fast-forward `main`.
   - Rule: Never put additive and destructive DDL in one migration file. `CREATE FUNCTION new_thing` plus `DROP FUNCTION old_thing` need opposite deploy orders (additive: apply before deploy; destructive: deploy before apply), so one file cannot be applied safely in either order. Split them and apply the drop only after the deploy is verified.
   - Prevention: Before any `git merge --ff-only` onto `main`, ask whether the branch calls an RPC/column production lacks; if so, apply the additive migration first. When assessing blast radius, read the destructuring: a Server Action that ignores `error` from `.rpc()` turns a missing function into silently wrong numbers rather than a visible failure.
