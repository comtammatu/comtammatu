import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { canAccess } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";

export default async function BranchesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { claims } = await loadAuthState();

  if (!canAccess(claims.user_role, "branches")) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  return children;
}
