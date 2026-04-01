import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, canAccess } from "@comtammatu/shared/auth";

export default async function KdsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ branchId: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const claims = extractClaims(user.app_metadata);
  if (!claims || !canAccess(claims.user_role, "kds")) {
    redirect("/login");
  }

  // Branch scope: JWT must have branch_id and it must match the URL
  const { branchId } = await params;
  const urlBranchId = Number(branchId);
  if (claims.branch_id === null || claims.branch_id !== urlBranchId) {
    redirect("/login");
  }

  return (
    <div className="dark h-dvh touch-manipulation overflow-hidden bg-background text-foreground">
      {children}
    </div>
  );
}
