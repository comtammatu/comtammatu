#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: [".env.local", ".env"], quiet: true });

type Command = "create" | "rotate" | "revoke" | "status";

type CliOptions = {
  command: Command;
  tenantId: number;
  branchId: number;
  agentId: string;
  token: string | null;
  confirmProjectRef: string | null;
  dryRun: boolean;
};

type PresenceTokenRow = {
  agent_id: string;
  branch_id: number;
  created_at: string;
  last_attempt_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  tenant_id: number;
  token_sha256: string;
};

type PrinterAgentRow = {
  agent_id: string;
  last_seen_at: string;
  version: string | null;
};

type TrustedIpRow = {
  ip_address: string;
  last_seen_at: string;
  registered_by_agent_id: string | null;
  revoked_at: string | null;
};

const usage = `Usage:
  pnpm --filter @comtammatu/print-agent presence:provision -- create --tenant-id 1 --branch-id 1 --agent-id pos-branch-1 --confirm-project-ref <ref>
  pnpm --filter @comtammatu/print-agent presence:provision -- rotate --tenant-id 1 --branch-id 1 --agent-id pos-branch-1 --confirm-project-ref <ref>
  pnpm --filter @comtammatu/print-agent presence:provision -- revoke --tenant-id 1 --branch-id 1 --agent-id pos-branch-1 --confirm-project-ref <ref>
  pnpm --filter @comtammatu/print-agent presence:provision -- status --tenant-id 1 --branch-id 1 --agent-id pos-branch-1

Options:
  --tenant-id <number>          Defaults to AGENT_TENANT_ID
  --branch-id <number>          Defaults to AGENT_BRANCH_ID
  --agent-id <string>           Defaults to AGENT_ID
  --token <raw-token>           Optional raw token for create/rotate. Otherwise generated.
  --confirm-project-ref <ref>   Required for write commands.
  --dry-run                     Validate target and print planned operation without writing.

Environment:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
`;

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function readFlag(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`Missing value for ${flag}`);
  }
  return value;
}

function parseNumber(raw: string | null, name: string): number {
  if (!raw) fail(`Missing ${name}`);
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    fail(`Invalid ${name}: ${raw}`);
  }
  return n;
}

function parseCommand(raw: string | undefined): Command {
  if (
    raw === "create" ||
    raw === "rotate" ||
    raw === "revoke" ||
    raw === "status"
  ) {
    return raw;
  }
  if (raw === "--help" || raw === "-h") {
    console.log(usage);
    process.exit(0);
  }
  fail(`Unknown command: ${raw ?? "(missing)"}\n\n${usage}`);
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const command = parseCommand(args[0]);
  const tenantId = parseNumber(
    readFlag(args, "--tenant-id") ?? process.env.AGENT_TENANT_ID ?? null,
    "--tenant-id",
  );
  const branchId = parseNumber(
    readFlag(args, "--branch-id") ?? process.env.AGENT_BRANCH_ID ?? null,
    "--branch-id",
  );
  const agentId = readFlag(args, "--agent-id") ?? process.env.AGENT_ID ?? null;
  if (!agentId) fail("Missing --agent-id");
  if (agentId.length > 128) fail("--agent-id must be 128 characters or fewer");

  return {
    command,
    tenantId,
    branchId,
    agentId,
    token: readFlag(args, "--token"),
    confirmProjectRef: readFlag(args, "--confirm-project-ref"),
    dryRun: args.includes("--dry-run"),
  };
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) fail(`Missing env ${name}`);
  return value;
}

