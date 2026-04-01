import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, getDefaultRedirect } from "@comtammatu/shared/auth";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const claims = extractClaims(user.app_metadata);
  if (!claims) {
    redirect("/login");
  }

  redirect(getDefaultRedirect(claims));
}
