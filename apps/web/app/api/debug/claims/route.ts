import { NextResponse } from "next/server";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaimsFromAccessToken,
  PERMISSION_KEYS,
} from "@comtammatu/shared/auth";

function decodeJwtPayload(token: string): unknown {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payloadB64 = parts[1];
  if (!payloadB64) return null;
  try {
    const padded = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

export async function GET() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ENABLE_DEBUG_CLAIMS !== "true"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const claims = extractClaimsFromAccessToken(session?.access_token);
  if (!claims) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: canInspectClaims, error: permissionError } = await supabase.rpc(
    "has_permission_any",
    { p_key: PERMISSION_KEYS.STAFF_ASSIGN_PERMISSION },
  );
  if (permissionError || canInspectClaims !== true) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const decoded = session?.access_token
    ? decodeJwtPayload(session.access_token)
    : null;

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      app_metadata: user.app_metadata,
      user_metadata: user.user_metadata,
    },
    session: session
      ? {
          expires_at: session.expires_at,
          access_token_present: Boolean(session.access_token),
        }
      : null,
    decoded_access_token_payload: decoded,
  });
}
