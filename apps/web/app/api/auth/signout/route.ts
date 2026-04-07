import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { rateLimit } from "@comtammatu/security";

export async function POST(request: Request) {
  // Rate limit by IP before auth
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { success: allowed } = await rateLimit.limit(`signout:${ip}`);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
