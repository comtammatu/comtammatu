import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import packageJson from "../package.json";
import {
  dispatchPrintJob,
  type PrinterRow,
  type PrintJobRow,
} from "./dispatch.js";

loadEnv({ path: [".env.local", ".env"], quiet: true });

const requireEnv = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
};

const numEnv = (k: string, fallback: number): number => {
  const raw = process.env[k];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const webBaseUrl = process.env.WEB_BASE_URL ?? null;
const presenceToken = process.env.PRINT_AGENT_PRESENCE_TOKEN ?? null;
const agentId = process.env.AGENT_ID ?? `agent-${process.pid}`;

if (webBaseUrl && !presenceToken) {
  throw new Error(
    "Missing env PRINT_AGENT_PRESENCE_TOKEN when WEB_BASE_URL is set",
  );
}

if (presenceToken && !process.env.AGENT_ID) {
  throw new Error(
    "Missing env AGENT_ID when PRINT_AGENT_PRESENCE_TOKEN is set; presence tokens are bound to a stable agent id",
  );
}

const config = {
  supabaseUrl: requireEnv("SUPABASE_URL"),
  serviceKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  branchId: Number(requireEnv("AGENT_BRANCH_ID")),
  tenantId: Number(requireEnv("AGENT_TENANT_ID")),
  agentId,
  version: packageJson.version,
  // Network gate: agent registers its NAT egress IP every 5 min via the
  // web app's /api/branch-presence endpoint. Web app then enforces "POS/KDS
  // only from devices on this branch's wifi" in proxy.ts.
  // Optional — leave WEB_BASE_URL unset to disable presence registration.
  webBaseUrl,
  presenceToken,
  // Transient LAN blips during a rush used to drop the ticket on the first
  // timeout. Resend a few times with backoff before marking the job failed.
  printTimeoutMs: numEnv("PRINT_TIMEOUT_MS", 5000),
  printMaxAttempts: numEnv("PRINT_MAX_ATTEMPTS", 3),
  printRetryBackoffMs: numEnv("PRINT_RETRY_BACKOFF_MS", 750),
};

const printerCache = new Map<number, PrinterRow>();

async function loadPrinters(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from("printers")
    .select(
      "id, branch_id, role, connection_type, lan_host, lan_port, paper_width_mm, is_active",
    )
    .eq("branch_id", config.branchId)
    .eq("is_active", true);
  if (error) throw error;
  printerCache.clear();
  for (const p of (data ?? []) as PrinterRow[]) {
    printerCache.set(p.id, p);
  }
  console.log(
    `[agent] loaded ${printerCache.size} printers for branch ${config.branchId}`,
  );

  const nonLan = [...printerCache.values()].filter(
    (p) => p.connection_type !== "lan",
  );
  if (nonLan.length > 0) {
    console.warn(
      `[agent] WARN ${nonLan.length} non-LAN printer(s) active for branch ${config.branchId}; ` +
        `their jobs will fail — flip printers.connection_type='lan' or deactivate.`,
    );
  }
}

async function heartbeat(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.from("printer_agents").upsert(
    {
      branch_id: config.branchId,
      tenant_id: config.tenantId,
      agent_id: config.agentId,
      version: config.version,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "branch_id" },
  );
  if (error) console.error("[agent] heartbeat failed:", error.message);
}

/**
 * Register this branch's NAT egress IP with the web app so that
 * proxy.ts can allow POS/KDS access from devices sharing the same wifi.
 *
 * The web app reads the IP from the request itself (x-real-ip) — we do
 * NOT pass it in the body, since a leaked token would otherwise let
 * an attacker register an arbitrary IP. The body carries only identity
 * (tenant + branch + agent_id) for audit.
 */
async function registerPresence(): Promise<void> {
  if (!config.webBaseUrl || !config.presenceToken) return;
  try {
    const resp = await fetch(`${config.webBaseUrl}/api/branch-presence`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.presenceToken}`,
      },
      body: JSON.stringify({
        tenant_id: config.tenantId,
        branch_id: config.branchId,
        agent_id: config.agentId,
      }),
    });
    if (!resp.ok) {
      console.error(
        `[agent] presence register failed: ${resp.status} ${resp.statusText}`,
      );
      return;
    }
    const data = (await resp.json()) as {
      ok?: boolean;
      ip?: string;
      skipped?: boolean;
      error?: string;
    };
    if (data.ok) {
      console.log(
        data.skipped
          ? `[agent] presence fresh ip=${data.ip}`
          : `[agent] presence registered ip=${data.ip}`,
      );
    } else {
      console.error(
        `[agent] presence register rejected: ${data.error ?? "unknown"}`,
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[agent] presence register error: ${msg}`);
  }
}

async function claimJob(
  supabase: SupabaseClient,
  jobId: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_print_job", {
    p_job_id: jobId,
    p_agent_id: config.agentId,
  });
  if (error) {
    console.error(`[agent] claim ${jobId} failed:`, error.message);
    return false;
  }
  return data === true;
}

async function completeJob(
  supabase: SupabaseClient,
  jobId: number,
  success: boolean,
  err?: string,
): Promise<void> {
  const { error } = await supabase.rpc("complete_print_job", {
    p_job_id: jobId,
    p_success: success,
    p_error: err ?? null,
  });
  if (error) console.error(`[agent] complete ${jobId} failed:`, error.message);
}

