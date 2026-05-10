import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { renderPayload, type PrintPayload } from "./escpos.js";
import { renderPayloadBitmap } from "./escpos-bitmap.js";
import { sendRawBluetooth } from "./bluetooth.js";
import { sendRawLAN } from "./lan.js";

type PrinterRow = {
  id: number;
  branch_id: number;
  role: "receipt" | "kitchen_1" | "kitchen_2";
  connection_type: "lan" | "bluetooth" | string;
  lan_host: string | null;
  lan_port: number | null;
  paper_width_mm: number;
  is_active: boolean;
};

type PrintJobRow = {
  id: number;
  tenant_id: number;
  branch_id: number;
  printer_id: number;
  job_type:
    | "kitchen_ticket"
    | "receipt"
    | "reprint"
    | "cancel_ticket"
    | "provisional_bill"
    | "shift_close_report"
    | "tax_invoice";
  payload: PrintPayload;
  status:
    | "pending"
    | "processing"
    | "printed"
    | "failed"
    | "expired"
    | "cancelled";
};

type PrintMode = "text" | "bitmap";

const requireEnv = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
};

const parsePrintMode = (raw: string | undefined): PrintMode => {
  const v = (raw ?? "text").toLowerCase();
  if (v === "text" || v === "bitmap") return v;
  throw new Error(`Invalid PRINT_MODE=${raw} (expected 'text' or 'bitmap')`);
};

const parseBluetoothTargetMap = (
  raw: string | undefined,
): Record<string, string> => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected JSON object");
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) {
        out[key] = value.trim();
      }
    }
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid PRINT_BT_TARGETS JSON: ${msg}`);
  }
};

const config = {
  supabaseUrl: requireEnv("SUPABASE_URL"),
  serviceKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  branchId: Number(requireEnv("AGENT_BRANCH_ID")),
  tenantId: Number(requireEnv("AGENT_TENANT_ID")),
  agentId: process.env.AGENT_ID ?? `agent-${process.pid}`,
  version: process.env.AGENT_VERSION ?? "0.4.0",
  printMode: parsePrintMode(process.env.PRINT_MODE),
  bluetoothTargets: parseBluetoothTargetMap(process.env.PRINT_BT_TARGETS),
  // Network gate: agent registers its NAT egress IP every 5 min via the
  // web app's /api/branch-presence endpoint. Web app then enforces "POS/KDS
  // only from devices on this branch's wifi" in proxy.ts.
  // Optional — leave WEB_BASE_URL unset to disable presence registration.
  webBaseUrl: process.env.WEB_BASE_URL ?? null,
  presenceToken: process.env.PRINT_AGENT_PRESENCE_TOKEN ?? null,
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

  const unsupported = [...printerCache.values()].filter(
    (p) => p.connection_type !== "lan" && p.connection_type !== "bluetooth",
  );
  if (unsupported.length > 0) {
    console.warn(
      `[agent] WARN ${unsupported.length} unsupported printer(s) active for branch ${config.branchId}; ` +
        `their jobs will fail — use printers.connection_type='lan'/'bluetooth' or deactivate.`,
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
      error?: string;
    };
    if (data.ok) {
      console.log(`[agent] presence registered ip=${data.ip}`);
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

function resolveBluetoothTarget(printer: PrinterRow): string | null {
  const roleKey = printer.role.toUpperCase();
  return (
    config.bluetoothTargets[String(printer.id)] ??
    config.bluetoothTargets[printer.role] ??
    config.bluetoothTargets[roleKey] ??
    process.env[`PRINT_BT_TARGET_${printer.id}`] ??
    process.env[`PRINT_BT_TARGET_${roleKey}`] ??
    printer.lan_host ??
    null
  );
}

async function dispatch(job: PrintJobRow): Promise<void> {
  const printer = printerCache.get(job.printer_id);
  if (!printer) {
    throw new Error(`printer ${job.printer_id} not in cache / inactive`);
  }
  if (
    printer.connection_type !== "lan" &&
    printer.connection_type !== "bluetooth"
  ) {
    throw new Error(
      `printer ${printer.id}: unsupported connection_type='${printer.connection_type}'`,
    );
  }

  const bytes =
    config.printMode === "bitmap"
      ? await renderPayloadBitmap(job.payload)
      : renderPayload(job.payload);

  if (printer.connection_type === "bluetooth") {
    const target = resolveBluetoothTarget(printer);
    if (!target) {
      throw new Error(
        `printer ${printer.id} missing bluetooth target (set lan_host/device path or PRINT_BT_TARGETS)`,
      );
    }
    await sendRawBluetooth(target, bytes);
    return;
  }

  if (!printer.lan_host) {
    throw new Error(`printer ${printer.id} missing lan_host`);
  }
  await sendRawLAN(printer.lan_host, printer.lan_port ?? 9100, bytes);
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
    await dispatch(job);
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
    `[agent] starting ${config.agentId} v${config.version} branch=${config.branchId} print_mode=${config.printMode}`,
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
        if (row.status === "pending") {
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
  // Worst-case latency for a job INSERTed during a WS disconnect:
  // bounded by this interval (was 60_000 — too slow for a kitchen).
  setInterval(() => void drainPending(supabase), 15_000);
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
