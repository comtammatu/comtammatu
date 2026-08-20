/**
 * Print-agent presence registration endpoint.
 *
 * Called by `apps/print-agent` every 5 min (or whenever its egress IP
 * changes). Records the agent's NAT egress IP in
 * `branch_trusted_egress_ips`; proxy.ts then allows /br/[branchId]/{pos,kds}
 * requests sharing that IP.
 *
 * Auth: per-agent bearer token. The route hashes the bearer and delegates to
 * `register_branch_presence`, which binds it to tenant + branch + agent_id.
 * The raw token remains agent-local; the DB stores only SHA-256 hex.
 *
 * The IP is read SERVER-SIDE from `x-real-ip` / `x-forwarded-for`
 * (via getClientIp helper) — NEVER trust the body. Any IP the agent
 * could put in the body could be put there by a leaked-token attacker.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { getClientIp } from "@lib/network/client-ip";


const presenceBodySchema = z.object({
  tenant_id: z.coerce.number().int().positive(),
  branch_id: z.coerce.number().int().positive(),
  agent_id: z.string().trim().min(1).max(128),
});

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "unauthorized" },
    { status: 401 },
  );
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  return authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function POST(request: Request) {
  const provided = getBearerToken(request);
  if (!provided) {
    return unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid json" },
      { status: 400 },
    );
  }

  const parsed = presenceBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid identity" },
      { status: 400 },
    );
  }
  const {
    tenant_id: tenantId,
    branch_id: branchId,
    agent_id: agentId,
  } = parsed.data;

  const ip = getClientIp(request.headers);
  if (!ip) {
    // No usable public IP — fail closed. Agent will retry; admin must check
    // proxy chain config (x-real-ip / x-forwarded-for headers).
    return NextResponse.json(
      { ok: false, error: "could not resolve public client IP" },
      { status: 400 },
    );
  }

  const { data: result, error } = await createServiceClient()
    .rpc("register_branch_presence", {
      p_agent_id: agentId,
      p_branch_id: branchId,
      p_ip_address: ip,
      p_tenant_id: tenantId,
      p_token_sha256: sha256Hex(provided),
    })
    .maybeSingle();

  if (error) {
    console.error("[branch-presence] registration rpc failed", {
      tenantId,
      branchId,
      agentId,
      code: error.code,
    });
    return NextResponse.json(
      { ok: false, error: "registration failed" },
      { status: 500 },
    );
  }

  if (!result) {
    console.error("[branch-presence] registration rpc returned no row", {
      tenantId,
      branchId,
      agentId,
    });
    return NextResponse.json(
      { ok: false, error: "registration failed" },
      { status: 500 },
    );
  }

  switch (result.status) {
    case "ok":
    case "skipped":
      return NextResponse.json({
        ok: true,
        ip: result.ip ?? ip,
        skipped: result.skipped === true,
      });
    case "invalid_token":
      return unauthorized();
    case "agent_not_registered":
      return NextResponse.json(
        { ok: false, error: "agent not registered" },
        { status: 403 },
      );
    case "ip_revoked":
      return NextResponse.json(
        { ok: false, error: "ip revoked" },
        { status: 403 },
      );
    case "rate_limited":
      return NextResponse.json(
        { ok: false, error: "rate limited" },
        { status: 429 },
      );
    default:
      console.error("[branch-presence] unexpected registration status", {
        tenantId,
        branchId,
        agentId,
        status: result.status,
      });
      return NextResponse.json(
        { ok: false, error: "registration failed" },
        { status: 500 },
      );
  }
}
