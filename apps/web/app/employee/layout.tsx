import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
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
  if (!claims) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col">
      <MobileHeader />
      <main
        id="main-content"
        className="mx-auto w-full max-w-lg flex-1 px-4 py-4 pb-20"
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
