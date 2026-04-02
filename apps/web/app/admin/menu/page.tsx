import { getCategories, getMenuItems } from "./actions";
import { MenuManager } from "./menu-manager";

export default async function MenuPage() {
  const [categoriesResult, itemsResult] = await Promise.all([
    getCategories(),
    getMenuItems(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quản lý thực đơn</h1>
        <p className="mt-1 text-muted-foreground">
          Quản lý danh mục, món ăn, biến thể và topping
        </p>
      </div>
      <MenuManager
        initialCategories={categoriesResult.data ?? []}
        initialItems={itemsResult.data ?? []}
      />
    </div>
  );
}
