import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  canAccess,
  extractClaims,
} from "@comtammatu/shared/auth";
import { cn } from "@comtammatu/ui";

export default async function PosLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ branchId: string }>;
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

  if (!canAccess(claims.user_role, "pos")) {
    redirect("/login");
  }

  // Branch scope: JWT must have branch_id and it must match the URL
  const { branchId } = await params;
  const urlBranchId = Number(branchId);
  if (claims.branch_id === null || claims.branch_id !== urlBranchId) {
    redirect("/login");
  }

  return (
    <main
      id="main-content"
      className={cn(
        "min-h-screen bg-background",
        "pt-[max(0px,env(safe-area-inset-top,0px))] flex h-dvh touch-manipulation overflow-hidden",
      )}
    >
      <div className="relative flex min-h-full w-full flex-1">
        <div className="ops-grid pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative z-10 flex min-h-full w-full flex-1">
          {children}
        </div>
      </div>
    </main>
  );
}
