import process from "node:process";
import { performance } from "node:perf_hooks";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { Database } from "@comtammatu/database";
import {
  bumpTicketToReady,
  createKdsTestTicket,
  createTestOrder,
  getPosTestContext,
} from "../e2e/helpers/supabase";
import {
  getRealtimeMetricsSnapshot,
  makeKeyedRealtimeBatcher,
  makeRealtimeCoalescer,
  resetRealtimeMetrics,
  type RealtimeSchedulerMetric,
} from "../app/_utils/realtime-scheduler";

type Mode = "synthetic" | "listen";
type Surface = "pos" | "kds" | "mixed";
type LoadTarget = "dev" | "test" | "local" | "staging";

interface HarnessArgs {
  allowWrites: boolean;
  branchId: number | null;
  burstSize: number;
  clients: number;
  durationMs: number;
  eventsPerClient: number;
  json: boolean;
  keySpace: number;
  mode: Mode;
  mutations: number;
  rpcLatencyMs: number;
  settleMs: number;
  surface: Surface;
  tickMs: number;
  writeConcurrency: number;
}

interface LiveClient {
  channel: RealtimeChannel;
  client: ReturnType<typeof createClient<Database>>;
}

interface LiveCounters {
  eventsByTable: Map<string, number>;
  subscribeErrors: number;
  subscribed: number;
  totalEvents: number;
}

interface FixtureCleanup {
  cleanup: () => Promise<void>;
  orderId: number;
  ticketId: number;
}

const DEFAULT_ARGS: HarnessArgs = {
  allowWrites: false,
  branchId: null,
  burstSize: 10,
  clients: 50,
  durationMs: 30_000,
  eventsPerClient: 100,
  json: false,
  keySpace: 20,
  mode: "synthetic",
  mutations: 0,
  rpcLatencyMs: 80,
  settleMs: 2_000,
  surface: "mixed",
  tickMs: 5,
  writeConcurrency: 4,
};

function usage(): string {
  return [
    "Realtime load harness",
    "",
    "Safe synthetic scheduler benchmark:",
    "  pnpm realtime:load -- --mode synthetic --surface mixed --clients 50 --events-per-client 100",
    "",
    "Live Realtime listener benchmark against dev/test Supabase:",
    "  pnpm realtime:load -- --mode listen --surface mixed --branch-id <branch-id> --clients 50 --duration-ms 30000",
    "",
    "Live listener with controlled fixture writes (dev/test only):",
    "  REALTIME_LOAD_TARGET=dev pnpm realtime:load -- --mode listen --surface mixed --clients 50 --mutations 20 --allow-writes",
    "",
    "Flags:",
    "  --mode synthetic|listen",
    "  --surface pos|kds|mixed",
    "  --clients N",
    "  --branch-id N",
    "  --duration-ms N",
    "  --events-per-client N",
    "  --mutations N",
    "  --allow-writes",
    "  --json",
  ].join("\n");
}

function parseBooleanFlag(value: string | boolean | undefined): boolean {
  if (value === true || value === undefined) return true;
  return value === "1" || value === "true" || value === "yes";
}

function resolveLoadTarget(): LoadTarget | null {
  const target = process.env.REALTIME_LOAD_TARGET;
  if (
    target === "dev" ||
    target === "test" ||
    target === "local" ||
    target === "staging"
  ) {
    return target;
  }
  return null;
}

