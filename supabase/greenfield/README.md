# Greenfield Supabase Bundle

This directory is not the production migration chain.

Files under `supabase/greenfield/migrations/` are rehearsal SQL for the
owner-approved greenfield target `staging` / `jmasiwuqiyedqvyfzhuq`. They must
not be applied through the normal production migration flow and must not be
moved into `supabase/migrations/` as-is.

Apply these files only after the active public baseline and
`supabase/managed-surfaces.install.sql` have been restored to an owner-approved
empty dev/test target. Use filename order. If a rehearsal change should
graduate to the active production path, author a separate production-reviewed
migration under `supabase/migrations/`; do not copy a rehearsal file as-is.

Acceptance gates:

- target project ref is verified before apply;
- no file under this directory is moved into `supabase/migrations/`;
- `pnpm lint:db-boundary` passes;
- `pnpm db:types` runs only after the approved target schema is updated;
- `pnpm typecheck && pnpm lint && pnpm build` passes before marking runtime work complete.

Boundary rules:

- `supabase/migrations/` is the production-forward chain.
- `supabase/greenfield/migrations/` is greenfield rehearsal only.
- `pnpm lint:db-boundary` fails if greenfield-only SQL appears in the
  production migration chain.
