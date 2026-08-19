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

2. **Code that depends on an unapplied migration must never sit on the `main` ref, even unpushed**
   - Pattern: A fast-forward of local `main` put RPC-calling code onto the branch while its additive migration was still only a file. A parallel session then pushed `main`; Vercel auto-deployed production from it, and `/orders`, food-cost, and the consumption-variance report ran against three RPCs that did not exist in production for ~3h15m (2026-07-10). `/orders` was the worst case: it destructures only `{ data }` from the `rpc()` call, so the missing function surfaced as **0 orders / 0 revenue** instead of an error.
   - Rule: "Unpushed" is not a safety boundary in a repo where other sessions share the working tree and push `main`. Migration-dependent code stays on a feature branch until the migration is applied to production; apply first, then fast-forward `main`.
   - Rule: Never put additive and destructive DDL in one migration file. `CREATE FUNCTION new_thing` plus `DROP FUNCTION old_thing` need opposite deploy orders (additive: apply before deploy; destructive: deploy before apply), so one file cannot be applied safely in either order. Split them and apply the drop only after the deploy is verified.
   - Prevention: Before any `git merge --ff-only` onto `main`, ask whether the branch calls an RPC/column production lacks; if so, apply the additive migration first. When assessing blast radius, read the destructuring: a Server Action that ignores `error` from `.rpc()` turns a missing function into silently wrong numbers rather than a visible failure.