function parseNumberFlag(name: string, value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name}: ${value ?? ""}`);
  }
  return parsed;
}

function parseArgs(argv: string[]): HarnessArgs {
  const args = { ...DEFAULT_ARGS };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw) continue;
    if (raw === "--") continue;
    if (raw === "--help" || raw === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (!raw.startsWith("--")) {
      throw new Error(`Unknown positional argument: ${raw}`);
    }

    const [flag, inlineValue] = raw.slice(2).split("=", 2);
    const nextValue =
      inlineValue ??
      (argv[index + 1]?.startsWith("--") ? undefined : argv[index + 1]);
    if (inlineValue === undefined && nextValue !== undefined) {
      index += 1;
    }

    switch (flag) {
      case "allow-writes":
        args.allowWrites = parseBooleanFlag(nextValue ?? true);
        break;
      case "branch-id":
        args.branchId = parseNumberFlag(flag, nextValue);
        break;
      case "burst-size":
        args.burstSize = parseNumberFlag(flag, nextValue);
        break;
      case "clients":
        args.clients = parseNumberFlag(flag, nextValue);
        break;
      case "duration-ms":
        args.durationMs = parseNumberFlag(flag, nextValue);
        break;
      case "events-per-client":
        args.eventsPerClient = parseNumberFlag(flag, nextValue);
        break;
      case "json":
        args.json = parseBooleanFlag(nextValue ?? true);
        break;
      case "key-space":
        args.keySpace = parseNumberFlag(flag, nextValue);
        break;
      case "mode":
        if (nextValue !== "synthetic" && nextValue !== "listen") {
          throw new Error(`Invalid mode: ${nextValue ?? ""}`);
        }
        args.mode = nextValue;
        break;
      case "mutations":
        args.mutations = parseNumberFlag(flag, nextValue);
        break;
      case "rpc-latency-ms":
        args.rpcLatencyMs = parseNumberFlag(flag, nextValue);
        break;
      case "settle-ms":
        args.settleMs = parseNumberFlag(flag, nextValue);
        break;
      case "surface":
        if (
          nextValue !== "pos" &&
          nextValue !== "kds" &&
          nextValue !== "mixed"
        ) {
          throw new Error(`Invalid surface: ${nextValue ?? ""}`);
        }
        args.surface = nextValue;
        break;
      case "tick-ms":
        args.tickMs = parseNumberFlag(flag, nextValue);
        break;
      case "write-concurrency":
        args.writeConcurrency = parseNumberFlag(flag, nextValue);
        break;
      default:
        throw new Error(`Unknown flag: --${flag}`);
    }
  }

  return args;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function includesPos(surface: Surface): boolean {
  return surface === "pos" || surface === "mixed";
}

function includesKds(surface: Surface): boolean {
  return surface === "kds" || surface === "mixed";
}

function metricSummary(metric: RealtimeSchedulerMetric) {
  const collapsePct =
    metric.triggerCount === 0
      ? 0
      : (1 - metric.runCount / metric.triggerCount) * 100;
  return {
    batchKeyCount: metric.batchKeyCount,
    collapsePct: Number(collapsePct.toFixed(2)),
    duplicateKeyCount: metric.duplicateKeyCount,
    errorCount: metric.errorCount,
    maxBatchSize: metric.maxBatchSize,
    runCount: metric.runCount,
    scheduledCount: metric.scheduledCount,
    triggerCount: metric.triggerCount,
  };
}

function printMetrics(snapshot: Record<string, RealtimeSchedulerMetric>): void {
  for (const [name, metric] of Object.entries(snapshot)) {
    const summary = metricSummary(metric);
    console.log(
      [
        `${name}:`,
        `triggers=${summary.triggerCount}`,
        `runs=${summary.runCount}`,
        `scheduled=${summary.scheduledCount}`,
        `collapse=${summary.collapsePct}%`,
        `batchKeys=${summary.batchKeyCount}`,
        `maxBatch=${summary.maxBatchSize}`,
        `duplicates=${summary.duplicateKeyCount}`,
        `errors=${summary.errorCount}`,
      ].join(" "),
    );
  }
}

async function runSynthetic(args: HarnessArgs): Promise<void> {
  resetRealtimeMetrics();
  const posSchedulers: Array<() => void> = [];
  const kdsSchedulers: Array<(orderId: number) => void> = [];

  for (let client = 0; client < args.clients; client += 1) {
    if (includesPos(args.surface)) {
      posSchedulers.push(
        makeRealtimeCoalescer(
          async () => {
            await wait(args.rpcLatencyMs);
          },
          undefined,
          { metricName: "harness.pos.rpc" },
        ),
      );
    }
    if (includesKds(args.surface)) {
      kdsSchedulers.push(
        makeKeyedRealtimeBatcher(
          async () => {
            await wait(args.rpcLatencyMs);
          },
          undefined,
          { metricName: "harness.kds.batch-rpc" },
        ),
      );
    }
  }

  const startedAt = performance.now();
  for (let eventIndex = 0; eventIndex < args.eventsPerClient; eventIndex += 1) {
    for (const schedule of posSchedulers) {
      schedule();
    }
    for (let client = 0; client < kdsSchedulers.length; client += 1) {
      const key = eventIndex % Math.max(args.keySpace, 1);
      kdsSchedulers[client]?.(key);
    }
    if ((eventIndex + 1) % Math.max(args.burstSize, 1) === 0) {
      await wait(args.tickMs);
    }
  }

  await wait(args.rpcLatencyMs + args.settleMs + 150);
  const elapsedMs = performance.now() - startedAt;
  const snapshot = getRealtimeMetricsSnapshot();

  if (args.json) {
    console.log(
      JSON.stringify({ args, elapsedMs, metrics: snapshot }, null, 2),
    );
    return;
  }

  console.log(
    `Synthetic complete: clients=${args.clients} surface=${args.surface} elapsedMs=${elapsedMs.toFixed(0)}`,
  );
  printMetrics(snapshot);
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function resolveBranchId(
  explicitBranchId: number | null,
): Promise<number> {
  if (explicitBranchId !== null) return explicitBranchId;
  const envBranchId = Number(process.env.REALTIME_LOAD_BRANCH_ID ?? "0");
  if (Number.isFinite(envBranchId) && envBranchId > 0) return envBranchId;
  if (process.env.E2E_CASHIER_EMAIL) {
    const context = await getPosTestContext();
    return context.branchId;
  }

  throw new Error(
    "Unable to resolve branch id. Pass --branch-id or set REALTIME_LOAD_BRANCH_ID.",
  );
}

function liveTables(surface: Surface): string[] {
  const tables = new Set<string>();
  if (includesPos(surface)) {
    tables.add("orders");
    tables.add("tables");
    tables.add("payments");
    tables.add("branch_menu_item_daily_limits");
  }
  if (includesKds(surface)) {
    tables.add("kds_tickets");
    tables.add("orders");
  }
  return Array.from(tables);
}

async function subscribeClient(opts: {
  branchId: number;
  clientIndex: number;
  counters: LiveCounters;
  surface: Surface;
  tables: string[];
}): Promise<LiveClient> {
  const client = createServiceClient();
  const channel = client.channel(
    `realtime-load-${opts.surface}-${opts.clientIndex}-${Date.now()}`,
  );

  for (const table of opts.tables) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        filter: `branch_id=eq.${opts.branchId}`,
        schema: "public",
        table,
      },
      (payload) => {
        const eventType = payload.eventType ?? "UNKNOWN";
        const key = `${table}.${eventType}`;
        opts.counters.totalEvents += 1;
        opts.counters.eventsByTable.set(
          key,
          (opts.counters.eventsByTable.get(key) ?? 0) + 1,
        );
      },
    );
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      opts.counters.subscribeErrors += 1;
      reject(
        new Error(
          `Realtime subscribe timed out for client ${opts.clientIndex}`,
        ),
      );
    }, 10_000);

    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        opts.counters.subscribed += 1;
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        opts.counters.subscribeErrors += 1;
        reject(error ?? new Error(`Realtime subscribe failed: ${status}`));
      }
    });
  });

  return { channel, client };
}

async function runLimited<T>(
  count: number,
  concurrency: number,
  worker: (index: number) => Promise<T>,
): Promise<T[]> {
  const results: T[] = [];
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= count) return;
    results[index] = await worker(index);
    await runNext();
  }

  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), count) },
    () => runNext(),
  );
  await Promise.all(workers);
  return results;
}

async function createFixture(surface: Surface): Promise<FixtureCleanup> {
  if (surface === "kds") {
    const ticket = await createKdsTestTicket();
    return {
      cleanup: ticket.cleanup,
      orderId: ticket.orderId,
      ticketId: ticket.ticketId,
    };
  }

  const order = await createTestOrder();
  return {
    cleanup: order.cleanup,
    orderId: order.orderId,
    ticketId: order.kdsTicketId,
  };
}

async function runMutations(args: HarnessArgs): Promise<FixtureCleanup[]> {
  if (args.mutations === 0) return [];
  if (!args.allowWrites) {
    throw new Error(
      "Refusing live writes without --allow-writes. Use dev/test Supabase only.",
    );
  }
  const target = resolveLoadTarget();
  if (!target) {
    throw new Error(
      "Refusing live writes without REALTIME_LOAD_TARGET=dev|test|local|staging.",
    );
  }

  const service = createServiceClient();
  return runLimited(args.mutations, args.writeConcurrency, async (index) => {
    const fixture = await createFixture(args.surface);
    const { error } = await service
      .from("orders")
      .update({ note: `Realtime load harness ${Date.now()} ${index}` })
      .eq("id", fixture.orderId);
    if (error) {
      throw new Error(`Failed to update fixture order ${fixture.orderId}`);
    }
    await bumpTicketToReady(fixture.ticketId);
    return fixture;
  });
}

async function cleanupFixtures(fixtures: FixtureCleanup[]): Promise<void> {
  await Promise.allSettled(fixtures.map((fixture) => fixture.cleanup()));
}

async function runLiveListen(args: HarnessArgs): Promise<void> {
  const branchId = await resolveBranchId(args.branchId);
  const counters: LiveCounters = {
    eventsByTable: new Map(),
    subscribeErrors: 0,
    subscribed: 0,
    totalEvents: 0,
  };
  const tables = liveTables(args.surface);
  const startedAt = performance.now();
  const liveClients: LiveClient[] = [];
  let fixtures: FixtureCleanup[] = [];

  try {
    for (let clientIndex = 0; clientIndex < args.clients; clientIndex += 1) {
      liveClients.push(
        await subscribeClient({
          branchId,
          clientIndex,
          counters,
          surface: args.surface,
          tables,
        }),
      );
    }

    fixtures = await runMutations(args);
    await wait(args.durationMs);

    const elapsedMs = performance.now() - startedAt;
    const eventEntries = Object.fromEntries(
      Array.from(counters.eventsByTable.entries()).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    );
    const result = {
      args: { ...args, branchId },
      elapsedMs,
      events: eventEntries,
      subscribeErrors: counters.subscribeErrors,
      subscribed: counters.subscribed,
      totalEvents: counters.totalEvents,
    };

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(
      `Live listen complete: branchId=${branchId} clients=${args.clients} surface=${args.surface} elapsedMs=${elapsedMs.toFixed(0)}`,
    );
    console.log(
      `subscribed=${counters.subscribed} subscribeErrors=${counters.subscribeErrors} totalEvents=${counters.totalEvents}`,
    );
    for (const [key, count] of Object.entries(eventEntries)) {
      console.log(`${key}: ${count}`);
    }
  } finally {
    await Promise.allSettled(
      liveClients.map(({ channel, client }) => client.removeChannel(channel)),
    );
    for (const { client } of liveClients) {
      client.realtime.disconnect();
    }
    await cleanupFixtures(fixtures);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "synthetic") {
    await runSynthetic(args);
    return;
  }
  await runLiveListen(args);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`realtime-load-harness failed: ${message}`);
  process.exitCode = 1;
});
