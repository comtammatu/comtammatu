# Greenfield Supabase Bundle

This directory is not the production migration chain.

Files under `supabase/greenfield/migrations/` are rehearsal SQL for the
owner-approved greenfield target `staging` / `jmasiwuqiyedqvyfzhuq`. They must
not be applied through the normal production migration flow and must not be
moved into `supabase/migrations/` as-is.

Use `docs/runbooks/supabase-greenfield-baseline.md` for the application order
and acceptance gates. If a greenfield rehearsal change should graduate to the
active production path, author a separate production-reviewed migration under
`supabase/migrations/`.

Boundary rules:

- `supabase/migrations/` is the production-forward chain.
- `supabase/greenfield/migrations/` is greenfield rehearsal only.
- `pnpm lint:db-boundary` fails if greenfield-only SQL appears in the
  production migration chain.
