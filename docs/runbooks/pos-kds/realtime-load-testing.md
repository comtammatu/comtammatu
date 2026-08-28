# POS/KDS Realtime Load Harness

Use this harness to measure whether Realtime event bursts collapse into fewer
RPC/refetch calls, and to count Postgres Changes fanout under multiple
subscribers.

## Synthetic Scheduler Benchmark

No Supabase writes. This exercises the same coalescer/batcher used by POS and
KDS client code.

```bash
corepack pnpm realtime:load -- --mode synthetic --surface mixed --clients 50 --events-per-client 100
```

Read `collapse`: higher is better. Example: `triggers=5000 runs=2` means a burst
of 5,000 invalidations caused only two scheduled RPC-shaped runs.

## Live Listener Benchmark

Requires `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and either
`--branch-id` or `E2E_CASHIER_EMAIL` in the loaded env files.

```bash
corepack pnpm realtime:load -- --mode listen --surface mixed --branch-id <branch-id> --clients 50 --duration-ms 30000
```

This opens virtual Realtime subscribers and counts events by table. It does not
write unless `--mutations` and `--allow-writes` are both provided.

## Write Mode

Write mode is not an approved operator workflow. `REALTIME_LOAD_TARGET` is only
a caller-supplied label; it does not prove that the loaded Supabase URL/ref is
non-production. Use synthetic or listener mode until the harness validates the
actual target ref against the Environment Registry and has mismatch tests.
