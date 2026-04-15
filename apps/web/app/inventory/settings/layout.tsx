import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { SettingsSectionNav } from "./settings-section-nav";

export default async function InventorySettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;
  const role = claims?.user_role ?? "branch_manager";

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card px-4 py-4 shadow-sm sm:px-5">
        <SettingsSectionNav role={role} />
      </div>
      <div>{children}</div>
    </div>
  );
}
