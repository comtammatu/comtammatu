# React And Next.js Performance Rules

Project-enforced React/Next patterns. Read when writing or refactoring App
Router pages, Server Actions, client components, or data-fetching paths. This
file replaces vendor React performance encyclopedias; do not load external
React skill dumps for routine work.

## Critical

- Eliminate async waterfalls: start independent promises immediately; use
  `Promise.all` when there is no dependency; await only on the branch that needs
  the result.
- Authenticate and authorize inside every Server Action; never rely on layout
  or proxy alone.
- Prefer direct or framework-optimized imports; avoid pulling unused modules
  through accidental wide barrels when a package is not Next-optimized.
- Pass only fields the client uses across the RSC boundary.
- Keep request-scoped data out of mutable module-level server state.

## High

- Parallelize independent server fetches with composition or early promise
  creation; do not chain unrelated awaits.
- Use `React.cache()` for per-request dedupe of non-`fetch` server work
  (auth, DB helpers) when the same call repeats in one tree.
- Dynamic-import heavy client-only editors/charts that are not needed on first
  paint.
- Prefer URL search params for scope/filters; never put workflow scope in
  `localStorage` or React Context.

## Medium

- Derive values during render; do not mirror props into state + effects.
- Put user-triggered side effects in event handlers, not `useEffect`.
- Prefer `useTransition` / `useDeferredValue` for non-urgent UI updates over
  manual loading flags when the pattern already fits the surface.
- Do not define components inside components.
- Prefer functional `setState` when the next value depends on the previous one.

## Do Not

- Invent a second data or auth layer to “optimize” around these rules.
- Copy vendor rule catalogs into product docs or route comments.
- Trade Má Tư Design System or ACL contracts for micro-optimizations.
