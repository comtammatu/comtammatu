# Lessons Learned

> Durable, prose-only insight that is **not yet** enforced by a lint/test/hook.
> This file is a staging area, not an archive: when a lesson becomes mechanical,
> promote it to a guard or a `tasks/regressions.md` rule; when it becomes stable
> architecture, promote it to the relevant module / `docs/agent/rules/` doc —
> then delete it here. Keep only what is still prose-only and still load-bearing.
> Format: Pattern -> Rule -> Prevention.

1. **Do not fake preset UI with raw elements**
   - Pattern: Used plain `div` / `span` / `p` plus Tailwind classes to imitate preset-backed `Card`, `Badge`, `Button`, `Table`, or other shadcn primitives.
   - Rule: If a surface visually behaves like a primitive, it must use the project primitive directly. Never rebuild the same surface with raw elements, even if the result looks similar.
   - Prevention: Before writing any UI markup, map each visible surface to an existing primitive from `packages/ui/src/components/*`. If no primitive fits, stop and discuss instead of inventing a parallel pattern.

2. **Do not mix POS commercial close with KDS fulfillment**
   - Pattern: POS required `served` / KDS item completion before cashier could complete an order and release the table.
   - Rule: Payment closes the POS order; KDS state closes the kitchen work. `served` is fulfillment-only and must not release a table.
   - Prevention: Any payment or table-release change must test a dine-in order with unfinished KDS tickets: payment succeeds, order becomes `completed`, table becomes `available`, and KDS tickets stay unchanged.

3. **supabase-js typegen vs PostgREST runtime for M:1 FK joins**
   - Pattern: `select("*, parent(...)")` with `child.parent_id → parent.id` (M:1, no UNIQUE on FK column). supabase-js typegen marks the relation `isOneToOne: false` and infers TS type as `Parent[]`. PostgREST runtime returns a single `{ ... } | null` object. Code that follows TS inference (`row.parent?.[0]?.name`) reads `undefined` against the real object payload.
   - Rule: For M:1 embeds, treat the FK field as `{ ... } | null` (object), matching runtime. Use `row.parent as unknown as { ... } | null` (or pre-typed interface) to bridge supabase-js typegen quirk. Match `apps/web/app/(protected)/hr/attendance-table.tsx` (`record.shifts?.name`).
   - Prevention: Whenever you write `?.[0]?` on a select-embed, stop and check direction: if `child.fk → parent.pk` (M:1) it is an object, not an array; reserve `[0]` for reverse 1:M embeds.

4. **Next.js 16.2 webpack + serwist intermittent cache poisoning**
   - Pattern: After regenerating `database.types.ts` mid-session, `pnpm build` failed with `uncaughtException TypeError: Cannot read properties of undefined (reading 'length') at ignore-listed frames` — error originates in Next.js / serwist internals, not user code. Compile passed; the failure was in the post-compile manifest step. Clearing `.next` + `.turbo` resolved.
   - Rule: When `pnpm build` fails with a `TypeError ... ignore-listed frames` from inside Next.js / serwist after a types regeneration, the cause is webpack/serwist manifest desync — not code. Clear `apps/web/.next` and `apps/web/.turbo` and rebuild. Use `pnpm clean:web && pnpm build` as the single recovery sequence.
   - Prevention: Added `pnpm clean:web` script at root (uses `node scripts/clean-web.mjs`, cross-platform). When changing types in mid-session, default to clean rebuild to avoid the trap.

5. **Bash `run_in_background` notification exit-code is unreliable; ALWAYS read the output file**
   - Rule: Treat the bg-completion notification as "done", not "succeeded" — for chained pnpm/turbo invocations the notification can report exit 0 while the output contains `ELIFECYCLE ... exit code 1` / `Failed to type check`. The output file's own summary (`Tasks: N successful` / `Failed:` token) is authoritative.
   - Prevention: `tail -10 <output_file>` after every bg notification; exit-0 + `Failed:` line = real failure.
