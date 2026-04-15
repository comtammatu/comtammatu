import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  extractClaims,
} from "@comtammatu/shared/auth";
import { cn } from "@comtammatu/ui";
import { SearchParamBlockedStateFlash } from "@/components/foundation/blocked-state-flash";
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
    <div
      className={cn("min-h-screen bg-background", "flex min-h-dvh flex-col")}
    >
      <MobileHeader />
      <main
        id="main-content"
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-28 sm:px-6 lg:px-8"
      >
        <Suspense fallback={null}>
          <SearchParamBlockedStateFlash
            autoClear
            className="mb-4"
            mode="inline"
          />
        </Suspense>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
