import { fetchMenuForPos, fetchTablesForBranch } from "./actions";
import { PosMenu } from "./pos-menu";
import type { MenuCategory } from "./pos-menu";

export default async function PosPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const branchIdNum = Number(branchId);

  const [menuResult, tablesResult] = await Promise.all([
    fetchMenuForPos(branchIdNum),
    fetchTablesForBranch(branchIdNum),
  ]);

  if (!menuResult.success || !menuResult.data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-destructive">
            {menuResult.error ?? "Không thể tải menu"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Vui lòng tải lại trang hoặc liên hệ quản lý.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PosMenu
      branchId={branchIdNum}
      categories={menuResult.data as MenuCategory[]}
      tables={(tablesResult.data ?? []) as BranchTable[]}
    />
  );
}

/** Table shape returned by fetchTablesForBranch */
export interface BranchTable {
  id: number;
  number: number;
  capacity: number;
  status: string;
  zone_id: number | null;
  branch_zones: { id: number; name: string } | null;
}
