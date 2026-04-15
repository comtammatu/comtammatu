import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  ROLE_LABEL_VI,
  buildLoginBlockedStatePath,
  extractClaims,
  isAdminRole,
} from "@comtammatu/shared/auth";
import { BetaShell } from "../_components/beta-shell";
import { getAdminBetaNavGroups } from "../_lib/routes";

export default async function BetaAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect("/beta/login");
  }

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) {
    redirect(buildLoginBlockedStatePath("missing-auth-context", { surface: "beta" }));
  }

  if (!isAdminRole(claims.user_role)) {
    redirect("/beta?forbidden=1&reason=insufficient-permission");
  }

  const userName =
    session.user.user_metadata?.["display_name"] ??
    session.user.user_metadata?.["full_name"] ??
    session.user.email ??
    "";

  return (
    <BetaShell
      workspaceTitle="Điều hành quản trị"
      workspaceDescription="Surface beta cho cây route quản trị, giữ nguyên auth, ACL và dữ liệu hiện có."
      navGroups={getAdminBetaNavGroups()}
      userName={userName}
      roleLabel={ROLE_LABEL_VI[claims.user_role]}
    >
      {children}
    </BetaShell>
  );
}
