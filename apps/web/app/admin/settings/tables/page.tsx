import { getBranches } from "./actions";
import { TablesManager } from "./tables-manager";

export default async function TablesPage() {
  const result = await getBranches();
  const branches = result.data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quản lý bàn</h1>
        <p className="mt-1 text-muted-foreground">
          Quản lý khu vực và bàn ăn theo chi nhánh
        </p>
      </div>

      <TablesManager branches={branches} />
    </div>
  );
}
