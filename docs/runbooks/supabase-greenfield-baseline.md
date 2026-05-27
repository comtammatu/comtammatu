# Supabase Greenfield Baseline Runbook

> Status: rehearsal-only
> Canonical source: `docs/plan/live-schema-first-baseline-extraction.md`
> Production mutation: forbidden

Use this runbook to package and verify a clean Supabase baseline for the next
project track. This does not replace the active pilot database and does not
apply migrations to production.

## Safety Rails

- Verify the linked project ref is `iexwsuaqqenyjiskawoj` before export.
- Do not use `supabase db pull` for the baseline package. It is migration
  history dependent and can ask to update remote migration history.
- Do not run parallel `supabase db dump --linked` commands. Use the repo scripts
  so each schema export runs one at a time.
- Do not export data rows in this schema pass. Data, storage objects, provider
  identifiers, and queue state follow `docs/plan/data-audit-classification.md`.
- Restore rehearsals must use scratch Supabase Local or an owner-approved empty
  dev/test database only.

## Step 1: Dry Run The Export Plan

Run a single-schema dry run first:

```bash
pnpm db:baseline:extract:dry-run -- --schemas=public
```

Expected result: the command prints a sanitized `pg_dump` plan and does not
write SQL files.

If a temp-login auth circuit breaker appears, stop and wait before retrying.
Do not keep retrying linked dumps in a loop.

## Step 2: Export Schema Artifacts

Export into an untracked artifact directory:

```bash
pnpm db:baseline:extract -- --schemas=public
```

Default output:

```text
.baseline-artifacts/supabase-live-baseline-<timestamp>/
  manifest.json
  public.schema.sql
```

Start with `public`. Managed surfaces such as `storage`, `auth`, `cron`, and
`realtime` need separate review before they become install SQL.

## Step 3: Local Public-Schema Check

Apply the candidate SQL to a scratch Supabase Local project:

```bash
pnpm db:baseline:local-check -- --baseline=.baseline-artifacts/<run>/public.schema.sql
```

The script creates a scratch workdir under `/tmp`, uses non-default ports, runs
`supabase db start`, then stops and removes the scratch project unless `--keep`
is provided.

## Step 4: Managed Surfaces

Read the manifest before writing install SQL:

```text
docs/plan/supabase-managed-surfaces-baseline.md
```

Package these surfaces after the public schema candidate exists:

- extension enablement
- storage buckets and storage policies
- auth hook function, grants, and `supabase/config.toml` hook setting
- realtime publication and replica identity settings
- DB cron jobs through explicit `cron.schedule(...)` calls
- Data API exposed-schema verification after restore

Do not restore `auth`, `storage`, or `realtime` as blind raw schema dumps.

Install bundle:

```text
docs/plan/supabase-managed-surfaces-install-bundle.sql
```

For remote restore, use a scratch CLI workdir instead of changing the repo's
linked source project:

```bash
WORKDIR=/tmp/comtammatu-greenfield-remote-restore
pnpm dlx supabase link --project-ref jmasiwuqiyedqvyfzhuq --workdir "$WORKDIR" --yes
```

If `supabase db query --linked` or `supabase db push --linked` fails with an
IPv6 route error, stop. Use a pooler/direct DB URL with password for the
greenfield project, or a Management API migration path, rather than relinking
the repo to the live source project.

For the 2026-05-26 `staging` target, the working Supavisor session pooler shard
was:

```text
aws-1-ap-southeast-1.pooler.supabase.com:5432
```

The direct linked CLI route still resolved to IPv6 and failed from this machine.
The successful restore used `psql` through the local Supabase Postgres container
as a client and applied the public schema in transaction-scoped chunks instead
of one long transaction, because the pooler dropped the single long-running
transaction near the grants section.

## Acceptance Gate

The package is not accepted until:

- The candidate SQL boots from an empty Supabase Local database.
- Public table/view/function/RLS/policy counts match the live manifest or have
  explicit owner-approved deviations.
- Storage buckets, cron jobs, realtime publication, extension enablement, and
  auth hook behavior are handled as separate install steps and restored to an
  approved empty dev/test database.
- `pnpm db:types` is regenerated from the restored source schema.
- `pnpm typecheck && pnpm lint && pnpm build` passes after type regeneration.
