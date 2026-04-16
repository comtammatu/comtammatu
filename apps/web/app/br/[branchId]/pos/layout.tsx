import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  canAccess,
  extractClaims,
} from "@comtammatu/shared/auth";

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
      className="min-h-dvh w-full  flex h-dvh min-h-screen touch-manipulation overflow-hidden"
    >
      <div className="flex min-h-full w-full flex-1 p-3 md:p-4">
        <div className="rounded-lg border bg-background shadow-sm relative flex min-h-full w-full flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </main>
  );
}
