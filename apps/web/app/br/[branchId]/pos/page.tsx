import { fetchMenuForPos } from "./actions";
import { PosMenu } from "./pos-menu";
import type { MenuCategory } from "./pos-menu";

export default async function PosPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const branchIdNum = Number(branchId);

  const menuResult = await fetchMenuForPos(branchIdNum);

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

  return <PosMenu categories={menuResult.data as MenuCategory[]} />;
}
