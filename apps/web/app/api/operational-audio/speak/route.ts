import { NextResponse } from "next/server";
import {
  MODULE_ACL,
  PERMISSION_KEYS,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { ttsRateLimit } from "@comtammatu/security";
import { getAuthContextWithAnyPermission } from "@/_lib/auth";
import { isAllowedOperationalUtterance } from "@lib/operational-audio-catalog";
import {
  getCachedOperationalUtterance,
  isOperationalTtsConfigured,
  synthesizeOperationalUtterance,
} from "@lib/operational-tts-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATION_ROLES: readonly StaffRole[] = Array.from(
  new Set<StaffRole>([
    ...MODULE_ACL.pos.allowedRoles,
    ...MODULE_ACL.kds.allowedRoles,
  ]),
);

function badRequest() {
  return NextResponse.json({ error: "invalid_utterance" }, { status: 400 });
}

function audioResponse(bytes: Buffer) {
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, max-age=2592000, immutable",
    },
  });
}

export async function GET(request: Request) {
  const ctx = await getAuthContextWithAnyPermission(STATION_ROLES, [
    PERMISSION_KEYS.POS_USE,
    PERMISSION_KEYS.KDS_USE,
  ]);
  if (!ctx) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const text = new URL(request.url).searchParams.get("text")?.trim() ?? "";
  if (!isAllowedOperationalUtterance(text)) return badRequest();

  const cached = getCachedOperationalUtterance(text);
  if (cached) return audioResponse(cached);

  if (!isOperationalTtsConfigured()) {
    console.error("[operational-tts] tts_unconfigured");
    return NextResponse.json({ error: "tts_unconfigured" }, { status: 503 });
  }

  const limited = await ttsRateLimit.limit(ctx.user.id);
  if (!limited.success) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((limited.reset - Date.now()) / 1000),
    );
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      },
    );
  }

  try {
    const bytes = await synthesizeOperationalUtterance(text);
    if (!bytes) {
      return NextResponse.json({ error: "tts_unavailable" }, { status: 503 });
    }
    return audioResponse(bytes);
  } catch {
    return NextResponse.json({ error: "tts_unavailable" }, { status: 503 });
  }
}