function projectRefFromUrl(rawUrl: string): string {
  try {
    const hostname = new URL(rawUrl).hostname;
    const [ref] = hostname.split(".");
    if (!ref) fail(`Cannot parse project ref from SUPABASE_URL=${rawUrl}`);
    return ref;
  } catch {
    fail(`Invalid SUPABASE_URL=${rawUrl}`);
  }
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function newRawToken(): string {
  return randomBytes(32).toString("base64url");
}

function maskHash(hash: string): string {
  return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
}

function assertWriteTargetConfirmed(
  options: CliOptions,
  projectRef: string,
): void {
  if (options.command === "status" || options.dryRun) return;
  if (!options.confirmProjectRef) {
    fail(`Write command requires --confirm-project-ref ${projectRef}`);
  }
  if (options.confirmProjectRef !== projectRef) {
    fail(
      `Project confirmation mismatch: SUPABASE_URL points to ${projectRef}, ` +
        `but --confirm-project-ref=${options.confirmProjectRef}`,
    );
  }
}

function createOpsClient(supabaseUrl: string, serviceKey: string) {
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

type OpsSupabaseClient = ReturnType<typeof createOpsClient>;

async function assertBranchExists(
  supabase: OpsSupabaseClient,
  options: CliOptions,
): Promise<void> {
  const { data, error } = await supabase
    .from("branches")
    .select("id, tenant_id, name")
    .eq("tenant_id", options.tenantId)
    .eq("id", options.branchId)
    .maybeSingle();

  if (error) fail(`Cannot verify branch target: ${error.message}`);
  if (!data) {
    fail(
      `Branch ${options.branchId} does not exist under tenant ${options.tenantId}`,
    );
  }
}

async function getPresenceRow(
  supabase: OpsSupabaseClient,
  options: CliOptions,
): Promise<PresenceTokenRow | null> {
  const { data, error } = await supabase
    .from("printer_agent_presence_tokens")
    .select(
      "tenant_id, branch_id, agent_id, token_sha256, created_at, last_attempt_at, last_used_at, revoked_at",
    )
    .eq("tenant_id", options.tenantId)
    .eq("branch_id", options.branchId)
    .eq("agent_id", options.agentId)
    .maybeSingle();

  if (error) {
    fail(
      "Cannot read printer_agent_presence_tokens. " +
        "Apply migration 20260601870000_network_gate_presence_token_registry.sql first. " +
        `Supabase error: ${error.message}`,
    );
  }
  return (data ?? null) as PresenceTokenRow | null;
}

async function warnIfHeartbeatMissing(
  supabase: OpsSupabaseClient,
  options: CliOptions,
): Promise<void> {
  const { data, error } = await supabase
    .from("printer_agents")
    .select("agent_id, last_seen_at, version")
    .eq("tenant_id", options.tenantId)
    .eq("branch_id", options.branchId)
    .maybeSingle();

  if (error) fail(`Cannot verify printer agent heartbeat: ${error.message}`);
  const row = data as PrinterAgentRow | null;
  if (!row) {
    console.warn(
      "WARN: No printer_agents heartbeat row exists yet. " +
        "This is acceptable before first agent start; the agent heartbeat must run before presence can register.",
    );
    return;
  }
  if (row.agent_id !== options.agentId) {
    console.warn(
      `WARN: Current printer_agents.agent_id is "${row.agent_id}", but provisioning targets "${options.agentId}". ` +
        "Presence registration will fail with agent_not_registered until AGENT_ID matches.",
    );
  }
}

async function printStatus(
  supabase: OpsSupabaseClient,
  options: CliOptions,
  row: PresenceTokenRow | null,
): Promise<void> {
  const { data, error } = await supabase
    .from("branch_trusted_egress_ips")
    .select("ip_address, registered_by_agent_id, last_seen_at, revoked_at")
    .eq("tenant_id", options.tenantId)
    .eq("branch_id", options.branchId)
    .eq("registered_by_agent_id", options.agentId)
    .order("last_seen_at", { ascending: false })
    .limit(5);

  if (error) fail(`Cannot read trusted IP status: ${error.message}`);

  console.log(
    `Presence token status for tenant=${options.tenantId} branch=${options.branchId} agent=${options.agentId}`,
  );
  if (!row) {
    console.log("token: missing");
  } else {
    console.log(`token: ${row.revoked_at ? "revoked" : "active"}`);
    console.log(`hash: ${maskHash(row.token_sha256)}`);
    console.log(`created_at: ${row.created_at}`);
    console.log(`last_attempt_at: ${row.last_attempt_at ?? "(never)"}`);
    console.log(`last_used_at: ${row.last_used_at ?? "(never)"}`);
    console.log(`revoked_at: ${row.revoked_at ?? "(not revoked)"}`);
  }

  const trustedIps = (data ?? []) as TrustedIpRow[];
  if (trustedIps.length === 0) {
    console.log("trusted_ips: none registered by this agent");
    return;
  }

  console.log("trusted_ips:");
  for (const ip of trustedIps) {
    console.log(
      `  - ${String(ip.ip_address)} last_seen_at=${ip.last_seen_at} ` +
        `revoked_at=${ip.revoked_at ?? "(not revoked)"}`,
    );
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = projectRefFromUrl(supabaseUrl);
  assertWriteTargetConfirmed(options, projectRef);

  const supabase = createOpsClient(supabaseUrl, serviceKey);

  await assertBranchExists(supabase, options);
  await warnIfHeartbeatMissing(supabase, options);
  const existing = await getPresenceRow(supabase, options);

  if (options.command === "status") {
    await printStatus(supabase, options, existing);
    return;
  }

  if (options.command === "revoke") {
    if (!existing) fail("Cannot revoke: presence token row does not exist");
    if (options.dryRun) {
      console.log(
        `DRY RUN: would revoke token ${maskHash(existing.token_sha256)}`,
      );
      return;
    }

    const { error } = await supabase
      .from("printer_agent_presence_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("tenant_id", options.tenantId)
      .eq("branch_id", options.branchId)
      .eq("agent_id", options.agentId);

    if (error) fail(`Cannot revoke presence token: ${error.message}`);
    console.log(
      "Presence token revoked. Existing trusted IP rows are not re-enabled or deleted.",
    );
    console.log(
      "Để ngắt POS/KDS ngay lập tức, hãy thu hồi địa chỉ IP tin cậy tại Chủ sở hữu > Cài đặt > Chi nhánh.",
    );
    return;
  }

  const rawToken = options.token ?? newRawToken();
  const tokenSha256 = sha256Hex(rawToken);

  if (options.command === "create" && existing) {
    fail(
      "Presence token already exists. Use rotate to replace it intentionally.",
    );
  }
  if (options.command === "rotate" && !existing) {
    fail("Cannot rotate: presence token row does not exist. Use create first.");
  }

  if (options.dryRun) {
    console.log(
      `DRY RUN: would ${options.command} token hash=${maskHash(tokenSha256)} ` +
        `for project=${projectRef} tenant=${options.tenantId} branch=${options.branchId} agent=${options.agentId}`,
    );
    return;
  }

  if (options.command === "create") {
    const { error } = await supabase
      .from("printer_agent_presence_tokens")
      .insert({
        tenant_id: options.tenantId,
        branch_id: options.branchId,
        agent_id: options.agentId,
        token_sha256: tokenSha256,
      });
    if (error) fail(`Cannot create presence token: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("printer_agent_presence_tokens")
      .update({
        token_sha256: tokenSha256,
        last_attempt_at: null,
        last_used_at: null,
        revoked_at: null,
      })
      .eq("tenant_id", options.tenantId)
      .eq("branch_id", options.branchId)
      .eq("agent_id", options.agentId);
    if (error) fail(`Cannot rotate presence token: ${error.message}`);
  }

  console.log(
    `Presence token ${options.command === "create" ? "created" : "rotated"}.`,
  );
  console.log("Raw token is shown once. Put it in the branch agent .env:");
  console.log("");
  console.log(`AGENT_TENANT_ID=${options.tenantId}`);
  console.log(`AGENT_BRANCH_ID=${options.branchId}`);
  console.log(`AGENT_ID=${options.agentId}`);
  console.log("WEB_BASE_URL=https://<app-host>");
  console.log(`PRINT_AGENT_PRESENCE_TOKEN=${rawToken}`);
  console.log("");
  console.log(`Stored token_sha256=${maskHash(tokenSha256)} only.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
});
