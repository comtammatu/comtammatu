# Supabase Local Baseline Replay

> Status: LOCAL REPLAY FAILED
> Date: 2026-05-26
> Target: scratch Supabase Local workdir only
> Remote projects queried or mutated: none

This replay check validates whether the current `supabase/migrations` folder can
serve as the install path for a greenfield database.

It cannot.

## Safety Boundary

- Used Supabase CLI through `pnpm dlx supabase`.
- Used a scratch workdir at `/tmp/comtammatu-supabase-local-check`.
- Copied `supabase/` into the scratch workdir.
- Changed only the scratch `config.toml` to avoid existing local ports.
- Did not stop the existing `matu-platform` Supabase Local containers.
- Did not apply migrations to any remote project.
- Did not query or mutate `matu-prod`.

4-agent debate is skipped because this is verification evidence plus
documentation, not a feature, bug fix, or refactor.

## Toolchain

| Tool | Result |
| --- | --- |
| Supabase CLI | `2.101.0` via `pnpm dlx supabase --version` |
| Docker | `29.4.3` |
| Node | `v24.15.0` |
| pnpm | `10.33.0` |

Initial `supabase db start` in the repo workdir was blocked by an existing local
Supabase project:

```text
Bind for 0.0.0.0:54322 failed: port is already allocated
Try stopping the running project with supabase stop --project-id matu-platform
```

To avoid disrupting that project, the replay used a scratch project id and ports:

```toml
project_id = "comtammatu-local-baseline-check"

[api]
port = 55421

[db]
port = 55432
shadow_port = 55430
major_version = 17
```

## Command

```bash
pnpm dlx supabase db start --workdir /tmp/comtammatu-supabase-local-check
```

Supabase Local began applying migrations from an empty local database and failed
during migration replay.

## Failure

Replay stopped at:

```text
Applying migration 20260508055046_hddt_summary_rpcs.sql...
ERROR: column oi.vat_rate does not exist (SQLSTATE 42703)
```

The failing statement is inside `public._compute_vat_breakdown(...)` in
`supabase/migrations/20260508055046_hddt_summary_rpcs.sql`.

Root cause in local migration order:

| Requirement | Migration using it | Migration creating it |
| --- | --- | --- |
| `public.order_items.vat_rate` | `20260508055046_hddt_summary_rpcs.sql` | `20260509000000_finance_phase1_5_vat_per_line.sql` |

The migration chain therefore references a column one day before the column is
created. This is an empty-database replay failure, not just a live-vs-local
timestamp mismatch.

## Verdict

`NO-GO` for `local-chain-first`.

`live-schema-first` is now finalized as the only practical baseline strategy for
the upgraded database package.

The current local migration folder remains useful as historical evidence and
for forward-change archaeology, but it is not a greenfield install path.

## Consequences

1. Do not spend time repairing the existing migration chain unless the owner
   explicitly wants a historical replay project.
2. Build the upgraded baseline from verified live schema shape.
3. Treat local migration files after 2026-05-08 as content evidence only until
   each item is matched against live schema effects.
4. Keep schema extraction and data migration separate.
5. The next real gate is restoring a clean `live-schema-first` baseline
   candidate into an empty approved dev/test database and regenerating DB types
   from that restored schema.
