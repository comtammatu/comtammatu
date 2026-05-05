/**
 * Print-agent presence registration endpoint.
 *
 * Called by `apps/print-agent` every 5 min (or whenever its egress IP
 * changes). Records the agent's NAT egress IP in
 * `branch_trusted_egress_ips`; proxy.ts then allows /br/[branchId]/{pos,kds}
 * requests sharing that IP.
 *
 * Auth: shared bearer token via `PRINT_AGENT_PRESENCE_TOKEN` env var.
 * Both this route and the agent must hold the same value. NOT the
 * Supabase service-role key — separate token so it can be rotated
 * independently when an agent host is decommissioned.
 *
 * Residual accepted risk for this slice: the token is still global. If it
 * leaks, an attacker who knows a valid tenant/branch/agent tuple can forge
 * presence for that tuple until per-agent tokens ship.
 *
 * The IP is read SERVER-SIDE from `x-real-ip` / `x-forwarded-for`
 * (via getClientIp helper) — NEVER trust the body. Any IP the agent
 * could put in the body could be put there by a leaked-token attacker.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getClientIp } from "@lib/network/client-ip";

export const runtime = "nodejs";

const HEARTBEAT_WRITE_MIN_INTERVAL_MS = 60_000;

interface PresenceBody {
  tenant_id?: number;
  branch_id?: number;
  agent_id?: string;
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(request: Request) {
  const expected = process.env.PRINT_AGENT_PRESENCE_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "presence token not configured" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const provided = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  if (!provided || !timingSafeEquals(provided, expected)) {
    return unauthorized();
  }

  let body: PresenceBody;
  try {
    body = (await request.json()) as PresenceBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const tenantId = Number(body.tenant_id);
  const branchId = Number(body.branch_id);
  const agentId = typeof body.agent_id === "string" ? body.agent_id : null;
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return NextResponse.json(
      { ok: false, error: "missing tenant_id" },
      { status: 400 },
    );
  }
  if (!Number.isInteger(branchId) || branchId <= 0) {
    return NextResponse.json(
      { ok: false, error: "missing branch_id" },
      { status: 400 },
    );
  }
  if (!agentId) {
    return NextResponse.json(
      { ok: false, error: "missing agent_id" },
      { status: 400 },
    );
  }

  const ip = getClientIp(request.headers);
  if (!ip) {
    // No usable public IP — fail closed. Agent will retry; admin must check
    // proxy chain config (x-real-ip / x-forwarded-for headers).
    return NextResponse.json(
      { ok: false, error: "could not resolve public client IP" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: agent, error: agentError } = await supabase
    .from("printer_agents")
    .select("branch_id")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("agent_id", agentId)
    .maybeSingle();

  if (agentError) {
    console.error("[branch-presence] agent validation failed", {
      tenantId,
      branchId,
      agentId,
      code: agentError.code,
    });
    return NextResponse.json(
      { ok: false, error: "registration failed" },
      { status: 500 },
    );
  }

  if (!agent) {
    return NextResponse.json(
      { ok: false, error: "agent not registered" },
      { status: 403 },
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("branch_trusted_egress_ips")
    .select("id, last_seen_at, revoked_at")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("ip_address", ip)
    .maybeSingle();

  if (existingError) {
    console.error("[branch-presence] lookup failed", {
      tenantId,
      branchId,
      ip,
      code: existingError.code,
    });
    return NextResponse.json(
      { ok: false, error: "registration failed" },
      { status: 500 },
    );
  }

  if (existing?.revoked_at) {
    return NextResponse.json(
      { ok: false, error: "ip revoked" },
      { status: 403 },
    );
  }

  if (existing) {
    const lastSeenAt = Date.parse(existing.last_seen_at);
    if (
      Number.isFinite(lastSeenAt) &&
      now.getTime() - lastSeenAt < HEARTBEAT_WRITE_MIN_INTERVAL_MS
    ) {
      return NextResponse.json({ ok: true, ip, skipped: true });
    }

    const { data: updated, error: updateError } = await supabase
      .from("branch_trusted_egress_ips")
      .update({
        registered_via: "agent",
        registered_by_agent_id: agentId,
        last_seen_at: nowIso,
      })
      .eq("id", existing.id)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("[branch-presence] update failed", {
        tenantId,
        branchId,
        ip,
        code: updateError.code,
      });
      return NextResponse.json(
        { ok: false, error: "registration failed" },
        { status: 500 },
      );
    }

    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "ip revoked" },
        { status: 403 },
      );
    }

    return NextResponse.json({ ok: true, ip });
  }

  const { error: insertError } = await supabase
    .from("branch_trusted_egress_ips")
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      ip_address: ip,
      registered_via: "agent",
      registered_by_agent_id: agentId,
      last_seen_at: nowIso,
    });

  if (insertError) {
    console.error("[branch-presence] insert failed", {
      tenantId,
      branchId,
      ip,
      code: insertError.code,
    });
    return NextResponse.json(
      {
        ok: false,
        error:
          insertError.code === "23505"
            ? "registration conflict"
            : "registration failed",
      },
      { status: insertError.code === "23505" ? 409 : 500 },
    );
  }

  return NextResponse.json({ ok: true, ip });
}
