import { createHmac } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@lib/network/client-ip";

export const SELF_ORDER_MUTATION_HEADER = "x-self-order-request";

function isProductionRuntime() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

function rateLimitPepper(): string {
  const configured = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (configured && configured.length >= 32) return configured;
  if (isProductionRuntime()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required in production");
  }
  return "local-self-order-rate-limit-pepper-not-for-production";
}

export function applySelfOrderPrivateHeaders(response: NextResponse): void {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Origin");
}

export function validateSelfOrderMutationRequest(
  request: NextRequest,
): boolean {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) return false;
  if (request.headers.get(SELF_ORDER_MUTATION_HEADER) !== "1") return false;

  const origin = request.headers.get("origin");
  if (origin) return origin === request.nextUrl.origin;
  return request.headers.get("sec-fetch-site") === "same-origin";
}

export function hashSelfOrderClientIp(request: NextRequest): string | null {
  const ip = getClientIp(request.headers);
  if (!ip && isProductionRuntime()) return null;
  return createHmac("sha256", rateLimitPepper())
    .update(`ip:${ip ?? "local-development"}`)
    .digest("hex");
}
