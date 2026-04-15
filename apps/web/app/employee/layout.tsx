import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  extractClaims,
} from "@comtammatu/shared/auth";
import { MobileHeader } from "./components/mobile-header";
import { BottomNav } from "./components/bottom-nav";

export default async function EmployeeLayout({
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
  if (!claims) redirect(buildLoginBlockedStatePath());

  return (
    <div className="paper-grid flex min-h-dvh flex-col bg-background">
      <MobileHeader />
      <main
        id="main-content"
        className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 pb-32 sm:px-4 lg:px-6"
      >
        <div className="space-y-4">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
