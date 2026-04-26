import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { renderPayload, type PrintPayload } from "./escpos.js";
import { renderPayloadBitmap } from "./escpos-bitmap.js";
import { sendRawLAN } from "./lan.js";

type PrinterRow = {
  id: number;
  branch_id: number;
  role: "receipt" | "kitchen_1" | "kitchen_2";
  connection_type: "lan" | "usb";
  lan_host: string | null;
  lan_port: number | null;
  usb_vendor_id: string | null;
  usb_product_id: string | null;
  paper_width_mm: number;
  is_active: boolean;
};

type PrintJobRow = {
  id: number;
  tenant_id: number;
  branch_id: number;
  printer_id: number;
  job_type: "kitchen_ticket" | "receipt" | "reprint" | "cancel_ticket";
  payload: PrintPayload;
  status: "pending" | "processing" | "printed" | "failed" | "expired" | "cancelled";
};

type Transport = "lan" | "all";
type PrintMode = "text" | "bitmap";

const requireEnv = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
};

const parseTransport = (raw: string | undefined): Transport => {
  const v = (raw ?? "all").toLowerCase();
  if (v === "lan" || v === "all") return v;
  throw new Error(`Invalid AGENT_TRANSPORT=${raw} (expected 'lan' or 'all')`);
};

const parsePrintMode = (raw: string | undefined): PrintMode => {
  const v = (raw ?? "text").toLowerCase();
  if (v === "text" || v === "bitmap") return v;
  throw new Error(`Invalid PRINT_MODE=${raw} (expected 'text' or 'bitmap')`);
};

const config = {
  supabaseUrl: requireEnv("SUPABASE_URL"),
  serviceKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  branchId: Number(requireEnv("AGENT_BRANCH_ID")),
  tenantId: Number(requireEnv("AGENT_TENANT_ID")),
  agentId: process.env.AGENT_ID ?? `agent-${process.pid}`,
  version: process.env.AGENT_VERSION ?? "0.1.0",
  transport: parseTransport(process.env.AGENT_TRANSPORT),
  printMode: parsePrintMode(process.env.PRINT_MODE),
};

const printerCache = new Map<number, PrinterRow>();

// Lazy-load the USB sender so LAN-only deployments (Termux, Raspberry Pi)
// never require the `usb` native binding at startup.
type UsbSender = (
  vendorIdHex: string,
  productIdHex: string | null,
  bytes: Uint8Array,
) => Promise<void>;
let usbSenderPromise: Promise<UsbSender> | null = null;
const loadUsbSender = (): Promise<UsbSender> => {
  if (config.transport === "lan") {
    return Promise.reject(
      new Error("USB dispatch disabled (AGENT_TRANSPORT=lan)"),
    );
  }
  usbSenderPromise ??= import("./usb.js").then((m) => m.sendRawUSB);
  return usbSenderPromise;
};

async function loadPrinters(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from("printers")
    .select(
      "id, branch_id, role, connection_type, lan_host, lan_port, usb_vendor_id, usb_product_id, paper_width_mm, is_active",
    )
    .eq("branch_id", config.branchId)
    .eq("is_active", true);
  if (error) throw error;
  printerCache.clear();
  for (const p of (data ?? []) as PrinterRow[]) {
    printerCache.set(p.id, p);
  }
  console.log(`[agent] loaded ${printerCache.size} printers for branch ${config.branchId}`);

  if (config.transport === "lan") {
    const usbActive = [...printerCache.values()].filter(
      (p) => p.connection_type === "usb",
    );
    if (usbActive.length > 0) {
      console.warn(
        `[agent] WARN transport=lan but ${usbActive.length} USB printer(s) active for branch ${config.branchId}; ` +
          `jobs targeting them will be left pending for a full agent.`,
      );
    }
  }
}

async function heartbeat(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.from("printer_agents").upsert(
    {
      branch_id: config.branchId,
      tenant_id: config.tenantId,
      agent_id: config.agentId,
      version: config.version,
      transport: config.transport,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "branch_id" },
  );
  if (error) console.error("[agent] heartbeat failed:", error.message);
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

// Pre-claim capability check: a LAN-only agent must NOT claim a USB job.
// Claim-then-fail would mark the job `failed` permanently (no requeue path),
// so we leave the row `pending` for a full agent to pick up.
function canServePrinter(printer: PrinterRow): boolean {
  if (config.transport === "all") return true;
  return printer.connection_type === "lan";
}

async function dispatch(job: PrintJobRow): Promise<void> {
  const printer = printerCache.get(job.printer_id);
  if (!printer) {
    throw new Error(`printer ${job.printer_id} not in cache / inactive`);
  }
  const bytes =
    config.printMode === "bitmap"
      ? await renderPayloadBitmap(job.payload)
      : renderPayload(job.payload);

  if (printer.connection_type === "lan") {
    if (!printer.lan_host) throw new Error(`printer ${printer.id} missing lan_host`);
    await sendRawLAN(printer.lan_host, printer.lan_port ?? 9100, bytes);
    return;
  }

  if (printer.connection_type === "usb") {
    if (!printer.usb_vendor_id) {
      throw new Error(`printer ${printer.id} missing usb_vendor_id`);
    }
    const send = await loadUsbSender();
    await send(printer.usb_vendor_id, printer.usb_product_id, bytes);
    return;
  }

  throw new Error(
    `printer ${printer.id}: unsupported connection_type=${printer.connection_type}`,
  );
}

async function processJob(
  supabase: SupabaseClient,
  jobId: number,
  printerId: number | null,
): Promise<void> {
  if (printerId !== null) {
    const printer = printerCache.get(printerId);
    if (printer && !canServePrinter(printer)) {
      return; // leave pending for a capable agent
    }
  }

  const claimed = await claimJob(supabase, jobId);
  if (!claimed) return;

  const { data, error } = await supabase
    .from("print_jobs")
    .select("id, tenant_id, branch_id, printer_id, job_type, payload, status")
    .eq("id", jobId)
    .single();
  if (error || !data) {
    await completeJob(supabase, jobId, false, `fetch failed: ${error?.message}`);
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
    .select("id, printer_id")
    .eq("branch_id", config.branchId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) {
    console.error("[agent] drain failed:", error.message);
    return;
  }
  for (const row of (data ?? []) as Array<{ id: number; printer_id: number | null }>) {
    await processJob(supabase, row.id, row.printer_id);
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
    `[agent] starting ${config.agentId} v${config.version} branch=${config.branchId} transport=${config.transport} print_mode=${config.printMode}`,
  );
  if (config.transport === "lan") {
    console.log("[agent] USB dispatch disabled; only LAN (TCP:9100) printers will be served");
  }
  const supabase = createClient(config.supabaseUrl, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await loadPrinters(supabase);
  await heartbeat(supabase);
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
        const row = payload.new as {
          id: number;
          status: string;
          printer_id: number | null;
        };
        if (row.status === "pending") {
          void processJob(supabase, row.id, row.printer_id);
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
