# Runner Public Display Contract

## T3 Review Contract

PM: scope = make `/br/[branchId]/runner` a customer-facing display that does not require staff Auth or Account Login; acceptance = unauthenticated visitors can load the Runner board directly, while POS/KDS stay protected staff surfaces; priority = high because this screen is meant to be shown to guests.

BA: rules = Runner is read-only and shows only customer-board data; `branchId` remains URL-scoped; invalid branch IDs and central warehouse/kitchen branches must not render the board; no writes, actions, staff profile data, or account controls appear on this surface.

Senior Dev: approach = mark only the exact Runner board path as public in route resolution, keep POS/KDS behind proxy auth, and switch the Runner server page from `loadAuthState()` to a server-only service client read; no RLS, migration, RPC, or anon grant changes.

QA/QC: tests = static route/auth tests for public Runner path, static Runner page test proving no auth helper/import remains, and full `pnpm typecheck && pnpm lint && pnpm build`; smoke unauthenticated `/br/:id/runner` when a dev dataset/server is available.

## Synthesis

- Runner is a display surface, not an operator action surface.
- Public means no staff session, no branch-scope claim, and no Account Login dependency.
- The page still owns structural safety checks that used to be implicit in the protected proxy path: valid numeric branch and non-central operational branch kind.
- POS, KDS, branch settings, menu limits, money, and mutations remain protected by the existing auth/RLS/RPC layers.
