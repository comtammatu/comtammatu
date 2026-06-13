# FK Covering Indexes (hot wave) - 2026-06-14

Scope: production `iexwsuaqqenyjiskawoj`. First, conservative slice of the
performance advisor `unindexed_foreign_keys` (145 flagged). Companion to
`supabase-rls-initplan-2026-06-14.md`.

## Selection

At pilot scale the largest flagged table is ~17k rows, so index value is modest
and selection matters more than coverage. Added only FK columns that are real
filter/join keys on the hottest tables:

| Index | Table (rows) | Why |
| --- | --- | --- |
| `print_jobs_printer_id_idx` | print_jobs (~16.9k) | print-agent polls/claims jobs by printer |
| `kitchen_send_batches_order_id_idx` | kitchen_send_batches (~7k) | join to orders (KDS "what was sent") |
| `kitchen_send_batches_branch_id_idx` | kitchen_send_batches (~7k) | branch-scoped KDS queries |
| `notifications_target_branch_id_idx` | notifications (~6.4k) | branch-scoped notification fetch |

Deliberately deferred (telemetry-driven later wave): single-tenant `tenant_id`
columns (no selectivity — every row is tenant 1), pure user-audit refs
(`created_by`/`changed_by`/`*_by`/`actor_id` — rarely used as query filters), FKs
on near-empty tables, and all FKs on D020-doomed GL tables (`journal_entries`
etc.) which are being dropped. Plain `CREATE INDEX` (transactional, sub-second at
this size) rather than `CONCURRENTLY`.

## Production Apply (done 2026-06-14)

Owner-delegated in-session apply (§2): guard block 2 lifted then restored
byte-identical (`git diff` empty, `lint:guard-sync` green, write-probe re-blocked).
Dry-run (`BEGIN … CREATE INDEX×4 … self-check … ROLLBACK`) passed; real
(`… COMMIT`) applied; ledger row `20260614092000` recorded.

Verified: all four indexes present; advisor `unindexed_foreign_keys` 145 → 141.

## Not Done

- Remaining 141 unindexed FKs — defer to a telemetry-driven wave once real query
  patterns (and table growth) justify specific covering indexes.
- `multiple_permissive_policies` (54) and `unused_index` (161, deferred per
  `tasks/todo.md`) are separate.
