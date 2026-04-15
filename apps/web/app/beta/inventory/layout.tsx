import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  ROLE_LABEL_VI,
  buildLoginBlockedStatePath,
  canAccess,
  extractClaims,
} from "@comtammatu/shared/auth";
import { BetaShell } from "../_components/beta-shell";
import { getInventoryBetaNavGroups } from "../_lib/routes";

export default async function BetaInventoryLayout({
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

  if (!canAccess(claims.user_role, "inventory")) {
    redirect("/beta?forbidden=1&reason=insufficient-permission");
  }

  const userName =
    session.user.user_metadata?.["display_name"] ??
    session.user.user_metadata?.["full_name"] ??
    session.user.email ??
    "";

  return (
    <BetaShell
      workspaceTitle="Kho vận"
      workspaceDescription="Editorial-industrial shell cho inventory surface: giữ dữ liệu thật, nhấn mạnh cảnh báo và điều phối theo site."
      navGroups={getInventoryBetaNavGroups()}
      userName={userName}
      roleLabel={ROLE_LABEL_VI[claims.user_role]}
    >
      {children}
    </BetaShell>
  );
}
