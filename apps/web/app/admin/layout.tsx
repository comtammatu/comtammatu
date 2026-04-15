import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  extractClaims,
  isAdminRole,
} from "@comtammatu/shared/auth";
import { AdminShell } from "./components/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) {
    redirect(buildLoginBlockedStatePath());
  }

  if (!isAdminRole(claims.user_role)) {
    redirect("/login");
  }

  return (
    <AdminShell
      user={{
        name:
          session.user.user_metadata?.["display_name"] ??
          session.user.email ??
          "",
      }}
      role={claims.user_role}
      branchId={claims.branch_id}
    >
      {children}
    </AdminShell>
  );
}
