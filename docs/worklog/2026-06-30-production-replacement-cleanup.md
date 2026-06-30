# Production Replacement Cleanup Contract (T3)

Status: Reconciled-through 9134633b.

Owner: `tasks/todo.md` active-board cleanup and the production-replacement baseline.

Tier: T3 because this work touches Supabase replacement, migrations/RLS/auth,
money/payment completion, cron observability, generated DB types, and production
cutover criteria.

Skill plan: repo rules = engineering + skills + workflow + database + team +
orchestration + references; external skills = superpowers:brainstorming,
superpowers:dispatching-parallel-agents, vercel:nextjs,
vercel:deployments-cicd, vercel:env-vars, vercel:react-best-practices,
vercel:turborepo, next-best-practices, Supabase,
Supabase Postgres best practices; runtime tools = CodeGraph,
Vercel documentation search, Supabase documentation search, read-only shell
audit, local gates, Supabase CLI/MCP only after the target ref is registered;
skipped = any production write, any Supabase write to an unregistered project,
and any commit because the owner has not requested a commit.

## Owner Decision

The target is a production replacement, not a rehearsal-only project.

Greenfield data must not carry old operational history:

- no old `orders`
- no old `payments`
- no old `tax_invoices`
- no old attendance rows
- no old cron logs
- no old audit logs
- no old `stock_movements`

Allowed replacement data is current master/configuration data plus explicit
opening balances or cutover stocktakes only if the owner approves them.

## Cleanup Definition

Repo cleanup must happen before the production replacement.

`tasks/todo.md` must stop being a mixed archive/roadmap. After this cleanup it
should contain only:

- production-replacement blockers
- owner decisions required before cutover
- actively executable tasks with a clear verification path

Long-term ideas, later-scope roadmap items, deferred work blocked on telemetry/hardware,
and tasks already shipped must be removed from the active board or promoted to
the correct source of truth.

## Four-Perspective Synthesis

PM: The baseline should not chase a zero-TODO fantasy. It should close or remove
items that can hide data corruption, break replay, confuse production-vs-new
project routing, or block validation of the replacement project. Roadmap and
telemetry-dependent cleanup must not stay as active blockers.

BA: The replacement must preserve the HKD operational model: tenant/branch
hierarchy, auth/profile/position/permission spine, POS to KDS to payment to
print/HDDT truth chain, finance vocabulary, inventory receipt/consumption
semantics, and branch-edge printing. Old event history is excluded from the new
project.

Senior Dev / DB-Security: Keep the cleanup narrow by root cause. Fix observability
where DB errors are swallowed, close T3 auth/payment/cron tails, verify migration
and generated-type state, and register the new Supabase ref before any write.
Do not rewrite baseline SQL, drop RPCs, or prune indexes without evidence.

QA/QC: Baseline-ready means a blank environment can replay, seed, build, type
check, and pass at least one real operator path. CI must not be widened by
stuffing unstable Playwright specs into one overloaded job. Fresh-project checks
must include auth hook, grants/RLS, storage policies, realtime publication,
advisors, generated types, and smoke roles.

## Cleanup Workstreams

1. Active-board triage
   - Classify every open `tasks/todo.md` row as `fix now`, `verify/close`,
     `owner decision`, `defer outside baseline`, or `delete from active board`.
   - Remove shipped rows and stale notes from the active section.
   - Move durable rules to `tasks/regressions.md`, `tasks/lessons.md`,
     `docs/plan/decisions.md`, module docs, or runbooks as appropriate.

2. Blocker fixes
   - Surface swallowed Supabase read/select errors server-side by shell, without
     returning raw database messages to clients.
   - Add `cron_run_log` plus notification alerts for scheduled mutation paths
     that can fail silently.
   - Tighten payment completion so sale completion uses `pos:confirm_payment`
     where money is actually confirmed, without blocking QR creation/setup paths
     unnecessarily.
   - Finish or verify the `can_access_branch` removal tail and regenerate DB
     types against the correct type-source schema.

