import { redirect } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getAuthContextWithAnyPermission } from "@/inventory/_lib/auth";
import { ExpressWindowsClient, type BranchRow } from "./express-windows-client";

export const dynamic = "force-dynamic";

export default async function ExpressWindowsAdminPage() {
  // Admin needs either config or rotate_code to see this page.
  const ctx = await getAuthContextWithAnyPermission(
    [],
    [
      PERMISSION_KEYS.INVENTORY_GRN_EXPRESS_CONFIGURE,
      PERMISSION_KEYS.PROCUREMENT_OVERRIDE_CODE_ROTATE,
    ],
  );
  if (!ctx) redirect("/");
  const { supabase, claims } = ctx;

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, branch_kind, timezone")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("id", { ascending: true });

  const { data: windows } = await supabase
    .from("branch_express_window")
    .select("branch_id, enabled, start_time, end_time, updated_at");

  const winMap = new Map<number, NonNullable<typeof windows>[number]>();
  for (const w of windows ?? []) {
    if (w.branch_id) winMap.set(w.branch_id, w);
  }

  const rows: BranchRow[] = (branches ?? []).map((b) => {
    const win = winMap.get(b.id);
    return {
      id: b.id,
      name: b.name,
      branchKind: b.branch_kind ?? "branch",
      timezone: b.timezone ?? "Asia/Ho_Chi_Minh",
      window: {
        enabled: Boolean(win?.enabled ?? false),
        startTime: win?.start_time ?? "06:00",
        endTime: win?.end_time ?? "09:00",
        updatedAt: win?.updated_at ?? null,
      },
    };
  });

  return <ExpressWindowsClient initial={rows} />;
}
