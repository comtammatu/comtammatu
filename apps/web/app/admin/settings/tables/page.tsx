import { createClient } from "@comtammatu/database/supabase/server";
import { TablesClient } from "./tables-client";

export default async function TablesPage() {
  const supabase = await createClient();

  const [branchesRes, zonesRes, tablesRes] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, is_active")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("branch_zones")
      .select("id, branch_id, name, sort_order")
      .order("sort_order")
      .order("name"),
    supabase
      .from("tables")
      .select(
        "id, branch_id, zone_id, number, capacity, status, branch_zones(name)",
      )
      .order("number"),
  ]);

  if (branchesRes.error) throw new Error("Không thể tải chi nhánh");
  if (zonesRes.error) throw new Error("Không thể tải khu vực");
  if (tablesRes.error) throw new Error("Không thể tải bàn");

  const branches = branchesRes.data;
  const zones = zonesRes.data;
  const tables = tablesRes.data.map((t) => ({
    id: t.id,
    branch_id: t.branch_id,
    zone_id: t.zone_id,
    number: t.number,
    capacity: t.capacity,
    status: t.status,
    zone_name: t.branch_zones?.name ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bàn & Khu vực</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quản lý khu vực và bàn ăn theo chi nhánh
        </p>
      </div>

      <TablesClient branches={branches} zones={zones} tables={tables} />
    </div>
  );
}
