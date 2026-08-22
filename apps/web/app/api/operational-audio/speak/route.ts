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
import { resolveTtsConfig } from "@lib/operational-tts-config";

export const maxDuration = 15;

const STATION_ROLES: readonly StaffRole[] = Array.from(
  new Set<StaffRole>([
    ...MODULE_ACL.pos.allowedRoles,
    ...MODULE_ACL.kds.allowedRoles,
    ...MODULE_ACL.branch_settings.allowedRoles,
    ...MODULE_ACL.settings.allowedRoles,
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
    PERMISSION_KEYS.SETTINGS_BRANCH,
    PERMISSION_KEYS.SETTINGS_TENANT,
  ]);
  if (!ctx) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const text = url.searchParams.get("text")?.trim() ?? "";
  if (!isAllowedOperationalUtterance(text)) return badRequest();
  const isLive = url.searchParams.get("live") === "1";

  const rawBranchId = url.searchParams.get("branchId");
  const branchId = rawBranchId ? Number(rawBranchId) : null;
  const config = await resolveTtsConfig(
    ctx.supabase as unknown as Parameters<typeof resolveTtsConfig>[0],
    branchId,
    ctx.claims.tenant_id,
  );

  const cached = getCachedOperationalUtterance(text, config);
  if (cached) return audioResponse(cached);

  if (!isOperationalTtsConfigured()) {
    console.error("[operational-tts] tts_unconfigured");
    return NextResponse.json({ error: "tts_unconfigured" }, { status: 503 });
  }

  // Prefetch and stale POS/KDS JS must not spend Gateway quota. Live alerts
  // are the only synthesize path (`live=1`).
  if (!isLive) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const limited = await ttsRateLimit.limit("operational");
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
    const bytes = await synthesizeOperationalUtterance(text, config);
    if (bytes === "rate_limited") {
      return NextResponse.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: { "Retry-After": "30" },
        },
      );
    }
    if (!bytes) {
      return NextResponse.json({ error: "tts_unavailable" }, { status: 503 });
    }
    return audioResponse(bytes);
  } catch {
    return NextResponse.json({ error: "tts_unavailable" }, { status: 503 });
  }
}
