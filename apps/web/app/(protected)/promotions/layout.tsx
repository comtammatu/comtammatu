import type { ReactNode } from "react";
import { canAccess } from "@comtammatu/shared/auth";
import { redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";

export default async function PromotionsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { claims } = await loadAuthState();
  if (!canAccess(claims.user_role, "promotions")) {
    redirect("/access-denied?reason=module");
  }
  return children;
}
