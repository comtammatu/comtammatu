import { NextResponse, type NextRequest } from "next/server";
import {
  decodeMomoCallbackContext,
  verifyMomoResult,
} from "@lib/payments/momo";

export async function GET(request: NextRequest) {
  const result = verifyMomoResult(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  const context = result ? decodeMomoCallbackContext(result.extraData) : null;
  if (!context) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const destination = new URL(
    `/q/${encodeURIComponent(context.token)}`,
    request.nextUrl.origin,
  );
  destination.searchParams.set("momo", "returned");
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