async function processJob(
  supabase: SupabaseClient,
  jobId: number,
): Promise<void> {
  const claimed = await claimJob(supabase, jobId);
  if (!claimed) return;

  const { data, error } = await supabase
    .from("print_jobs")
    .select("id, tenant_id, branch_id, printer_id, job_type, payload, status")
    .eq("id", jobId)
    .single();
  if (error || !data) {
    await completeJob(
      supabase,
      jobId,
      false,
      `fetch failed: ${error?.message}`,
    );
    return;
  }
  const job = data as unknown as PrintJobRow;

  try {
    await dispatchPrintJob(job, printerCache, {
      timeoutMs: config.printTimeoutMs,
      maxAttempts: config.printMaxAttempts,
      backoffMs: config.printRetryBackoffMs,
      webBaseUrl: config.webBaseUrl,
    });
    await completeJob(supabase, jobId, true);
    console.log(`[agent] printed job ${jobId} type=${job.job_type}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[agent] print failed job=${jobId}:`, msg);
    await completeJob(supabase, jobId, false, msg);
  }
}

async function drainPending(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from("print_jobs")
    .select("id")
    .eq("branch_id", config.branchId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) {
    console.error("[agent] drain failed:", error.message);
    return;
  }
  for (const row of (data ?? []) as Array<{ id: number }>) {
    await processJob(supabase, row.id);
  }
}

/** INSERT pending, or UPDATE into pending (cashier reprint / retry). */
function isNewlyPending(
  nextStatus: string | undefined,
  prevStatus: string | undefined,
): boolean {
  return nextStatus === "pending" && prevStatus !== "pending";
}

/**
 * Janitor: ask the DB to revert any print_jobs stuck in 'processing' for
 * >5 min back to 'pending'. Happens when an agent crashes mid-dispatch
 * (NSSM restarts node, but the row stays processing forever otherwise —
 * UNIQUE(idempotency_key) blocks any new insert, retry button can't
 * reach it). Without this, a single LAN blip + agent crash = silent
 * print loss for the rest of the shift.
 */
async function reapStuckJobs(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.rpc("expire_stuck_print_jobs", {
    p_stale_after_seconds: 300,
  });
  if (error) {
    console.error("[agent] reap failed:", error.message);
    return;
  }
  const revived = typeof data === "number" ? data : 0;
  if (revived > 0) {
    console.log(`[agent] reaped ${revived} stuck processing job(s) → pending`);
    void drainPending(supabase);
  }
}

async function main() {
  console.log(
    `[agent] starting ${config.agentId} v${config.version} branch=${config.branchId}`,
  );
  const supabase = createClient(config.supabaseUrl, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await loadPrinters(supabase);
  await heartbeat(supabase);
  await registerPresence();
  await drainPending(supabase);

  let initialSubscribeSeen = false;

  const channel = supabase
    .channel(`print_jobs:branch=${config.branchId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "print_jobs",
        filter: `branch_id=eq.${config.branchId}`,
      },
      (payload) => {
        const row = payload.new as { id: number; status: string };
        if (isNewlyPending(row.status, undefined)) {
          void processJob(supabase, row.id);
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "print_jobs",
        filter: `branch_id=eq.${config.branchId}`,
      },
      (payload) => {
        const row = payload.new as { id: number; status: string };
        const old = payload.old as { status?: string } | null;
        if (isNewlyPending(row.status, old?.status)) {
          void processJob(supabase, row.id);
        }
      },
    )
    .subscribe((status) => {
      console.log(`[agent] realtime status=${status}`);
      if (status !== "SUBSCRIBED") return;
      // Skip the FIRST SUBSCRIBED — drainPending() ran on startup above.
      // Every SUBSCRIBED after that is a reconnect (CHANNEL_ERROR /
      // TIMED_OUT / CLOSED → SUBSCRIBED): re-drain so any print_jobs
      // INSERTed while the WebSocket was down get picked up immediately
      // instead of waiting for the next interval tick.
      if (!initialSubscribeSeen) {
        initialSubscribeSeen = true;
        return;
      }
      console.log("[agent] reconnected — re-draining pending jobs");
      void drainPending(supabase);
    });

  setInterval(() => void heartbeat(supabase), 30_000);
  setInterval(() => void loadPrinters(supabase), 5 * 60_000);
  // Presence: re-register every 5 min so trusted-IP row stays fresh within
  // the 30-min grace window enforced by web proxy.
  setInterval(() => void registerPresence(), 5 * 60_000);
  // Safety-net drain: catches INSERT/UPDATE-to-pending events missed during a
  // WS gap, and reprints that only UPDATE an existing row (no INSERT event).
  // claim_print_job is idempotent, so overlapping drain + realtime is safe.
  setInterval(() => void drainPending(supabase), 60_000);
  // Janitor: re-pending stuck 'processing' jobs every 60s.
  setInterval(() => void reapStuckJobs(supabase), 60_000);

  const shutdown = () => {
    console.log("[agent] shutting down");
    void channel.unsubscribe();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[agent] fatal:", err);
  process.exit(1);
});
