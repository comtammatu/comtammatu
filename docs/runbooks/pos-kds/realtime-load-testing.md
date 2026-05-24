# POS/KDS Realtime Load Harness

Use this harness to measure whether Realtime event bursts collapse into fewer
RPC/refetch calls, and to count Postgres Changes fanout under multiple
subscribers.

## Synthetic Scheduler Benchmark

No Supabase writes. This exercises the same coalescer/batcher used by POS and
KDS client code.

```bash
pnpm realtime:load -- --mode synthetic --surface mixed --clients 50 --events-per-client 100
```

Read `collapse`: higher is better. Example: `triggers=5000 runs=2` means a burst
of 5,000 invalidations caused only two scheduled RPC-shaped runs.

## Live Listener Benchmark

Requires `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and either
`--branch-id` or `E2E_CASHIER_EMAIL` in the loaded env files.

```bash
pnpm realtime:load -- --mode listen --surface mixed --branch-id 1 --clients 50 --duration-ms 30000
```

This opens virtual Realtime subscribers and counts events by table. It does not
write unless `--mutations` and `--allow-writes` are both provided.

## Controlled Dev/Test Writes

Only use against dev/test Supabase. The script creates E2E fixture orders and
KDS tickets, waits for Realtime delivery, then removes the fixtures.

```bash
REALTIME_LOAD_TARGET=dev pnpm realtime:load -- --mode listen --surface mixed --clients 50 --mutations 20 --allow-writes
```

Do not run write mode against production. The harness refuses `--allow-writes`
unless `REALTIME_LOAD_TARGET` is one of `dev`, `test`, `local`, or `staging`.
