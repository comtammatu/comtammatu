import { NextResponse } from "next/server";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { selfOrderTokenSchema } from "@lib/self-order/contracts";

export function parseSelfOrderToken(token: string) {
  const parsed = selfOrderTokenSchema.safeParse(token);
  return parsed.success ? parsed.data : null;
}

export function jsonError(
  status: number,
  code: string,
  message: string = SELF_ORDER_VI.submitFailed,
) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