3. Baseline-critical verification
   - Keep `payment-cash` as the mandatory e2e smoke.
   - Fix only e2e drift that represents real baseline semantics, such as daily
     limit timezone behavior or fresh-project realtime publication requirements.
   - Treat KDS ordering, full inventory UI e2e, modifier fixtures, and multi-spec
     CI runner saturation as separate post-baseline work unless they block the
     replacement launch contract.

4. Production replacement preparation
   - Register the new Supabase project ref in `docs/agent/rules/database.md`
     before any write.
   - Update the guard/adapters if the new ref changes the allowed-write posture.
   - Apply the migration chain to the registered replacement project only through
     an explicit target ref, never by relying on `.env.local`.
   - Seed approved master/configuration data only.
   - Run advisors, generated types, hard gates, baseline replay, and smoke roles.

## Provider Best-Practice Lanes

Provider guidance is used as a review and verification layer. Repo rules remain
the authority when a provider pattern conflicts with the app's operating
contract.

### Vercel / Next.js

- Verify App Router behavior against Next.js 16 rules: `proxy.ts` is traffic
  control only, never the sole authorization layer; Server Components and Server
  Actions must re-check auth/ACL at data and mutation boundaries.
- Keep internal reads in Server Components where possible. Client Components
  should receive serialized initial data or use a Route Handler only when a
  client-side read is genuinely needed.
- Keep UI-triggered mutations in Server Actions with Zod validation and
  sanitized errors. Route Handlers are for external integrations, webhooks,
  public APIs, or cacheable API reads.
- Audit touched routes for Next.js 15/16 async APIs: `params`,
  `searchParams`, `cookies()`, and `headers()` must be awaited or unwrapped with
  `React.use()` in the narrow cases where that is appropriate.
- Keep Client Component boundaries serializable: no async client components, no
  function props except Server Actions, and no `Date`/`Map`/class instances
  crossing the Server-to-Client boundary without conversion.
- Default new route/page/runtime work to Node.js runtime. Edge runtime requires
  a named latency need and dependency compatibility check.
- Wrap `useSearchParams()` and dynamic-route `usePathname()` usage in Suspense
  when the route shape requires it, so one client hook does not force a larger
  CSR bailout.
- Keep server-incompatible packages isolated: browser-only packages behind
  client wrappers or `dynamic(..., { ssr: false })`, native/server packages via
  `serverExternalPackages` only when needed, and package-transpilation changes
  localized to `next.config.ts`.
- Keep service clients and provider SDKs lazy enough for `next build`; no
  build-time initialization should require runtime-only secrets.
- Use Vercel environment separation deliberately:
  - preview must not point to the current production database unless explicitly
    documented for a read-only check
  - production replacement variables must be pulled/applied for the replacement
    target only
  - CI checks that depend on Vercel envs should use explicit
    `vercel pull --environment=<target>` or `vercel env run`
- CI/deploy shape should keep build, test, smoke, and production promotion as
  separate gates. Do not add unstable realtime e2e specs to the existing single
  overloaded Playwright job.
- Run the React best-practices checklist only on slices that edit multiple TSX
  files; do not spend it on SQL/doc-only cleanup.

### Packages / Dependencies

- Keep dependency policy rooted at the workspace root. Use `pnpm-workspace.yaml`
  overrides and build-script allow lists instead of scattered package-local
  exceptions.
- `corepack pnpm install --frozen-lockfile` must be reproducible without
  interactive build-script approval prompts.
- `corepack pnpm deps:audit` must run non-interactively and must not mutate the
  real `node_modules` tree while checking dedupe state.
- Direct dependency changes require a real import, script command, peer
  dependency need, or binary usage. Otherwise remove the dependency rather than
  documenting why it is unused.
- Deprecated transitive dependency warnings are not automatic launch blockers;
  promote them only when the owning top-level dependency has a practical upgrade
  path inside the baseline window.

### Monorepo / Turborepo

- Keep the current architecture shape unless evidence says otherwise:
  `apps/web`, `apps/print-agent`, and shared packages for database, shared
  domain logic, UI, security, and print rendering.
- Preserve `@comtammatu/web` as the only Next.js app for this replacement. Do
  not split microfrontends or multi-zones for a single-team internal operator
  product.
