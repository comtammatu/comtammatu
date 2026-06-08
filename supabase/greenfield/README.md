# `supabase/greenfield/` — HKD lean DB rebuild tooling

DB-side tooling for rebuilding comtammatu's schema lean for a Hộ Kinh Doanh.
The OUTPUT (canonical lean baseline) lives at
[`../migrations/00000000000000_baseline.sql`](../migrations/00000000000000_baseline.sql).

- **`lean-cutover.sql`** — the transform applied on top of the complete prod
  schema: drops ~61 tables + 16 GL/production/transfer RPCs, drops GL FK columns,
  adds `cash_entries`. (RPC de-wire lives in `verify/dewire-rpcs.sql`.)
- **`verify/`** — `build-lean.sh` regenerates + replay-from-empty-verifies the
  lean baseline from current prod truth; `supa-shim.sql` + `dewire-rpcs.sql` are
  its inputs. See [`verify/README.md`](verify/README.md).

Frozen inputs (the old in-place migrations folded into the baseline) live under
[`../_legacy/`](../_legacy/README.md). The previous "greenfield rehearsal" model
(per-migration SQL under `greenfield/migrations/`) is retired — the lean baseline
is now a single replayable artifact.
