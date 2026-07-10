import { createHmac, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@lib/network/client-ip";

export const SELF_ORDER_DEVICE_COOKIE = "ctmt_so_device_v1";
export const SELF_ORDER_MUTATION_HEADER = "x-self-order-request";
const DEVICE_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;
const DEVICE_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function isProductionRuntime() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

function devicePepper(): string {
  const configured = process.env.SELF_ORDER_DEVICE_PEPPER?.trim();
  if (configured && configured.length >= 32) return configured;
  if (isProductionRuntime()) {
    throw new Error("SELF_ORDER_DEVICE_PEPPER is required in production");
  }
  return "local-self-order-device-pepper-not-for-production";
}

function hmac(value: string): string {
  return createHmac("sha256", devicePepper()).update(value).digest("hex");
}

export function hashSelfOrderDeviceSecret(secret: string): string {
  return hmac(`device:${secret}`);
}

export function readSelfOrderDeviceSecret(request: NextRequest): string | null {
  const value = request.cookies.get(SELF_ORDER_DEVICE_COOKIE)?.value ?? "";
  return DEVICE_SECRET_PATTERN.test(value) ? value : null;
}

export function createSelfOrderDeviceSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function setSelfOrderDeviceCookie(
  response: NextResponse,
  secret: string,
): void {
  response.cookies.set({
    name: SELF_ORDER_DEVICE_COOKIE,
    value: secret,
    httpOnly: true,
    secure: isProductionRuntime(),
    sameSite: "lax",
    path: "/api/self-order",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
  });
}

export function applySelfOrderPrivateHeaders(response: NextResponse): void {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Cookie");
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
  if (ip) return hmac(`ip:${ip}`);
  return isProductionRuntime() ? null : hmac("ip:local-development");
}