- Treat `turbo.json` as the task graph authority. Full baseline completion still
  uses the repo hard gate, while local/debug work may use package filters or
  `--affected` only as a developer optimization.
- Keep workspace package imports one-way: apps may import packages; packages
  must not import from apps. If this becomes noisy or repeatedly regresses, add
  an explicit `turbo boundaries` task rather than relying on convention alone.
- Keep `apps/web/next.config.ts` as the only place for Next.js package
  transpilation, server externalization, image optimization, and package import
  optimization decisions.

### Supabase / Postgres

- Register the replacement project ref before any write-capable command, and
  keep production `iexwsuaqqenyjiskawoj` SELECT-only unless the owner explicitly
  delegates a production write in the current session.
- Treat Supabase preview branches as isolated test environments, not the
  permanent production replacement. A replacement project must be a registered
  project target with its own env and seed contract.
- Run migrations in sequential order from the repo chain; branch/preview data is
  temporary, and production operational history is not copied into the
  replacement project.
- For public/exposed schemas, new tables require RLS plus explicit grants.
  Policies must use the repo auth helpers and tenant/branch predicates, not just
  `TO authenticated`.
- `SECURITY DEFINER` functions must have explicit authz, stable `search_path`,
  and intentional `EXECUTE` grants. Revoke from `PUBLIC`, `anon`, and
  `authenticated` when browser execution is not intended.
- Run Supabase advisors after schema changes and before declaring the
  replacement project baseline-ready.

## Explicitly Out Of Active Cleanup

- Dropping unused indexes without a representative stats window.
- Dead-RPC waves without function tracking plus the six-channel scan.
- Partial payments / split-invoice rebuild.
- HR/payroll expansion beyond baseline safety.
- QR self-order, loyalty, advanced analytics, and employee portal expansion.
- All-branch print deployment and HDDT provider smoke unless the owner supplies
  hardware/provider credentials and promotes them to launch blockers.
- UI debt cleanup that is not tied to a replacement-blocking route.

These items may exist as decisions, runbooks, or future roadmap notes, but not
as active-board blockers for production replacement.

## Acceptance Criteria

- `tasks/todo.md` has no shipped rows, stale blockers, dead tasks, or roadmap
  rows in the active sections.
- Every remaining active row has one owner state: `fix now`, `owner decision`,
  or `blocked by named external dependency`.
- `corepack pnpm install --frozen-lockfile` completes without interactive
  build-script approval prompts.
- `corepack pnpm deps:audit` passes without mutating the real `node_modules`
  tree.
- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build` passes.
- `corepack pnpm db:baseline:local-check` passes.
- The mandatory e2e smoke stays green against a from-empty local stack.
- Generated DB types are clean after the type-source schema is applied.
- The replacement Supabase ref is registered before writes.
- No old production operational history is migrated into the replacement
  project.

## Current Verification Snapshot

Local verification for the package, dependency, Next.js, and monorepo cleanup
lane is green:

- `corepack pnpm install --frozen-lockfile`
- `corepack pnpm deps:audit`
- `corepack pnpm verify`

## Open Owner Decisions

- Which current branches/sites are included in the replacement master seed.
- Whether opening balances/cutover stocktakes are seeded, and at what date/time.
- Whether print-agent and HDDT provider smoke are required before cutover or
  tracked as branch rollout work after replacement.
- Whether dashboard metric definitions must be settled before cutover or can
  remain an owner decision outside the replacement blocker set.

## T3 Attestation

Test plan: local gates, baseline replay, generated-type diff check, e2e smoke,
and replacement-project post-apply checks are required. Deferred test coverage
must be tied to a named reason, not left as a vague backlog row.

BA rules mapping: greenfield-history exclusion belongs in replacement seed/runbook
work; auth/payment/cron/DB-read concerns belong in implementation slices; board
cleanup belongs in `tasks/todo.md` plus any promoted source-of-truth docs.

Known out-of-scope gaps: telemetry-dependent RPC/index cleanup, hardware/provider
smoke without credentials, and future product expansion.
