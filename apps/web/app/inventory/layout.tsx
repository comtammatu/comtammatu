import { Inter } from "next/font/google";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, canAccess } from "@comtammatu/shared/auth";
import { DemoSidebar } from "./_components/demo-sidebar";
import { DemoHeader } from "./_components/demo-header";
import "./demo-theme.css";

const inter = Inter({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
});

export default async function InventoryLayout({
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
  if (!claims || !canAccess(claims.user_role, "inventory")) {
    redirect("/admin/dashboard?forbidden=1");
  }

  return (
    <div
      className={`demo-inventory-theme ${inter.variable} flex h-dvh overflow-hidden`}
      style={{
        fontFamily: "var(--font-inter), sans-serif",
        backgroundColor: "var(--md-surface)",
      }}
    >
      <DemoSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <DemoHeader />
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </div>
    </div>
  );
}
