import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, isAdminRole } from "@comtammatu/shared/auth";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const claims = extractClaims(user.app_metadata);
  if (!claims || !isAdminRole(claims.user_role)) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      {/* TODO: Sidebar component with role-filtered navigation */}
      <aside className="w-64 border-r bg-card p-4">
        <h2 className="mb-4 font-bold">Cơm Tấm Má Tư</h2>
        <nav className="space-y-1">
          <a
            href="/admin/dashboard"
            className="block rounded px-3 py-2 hover:bg-accent"
          >
            Dashboard
          </a>
          <a
            href="/admin/menu"
            className="block rounded px-3 py-2 hover:bg-accent"
          >
            Menu
          </a>
          <a
            href="/admin/inventory"
            className="block rounded px-3 py-2 hover:bg-accent"
          >
            Kho
          </a>
          <a
            href="/admin/orders"
            className="block rounded px-3 py-2 hover:bg-accent"
          >
            Đơn hàng
          </a>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
